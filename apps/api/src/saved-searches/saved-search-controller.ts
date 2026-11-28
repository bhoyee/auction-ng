import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
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
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  savedSearchAvailabilitySchema,
  savedSearchInputSchema,
  savedSearchPageSchema,
  savedSearchResultSchema,
  savedSearchRules,
  savedSearchSettingsSchema,
  savedSearchSummarySchema,
  savedSearchUpdateSchema,
  cataloguePageSchema,
} from '@auction-ng/shared';
import { Public, Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { SavedSearchService } from './saved-search-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
function parse<T>(value: z.ZodType<T>, input: unknown) {
  const parsed = value.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException('Check the request fields.');
  return parsed.data;
}
function owner(request: AuthRequest, response: ServerResponse, query: unknown) {
  response.setHeader('Cache-Control', 'no-store');
  if (!request.identity) throw new UnauthorizedException();
  parse(z.object({}).strict(), query);
  return request.identity.user.id;
}

@ApiTags('Saved searches')
@Controller()
export class SavedSearchController {
  constructor(
    @Inject(SavedSearchService) private readonly saved: SavedSearchService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get('saved-searches/availability')
  @Public()
  @ApiOperation({
    summary:
      'Whether buyers can save searches and get alerts; shows or hides the button.',
  })
  @ApiOkResponse({ schema: schema(savedSearchAvailabilitySchema) })
  availability(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    parse(z.object({}).strict(), query);
    return { enabled: this.saved.enabled };
  }

  @Get('buyers/saved-searches')
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({ summary: 'Your saved searches, newest first (up to 20).' })
  @ApiOkResponse({ schema: schema(savedSearchPageSchema) })
  list(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.saved.list(owner(request, response, query));
  }

  @Post('buyers/saved-searches')
  @HttpCode(200)
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({
    summary:
      'Save a search with its filters. Saving it again returns the same one; 409 at 20.',
  })
  @ApiBody({ schema: schema(savedSearchInputSchema) })
  @ApiOkResponse({ schema: schema(savedSearchResultSchema) })
  async save(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    const input = parse(savedSearchInputSchema, body);
    await this.auth.limitSearchHistory(userId);
    return this.saved.save(userId, input);
  }

  @Delete('buyers/saved-searches/:id')
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({ summary: 'Remove one of your saved searches.' })
  async remove(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    const savedId = parse(z.uuid(), id);
    await this.auth.limitSearchHistory(userId);
    return this.saved.remove(userId, savedId);
  }

  @Get('buyers/saved-searches/summary')
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({
    summary: 'New matches on live items across your saved searches (badge).',
  })
  @ApiOkResponse({ schema: schema(savedSearchSummarySchema) })
  summary(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.saved.summary(owner(request, response, query));
  }

  @Get('buyers/saved-searches/new-items')
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({
    summary:
      'Live items from new saved-search matches, closing soonest first (homepage row, up to 8).',
  })
  @ApiOkResponse({ schema: schema(cataloguePageSchema) })
  newItems(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    const { limit } = parse(
      z
        .object({
          limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(savedSearchRules.widgetItems)
            .default(savedSearchRules.widgetItems),
        })
        .strict(),
      query,
    );
    return this.saved.newItems(request.identity.user.id, limit);
  }

  @Patch('buyers/saved-searches/settings')
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({
    summary: 'Turn the daily saved-search digest email on or off.',
  })
  @ApiBody({ schema: schema(savedSearchSettingsSchema) })
  @ApiOkResponse({ schema: schema(savedSearchSettingsSchema) })
  async settings(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    const input = parse(savedSearchSettingsSchema, body);
    await this.auth.limitSearchHistory(userId);
    return this.saved.settings(userId, input.digest);
  }

  @Patch('buyers/saved-searches/:id')
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({
    summary: `Turn "email me straight away" on or off (up to ${savedSearchRules.instantPerDay} such emails a day; the rest wait for the daily digest).`,
  })
  @ApiBody({ schema: schema(savedSearchUpdateSchema) })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    const savedId = parse(z.uuid(), id);
    const input = parse(savedSearchUpdateSchema, body);
    await this.auth.limitSearchHistory(userId);
    return this.saved.update(userId, savedId, input.instantEmail);
  }

  @Post('buyers/saved-searches/:id/viewed')
  @HttpCode(200)
  @Roles('buyer')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Device-Id', required: true })
  @ApiOperation({ summary: "Clear a saved search's new-match count." })
  async viewed(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    const savedId = parse(z.uuid(), id);
    await this.auth.limitSearchHistory(userId);
    return this.saved.viewed(userId, savedId);
  }
}
