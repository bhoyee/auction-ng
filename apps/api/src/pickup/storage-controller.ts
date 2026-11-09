import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
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
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import * as s from '@auction-ng/shared';
import {
  Capabilities,
  Public,
  Roles,
  type AuthRequest,
} from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { PickupStorageService } from './storage-service';
import { NotificationService } from '../closing/notification-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const page = z.object({ cursor: z.uuid().optional() }).strict();
function parse<T extends z.ZodType>(shape: T, value: unknown): z.output<T> {
  const p = shape.safeParse(value);
  if (!p.success)
    throw new BadRequestException('Check the storage request fields.');
  return p.data;
}
@Controller('pickup/storage')
@ApiTags('Pickup deadlines and storage')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
export class PickupStorageController {
  constructor(
    @Inject(PickupStorageService)
    private readonly storage: PickupStorageService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}
  private async who(r: AuthRequest, write = false, staff = false) {
    if (!r.identity) throw new UnauthorizedException();
    if (write) {
      if (staff)
        await this.auth.staffActionRate(
          r.identity.user.id,
          r.socket.remoteAddress ?? 'unknown',
        );
      else
        await this.auth.limitPaymentRequests(
          r.identity.user.id,
          r.socket.remoteAddress ?? 'unknown',
        );
    }
    return r.identity;
  }
  @Get('mine')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Your item-level pickup deadlines, confirmed storage policy and current storage charges.',
  })
  @ApiOkResponse({ schema: schema(s.storageCasePageSchema) })
  async mine(@Query() q: unknown, @Req() r: AuthRequest) {
    return this.storage.buyerList(
      (await this.who(r)).user.id,
      parse(s.storagePageQuerySchema, q),
    );
  }
  @Get('cases')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: schema(s.storageCasePageSchema) })
  async cases(@Query() q: unknown, @Req() r: AuthRequest) {
    return this.storage.staffList(
      await this.who(r),
      parse(s.storagePageQuerySchema, q),
    );
  }
  @Get('prepare')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Paid pickup items awaiting physical-ready confirmation, oldest payment first. Read-only; confirming readiness uses POST ready.',
  })
  @ApiOkResponse({ schema: schema(s.pickupPreparePageSchema) })
  async prepare(@Query() q: unknown, @Req() r: AuthRequest) {
    return this.storage.prepareQueue(
      await this.who(r),
      parse(s.pickupPrepareQuerySchema, q),
    );
  }
  @Get('centres')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    schema: schema(
      z
        .object({
          items: z.array(s.storageCentreSchema).max(20),
          nextCursor: z.uuid().nullable(),
        })
        .strict(),
    ),
  })
  async centres(@Query() q: unknown, @Req() r: AuthRequest) {
    return this.storage.centres(await this.who(r), parse(page, q).cursor);
  }
  @Post('centres')
  @Capabilities('storage.manage')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiBody({ schema: schema(s.storageCentreSaveSchema) })
  @ApiOkResponse({ schema: schema(s.storageResultSchema) })
  async configure(@Body() b: unknown, @Req() r: AuthRequest) {
    return this.storage.configure(
      await this.who(r, true, true),
      parse(s.storageCentreSaveSchema, b),
    );
  }
  @Post('ready')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiBody({ schema: schema(s.storageReadySchema) })
  @ApiOkResponse({ schema: schema(s.storageResultSchema) })
  async ready(@Body() b: unknown, @Req() r: AuthRequest) {
    return this.storage.ready(
      await this.who(r, true, true),
      parse(s.storageReadySchema, b),
    );
  }
  @Post('adjust')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiBody({ schema: schema(s.storageAdjustSchema) })
  @ApiOkResponse({ schema: schema(s.storageResultSchema) })
  async adjust(@Body() b: unknown, @Req() r: AuthRequest) {
    return this.storage.adjust(
      await this.who(r, true, true),
      parse(s.storageAdjustSchema, b),
    );
  }
  @Get('exceptions')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: schema(s.storageExceptionPageSchema) })
  async exceptions(@Query() q: unknown, @Req() r: AuthRequest) {
    return this.storage.exceptions(await this.who(r), parse(page, q).cursor);
  }
  @Get('cases/:id/payment')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: schema(s.storagePaymentSchema.nullable()) })
  async pendingPayment(@Param('id') id: string, @Req() r: AuthRequest) {
    return this.storage.pendingPayment(
      (await this.who(r)).user.id,
      parse(z.uuid(), id),
    );
  }
  @Post('quote')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiBody({ schema: schema(s.storagePaymentStartSchema) })
  @ApiOkResponse({ schema: schema(s.storagePaymentSchema) })
  async quote(@Body() b: unknown, @Req() r: AuthRequest) {
    return this.storage.quote(
      await this.who(r, true),
      parse(s.storagePaymentStartSchema, b),
    );
  }
  @Post('confirm')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiBody({ schema: schema(s.storagePaymentConfirmSchema) })
  @ApiOkResponse({ schema: schema(s.storagePaymentSchema) })
  async confirm(@Body() b: unknown, @Req() r: AuthRequest) {
    return this.storage.confirm(
      await this.who(r, true),
      parse(s.storagePaymentConfirmSchema, b),
    );
  }
  @Get('payments/:id')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: schema(s.storagePaymentSchema) })
  async payment(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(z.object({}).strict(), q);
    return this.storage.payment(
      (await this.who(r)).user.id,
      parse(z.uuid(), id),
    );
  }
  @Post('payments/:id/verify')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOkResponse({ schema: schema(s.storagePaymentSchema) })
  async verify(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(z.object({}).strict(), b ?? {});
    return this.storage.verify(
      (await this.who(r, true)).user.id,
      parse(z.uuid(), id),
    );
  }
  @Post('payments/:id/cancel')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOkResponse({ schema: schema(s.storagePaymentSchema) })
  async cancel(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(z.object({}).strict(), b ?? {});
    return this.storage.cancel(
      (await this.who(r, true)).user.id,
      parse(z.uuid(), id),
    );
  }
  @Post('maintain')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Private bounded pickup reminder/review/payment reconciliation batch.',
  })
  async maintain(
    @Headers('authorization') authorization: unknown,
    @Body() b: unknown,
    @Query() q: unknown,
  ) {
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const actual = Buffer.from(authorization),
      expected = Buffer.from('Bearer ' + secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    parse(z.object({}).strict(), b ?? {});
    parse(z.object({}).strict(), q);
    const result = await this.storage.maintain();
    await this.notifications.deliver();
    return result;
  }
}
