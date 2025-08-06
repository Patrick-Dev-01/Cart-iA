import { MiddlewareConsumer, Module, RawBody, RequestMethod } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { ConfigModule } from '@nestjs/config';
import { CartModule } from './cart/cart.module';
import { ChatModule } from './chat/chat.module';
import { WebHookController } from './webHookController';
import { JsonBodyMiddleware } from './middleware/json-body.middleware';
import { RawBodyMiddleware } from './middleware/raw-body.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    CatalogModule, 
    CartModule,
    ChatModule
  ],
  controllers: [WebHookController],
  providers: [],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void{
    consumer.apply(RawBodyMiddleware).forRoutes({
      path: '/webhooks/openai',
      method: RequestMethod.POST
    }).apply(JsonBodyMiddleware).forRoutes('*')
  }
}
