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
  actionVerifyChallengeSchema,
  actionVerifyFinishSchema,
  actionVerifyResultSchema,
  actionVerifyStartSchema,
  actionVerifyStatusSchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from './auth-guard';
import { ActionVerificationService } from './action-verification-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const parse = <T>(value: z.ZodType<T>, input: unknown) => {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the security check fields.');
  return result.data;
};

@ApiTags('Account security')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('auth/verify-action')
export class ActionVerificationController {
  constructor(
    @Inject(ActionVerificationService)
    private readonly verification: ActionVerificationService,
  ) {}
  private owner(req: AuthRequest, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    return req.identity;
  }
  private ip(req: AuthRequest) {
    return req.socket.remoteAddress ?? 'unknown';
  }
  @Get()
  @ApiOperation({
    summary:
      'Whether bidding is verified on this session, and until when (30-minute window).',
  })
  @ApiOkResponse({ schema: schema(actionVerifyStatusSchema) })
  status(
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    return this.verification.status(this.owner(req, res));
  }
  @Post('start')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Check your password and email a five-minute code for bidding, Buy Now or a bid cancellation request.',
  })
  @ApiBody({ schema: schema(actionVerifyStartSchema) })
  @ApiOkResponse({ schema: schema(actionVerifyChallengeSchema) })
  start(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.verification.start(
      this.owner(req, res),
      parse(actionVerifyStartSchema, body),
      this.ip(req),
    );
  }
  @Post('finish')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Verify the email code (and authenticator or recovery code when 2FA is on). Bidding unlocks this session for 30 minutes; Buy Now and cancellation return a single-use verificationId valid for 10 minutes.',
  })
  @ApiBody({ schema: schema(actionVerifyFinishSchema) })
  @ApiOkResponse({ schema: schema(actionVerifyResultSchema) })
  finish(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    return this.verification.finish(
      this.owner(req, res),
      parse(actionVerifyFinishSchema, body),
      this.ip(req),
    );
  }
}
