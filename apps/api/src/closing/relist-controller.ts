import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
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
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  relistSettingsSchema,
  relistSettingsUpdateSchema,
  unsoldCountSchema,
  unsoldPageSchema,
  unsoldRelistResultSchema,
  unsoldRelistSchema,
} from '@auction-ng/shared';
import { Capabilities, Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { clientIp } from '../security/client-ip';
import { RelistService } from './relist-service';
import { RelistSettingsService } from './relist-settings-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const parse = <T>(shape: z.ZodType<T>, value: unknown) => {
  const result = shape.safeParse(value);
  if (!result.success)
    throw new BadRequestException('Check the request fields and try again.');
  return result.data;
};

// Unsold review and Unsold items settings (owner decisions 2026-11-13).
@ApiTags('Unsold review')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Controller('admin')
export class RelistController {
  constructor(
    @Inject(RelistService) private readonly relists: RelistService,
    @Inject(RelistSettingsService)
    private readonly settings: RelistSettingsService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async actor(request: AuthRequest, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    await this.auth.limitCatalogueRequests(
      request.identity.user.id,
      clientIp(request),
    );
    return request.identity.user.id;
  }

  @Get('relist-settings')
  @Roles('admin')
  @Capabilities('fees.manage')
  @ApiOperation({
    summary:
      'Read the unsold item rules: automatic relists, run length and price cut.',
  })
  @ApiOkResponse({ schema: schema(relistSettingsSchema) })
  async readSettings(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.settings.read(await this.actor(request, response));
  }

  @Post('relist-settings')
  @HttpCode(200)
  @Roles('admin')
  @Capabilities('fees.manage')
  @ApiOperation({
    summary:
      'Change the unsold item rules. Revision-checked, idempotent and audited; applies to future relists only.',
  })
  @ApiBody({ schema: schema(relistSettingsUpdateSchema) })
  @ApiOkResponse({ schema: schema(relistSettingsSchema) })
  async updateSettings(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.settings.update(
      await this.actor(request, response),
      parse(relistSettingsUpdateSchema, body),
    );
  }

  @Get('unsold')
  @Roles('admin')
  @Capabilities('lots.relist')
  @ApiOperation({
    summary:
      'Unsold items with no automatic relist left, newest first (cursor pages, max 50).',
  })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer' } })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string' } })
  @ApiOkResponse({ schema: schema(unsoldPageSchema) })
  async list(
    @Query() query: Record<string, string>,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.relists.list(await this.actor(request, response), query);
  }

  @Get('unsold/count')
  @Roles('admin')
  @Capabilities('lots.relist')
  @ApiOperation({ summary: 'How many items wait in Unsold review.' })
  @ApiOkResponse({ schema: schema(unsoldCountSchema) })
  async count(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.relists.count(await this.actor(request, response));
  }

  @Post('unsold/:id/relist')
  @HttpCode(200)
  @Roles('admin')
  @Capabilities('lots.relist')
  @ApiOperation({
    summary:
      'Relist an unsold item as a new scheduled auction, optionally at a new price. Idempotent; one relist per item.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(unsoldRelistSchema) })
  @ApiOkResponse({ schema: schema(unsoldRelistResultSchema) })
  async relist(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.relists.relist(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(unsoldRelistSchema, body),
    );
  }
}
