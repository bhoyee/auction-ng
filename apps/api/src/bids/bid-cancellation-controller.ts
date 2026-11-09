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
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import {
  bidCancellationApprovalSchema,
  bidCancellationApprovalResultSchema,
  bidCancellationQuoteSchema,
} from '@auction-ng/shared';
import { AuthService } from '../auth/auth-service';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { BidCancellationService } from './bid-cancellation-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const parse = <T>(value: z.ZodType<T>, input: unknown) => {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Review the cancellation fields.');
  return result.data;
};
@Controller('admin/bid-cancellations')
@ApiTags('Bid cancellation approvals')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('admin')
@Capabilities('bids.cancel')
export class BidCancellationController {
  constructor(
    @Inject(BidCancellationService)
    private readonly service: BidCancellationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async actor(req: AuthRequest, write = false) {
    if (!req.identity) throw new UnauthorizedException();
    await this.auth.supportRate(
      req.identity.user.id,
      req.socket.remoteAddress ?? 'unknown',
      write,
    );
    return req.identity;
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: schema(bidCancellationQuoteSchema) })
  async quote(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.quote(await this.actor(req), parse(z.uuid(), id));
  }
  @Post(':id/approve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiBody({ schema: schema(bidCancellationApprovalSchema) })
  @ApiOkResponse({ schema: schema(bidCancellationApprovalResultSchema) })
  async approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.approve(
      await this.actor(req, true),
      parse(z.uuid(), id),
      parse(bidCancellationApprovalSchema, body),
    );
  }
}
