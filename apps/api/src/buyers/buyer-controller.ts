import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  buyerBidPageSchema,
  buyerInvoiceDetailSchema,
  buyerInvoicePageSchema,
  pageQuerySchema,
  watchInputSchema,
  watchPageSchema,
  watchStatusInputSchema,
  watchStatusSchema,
  lotBidHistorySchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { BuyerService } from './buyer-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
function parse<T>(value: z.ZodType<T>, input: unknown) {
  const parsed = value.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException('Check the request fields.');
  return parsed.data;
}
function owner(request: AuthRequest, response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (!request.identity) throw new UnauthorizedException();
  return request.identity.user.id;
}
@ApiTags('Buyer account')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('buyers')
export class BuyerController {
  constructor(@Inject(BuyerService) private readonly buyers: BuyerService) {}
  @Get('lots/:id/bid-history')
  @ApiOperation({
    summary:
      'Recorded public price changes with lot-scoped aliases. Never private limits or current live prices.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(lotBidHistorySchema) })
  async history(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    owner(request, response);
    const page = parse(pageQuerySchema, query);
    return lotBidHistorySchema.parse(
      await this.buyers.lotHistory(
        parse(z.uuid(), id),
        page.limit,
        page.cursor,
      ),
    );
  }
  @Post('watchlist/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Read your saved state for up to 50 displayed lots in one query.',
  })
  @ApiBody({ schema: schema(watchStatusInputSchema) })
  @ApiOkResponse({ schema: schema(watchStatusSchema) })
  watched(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response);
    parse(z.object({}).strict(), query);
    return this.buyers.watched(
      userId,
      parse(watchStatusInputSchema, body).lotIds,
    );
  }

  @Get('watchlist')
  @ApiOperation({
    summary:
      'Read your own watchlist. Starting-price metadata only; no live bids.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '1–50',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(watchPageSchema) })
  watches(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response);
    const page = parse(pageQuerySchema, query);
    return this.buyers.watches(userId, page.limit, page.cursor);
  }
  @Post('watchlist/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Idempotently save or remove a lot from your own watchlist.',
  })
  @ApiBody({ schema: schema(watchInputSchema) })
  @ApiOkResponse({ schema: schema(watchInputSchema) })
  watch(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response);
    parse(z.object({}).strict(), query);
    return this.buyers.watch(
      userId,
      parse(z.uuid(), id),
      parse(watchInputSchema, body).watching,
    );
  }
  @Get('bids')
  @ApiOperation({
    summary:
      'Read your own persisted bid history. Amounts are historical, not current prices.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(buyerBidPageSchema) })
  bids(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response);
    const page = parse(pageQuerySchema, query);
    return this.buyers.bids(userId, page.limit, page.cursor);
  }
  @Get('invoices')
  @ApiOperation({ summary: 'Read your own invoices, newest first.' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(buyerInvoicePageSchema) })
  invoices(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response);
    const page = parse(pageQuerySchema, query);
    return this.buyers.invoices(userId, page.limit, page.cursor);
  }
  @Get('invoices/:id')
  @ApiOperation({
    summary:
      'Read one invoice you own. Pickup token requires a separate authenticated request.',
  })
  @ApiOkResponse({ schema: schema(buyerInvoiceDetailSchema) })
  invoice(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response);
    parse(z.object({}).strict(), query);
    return this.buyers.invoice(userId, parse(z.uuid(), id));
  }
}
