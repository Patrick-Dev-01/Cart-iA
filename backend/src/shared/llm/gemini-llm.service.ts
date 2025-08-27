import { Injectable } from "@nestjs/common";
import { AnswerMessage, LlmService, SuggestCarts } from "./llm.service";
import { GoogleGenAI } from "@google/genai";
import { ConfigService } from "@nestjs/config";
import zodToJsonSchema from "zod-to-json-schema";
import { answerMessageSchema, suggestCartsSchema } from "./schemas";
import { PostgresService } from "../postgres.service";

@Injectable()
export class GeminiLlmService extends LlmService{
    private readonly chatModel: string = `gemini-2.5-flash`;
    private readonly embeddingModel: string = `gemini-embedding-exp-03-07`;
    private client: GoogleGenAI;

    constructor(
        private readonly configService: ConfigService,
        private readonly postgresService: PostgresService
    ){
        super()
        this.client = new GoogleGenAI({
            apiKey: this.configService.get<string>('GEMINI_API_KEY')
        })
    }

    async suggestCarts(
        relevantProductsByStore: { 
            store_id: number; 
            products: { 
                id: number; 
                name: string; 
                price: number; 
                similarity: number; 
            }[]; 
        }[], 
        input: string
    ): Promise<(SuggestCarts & { responseId: string; }) | null> {

        const response = await this.client.models.generateContent({
            model: this.chatModel,
            contents: `Input do usuário: ${input}\n\nProdutos disponíveis por loja: ${JSON.stringify(relevantProductsByStore, null, 2)}`,
            config: {
                systemInstruction: GeminiLlmService.SUGGEST_CARTS_PROMPT,
                responseJsonSchema: zodToJsonSchema(suggestCartsSchema)
            }
        });

        // "json{}"
        const jsonContent = this.extractJsonContent(response.text ?? "");

        try {
            const parsedResponse = JSON.parse(jsonContent);
            const validated = suggestCartsSchema.safeParse(parsedResponse);

            if(!validated.success){
                console.error('Invalid response format', validated.error);
                return null;
            }

            return {
                ...validated.data,
                responseId: response.responseId ?? `gemini-${Date.now()}`
            };
        } catch (error) {
            console.error('Error parsing response JSON: ', error);
            return null;
        }
    }

    async batchEmbedProducts(products: { id: number; name: string; }[]): Promise<void> {
        const result = await this.client.models.embedContent({
            contents: products.map((p) => p.name),
            model: this.embeddingModel,
            config: {
                outputDimensionality: 1536,
                taskType: 'SEMANTIC_SIMILARITY',
            },
        })    

        if(!result.embeddings || result.embeddings.length === 0){
            console.error('No embeddings returned for products: ', products)
            return;
        }

        for (const [index, resultItem] of result.embeddings.entries() ?? []){
            console.log(`Embedding for product ${products[index].id}: ${resultItem.values?.length}`);

            if(!resultItem.values || resultItem.values.length === 0){
                console.error(
                    `No embedding returned for product ${products[index].id}`
                )
                continue
            }

            await this.postgresService.client.query(
                `UPDATE products SET embedding = $1::vector WHERE id = $2`,
                [JSON.stringify(resultItem.values), products[index].id]
            )
        }
    }
    handleWebhookEvent(rawBody: string, headers: Record<string, string>): Promise<{ productId: string; embedding: number[]; }[] | null> {
        throw new Error("Method not implemented.");
    }
    async embedInput(input: string): Promise<{ embedding: number[]; } | null> {
        try {
            const result = await this.client.models.embedContent({
                model: this.embeddingModel,
                contents: input,
                config: {
                    taskType: 'SEMANTIC_SIMILARITY',
                    outputDimensionality: 1536
                }
            })
            const embeddings = result.embeddings ? result.embeddings[0].values : null;

            if(!embeddings){
                console.error('No embeddings found in response: ', result)
                return null;
            }
            
            return { embedding: embeddings }

        } catch (error) {
            console.error(`Error embedding input`, error)
            return null;
        }
    }
    async answerMessage(
        message: string, 
        previousMessageId: string | null,
        previousMessages: { content: string, role: string }[]
    ): Promise<(AnswerMessage & { responseId: string; }) | null> {
        const response = await this.client.models.generateContent({
            model: this.chatModel,
            contents: previousMessages.map(msg => ({
                role: msg.role === 'user' ? `user` : `model`,
                text: msg.content
            })).concat({
                role: 'user',
                text: message
            }),
            config: {
                systemInstruction: GeminiLlmService.ANSWER_MESSAGE_PROMPT,
                responseJsonSchema: zodToJsonSchema(answerMessageSchema)
            }
        });

        const jsonContent = this.extractJsonContent(response.text ?? ""); // ```json{}```

        try {
            const parsedResponse = JSON.parse(jsonContent);
            const validated = answerMessageSchema.safeParse(parsedResponse);

            if(!validated.success){
                console.error('Invalid response format', validated.error);
                return null;
            }

            return {
                ...validated.data,
                responseId: response.responseId ?? `gemini-${Date.now()}`
            }
        } catch (error) {
            console.error('Error parsing response JSON: ', error);
            return null;
        }
    }

    private extractJsonContent(text: string): string{
        const jsonMatch = text?.match(/```json\n([\s\S]*?)\n```/) || 
        text?.match(/```\n([\s\S]*?)\n```/) || [null, text];

        const jsonContent = (jsonMatch[1] || text) ?? "{}";

        return jsonContent;
    }

    static readonly ANSWER_MESSAGE_PROMPT = `Você é um assistente de um marketplace de conhecimentos gastronômicos.
        Identifique qual ação o usuário está solicitando:
        - 'send_message': Use essa ação para responder o usuário antes de commitar alguma ação. Caso o usuário tenha 
        solicitado uma ação, mas você ainda precise de mais informações, use essa ação para perguntar ao usuário. Informe
        em "message" a resposta de assistente.
        - 'suggest_carts': Use essa ação apenas quando já tiver todas as informações necessárias para sugerir um carrinhos 
        de compras. Informe em "input" uma descrição do que o usuário está solicitando, junto a uma lista de produtos que
        você sugeriria para o carrinho. A mensagem que acompanha essa ação deve ser uma confirmação para o usuário, 
        perguntando se ele confirma a ação de manter o carrinho de compras.

        Exemplo:
            - Mensagem do usuário: "Montar um carrinho para receita de bolo de chocolate"
            - Respota do assistente: "Você solicitou um carrinho de compras para a receita de bolo de chocolate. Confirme a ação para que possa montar o carrinho 
            de compras?"
            - Input: "Bolo de chocolate. Ingredientes: farinha, açucar, ovos, chocolate meio amargo, fermento em pó."
        
        Não use a ação 'suggest_carts' para responder ao usuário, apenas para sugerir um carrinho de compras. use a ação 
        'send_message' para responder ao usuário.
        Não precisa ir muito afundo em detalhes, se o usuário solicitar bolo de chocolate, você pode sugerir um carrinho 
        com ingredientes básicos, ao invés de pergunta se ele prefere chocolate meio amargo ou ao leite ou pedir detalhes 
        sobre a receita, pois o usuário pode inserir esses detalhes depois.

        Formato da resposta "send_message":
        {
            "message": "Sua resposta para o usuário",
            "action": {
                "type": "send_message",
            },
        }

        ou "suggest_carts":

        {
            "message": "Você solicitou um carrinho de compras. Confirma a ação?",
            "action": {
                "type": "suggest_carts",
                "payload": {
                    "input": "Bolo de chocolate. Ingredientes: farinha, açucar, ovos, chocolate meio amargo, fermento"
                }
            },
        }
    `;

    static readonly SUGGEST_CARTS_PROMPT = `Você é um assistente de um marketplace de conhecimentos gastronômicos. Crie carrinhos de compras por loja com base nos produtos sugeridos.
       
        Atente-se ás quantidades de cada produto, e á quantidade disponível em cada loja. Por exemplo, 
        se a receita pede 1kg de farinha, mas a loja só tem pacotes de 500g, você deve sugerir 2 pacotes de 500g.

        Tolere variações nas marcas e apresentações dos produtos, mas mantenha o foco nos ingredientes necessários para a 
        receita.

        Calcule um score para cada carrinho sugerido, baseado na quantidade de produtos disponíveis e ma correspondência
        com os produtos necessários para a melhor execução da receita. Score de 0 a 100.

        Exemplos do que pode diminuir o score, mas não limitados a:
        - Produtos que não estãlo disponíveis na loja.
        - Produtos que não correspondem exatamente aos necessários para a receita, mas são substitutos aceitáveis.

        ATENÇÃO: O campo "id" de cada produto nos carrinhos ("carts") deve ser exatamente o id do produto disponível 
        informado na lista de produtos disponíveis de cada loja. não invente ids, utilize apenas os ids fornecidos.

        Exemplo: 
           - Input: "Bolo de chocolate. Ingredientes: farinha, açucar, ovos, chocolate meio amargo, fermento em pó.
           disponíveis na loja 1: farinha de trigo (id: 1), açucar refinado (id: 2), ovos (id: 3), chocolate meio amargo 200g (id: 4), 
           fermento em pó (id: 5). disponíveis na loja 2: farinha de trigo (id: 6), açucar cristal (id: 7), 
           ovos caipira (id: 8), chocolate ao leite (id: 9). Produtos disponiveis na loja 3: farinhade trigo (id: 10)."
           - Resposta:
            {
                "carts": [
                    {
                        "store_id": 1,
                        "products": [
                            {"id": 1, "name": "Farinha de trigo 1kg", "quantity": 1 },
                            {"id": 2, "name": "Açucar refinado 1kg", "quantity": 1 },
                            {"id": 3, "name": "Ovos 12 unidades", "quantity": 1 },
                            {"id": 4, "name": "Chocolate meio amargo 200g", "quantity": 1 },
                            {"id": 5, "name": "Fermento em pó 100g", "quantity": 1 }
                        ],
                        "score": 100,
                    },
                    {
                        "store_id": 2,
                        "products": [
                            {"id": 6, "name": "Farinha de trigo 1kg", "quantity": 1 },
                            {"id": 7, "name": "Açucar cristal 1kg", "quantity": 1 },
                            {"id": 8, "name": "Ovos caipira unidade", "quantity": 1 },
                            {"id": 9, "name": "Chocolate ao leite 500g", "quantity": 1 }
                        ],
                        "score": 70,
                    },
                    {
                        "store_id": 3,
                        "products": [
                            {"id": 10, "name": "Farinha de trigo 1kg", "quantity": 1 }
                        ],
                        "score": 20,
                    },
                    response: 'Carrinhos sugeridos com base nos produtos disponíveis.'
                }
                Os produtos disponiveis de cada loja são informados com seus respectivos ids. Sempre utilize o id correto do 
                produto disponível ao montar os carrinhos.`
}