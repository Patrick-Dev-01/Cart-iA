import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}

bootstrap().catch((err) => {
  console.error("Error during application bootstrap: ", err)
})
