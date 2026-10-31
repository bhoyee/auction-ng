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
  arrivalInputSchema,
  arrivalUpdateSchema,
  arrivalPageInputSchema,
  arrivalPageSchema,
  arrivalSchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { ArrivalService } from './arrival-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
function parse<T>(value: z.ZodType<T>, input: unknown) {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the request fields.');
  return result.data;
}
function owner(request: AuthRequest) {
  if (!request.identity) throw new UnauthorizedException();
  return request.identity.user.id;
}
@Controller('pickup')
@ApiTags('Pickup arrivals')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
export class ArrivalController {
  constructor(
    @Inject(ArrivalService) private readonly arrivals: ArrivalService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Post('check-in')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Confirm arrival for your paid, uncollected order; does not collect goods.',
  })
  @ApiBody({ schema: schema(arrivalInputSchema) })
  @ApiOkResponse({ schema: schema(arrivalSchema) })
  async checkIn(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    const input = parse(arrivalInputSchema, body);
    parse(z.object({}).strict(), query);
    const id = owner(request);
    await this.auth.limitPickupRequests(
      id,
      request.socket.remoteAddress ?? 'unknown',
    );
    return this.arrivals.checkIn(id, input);
  }
  @Get('arrivals')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Your active pickup arrivals, oldest first.' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: schema(arrivalPageSchema) })
  async mine(@Query() query: unknown, @Req() request: AuthRequest) {
    const page = parse(arrivalPageInputSchema, query);
    return arrivalPageSchema.parse(
      await this.arrivals.list(owner(request), page.limit, page.cursor),
    );
  }
  @Get('staff/arrivals')
  @Roles('admin', 'warehouse')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Paid, uncollected buyers who checked in. No private pass tokens.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: schema(arrivalPageSchema) })
  async queue(@Query() query: unknown) {
    const page = parse(arrivalPageInputSchema, query);
    return arrivalPageSchema.parse(
      await this.arrivals.list(undefined, page.limit, page.cursor),
    );
  }
  @Post('staff/arrivals/:id')
  @Roles('admin', 'warehouse')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Acknowledge or close an arrival visit; audited, does not mark goods collected.',
  })
  @ApiBody({ schema: schema(arrivalUpdateSchema) })
  @ApiOkResponse({ schema: schema(arrivalSchema) })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
  ) {
    parse(z.uuid(), id);
    parse(z.object({}).strict(), query);
    const input = parse(arrivalUpdateSchema, body),
      actor = owner(request);
    await this.auth.limitPickupRequests(
      actor,
      request.socket.remoteAddress ?? 'unknown',
      true,
    );
    return this.arrivals.update(actor, id, input);
  }
}
