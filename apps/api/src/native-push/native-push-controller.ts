import { clientIp } from '../security/client-ip';
import {
  BadRequestException,
  Body,
  Controller,
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
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  nativePushRegisterSchema,
  nativePushStatusSchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { NativePushService } from './native-push-service';
const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: 'openapi-3.0' }) as SchemaObject;
@ApiTags('Native notifications')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('buyers/push-devices')
export class NativePushController {
  constructor(
    @Inject(NativePushService) private readonly push: NativePushService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Post()
  @HttpCode(200)
  @ApiBody({ schema: schema(nativePushRegisterSchema) })
  @ApiOkResponse({ schema: schema(nativePushStatusSchema) })
  async register(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
    @Body() body: unknown,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    const value = nativePushRegisterSchema.safeParse(body);
    if (!value.success)
      throw new BadRequestException('Check push registration fields.');
    await this.auth.securityRate(request.identity.user.id, clientIp(request));
    return this.push.register(request.identity, value.data);
  }
  @Post('disable')
  @HttpCode(200)
  @ApiBody({ schema: schema(z.object({}).strict()) })
  @ApiOkResponse({ schema: schema(nativePushStatusSchema) })
  async disable(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
    @Body() body: unknown,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    if (!z.object({}).strict().safeParse(body).success)
      throw new BadRequestException();
    await this.auth.securityRate(request.identity.user.id, clientIp(request));
    return this.push.disable(request.identity);
  }
}
