import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
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
}