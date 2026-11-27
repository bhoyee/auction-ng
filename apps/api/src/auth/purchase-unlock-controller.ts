import { clientIp } from '../security/client-ip';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  purchaseUnlockChallengeSchema,
  purchaseUnlockFinishSchema,
  purchaseUnlockStartSchema,
  purchaseUnlockStatusSchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from './auth-guard';
import { PurchaseUnlockService } from './purchase-unlock-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const parse = <T>(value: z.ZodType<T>, input: unknown) => {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the confirmation fields.');
  return result.data;
};

@ApiTags('Account security')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('auth/purchase-unlock')
export class PurchaseUnlockController {
  constructor(
    @Inject(PurchaseUnlockService)
    private readonly unlock: PurchaseUnlockService,
  ) {}
  private owner(req: AuthRequest, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    return req.identity;
  }
  @Get()
  @ApiOperation({
    summary:
      'Until when this sign-in may bid and buy without confirming again; null when it must confirm first.',
  })
  @ApiOkResponse({ schema: schema(purchaseUnlockStatusSchema) })
  status(
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    return this.unlock.status(this.owner(req, res));
  }
  @Post('start')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Check your password and email a five-minute code bound to this sign-in. Reserves no money.',
  })
  @ApiBody({ schema: schema(purchaseUnlockStartSchema) })
  @ApiOkResponse({ schema: schema(purchaseUnlockChallengeSchema) })
  start(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.unlock.start(
      this.owner(req, res),
      parse(purchaseUnlockStartSchema, body),
      clientIp(req),
    );
  }
  @Post('finish')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Enter the email code, and the authenticator code when it is on, to bid and buy for 30 minutes from this sign-in.',
  })
  @ApiBody({ schema: schema(purchaseUnlockFinishSchema) })
  @ApiOkResponse({ schema: schema(purchaseUnlockStatusSchema) })
  finish(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.unlock.finish(
      this.owner(req, res),
      parse(purchaseUnlockFinishSchema, body),
      clientIp(req),
    );
  }
}
