import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  HttpCode,
  Req,
  Res,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import { purchaseInputSchema, purchaseStatusSchema } from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { PurchaseService } from './purchase-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
const empty = z.object({}).strict();
function parse<T>(value: z.ZodType<T>, input: unknown): T {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the purchase details and try again.');
  return result.data;
}
@ApiTags('Fixed-price purchases')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller()
export class PurchaseController {
  constructor(
    @Inject(PurchaseService) private readonly purchases: PurchaseService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async actor(
    request: AuthRequest,
    response: ServerResponse,
    readOnly = false,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    await (
      readOnly
        ? this.auth.limitPurchaseStatusRequests.bind(this.auth)
        : this.auth.limitPaymentRequests.bind(this.auth)
    )(request.identity.user.id, request.socket.remoteAddress ?? 'unknown');
    return {
      userId: request.identity.user.id,
      sessionId: request.identity.sessionId,
    };
  }
  @Post('lots/:id/purchases')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reserve a fixed-price item; explicitly accepted item price, tax and processing fee required. Wallet pays immediately; card/transfer uses hosted test checkout.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(purchaseInputSchema) })
  @ApiOkResponse({ schema: schema(purchaseStatusSchema) })
  async start(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.purchases.start(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(purchaseInputSchema, body),
    );
  }
  @Get('purchases/:id')
  @ApiOperation({ summary: 'Read your own purchase reservation and receipt.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(purchaseStatusSchema) })
  async get(
    @Param('id') id: string,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.purchases.get(
      (await this.actor(request, response, true)).userId,
      parse(z.uuid(), id),
    );
  }
  @Post('purchases/:id/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Re-verify provider payment. Redirects and client messages never prove payment; late payments remain wallet credit.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(empty) })
  @ApiOkResponse({ schema: schema(purchaseStatusSchema) })
  async confirm(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    parse(empty, body);
    return this.purchases.confirm(
      (await this.actor(request, response)).userId,
      parse(z.uuid(), id),
    );
  }
  @Post('purchases/:id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Cancel your unpaid reservation; a later verified payment is wallet credit, never a purchase.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(empty) })
  @ApiOkResponse({ schema: schema(purchaseStatusSchema) })
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    parse(empty, body);
    return this.purchases.cancel(
      (await this.actor(request, response)).userId,
      parse(z.uuid(), id),
    );
  }
}
