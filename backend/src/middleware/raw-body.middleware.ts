import type { Request, Response } from 'express';
import * as bodyParser from 'body-parser';
import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class RawBodyMiddleware implements NestMiddleware{
    use(req: Request, res: Response, next: () => any) {
        bodyParser.text({ type: '*/*' })(req, res, next);
    }
}