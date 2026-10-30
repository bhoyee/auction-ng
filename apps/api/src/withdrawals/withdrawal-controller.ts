import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  pageQuerySchema,
  withdrawalBankInputSchema,
  withdrawalBankSchema,
  withdrawalConfirmSchema,
  withdrawalOverviewSchema,
  withdrawalPageSchema,
  withdrawalQuoteInputSchema,
  withdrawalQuoteSchema,
  withdrawalReviewSchema,
  withdrawalSchema,
  withdrawalStartSchema,
  withdrawalProcessReportSchema,
  bankChangeSchema,
  bankChangeStartSchema,
} from '@auction-ng/shared';
import { Public, Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { WithdrawalService } from './withdrawal-service';
import { NotificationService } from '../closing/notification-service';
const schema = (input: z.ZodType) =>
  z.toJSONSchema(input, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
function parse<T extends z.ZodType>(shape: T, input: unknown): z.output<T> {
  const result = shape.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the withdrawal details.');
  return result.data;
}
@ApiTags('Wallet withdrawals')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('withdrawals')
export class WithdrawalController {
  constructor(
    @Inject(WithdrawalService) private readonly withdrawals: WithdrawalService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async owner(
    request: AuthRequest,
    response: ServerResponse,
    read = false,
    confirm = false,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    const id = request.identity.user.id,
      ip = request.socket.remoteAddress ?? 'unknown';
    if (read) await this.auth.limitPaymentReads(id, ip);
    else await this.auth.limitWithdrawals(id, ip, confirm);
    return request.identity;
  }
  @Get('overview')
  @ApiOkResponse({ schema: schema(withdrawalOverviewSchema) })
  async overview(
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    const who = await this.owner(req, res, true);
    return this.withdrawals.overview(who.user.id);
  }
  @Post('bank')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Resolve own bank details and request BVN identity verification. Does not send money.',
  })
  @ApiBody({ schema: schema(withdrawalBankInputSchema) })
  @ApiOkResponse({ schema: schema(withdrawalBankSchema) })
  async bank(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res);
    return this.withdrawals.verifyBank(
      who.user.id,
      parse(withdrawalBankInputSchema, body),
    );
  }
  @Post('bank-change/start')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Confirm password and send a purpose-bound code for changing the withdrawal bank. Keeps the existing bank selected.',
  })
  @ApiBody({ schema: schema(bankChangeStartSchema) })
  @ApiOkResponse({ schema: schema(bankChangeSchema) })
  async startBankChange(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res);
    return this.withdrawals.startBankChange(
      who.user.id,
      who.sessionId,
      parse(bankChangeStartSchema, body),
    );
  }
  @Post('bank-change/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Consume the bank-change code and verify the replacement against the existing BVN. Does not send money.',
  })
  @ApiBody({ schema: schema(withdrawalConfirmSchema) })
  @ApiOkResponse({ schema: schema(bankChangeSchema) })
  async confirmBankChange(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res, false, true);
    return this.withdrawals.confirmBankChange(
      who.user.id,
      who.sessionId,
      parse(withdrawalConfirmSchema, body),
    );
  }
  @Get('bank-change/:id')
  @ApiOperation({
    summary:
      'Read only your bank-change verification status and masked replacement details.',
  })
  @ApiOkResponse({ schema: schema(bankChangeSchema) })
  async getBankChange(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    const who = await this.owner(req, res, true);
    return this.withdrawals.getBankChange(who.user.id, parse(z.uuid(), id));
  }
  @Post('bank-change/:id/retry')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Retry code delivery or the same confirmed bank verification without changing beneficiary details.',
  })
  @ApiBody({ schema: schema(z.object({}).strict()) })
  @ApiOkResponse({ schema: schema(bankChangeSchema) })
  async retryBankChange(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), body);
    const who = await this.owner(req, res);
    return this.withdrawals.bankChanges.retry(
      who.user.id,
      who.sessionId,
      parse(z.uuid(), id),
    );
  }
  @Post('quote')
  @HttpCode(200)
  @ApiBody({ schema: schema(withdrawalQuoteInputSchema) })
  @ApiOkResponse({ schema: schema(withdrawalQuoteSchema) })
  @ApiUnprocessableEntityResponse({
    description:
      'Available wallet funds do not cover the withdrawal amount plus all fees and levies. No code or reservation is created.',
  })
  async quote(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res, true);
    return this.withdrawals.quoteForBuyer(
      who.user.id,
      parse(withdrawalQuoteInputSchema, body).amountKobo,
    );
  }
  @Post('bank/retry')
  @HttpCode(200)
  @ApiBody({ schema: schema(z.object({}).strict()) })
  @ApiOkResponse({ schema: schema(withdrawalBankSchema) })
  async retryBank(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), body);
    const who = await this.owner(req, res);
    return this.withdrawals.retryBank(who.user.id);
  }
  @Post('start')
  @HttpCode(200)
  @ApiBody({ schema: schema(withdrawalStartSchema) })
  @ApiOkResponse({ schema: schema(withdrawalSchema) })
  async start(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res);
    return this.withdrawals.start(
      who.user.id,
      who.sessionId,
      parse(withdrawalStartSchema, body),
    );
  }
  @Post('confirm')
  @HttpCode(200)
  @ApiBody({ schema: schema(withdrawalConfirmSchema) })
  @ApiOkResponse({ schema: schema(withdrawalSchema) })
  async confirm(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res, false, true);
    return this.withdrawals.confirm(
      who.user.id,
      who.sessionId,
      parse(withdrawalConfirmSchema, body),
    );
  }
  @Get()
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: schema(withdrawalPageSchema) })
  async history(
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res, true),
      page = parse(pageQuerySchema, query);
    return this.withdrawals.history(who.user.id, page.limit, page.cursor);
  }
  @Get(':id')
  @ApiOkResponse({ schema: schema(withdrawalSchema) })
  async get(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    const who = await this.owner(req, res, true);
    return this.withdrawals.get(who.user.id, parse(z.uuid(), id));
  }
}
@ApiTags('Withdrawal finance review')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('finance', 'admin')
@Controller('admin/withdrawals')
export class WithdrawalReviewController {
  constructor(
    @Inject(WithdrawalService) private readonly withdrawals: WithdrawalService,
  ) {}
  @Post(':id/review')
  @HttpCode(200)
  @ApiBody({ schema: schema(withdrawalReviewSchema) })
  @ApiOkResponse({ schema: schema(withdrawalSchema) })
  async review(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    if (!req.identity) throw new UnauthorizedException();
    const value = parse(withdrawalReviewSchema, body);
    return this.withdrawals.review(
      req.identity.user.id,
      parse(z.uuid(), id),
      value.approve,
      value.reason,
    );
  }
}
@ApiTags('Internal withdrawal processing')
@Controller('internal/withdrawals')
export class WithdrawalWorkerController {
  constructor(
    @Inject(WithdrawalService) private readonly withdrawals: WithdrawalService,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}
  @Post('process')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Private worker-only transfer reconciliation. Requires bid-maintenance bearer secret.',
  })
  @ApiOkResponse({ schema: schema(withdrawalProcessReportSchema) })
  @ApiBody({ schema: schema(z.object({}).strict()) })
  async process(
    @Headers('authorization') header: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof header !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from('Bearer ' + secret),
      actual = Buffer.from(header);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    parse(z.object({}).strict(), body ?? {});
    parse(z.object({}).strict(), query);
    const report = await this.withdrawals.maintain();
    await this.notifications.deliver();
    return report;
  }
}
