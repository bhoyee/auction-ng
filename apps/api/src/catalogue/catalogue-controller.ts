import {
  BadRequestException,
  Body,
  Controller,
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
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  catalogueListQuerySchema,
  cataloguePageSchema,
  catalogueDetailSchema,
  categoryPageSchema,
  locationPageSchema,
  pageQuerySchema,
  createLotInputSchema,
  editLotInputSchema,
  draftLotSchema,
  imageUploadInputSchema,
  imageUploadSchema,
  catalogueImageSchema,
  catalogueRules,
} from '@auction-ng/shared';
import { Public, Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { CatalogueService } from './catalogue-service';

const schema = (value: z.ZodType): SchemaObject =>
  z.toJSONSchema(value, { target: 'openapi-3.0' }) as SchemaObject;
function parse<T>(value: z.ZodType<T>, input: unknown): T {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the request fields and try again.');
  return result.data;
}
@ApiTags('Catalogue')
@Controller()
export class CatalogueController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
  ) {}
  @Get('lots')
  @Public()
  @ApiOperation({
    summary:
      'Browse scheduled/open lots ordered by closing time; prices are starting prices, not live bids.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    maximum: 50,
    minimum: 1,
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
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
  @ApiQuery({
    name: 'endingSoon',
    required: false,
    type: Boolean,
    description: 'Open/closing lots ending within one hour.',
  })
  @ApiQuery({
    name: 'minPriceKobo',
    required: false,
    type: Number,
    description: 'Minimum starting price in integer kobo.',
  })
  @ApiQuery({
    name: 'maxPriceKobo',
    required: false,
    type: Number,
    description: 'Maximum starting price in integer kobo.',
  })
  @ApiOkResponse({ schema: schema(cataloguePageSchema) })
  list(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.catalogue.list(parse(catalogueListQuerySchema, query));
  }
  @Get('lots/:id')
  @Public()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(catalogueDetailSchema) })
  detail(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    response.setHeader('Cache-Control', 'no-store');
    return this.catalogue.detail(parse(z.uuid(), id));
  }
  @Get('categories')
  @Public()
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 50 })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(categoryPageSchema) })
  categories(@Query() query: unknown) {
    return this.catalogue.categories(parse(pageQuerySchema, query));
  }
  @Get('locations')
  @Public()
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 50 })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(locationPageSchema) })
  locations(@Query() query: unknown) {
    return this.catalogue.locations(parse(pageQuerySchema, query));
  }
}
@ApiTags('Catalogue administration')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles(...catalogueRules.editorRoles)
@Controller('admin/lots')
export class CatalogueAdminController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async actor(request: AuthRequest, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    await this.auth.limitCatalogueRequests(
      request.identity.user.id,
      request.socket.remoteAddress ?? 'unknown',
    );
    return request.identity.user.id;
  }
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Create a draft. Staff SSO/MFA is required and is not yet configured.',
  })
  @ApiBody({ schema: schema(createLotInputSchema) })
  @ApiOkResponse({ schema: schema(draftLotSchema) })
  async create(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.catalogue.create(
      await this.actor(request, response),
      parse(createLotInputSchema, body),
    );
  }
  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(draftLotSchema) })
  async get(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    return this.catalogue.getDraft(
      await this.actor(request, response),
      parse(z.uuid(), id),
    );
  }
  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(editLotInputSchema) })
  @ApiOkResponse({ schema: schema(draftLotSchema) })
  async edit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.catalogue.edit(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(editLotInputSchema, body),
    );
  }
  @Post(':id/images/uploads')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(imageUploadInputSchema) })
  @ApiOkResponse({ schema: schema(imageUploadSchema) })
  async upload(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.catalogue.beginUpload(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(imageUploadInputSchema, body),
    );
  }
  @Post(':id/images/uploads/:uploadId/complete')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'uploadId', format: 'uuid' })
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiOkResponse({ schema: schema(catalogueImageSchema) })
  async complete(
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    parse(z.object({}).strict(), body ?? {});
    return this.catalogue.completeUpload(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(z.uuid(), uploadId),
    );
  }
}
