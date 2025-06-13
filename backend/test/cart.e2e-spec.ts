import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks()
    await app.init();
  });

  afterEach(async() => {
    await app.close();
  })

  it('should add product to the cart', async () => {
    const response = await request(app.getHttpServer()).post('/cart')
    .send({
        productId: 1,
        quantity: 2
    });

    expect(response.status).toBe(201)
    expect(response.body).toHaveProperty('id');

    const responseCart = await request(app.getHttpServer()).get('/cart/');
    expect(responseCart.status).toBe(200);
    expect(responseCart.body.id).toBe(response.body.id);
  });
});
