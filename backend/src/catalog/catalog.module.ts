import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PostgresService } from '../shared/postgres.service';
import { LlmModule } from 'src/shared/llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [CatalogController],
  providers: [CatalogService, PostgresService],
  exports: [CatalogService],
})
export class CatalogModule {}
