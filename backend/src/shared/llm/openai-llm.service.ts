import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodTextFormat } from 'openai/helpers/zod'
import { CreateEmbeddingResponse } from "openai/resources/embeddings";
import { AnswerMessage, answerMessageSchema, suggestCartsSchema } from "./schemas";
import { LlmService } from "./llm.service";

@Injectable()
export class OpenAiLlmService extends LlmService{
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

    private client: OpenAI;

    constructor(private readonly configService: ConfigService){
        super()
        this.client = new OpenAI({
            apiKey: this.configService.get<string>('OPEN_AI_API_KEY'),
            webhookSecret: this.configService.get<string>('OPEN_AI_WEBHOOK_SECRET')
        })
    }

    async suggestCarts(relevantProductsByStore: {
        store_id: number;
        products: {
            id: number;
            name: string;
            price: number;
            similarity: number;
        }[];
    }[], input: string){
        try{
            const response = await this.client.responses.parse({
                model: 'gpt-4.1-nano',
                instructions: OpenAiLlmService.SUGGEST_CARTS_PROMPT,
                input: `Input do usuário: ${input}\n\nProdutos disponíveis por loja: ${JSON.stringify(relevantProductsByStore, null, 2)}`,
                text: {
                    format: zodTextFormat(suggestCartsSchema, 'suggestCartsSchema'),
                }
            })

            if(!response.output_parsed){
                console.log('No parsed output in response', response);
                return null;
            }

            return {
                ...response.output_parsed,
                responseId: response.id
            }
        }

        catch (err) {
            console.log('Error in LlmService.suggestCarts: ', err);
            return null;
        }
    };

    async batchEmbedProducts(
        products: {
            id: number;
            name: string;
        }[]
    ){
        const jsonFile = products.map((product) => JSON.stringify({
            custom_id: product.id.toString(), 
            method: 'POST',
            url: '/v1/embeddings',
            body: {
                model: 'text-embedding-3-small',
                input: product.name
            }
        })).join('\n');

        const uploadedFile = await this.client.files.create({
            file: new File([jsonFile], 'products.jsonl', {
                type: 'application/jsonl'
            }),
            purpose: 'batch'
        })

        if(!uploadedFile.id){
            console.log('Failed to upload file for batch embedding');
        }

        await this.client.batches.create({
            input_file_id: uploadedFile.id,
            completion_window: '24h',
            endpoint: '/v1/embeddings'
        })
    }

    async handleWebhookEvent(rawBody: string, headers: Record<string, string>){
        console.log('LlmService.handleWebhookEvent called');
        const event = await this.client.webhooks.unwrap(rawBody, headers);

        if(event.type !== 'batch.completed'){
            console.warn('Received event is not a batch.completed event');
            return null;
        }
        
        console.log('Batch completed event received: ', event.data.id);
        const batch = await this.client.batches.retrieve(event.data.id);
        if(!batch || !batch.output_file_id){
            console.warn('Batch output file not found', event.data.id);
            return null;
        }

        console.log('Batch output file ID: ', batch.output_file_id);
        const outputFile = await this.client.files.content(batch.output_file_id);
        const results = (await outputFile.text()).split('\n').filter((line: string) => line.trim() !== '')
            .map((line: string) => {
                const data = JSON.parse(line) as {
                    custom_id: string;
                    response: {
                        body: CreateEmbeddingResponse
                    };
                }

                if(!data.response || !data.response.body || !data.response.body.data || data.response.body.data.length === 0){
                    console.warn('Invalid response data for custom_id: ', data.custom_id);
                    return null;
                }

                return {
                  productId: data.custom_id,
                  embedding: data.response.body.data[0].embedding
                };
            }).filter((result) => result !== null);

        return results;
    }

    async embedInput(input: string): Promise<{ embedding: number[] } | null> {
        console.log('LlmService.embedInput called with input: ', input);
        try {
            const response = await this.client.embeddings.create({
                model: 'text-embedding-3-small',
                input: input,
            });

            console.log('LlmService.embedInput response: ', response.data[0].embedding.length);

            return { embedding: response.data[0].embedding };
        }

        catch (err) {
            console.log('Error in LlmService.embedInput: ', err);
            return null;
        }
    }

    async answerMessage(
        message: string, 
        previousMessageId: string | null = null,
    ): Promise<(AnswerMessage & { responseId: string }) | null>{
        try {
            console.log('LlmService.answerMessage called with message ', message);
            const response = await this.client.responses.parse({
                previous_response_id: previousMessageId,
                model: 'gpt-4.1-nano',
                instructions: OpenAiLlmService.ANSWER_MESSAGE_PROMPT,
                input: message,
                text: {
                    format: zodTextFormat(answerMessageSchema, 'answerSchema'),
                }
            });
            console.log('LlmService.answerMessage response: ', JSON.stringify(response.output_parsed, null, 2));
    
            if(!response.output_parsed){
                console.log('No parsed output in response', JSON.stringify(response));
                return null;
            }
    
            return {
                ...response.output_parsed,
                responseId: response.id
            }
        } catch (err) {
            console.log('Error in LlmService.answerMessage: ', err)
            return null;
        }
    }
}