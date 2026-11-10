import { clientIp } from '../security/client-ip';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
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
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  securityStartSchema,
  securityEmailSchema,
  securityFinishSchema,
  securityStatusSchema,
  securityChallengeSchema,
  securityEmailResultSchema,
  securityResultSchema,
  staffRoles,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from './auth-guard';
import { TwoFactorService } from './two-factor-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const parse = <T>(value: z.ZodType<T>, input: unknown) => {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the security request fields.');
  return result.data;
};
@ApiTags('Account security')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer', ...staffRoles)
@Controller('auth/security')
export class TwoFactorController {
  constructor(
    @Inject(TwoFactorService) private readonly security: TwoFactorService,
  ) {}
  private owner(req: AuthRequest, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    return req.identity;
  }
  @Get()
  @ApiOperation({
    summary:
      'Read your own authenticator policy and remaining recovery-code count; no secrets.',
  })
  @ApiOkResponse({ schema: schema(securityStatusSchema) })
  status(
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    return this.security.status(this.owner(req, res));
  }
  @Post('start')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Check your password and email a five-minute, session-bound security-action code.',
  })
  @ApiBody({ schema: schema(securityStartSchema) })
  @ApiOkResponse({ schema: schema(securityChallengeSchema) })
  start(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.security.start(
      this.owner(req, res),
      parse(securityStartSchema, body),
      clientIp(req),
    );
  }
  @Post('email')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Verify the purpose-bound emailed code before setup or authenticator confirmation.',
  })
  @ApiBody({ schema: schema(securityEmailSchema) })
  @ApiOkResponse({ schema: schema(securityEmailResultSchema) })
  email(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.security.verifyEmail(
      this.owner(req, res),
      parse(securityEmailSchema, body),
      clientIp(req),
    );
  }
  @Post('finish')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Confirm enrolment/replacement, disable buyer 2FA or replace recovery codes. Staff/admin cannot disable 2FA. Codes are returned once only.',
  })
  @ApiBody({ schema: schema(securityFinishSchema) })
  @ApiOkResponse({ schema: schema(securityResultSchema) })
  finish(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.security.finish(
      this.owner(req, res),
      parse(securityFinishSchema, body),
      clientIp(req),
    );
  }
}
