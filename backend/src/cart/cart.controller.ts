import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller("cart")
export class CartController{
    userId = 1; 

    constructor(
        private readonly cartService: CartService
    ){}

    @Post()
    addtoCart(@Body() body: { productId: number, quantity: number }){
        if(!body.productId || !body.quantity){
            throw new BadRequestException("Product ID and quantity are required")
        }
        return this.cartService.addCart(1, body.productId, body.quantity)
    }

    @Get()
    async getCart(){
        const cart = await this.cartService.getCart(this.userId)

        if(!cart){
            throw new NotFoundException();
        }

        return cart
    }

    @Put(':cartId/items/:productId')
    async updateCartItem(
        @Body() body: { quantity: number },
        @Param('productId') productId: string,
    ){
        if(!body.quantity || body.quantity < 0){
            throw new BadRequestException('Quantity must be greater than 0');
        }

        await this.cartService.updateCartItemsQuantity(
            this.userId,
            Number(productId),
            body.quantity
        )
    }

    @Delete(`:cartId/items/:productId`)
    async removeCartItem(@Param('productId') productId: string){
        await this.cartService.removeCartItem(this.userId, Number(productId))
    }
}