import { Injectable, NotFoundException } from "@nestjs/common";
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
        const products = await this.postgresService.client.query<{store_id: number}>(`SELECT store_id FROM products WHERE id = $1`, [productId]);

        if(products.rows.length === 0){
            throw new NotFoundException("Product not found");
        }

        const existingCart = await this.postgresService.client.query<Cart>(
            `SELECT id, store_id FROM carts WHERE user_id = $1 AND active = true`,
            [userId]
        );

        if(existingCart.rows.length > 0 && existingCart.rows[0].store_id == products.rows[0].store_id){
            await this.postgresService.client.query(
                `INSERT INTO cart_items (cart_id, product_id, quantity) 
                VALUES ($1, $2, $3)
                ON CONFLICT (cart_id, product_id) DO UPDATE SET QUANTITY = cart_items.quantity + EXCLUDED.quantity`,
                [existingCart.rows[0].id, productId, quantity]
            )

            return {
                id: existingCart.rows[0].id
            }
        }

        if (existingCart.rows.length > 0 && existingCart.rows[0].store_id !== products.rows[0].store_id){
            await this.postgresService.client.query(
                `UPDATE carts SET active = false WHERE id = $1`,
                [existingCart.rows[0].id]
            );
        }

        const cart = await this.postgresService.client.query<{id: number}>(`
            INSERT INTO carts (user_id, store_id) VALUES ($1, $2) RETURNING id`, 
            [userId, products.rows[0].store_id],
        );
        
        await this.postgresService.client.query(
            `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)`, 
            [cart.rows[0].id, productId, quantity]
        );

        return {
            id: cart.rows[0].id,
        }
    }

    async getCart(userId: number){
        const result = await this.postgresService.client.query<Cart>(
            `SELECT carts.id AS id,  
                json_agg(
                    json_build_object(
                        'id', products.id,
                        'name', products.name,
                        'price', products.price,
                        'quantity', cart_items.quantity
                    )
                ) as items 
            FROM carts 
            JOIN cart_items ON carts.id = cart_items.cart_id 
            JOIN products ON cart_items.product_id = products.id

            WHERE user_id = $1 AND active = true
            GROUP BY carts.id 
            `, 
            [userId],
        );

        return result.rows[0] ?? null;
    }
}