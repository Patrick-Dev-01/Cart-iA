import { Injectable } from "@nestjs/common";
import { PostgresService } from "../shared/postgres.service";

@Injectable()
export class ChatService{
    constructor(
        private readonly postgresService: PostgresService,
    ){}

    async createChatSession(userId: number){
        const result = await this.postgresService.client.query(
            `INSERT INTO chat_sessions (user_id) VALUES ($1) RETURNING id`,
            [userId]
        );

        return result.rows[0];
    }

    async getChatSession(sessionId: number){
        const result = await this.postgresService.client.query<{ 
            id: number,
            created_at: Date,
            user_id: number
        }>(`SELECT chat_sessions.id, chat_sessions.created_at, chat_sessions.user_id, JSON_AGG(
                JSON_BUILD_OBJECT(
                    'id', chat_messages.id,
                    'content', chat_messages.content,
                    'sender', chat_messages.sender,
                    'openai_message_id', chat_messages.openai_message_id,
                    'created_at', chat_messages.created_at,
                    'message_type', chat_messages.message_type
                )
            ) FILTER(WHERE chat_messages.id IS NOT NULL) AS messages 
            FROM chat_sessions 
            LEFT JOIN chat_messages ON chat_sessions.id = chat_messages.chat_session_id
            WHERE chat_sessions.id = $1
            GROUP BY chat_sessions.id, chat_messages.chat_session_id`, 
            [sessionId]);

        if(result.rows.length === 0){
            return null;
        }

        return result.rows[0]
    }

    async addUserMessage(sessionId: number, content: string){
        return this.addMessagesToSession(sessionId, content, 'user')
    }

    private async addMessagesToSession(
        sessionId: number,
        content: string,
        sender: 'user' | 'assistant',
        openaiMessageId?: string,
        messageType: 'text' | 'suggest_carts_result' = 'text'
    ){
        const result = await this.postgresService.client.query<{
            sessionId: number;
            content: string;
            sender: string;
            openaiMessageId?: string;
            created_at: Date;
            messageType: string
        }>(
            `INSERT INTO chat_messages (chat_session_id, content, sender, openai_message_id, message_type)
            VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [sessionId, content, sender, openaiMessageId || null, messageType]
        );

        return result.rows[0];
    }
}