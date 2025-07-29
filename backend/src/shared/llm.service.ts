import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod'

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


    async answerMessage(message: string): Promise<(AnswerMessage & { responseId: string }) | null>{
        try {
            console.log('LlmService.answerMessage called with message ', message);
            const response = await this.client.responses.parse({
                model: 'gpt-4.1-nano',
                instructions: LlmService.ANSWER_MESSAGE_PROMPT,
                input: message,
                text: {
                    format: zodTextFormat(answerMessageSchema, 'answerSchema'),
                }
            });
            console.log('LlmService.answerMessage response: ', JSON.stringify(response, null, 2));
    
            if(!response.output_parsed){
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