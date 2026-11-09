import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  bidPreparationSchema,
  bidResultSchema,
  cancelBidResultSchema,
  confirmBidSchema,
  prepareBidSchema,
  persistBidsSchema,
  liveLotSchema,
} from '@auction-ng/shared';
import { Public, Roles, type AuthRequest } from '../auth/auth-guard';
import { BidService } from './bid-service';
import { AuthService } from '../auth/auth-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
const uuid = (value: string) => {
  if (!z.uuid().safeParse(value).success) throw new BadRequestException();
  return value;
};
const empty = (value: unknown) => {
  if (
    !z
      .object({})
      .strict()
      .safeParse(value ?? {}).success
  )
    throw new BadRequestException();
};
@ApiTags('Bidding')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Device-Id',
  required: true,
  description: 'Sign-in installation UUID.',
})
@Controller()
export class BidController {
  constructor(
    @Inject(BidService) private readonly bids: BidService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private credentials(request: AuthRequest, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    const device = request.headers['x-device-id'];
    if (
      !token ||
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      typeof device !== 'string' ||
      !z.uuid().safeParse(device).success
    )
      throw new UnauthorizedException();
    return { token, device };
  }
  private identity(request: AuthRequest) {
    if (!request.identity) throw new UnauthorizedException();
    return {
      userId: request.identity.user.id,
      sessionId: request.identity.sessionId,
    };
  }
  @Post('lots/:id/bid-preparations')
  @HttpCode(200)
  @Roles('buyer')
  @ApiOperation({
    summary:
      'Reserve wallet funds for an active, email-verified buyer: a direct bid (default) or an explicitly selected automatic limit. This does not place a bid.',
  })
  @ApiBody({ schema: schema(prepareBidSchema) })
  @ApiOkResponse({ schema: schema(bidPreparationSchema) })
  async prepare(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    empty(query);
    const input = prepareBidSchema.safeParse(body);
    if (!input.success) throw new BadRequestException();
    const { token, device } = this.credentials(request, response);
    await this.auth.limitBidPreparations(
      this.identity(request).userId,
      request.socket.remoteAddress ?? 'unknown',
    );
    return this.bids.prepare(
      this.identity(request),
      uuid(id),
      input.data,
      token,
      device,
    );
  }
  @Post('lots/:id/bids')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Confirm a funded preparation using its original session, installation and retry key. Redis-only acceptance.',
  })
  @ApiBody({ schema: schema(confirmBidSchema) })
  @ApiOkResponse({ schema: schema(bidResultSchema) })
  accept(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    empty(query);
    const input = confirmBidSchema.safeParse(body);
    if (!input.success) throw new BadRequestException();
    const { token, device } = this.credentials(request, response);
    return this.bids.accept(
      uuid(id),
      input.data,
      token,
      device,
      request.socket.remoteAddress ?? 'unknown',
    );
  }
  @Post('bid-preparations/:id/cancel')
  @Roles('buyer')
  @HttpCode(200)
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiOkResponse({ schema: schema(cancelBidResultSchema) })
  cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    empty(body);
    empty(query);
    this.credentials(request, response);
    return this.bids.cancel(this.identity(request), uuid(id));
  }
  @Post('lots/:id/live-state')
  @HttpCode(200)
  @Roles('buyer')
  @ApiBody({
    schema: { type: 'object', additionalProperties: false, properties: {} },
  })
  @ApiOkResponse({ schema: schema(liveLotSchema) })
  @ApiOperation({
    summary:
      'Get a fresh live price and your own leader flag. Never returns private maxima or bidder identities.',
  })
  snapshot(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    empty(body);
    empty(query);
    this.credentials(request, response);
    return this.bids.snapshot(this.identity(request), uuid(id));
  }
  @Get('lots/:id/public-live-state')
  @Public()
  @ApiHeader({ name: 'X-Device-Id', required: false })
  @ApiOkResponse({ schema: schema(liveLotSchema) })
  @ApiOperation({
    summary:
      'Public read-only current price and server clock for an open lot. No buyer identity or private bid limit.',
    security: [],
  })
  publicSnapshot(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    empty(query);
    response.setHeader('Cache-Control', 'no-store');
    return this.bids.snapshot(null, uuid(id));
  }
  @Post('internal/bids/maintain')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  maintain(
    @Headers('authorization') authorization: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from(`Bearer ${secret}`),
      actual = Buffer.from(authorization);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    empty(body);
    empty(query);
    return this.bids.maintain();
  }
  @Post('internal/bids/persist')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  persist(
    @Headers('authorization') authorization: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from(`Bearer ${secret}`),
      actual = Buffer.from(authorization);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    empty(query);
    const input = persistBidsSchema.safeParse(body);
    if (!input.success) throw new BadRequestException();
    return this.bids.persist(input.data.streamIds);
  }
}
