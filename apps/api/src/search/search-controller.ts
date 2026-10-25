import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { searchPageSchema, searchQuerySchema } from '@auction-ng/shared';
import { Public, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { SearchService } from './search-service';

@ApiTags('Search')
@Controller()
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly searchService: SearchService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get('search')
  @Public()
  @ApiOperation({
    summary:
      'Typo-tolerant open-lot search in closing-time order. Price filters use starting prices.',
  })
  @ApiQuery({ name: 'q', required: true, type: String, maxLength: 120 })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: String,
    format: 'uuid',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: String,
    format: 'uuid',
  })
  @ApiQuery({ name: 'endingSoon', required: false, type: Boolean })
  @ApiQuery({ name: 'minPriceKobo', required: false, type: Number })
  @ApiQuery({ name: 'maxPriceKobo', required: false, type: Number })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 50,
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({
    schema: z.toJSONSchema(searchPageSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  async search(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const parsed = searchQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    await this.auth.limitSearchRequests(
      request.socket.remoteAddress ?? 'unknown',
    );
    return this.searchService.search(parsed.data);
  }
  @Post('internal/search/sync')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async sync(
    @Headers('authorization') authorization: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const secret = process.env.SEARCH_SYNC_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authorization);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    if (
      !z
        .object({})
        .strict()
        .safeParse(body ?? {}).success ||
      !z.object({}).strict().safeParse(query).success
    )
      throw new BadRequestException();
    return this.searchService.sync();
  }
}
