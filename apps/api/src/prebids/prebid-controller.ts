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
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  preBidChangeSchema,
  preBidCancelSchema,
  preBidResponseSchema,
  preBidScheduleSchema,
  preBidScheduleResultSchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { PreBidService } from './prebid-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
@ApiTags('Pre-bids')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Controller()
export class PreBidController {
  constructor(
    @Inject(PreBidService) private readonly preBids: PreBidService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async owner(
    request: AuthRequest,
    response: ServerResponse,
    id: string,
    mutation = false,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    if (!z.uuid().safeParse(id).success) throw new BadRequestException();
    const ip = request.socket.remoteAddress ?? 'unknown';
    if (mutation)
      await this.auth.limitBidPreparations(request.identity.user.id, ip);
    else await this.auth.limitPaymentReads(request.identity.user.id, ip);
    return {
      userId: request.identity.user.id,
      sessionId: request.identity.sessionId,
    };
  }
  @Get('lots/:id/prebid')
  @Roles('buyer')
  @ApiOkResponse({ schema: schema(preBidResponseSchema) })
  async read(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.preBids.read(await this.owner(req, res, id), id);
  }
  @Post('lots/:id/prebid')
  @HttpCode(200)
  @Roles('buyer')
  @ApiBody({ schema: schema(preBidChangeSchema) })
  @ApiOkResponse({ schema: schema(preBidResponseSchema) })
  async change(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res, id, true),
      value = preBidChangeSchema.safeParse(body);
    if (!value.success)
      throw new BadRequestException(
        'Check your pre-bid amount and review the fees.',
      );
    return this.preBids.change(who, id, value.data);
  }
  @Post('lots/:id/prebid/cancel')
  @HttpCode(200)
  @Roles('buyer')
  @ApiBody({ schema: schema(preBidCancelSchema) })
  @ApiOkResponse({ schema: schema(preBidResponseSchema) })
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    const who = await this.owner(req, res, id, true),
      value = preBidCancelSchema.safeParse(body);
    if (!value.success)
      throw new BadRequestException('Reload your pre-bid before cancelling.');
    return this.preBids.cancel(who, id, value.data);
  }
  @Post('admin/lots/:id/schedule')
  @HttpCode(200)
  @Roles('admin')
  @ApiBody({ schema: schema(preBidScheduleSchema) })
  @ApiOkResponse({ schema: schema(preBidScheduleResultSchema) })
  async schedule(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    await this.owner(req, res, id, true);
    if (!req.identity) throw new UnauthorizedException();
    const value = preBidScheduleSchema.safeParse(body);
    if (!value.success)
      throw new BadRequestException(
        'Check the launch, closing time and reason.',
      );
    return this.preBids.schedule(req.identity, id, value.data);
  }
}
