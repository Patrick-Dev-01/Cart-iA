import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { PostgresService } from '../shared/postgres.service';
import { ChatService } from './chat.service';
import { LlmService } from '../shared/llm/llm.service';
import { LlmModule } from 'src/shared/llm/llm.module';

@Module({
    imports: [LlmModule],
    controllers: [ChatController],
    providers: [PostgresService, ChatService],
    exports: []
})

export class ChatModule{}