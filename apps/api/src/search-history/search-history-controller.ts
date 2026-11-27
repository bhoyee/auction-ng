import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  searchHistoryRecordSchema,
  searchHistoryRemoveSchema,
  searchHistorySchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { SearchHistoryService } from './search-history-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
function parse<T>(value: z.ZodType<T>, input: unknown) {
  const parsed = value.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException('Check the request fields.');
  return parsed.data;
}
function owner(
  request: AuthRequest,
  response: ServerResponse,
  query: unknown,
): string {
  response.setHeader('Cache-Control', 'no-store');
  if (!request.identity) throw new UnauthorizedException();
  parse(z.object({}).strict(), query);
  return request.identity.user.id;
}

@ApiTags('Buyer account')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('buyers/search-history')
export class SearchHistoryController {
  constructor(
    @Inject(SearchHistoryService)
    private readonly history: SearchHistoryService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Your 8 most recent searches, newest first.' })
  @ApiOkResponse({ schema: schema(searchHistorySchema) })
  list(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.history.list(owner(request, response, query));
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Save up to 8 searches, newest first: a new search, or the browser list after sign-in. Keeps 20.',
  })
  @ApiBody({ schema: schema(searchHistoryRecordSchema) })
  @ApiOkResponse({ schema: schema(searchHistorySchema) })
  async record(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    const input = parse(searchHistoryRecordSchema, body);
    await this.auth.limitSearchHistory(userId);
    return this.history.record(userId, input.queries);
  }

  @Post('remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove one of your recent searches.' })
  @ApiBody({ schema: schema(searchHistoryRemoveSchema) })
  @ApiOkResponse({ schema: schema(searchHistorySchema) })
  async remove(
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    const input = parse(searchHistoryRemoveSchema, body);
    await this.auth.limitSearchHistory(userId);
    return this.history.remove(userId, input.query);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all of your recent searches.' })
  @ApiOkResponse({ schema: schema(searchHistorySchema) })
  async clear(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const userId = owner(request, response, query);
    await this.auth.limitSearchHistory(userId);
    return this.history.clear(userId);
  }
}
