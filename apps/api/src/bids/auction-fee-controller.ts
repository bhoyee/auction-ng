import { clientIp } from '../security/client-ip';
import { Capabilities } from '../auth/auth-guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  auctionFeeQuoteSchema,
  auctionFeeSettingsSchema,
  auctionFeeUpdateSchema,
} from '@auction-ng/shared';
import { Public, Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { BidService } from './bid-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
@ApiTags('Auction fees')
@Controller()
export class AuctionFeeController {
  constructor(
    @Inject(BidService) private readonly bids: BidService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get('lots/:id/auction-fees')
  @Public()
  @ApiOkResponse({ schema: schema(auctionFeeQuoteSchema) })
  async quote(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!z.uuid().safeParse(id).success) throw new BadRequestException();
    return this.bids.auctionFeeQuote(id);
  }
  @Get('admin/auction-fees')
  @Roles('admin')
  @Capabilities('fees.manage')
  @ApiBearerAuth()
  @ApiOkResponse({ schema: schema(auctionFeeSettingsSchema) })
  async read(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    await this.auth.limitPaymentReads(
      request.identity.user.id,
      clientIp(request),
    );
    return this.bids.fees.read();
  }
  @Post('admin/auction-fees')
  @HttpCode(200)
  @Roles('admin')
  @Capabilities('fees.manage')
  @ApiBearerAuth()
  @ApiBody({ schema: schema(auctionFeeUpdateSchema) })
  @ApiOkResponse({ schema: schema(auctionFeeSettingsSchema) })
  async update(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    await this.auth.limitPaymentRequests(
      request.identity.user.id,
      clientIp(request),
    );
    const parsed = auctionFeeUpdateSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Check the fee rates, amounts and reason.');
    return this.bids.fees.update(request.identity, parsed.data);
  }
}
