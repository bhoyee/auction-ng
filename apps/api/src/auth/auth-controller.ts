import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Patch,
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
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  profilePatchSchema,
  refreshSchema,
  requestCodeSchema,
  verifyCodeSchema,
  profileSchema,
  tokenResponseSchema,
  codeRequestedSchema,
  realtimeSessionSchema,
  staffSignInSchema,
  webRefreshSchema,
} from '@auction-ng/shared';
import { AuthService, type SessionTokens } from './auth-service';
import { Public, type AuthRequest } from './auth-guard';

// Request/response schemas in OpenAPI are explicit because runtime validation uses Zod.
const deviceProperties = {
  deviceId: { type: 'string', format: 'uuid' },
  client: { type: 'string', enum: ['web', 'mobile'] },
};
const deviceRequired = ['deviceId', 'client'];
const responseSchema = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
const refreshBody = {
  type: 'object' as const,
  additionalProperties: false,
  required: deviceRequired,
  properties: {
    ...deviceProperties,
    refreshToken: {
      type: 'string',
      description: 'Required for mobile; forbidden for web (HttpOnly cookie).',
    },
  },
};

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  private staffBrowser(request: AuthRequest) {
    this.browser(request, 'web');
    if (
      !request.headers.origin ||
      !this.auth.staffOrigins.includes(request.headers.origin)
    )
      throw new ForbiddenException('Use the Auction NG staff website.');
  }
  private staffCookie(request: AuthRequest) {
    const values = (request.headers.cookie ?? '')
      .split(';')
      .map((value) => value.trim())
      .filter((value) => value.startsWith('auction_staff_refresh='));
    return values.length === 1
      ? values[0]?.slice('auction_staff_refresh='.length)
      : undefined;
  }
  private staffTokens(response: ServerResponse, result: SessionTokens) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Set-Cookie',
      `auction_staff_refresh=${result.refreshToken}; HttpOnly; SameSite=Strict; Path=/auth/staff; Max-Age=28800${this.auth.local ? '' : '; Secure'}`,
    );
    const { refreshToken, ...publicResult } = result;
    void refreshToken;
    return publicResult;
  }
  @Public()
  @Post('staff/sign-in')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Staff email/password plus Google Authenticator TOTP. No public staff registration.',
  })
  @ApiBody({ schema: responseSchema(staffSignInSchema) })
  @ApiOkResponse({ schema: responseSchema(tokenResponseSchema) })
  async staffSignIn(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    this.staffBrowser(request);
    return this.staffTokens(
      response,
      await this.auth.staffSignIn(
        this.parse(staffSignInSchema, body),
        this.ip(request),
      ),
    );
  }
  @Public()
  @Post('staff/refresh')
  @HttpCode(200)
  @ApiBody({ schema: responseSchema(webRefreshSchema) })
  @ApiOkResponse({ schema: responseSchema(tokenResponseSchema) })
  async staffRefresh(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    this.staffBrowser(request);
    const input = this.parse(webRefreshSchema, body);
    return this.staffTokens(
      response,
      await this.auth.refresh(
        input,
        this.staffCookie(request),
        this.ip(request),
        true,
      ),
    );
  }
  @Public()
  @Post('staff/logout')
  @HttpCode(204)
  @ApiBody({ schema: responseSchema(webRefreshSchema) })
  async staffLogout(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    this.staffBrowser(request);
    await this.auth.logout(
      this.parse(webRefreshSchema, body),
      this.staffCookie(request),
      this.ip(request),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Set-Cookie',
      `auction_staff_refresh=; HttpOnly; SameSite=Strict; Path=/auth/staff; Max-Age=0${this.auth.local ? '' : '; Secure'}`,
    );
  }
  private parse<T>(
    schema: {
      safeParse(
        value: unknown,
      ): { success: true; data: T } | { success: false };
    },
    input: unknown,
  ): T {
    const result = schema.safeParse(input);
    if (!result.success)
      throw new BadRequestException('Check the request fields and try again.');
    return result.data;
  }
  private browser(request: AuthRequest, client: string) {
    if (client !== 'web') return;
    const origin = request.headers.origin;
    if (
      !origin ||
      !this.auth.origins.includes(origin) ||
      request.headers['x-auction-client'] !== 'web'
    )
      throw new ForbiddenException('Use an approved Auction NG website.');
  }
  private ip(request: AuthRequest) {
    return request.socket.remoteAddress ?? 'unknown';
  }
  private cookie(request: AuthRequest): string | undefined {
    const values = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith('auction_refresh='));
    if (values.length !== 1) return undefined;
    return values[0]?.slice('auction_refresh='.length);
  }
  private setCookie(response: ServerResponse, token: string, maxAge = 2592000) {
    response.setHeader(
      'Set-Cookie',
      `auction_refresh=${token}; HttpOnly; SameSite=Strict; Path=/auth; Max-Age=${maxAge}${this.auth.local ? '' : '; Secure'}`,
    );
  }
  private tokens(
    response: ServerResponse,
    result: SessionTokens,
    client: string,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (client === 'mobile') return result;
    this.setCookie(response, result.refreshToken);
    const { refreshToken, ...publicResult } = result;
    void refreshToken;
    return publicResult;
  }
  @Public()
  @Post('request-code')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a sign-in code (local test inbox in T04).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['email', ...deviceRequired],
      properties: {
        email: { type: 'string', format: 'email' },
        ...deviceProperties,
      },
    },
  })
  @ApiOkResponse({
    description: 'Generic acknowledgement; code is never in the response.',
    schema: responseSchema(codeRequestedSchema),
  })
  async request(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = this.parse(requestCodeSchema, body);
    this.browser(request, input.client);
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.requestCode(input, this.ip(request));
  }
  @Public()
  @Post('verify-code')
  @HttpCode(200)
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['challengeId', 'code', ...deviceRequired],
      properties: {
        challengeId: { type: 'string', format: 'uuid' },
        code: { type: 'string', pattern: '^[0-9]{6}$' },
        ...deviceProperties,
      },
    },
  })
  @ApiOkResponse({
    description:
      'Access token and user; web refresh token is only an HttpOnly cookie.',
    schema: responseSchema(tokenResponseSchema),
  })
  async verify(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = this.parse(verifyCodeSchema, body);
    this.browser(request, input.client);
    return this.tokens(
      response,
      await this.auth.verifyCode(input, this.ip(request)),
      input.client,
    );
  }
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiBody({ schema: refreshBody })
  @ApiOkResponse({
    description:
      'Rotated access and refresh credentials. Reuse revokes the token family.',
    schema: responseSchema(tokenResponseSchema),
  })
  async refresh(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = this.parse(refreshSchema, body);
    this.browser(request, input.client);
    return this.tokens(
      response,
      await this.auth.refresh(
        input,
        input.client === 'web' ? this.cookie(request) : input.refreshToken,
        this.ip(request),
      ),
      input.client,
    );
  }
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiBody({ schema: refreshBody })
  async logout(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = this.parse(refreshSchema, body);
    this.browser(request, input.client);
    await this.auth.logout(
      input,
      input.client === 'web' ? this.cookie(request) : input.refreshToken,
      this.ip(request),
    );
    if (input.client === 'web') this.setCookie(response, '', 0);
    response.setHeader('Cache-Control', 'no-store');
  }
  @Get('profile')
  @ApiBearerAuth()
  @ApiHeader({
    name: 'X-Device-Id',
    required: true,
    description: 'The UUID used during sign-in.',
  })
  @ApiOkResponse({
    description:
      'Own profile only; email verification does not verify a phone.',
    schema: responseSchema(profileSchema),
  })
  profile(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    if (!request.identity) throw new UnauthorizedException();
    response.setHeader('Cache-Control', 'no-store');
    return request.identity.user;
  }
  @Patch('profile')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string', maxLength: 120, minLength: 1 } },
    },
  })
  @ApiOkResponse({
    description:
      'Updated own display name. Role, email and phone cannot be changed here.',
    schema: responseSchema(profileSchema),
  })
  async updateProfile(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = this.parse(profilePatchSchema, body);
    if (!request.identity) throw new UnauthorizedException();
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.updateProfile(request.identity, input.name);
  }
  @Post('realtime-session')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiBody({
    schema: { type: 'object', additionalProperties: false, properties: {} },
  })
  @ApiOkResponse({ schema: responseSchema(realtimeSessionSchema) })
  @ApiOperation({
    summary: 'Validate the current buyer session for a realtime connection.',
  })
  realtimeSession(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    this.parse(z.object({}).strict(), body ?? {});
    this.parse(z.object({}).strict(), query ?? {});
    if (!request.identity) throw new UnauthorizedException();
    response.setHeader('Cache-Control', 'no-store');
    return this.auth.realtimeSession(request.identity);
  }
}
