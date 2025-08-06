import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod'
import { CreateEmbeddingResponse } from "openai/resources/embeddings";

const answerMessageSchema = z.object({
    message: z.string(),
    action: z.discriminatedUnion("type", [
        z.object({
            type: z.literal('send_message')
        }),
        z.object({
            type: z.literal('suggest_carts'),
            payload: z.object({
                input: z.string()
            })
        }),
    ])
});

type AnswerMessage = z.infer<typeof answerMessageSchema>

@Injectable()
export class LlmService{
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

    private client: OpenAI;

    constructor(private readonly configService: ConfigService){
        this.client = new OpenAI({
            apiKey: this.configService.get<string>('OPEN_AI_API_KEY'),
            webhookSecret: this.configService.get<string>('OPEN_AI_WEBHOOK_SECRET')
        })
    }

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
            return null;
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
            return;
        }
        
        console.log('Batch completed event received: ', event.data.id);
        const batch = await this.client.batches.retrieve(event.data.id);
        if(!batch || !batch.output_file_id){
            console.warn('Batch output file not found', event.data.id);
            return;
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
                instructions: LlmService.ANSWER_MESSAGE_PROMPT,
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