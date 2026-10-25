import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Query,
  Res,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  quoteBankTransfer,
  topupQuoteInputSchema,
  topupQuoteSchema,
  virtualAccountInputSchema,
  virtualAccountSchema,
  walletHistoryQuerySchema,
  paymentHistorySchema,
  quoteCardFunding,
  cardQuoteInputSchema,
  cardQuoteSchema,
  cardFundingInputSchema,
  cardCheckoutSchema,
  cardConfirmInputSchema,
  cardConfirmationSchema,
  fundingRefundInputSchema,
  fundingRefundSchema,
} from '@auction-ng/shared';
import { AuthService } from '../auth/auth-service';
import { Public, Roles, type AuthRequest } from '../auth/auth-guard';
import { PaymentService } from './payment-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const accountResponse = z.union([
  virtualAccountSchema,
  z.object({ status: z.enum(['pending', 'not_requested']) }).strict(),
]);
@ApiTags('Wallet funding')
@ApiBearerAuth()
@Controller('payments')
export class PaymentController {
  constructor(
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async buyer(request: AuthRequest, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    await this.auth.limitPaymentRequests(
      request.identity.user.id,
      request.socket.remoteAddress ?? 'unknown',
    );
    return request.identity.user.id;
  }
  @Post('card/quote')
  @HttpCode(200)
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({ schema: schema(cardQuoteInputSchema) })
  @ApiOkResponse({ schema: schema(cardQuoteSchema) })
  async cardQuote(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    await this.buyer(request, response);
    const parsed = cardQuoteInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    try {
      return quoteCardFunding(parsed.data.amountKobo, parsed.data.cardType);
    } catch {
      throw new BadRequestException(
        'The payment must exceed the processing fee.',
      );
    }
  }
  @Post('card/initialize')
  @HttpCode(200)
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({ schema: schema(cardFundingInputSchema) })
  @ApiOkResponse({
    schema: schema(cardCheckoutSchema),
    description:
      'Hosted card payment. The amount is collected, not preauthorized. No wallet credit until provider verification.',
  })
  async initializeCard(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = await this.buyer(request, response);
    const parsed = cardFundingInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return this.payments.initializeCard(userId, parsed.data);
  }
  @Post('card/confirm')
  @HttpCode(200)
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({ schema: schema(cardConfirmInputSchema) })
  @ApiOkResponse({
    schema: schema(cardConfirmationSchema),
    description:
      'Re-fetch Paystack status for your own checkout. A browser return is never payment proof.',
  })
  async confirmCard(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = await this.buyer(request, response);
    const parsed = cardConfirmInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return this.payments.confirmCard(userId, parsed.data.paymentId);
  }
  @Post('refund-requests')
  @HttpCode(200)
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({ schema: schema(fundingRefundInputSchema) })
  @ApiOkResponse({
    schema: schema(fundingRefundSchema),
    description:
      'Request review of unused funding. This does not reserve, debit or refund money.',
  })
  async requestRefund(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = await this.buyer(request, response);
    const parsed = fundingRefundInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return this.payments.requestFundingRefund(userId, parsed.data);
  }
  @Post('quote')
  @HttpCode(200)
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({ schema: schema(topupQuoteInputSchema) })
  @ApiOkResponse({
    schema: schema(topupQuoteSchema),
    description:
      'Buyer-paid Paystack fee and net wallet credit. External bank charges are excluded.',
  })
  async quote(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    await this.buyer(request, response);
    const parsed = topupQuoteInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return quoteBankTransfer(parsed.data.transferKobo);
  }
  @Post('virtual-account')
  @HttpCode(200)
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({ schema: schema(virtualAccountInputSchema) })
  @ApiOkResponse({ schema: schema(accountResponse) })
  async assign(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = await this.buyer(request, response);
    const parsed = virtualAccountInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException();
    return this.payments.assignAccount(userId, parsed.data);
  }
  @Get('virtual-account')
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOkResponse({ schema: schema(accountResponse) })
  async account(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    if (!z.object({}).strict().safeParse(query).success)
      throw new BadRequestException();
    return this.payments.getAccount(await this.buyer(request, response));
  }
  @Get('history')
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 50,
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @Roles('buyer')
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOkResponse({ schema: schema(paymentHistorySchema) })
  async history(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = await this.buyer(request, response);
    const parsed = walletHistoryQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    return this.payments.history(userId, parsed.data);
  }
  @Post('webhook')
  @ApiOperation({ summary: 'Receive a signed Paystack event', security: [] })
  @Public()
  @HttpCode(200)
  @ApiHeader({ name: 'x-paystack-signature', required: true })
  async webhook(
    @Req() request: AuthRequest & { rawBody?: Buffer },
    @Headers('x-paystack-signature') signature: unknown,
  ) {
    if (!request.rawBody || typeof signature !== 'string')
      throw new UnauthorizedException();
    await this.payments.webhook(request.rawBody, signature);
    return { received: true };
  }
  @Post('reconcile')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async reconcile(@Headers('authorization') authorization: unknown) {
    const secret = process.env.RECONCILIATION_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const actual = Buffer.from(authorization);
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    return this.payments.reconcile(new Date(to.getTime() - 86400000), to);
  }
}
