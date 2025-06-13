import { Injectable } from "@nestjs/common";
import { PostgresService } from "../shared/postgres.service";

type Cart = {
    id: number;
    userId: number;
    created_at: string;
    store_id: number;
    active: boolean;
}

@Injectable()
export class CartService{
    constructor(
        private readonly postgresService: PostgresService,
    ){}

    async addCart(userId: number, productId: number, quantity: number){
        return {
            id: 1,
        }
    }

    async getCart(userId: number){
        const result = await this.postgresService.client.query<Cart>(
            `SELECT * FROM carts WHERE user_id = $1 AND active = true`, 
            [userId],
        );

        return result.rows[0] ?? null;
    }
}