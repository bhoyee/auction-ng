import {
  BadRequestException,
  GoneException,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
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
  ApiGoneResponse,
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
  ) {}
  @Post('check-in')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Legacy per-order check-in is retired. Use the visit pass flow.',
    deprecated: true,
  })
  @ApiGoneResponse({
    description: 'Refresh to use one check-in pass per visit.',
  })
  @ApiBody({ schema: schema(arrivalInputSchema) })
  @ApiOkResponse({ schema: schema(arrivalSchema) })
  checkIn() {
    throw new GoneException(
      'Order-by-order check-in has been replaced. Refresh Check-in to show your visit pass.',
    );
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
    summary: 'Legacy per-order mutation is retired. Use the visit checklist.',
    deprecated: true,
  })
  @ApiGoneResponse({ description: 'Use the staff visit checklist.' })
  @ApiBody({ schema: schema(arrivalUpdateSchema) })
  @ApiOkResponse({ schema: schema(arrivalSchema) })
  update() {
    throw new GoneException(
      'Use the pickup visit checklist to confirm handover. Refresh the staff workspace.',
    );
  }
}
