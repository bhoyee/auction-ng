import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  walletControlsSchema,
  walletControlsUpdateSchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { WalletControlsService } from './wallet-controls-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
@ApiTags('Wallet controls')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Controller()
export class WalletControlsController {
  constructor(
    @Inject(WalletControlsService)
    private readonly controls: WalletControlsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async owner(
    request: AuthRequest,
    response: ServerResponse,
    mutation = false,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    const id = request.identity.user.id,
      ip = request.socket.remoteAddress ?? 'unknown';
    if (mutation) await this.auth.limitPaymentRequests(id, ip);
    else await this.auth.limitPaymentReads(id, ip);
    return id;
  }
  @Get('wallet/controls')
  @Roles('buyer')
  @ApiOkResponse({ schema: schema(walletControlsSchema) })
  @ApiOperation({
    summary:
      'Read marketplace-wide admission controls; existing payments continue reconciling.',
  })
  async buyer(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    await this.owner(request, response);
    return this.controls.read();
  }
  @Get('admin/wallet-controls')
  @Roles('admin')
  @ApiOkResponse({ schema: schema(walletControlsSchema) })
  async read(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    await this.owner(request, response);
    return this.controls.read();
  }
  @Post('admin/wallet-controls')
  @HttpCode(200)
  @Roles('admin')
  @ApiBody({ schema: schema(walletControlsUpdateSchema) })
  @ApiOkResponse({ schema: schema(walletControlsSchema) })
  @ApiOperation({
    summary:
      'Audit and update global new deposit/withdrawal admission. Does not stop existing intents.',
  })
  async update(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const id = await this.owner(request, response, true),
      parsed = walletControlsUpdateSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Check the wallet controls and reason.');
    return this.controls.update(id, parsed.data);
  }
}
