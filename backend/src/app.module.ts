import { Module } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { ConfigModule } from '@nestjs/config';
import { CartModule } from './cart/cart.module';

@Module({
  imports: [
    CatalogModule, 
    ConfigModule.forRoot({
      isGlobal: true
    }),
    CartModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
