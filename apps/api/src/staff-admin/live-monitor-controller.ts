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
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import * as s from '@auction-ng/shared';
import { Capabilities, Public, type AuthRequest } from '../auth/auth-guard';
import { LiveMonitorService } from './live-monitor-service';
import { AuthService } from '../auth/auth-service';
import { readMonitorHistory, readMonitorLot } from './monitor-history';

const parts = z.enum([
  'summary',
  'lots',
  'series',
  'issues',
  'closed',
  'filters',
]);
const shape = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
@Controller('staff/live-monitor')
@ApiTags('Staff Live monitor')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
export class LiveMonitorController {
  constructor(
    @Inject(LiveMonitorService) private readonly monitor: LiveMonitorService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get('lots/:id/details')
  @Capabilities('inventory.read')
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: shape(s.monitorLotDetailSchema) })
  @ApiOperation({
    summary:
      'Read the complete staff lot workspace and paginated change history.',
  })
  async detail(
    @Param('id') id: unknown,
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    if (
      !z.uuid().safeParse(id).success ||
      !s.monitorHistoryQuerySchema.safeParse(query).success
    )
      throw new BadRequestException();
    return readMonitorLot(
      this.monitor.staffService,
      req.identity,
      String(id),
      query,
    );
  }
  @Get('lots/:id/control')
  @Capabilities('auctions.manage')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: shape(s.lotControlQuoteSchema) })
  @ApiOperation({
    summary:
      'Read current item-control effects before confirmation; admin and operations manager only.',
  })
  async quote(
    @Param('id') id: unknown,
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    if (
      !z.uuid().safeParse(id).success ||
      !z.object({}).strict().safeParse(query).success
    )
      throw new BadRequestException();
    return this.monitor.lotControls.quote(req.identity, String(id));
  }
  @Post('lot-control')
  @Capabilities('auctions.manage')
  @HttpCode(200)
  @ApiBody({ schema: shape(s.lotControlInputSchema) })
  @ApiOkResponse({ schema: shape(s.monitorCommandResultSchema) })
  @ApiOperation({
    summary:
      'Apply an audited idempotent individual pause, resume, extension or whole-lot cancellation.',
  })
  async lotControl(
    @Body() input: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    if (!s.lotControlInputSchema.safeParse(input).success)
      throw new BadRequestException(
        'Check the action, reason and confirmation.',
      );
    await this.auth.staffActionRate(
      req.identity.user.id,
      req.socket.remoteAddress ?? 'unknown',
    );
    return this.monitor.lotControls.request(req.identity, input);
  }
  @Get('lots/:id/bids')
  @Capabilities('auctions.manage')
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: shape(s.monitorHistorySchema) })
  @ApiOperation({
    summary:
      'Read paginated bids with masked names; administrator full-name access is audited.',
  })
  async bids(
    @Param('id') id: unknown,
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    if (
      !z.uuid().safeParse(id).success ||
      !s.monitorHistoryQuerySchema.safeParse(query).success
    )
      throw new BadRequestException();
    return readMonitorHistory(
      this.monitor.staffService,
      req.identity,
      String(id),
      query,
    );
  }
  @Post('control')
  @Capabilities('auctions.manage')
  @HttpCode(200)
  @ApiBody({ schema: shape(s.monitorCommandSchema) })
  @ApiOkResponse({ schema: shape(s.staffMutationResultSchema) })
  @ApiOperation({
    summary:
      'Request a durable, audited administrator pause or resume of all bidding.',
  })
  async control(
    @Body() input: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    if (!s.monitorCommandSchema.safeParse(input).success)
      throw new BadRequestException(
        'Enter the action, confirmation and reason.',
      );
    await this.auth.staffActionRate(
      req.identity.user.id,
      req.socket.remoteAddress ?? 'unknown',
    );
    return this.monitor.controlBidding(req.identity, input);
  }
  @Post('message')
  @Capabilities('auctions.manage')
  @HttpCode(200)
  @ApiBody({ schema: shape(s.monitorCommandSchema) })
  @ApiOkResponse({ schema: shape(s.staffMutationResultSchema) })
  @ApiOperation({
    summary: 'Queue an audited, idempotent message to this item’s bidders.',
  })
  async message(
    @Body() input: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    if (!s.monitorCommandSchema.safeParse(input).success)
      throw new BadRequestException('Choose an item, message and reason.');
    await this.auth.staffActionRate(
      req.identity.user.id,
      req.socket.remoteAddress ?? 'unknown',
    );
    return this.monitor.messageBidders(req.identity, input);
  }
  @Post('history')
  @Capabilities('bids.read')
  @HttpCode(200)
  @ApiBody({ schema: shape(s.monitorCommandSchema) })
  @ApiOkResponse({ schema: shape(s.staffMutationResultSchema) })
  @ApiOperation({
    summary:
      'Record a reasoned, idempotent staff inspection of bid history before opening it.',
  })
  async history(
    @Body() input: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    const value = s.monitorCommandSchema.safeParse(input);
    if (!value.success)
      throw new BadRequestException('Enter a reason for viewing bid history.');
    await this.auth.staffActionRate(
      req.identity.user.id,
      req.socket.remoteAddress ?? 'unknown',
    );
    return this.monitor.recordHistory(req.identity, value.data);
  }
  @Get(':part')
  @Capabilities('auctions.manage')
  @ApiParam({ name: 'part', enum: parts.options })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'locationId', required: false, type: String })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Live lots only: case-insensitive name or item ID match, up to 120 characters, applied before pagination.',
  })
  @ApiOperation({
    summary:
      'Read permission-checked live projection data; no hot bid or ledger aggregation.',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        s.monitorSummarySchema,
        s.monitorLotsSchema,
        s.monitorSeriesSchema,
        s.monitorIssuesSchema,
        s.monitorClosedSchema,
        s.monitorFiltersSchema,
      ].map(shape),
    },
  })
  async read(
    @Param('part') part: unknown,
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    const parsed = parts.safeParse(part),
      input = s.liveMonitorQuerySchema.safeParse(query);
    if (!parsed.success || !input.success)
      throw new BadRequestException('Check monitor filters and retry.');
    return this.monitor.read(req.identity, parsed.data, input.data);
  }
}
@Controller('internal/analytics')
@ApiTags('Private analytics maintenance')
export class LiveMonitorMaintenanceController {
  constructor(
    @Inject(LiveMonitorService) private readonly monitor: LiveMonitorService,
  ) {}
  @Post('live-refresh')
  @Public()
  @HttpCode(200)
  @ApiBody({ schema: shape(z.object({}).strict()) })
  @ApiOperation({
    summary:
      'Private worker refresh of Redis Live monitor projections; requires maintenance bearer token.',
  })
  @ApiOkResponse({
    schema: shape(z.object({ status: z.enum(['completed', 'busy']) }).strict()),
  })
  async refresh(
    @Headers('authorization') auth: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof auth !== 'string')
      throw new UnauthorizedException();
    const actual = Buffer.from(auth),
      expected = Buffer.from('Bearer ' + secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    if (
      !z.object({}).strict().safeParse(body).success ||
      !z.object({}).strict().safeParse(query).success
    )
      throw new BadRequestException();
    return this.monitor.refresh();
  }
}
