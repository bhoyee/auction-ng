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
  pastAuctionPageSchema,
  topDealEditSchema,
  autoRelistEditSchema,
  fixedPriceEditSchema,
  topDealAdminLotSchema,
  topDealAdminPageSchema,
  topDealAdminQuerySchema,
  dealListQuerySchema,
  dealPageSchema,
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
  @Get('browse-lots')
  @Public()
  @ApiOperation({
    summary:
      'Filter active auctions by multiple live bid ranges, closing windows and conditions; no private bidder data. Cursor pages may be sparse while scanning.',
  })
  @ApiQuery({
    name: 'section',
    required: false,
    enum: ['all', 'top-deals', 'ending-soon'],
  })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({
    name: 'prices',
    required: false,
    type: String,
    description: 'Comma-separated price-band IDs.',
  })
  @ApiQuery({
    name: 'ends',
    required: false,
    type: String,
    description: 'Comma-separated closing-window IDs.',
  })
  @ApiQuery({
    name: 'conditions',
    required: false,
    type: String,
    description: 'Comma-separated condition values.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(dealPageSchema) })
  deals(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.catalogue.deals(parse(dealListQuerySchema, query));
  }
  @Get('past-auctions')
  @Public()
  @ApiOperation({
    summary:
      'Purchased lots only: closed auctions with a paid invoice, newest closing first. No buyer or invoice identifiers are exposed.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    maximum: 50,
    minimum: 1,
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(pastAuctionPageSchema) })
  pastAuctions(
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.catalogue.pastAuctions(parse(pageQuerySchema, query));
  }
  @Get('lots')
  @ApiQuery({
    name: 'topDeals',
    required: false,
    type: Boolean,
    description:
      'Admin-curated active lots, in display order, excluding the last 20 minutes.',
  })
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
  @Get()
  @Roles('admin')
  @ApiOperation({
    summary:
      'List lots for Top Deals curation; administrator password/TOTP authentication required.',
  })
  @ApiQuery({
    name: 'reference',
    required: false,
    type: String,
    description: 'Exact lot reference.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 50 })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ schema: schema(topDealAdminPageSchema) })
  @ApiQuery({
    name: 'unsoldOnly',
    required: false,
    type: Boolean,
    description:
      'Unsold stock awaiting staff review; excludes replaced auctions and unpaid wins.',
  })
  async merchandisingList(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.catalogue.merchandisingList(
      await this.actor(request, response),
      parse(topDealAdminQuerySchema, query),
    );
  }
  @Patch(':id/top-deal')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Feature/unfeature or reorder a lot without editing auction or payment settings. Optimistic version required; changes are audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(topDealEditSchema) })
  @ApiOkResponse({ schema: schema(topDealAdminLotSchema) })
  async editTopDeal(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.catalogue.editTopDeal(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(topDealEditSchema, body),
    );
  }
  @Patch(':id/fixed-price')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Set or remove an optional fixed item price in kobo; tax is added at checkout. Audited administrator edit, optimistic version required; blocked during checkout reservations.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(fixedPriceEditSchema) })
  @ApiOkResponse({ schema: schema(topDealAdminLotSchema) })
  async editFixedPrice(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.catalogue.editFixedPrice(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(fixedPriceEditSchema, body),
    );
  }
  @Patch(':id/auto-relist')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Enable or disable future no-bid relists. Administrator MFA, optimistic version and audit required; never restarts a closed auction.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(autoRelistEditSchema) })
  @ApiOkResponse({ schema: schema(topDealAdminLotSchema) })
  async editAutoRelist(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    return this.catalogue.editAutoRelist(
      await this.actor(request, response),
      parse(z.uuid(), id),
      parse(autoRelistEditSchema, body),
    );
  }
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create a draft. Staff password/TOTP authentication is required.',
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
