import { Body, Controller, Headers, Post,  } from '@nestjs/common';
import { CatalogService } from './catalog/catalog.service';

@Controller('webhooks')
export class WebHookController {
    constructor(
        private readonly catalogService: CatalogService
    ) {}

    @Post('openai')
    async handleOpenAIWebhook(@Body() body: string, @Headers() headers: Record<string, string>) {
        return this.catalogService.handleEmbeddingWebhook(body, headers)
    }
}