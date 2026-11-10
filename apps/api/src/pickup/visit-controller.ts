import { clientIp } from '../security/client-ip';
import { Capabilities } from '../auth/auth-guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  visitPageInputSchema,
  visitItemPageInputSchema,
  pickupCentrePageSchema,
  prepareVisitPassSchema,
  scanVisitPassSchema,
  pickupVisitPassSchema,
  pickupVisitSchema,
  pickupVisitPageSchema,
  pickupVisitItemsSchema,
  confirmCollectionSchema,
  collectionReceiptSchema,
  cancelVisitSchema,
  collectionHistoryInputSchema,
  collectionHistoryPageSchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { VisitService } from './visit-service';
const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: 'openapi-3.0' }) as SchemaObject;
function parse<T>(s: z.ZodType<T>, v: unknown) {
  const p = s.safeParse(v);
  if (!p.success) throw new BadRequestException('Check the request fields.');
  return p.data;
}
function owner(r: AuthRequest) {
  if (!r.identity) throw new UnauthorizedException();
  return r.identity.user.id;
}
const empty = z.object({}).strict();
@Controller('pickup')
@ApiTags('Pickup visits and collection')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
export class VisitController {
  constructor(
    @Inject(VisitService) private readonly visits: VisitService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async mutation(r: AuthRequest, staff = false) {
    const id = owner(r);
    await this.auth.limitPickupRequests(id, clientIp(r), staff);
    return id;
  }
  @Get('centres')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Collection centres with your paid, uncollected items.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: schema(pickupCentrePageSchema) })
  async centres(@Query() q: unknown, @Req() r: AuthRequest) {
    const p = parse(visitPageInputSchema, q);
    return pickupCentrePageSchema.parse(
      await this.visits.centres(owner(r), p.limit, p.cursor),
    );
  }
  @Post('visit-pass')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Prepare one private, ten-minute arrival pass for your collection centre. Does not check you in.',
  })
  @ApiBody({ schema: schema(prepareVisitPassSchema) })
  @ApiOkResponse({ schema: schema(pickupVisitPassSchema) })
  async prepare(
    @Body() b: unknown,
    @Query() q: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(empty, q);
    const p = parse(prepareVisitPassSchema, b);
    return this.visits.prepare(await this.mutation(r), p.locationId, p.renew);
  }
  @Get('visit-pass/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Read only your private arrival pass and latest visit status.',
  })
  @ApiOkResponse({ schema: schema(pickupVisitPassSchema) })
  async pass(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(empty, q);
    parse(z.uuid(), id);
    return this.visits.pass(owner(r), id);
  }
  @Get('visits')
  @Roles('admin', 'warehouse')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Paginated warehouse queue: one visit per buyer/centre, no pass tokens.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: schema(pickupVisitPageSchema) })
  async queue(@Query() q: unknown) {
    const p = parse(visitPageInputSchema, q);
    return pickupVisitPageSchema.parse(
      await this.visits.queue(p.limit, p.cursor),
    );
  }
  @Get('collections')
  @Roles('admin', 'warehouse')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Read collected items, including partial handovers and legacy completed pickups. Newest first; no private pass tokens.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiOkResponse({ schema: schema(collectionHistoryPageSchema) })
  async history(@Query() q: unknown, @Req() r: AuthRequest) {
    return this.visits.history(
      owner(r),
      parse(collectionHistoryInputSchema, q),
    );
  }
  @Post('visits/scan')
  @Roles('admin', 'warehouse')
  @Capabilities('pickup.manage')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Scan private arrival QR or enter eight-character code. Registers arrival once, never collects goods.',
  })
  @ApiBody({ schema: schema(scanVisitPassSchema) })
  @ApiOkResponse({ schema: schema(pickupVisitSchema) })
  async scan(@Body() b: unknown, @Query() q: unknown, @Req() r: AuthRequest) {
    parse(empty, q);
    const p = parse(scanVisitPassSchema, b);
    return this.visits.scan(await this.mutation(r, true), p.code);
  }
  @Get('visits/:id/items')
  @Roles('admin', 'warehouse')
  @Capabilities('pickup.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Eligible uncollected item checklist for one visit; no per-order check-in.',
  })
  @ApiQuery({
    name: 'itemNumber',
    required: false,
    type: String,
    description: 'Exact staff-scanned item reference.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: schema(pickupVisitItemsSchema) })
  async items(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(z.uuid(), id);
    const p = parse(visitItemPageInputSchema, q);
    return pickupVisitItemsSchema.parse(
      await this.visits.items(owner(r), id, p.limit, p.cursor, p.itemNumber),
    );
  }
  @Post('visits/:id/collect')
  @Roles('admin', 'warehouse')
  @Capabilities('pickup.manage')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Audited, idempotent handover of explicitly selected paid items. Partial collection leaves remaining items pending.',
  })
  @ApiBody({ schema: schema(confirmCollectionSchema) })
  @ApiOkResponse({ schema: schema(collectionReceiptSchema) })
  async collect(
    @Param('id') id: string,
    @Body() b: unknown,
    @Query() q: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(empty, q);
    parse(z.uuid(), id);
    const p = parse(confirmCollectionSchema, b);
    return this.visits.collect(await this.mutation(r, true), id, p);
  }
  @Post('visits/:id/cancel')
  @Roles('admin', 'warehouse')
  @Capabilities('pickup.manage')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Cancel an abandoned visit with an audited reason; does not collect or refund items.',
  })
  @ApiBody({ schema: schema(cancelVisitSchema) })
  @ApiOkResponse({ schema: schema(pickupVisitSchema) })
  async cancel(
    @Param('id') id: string,
    @Body() b: unknown,
    @Query() q: unknown,
    @Req() r: AuthRequest,
  ) {
    parse(empty, q);
    parse(z.uuid(), id);
    const p = parse(cancelVisitSchema, b);
    return this.visits.cancel(await this.mutation(r, true), id, p.reason);
  }
}
