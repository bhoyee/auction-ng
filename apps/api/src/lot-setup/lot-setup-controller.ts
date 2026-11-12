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
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import * as shapes from '@auction-ng/shared';
import { Capabilities, Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { CategoryService } from './category-service';
import { LocationService } from './location-service';
import { CatalogService } from './catalog-service';

const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
function parse<T extends z.ZodType>(s: T, v: unknown): z.output<T> {
  const r = s.safeParse(v);
  if (!r.success) throw new BadRequestException('Check the request and retry.');
  return r.data;
}
const uuid = (v: unknown) => parse(z.uuid(), v);
const noQuery = (q: unknown) => parse(z.object({}).strict(), q);

// Lot setup (T15e). Every staff role reaches these routes; the services
// check read access again (setup.read, setup.manage, or inventory.read for
// the Create lot form options and bin labels). Only setup.manage changes.
@ApiTags('Lot setup')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles(...shapes.staffRoles)
@Controller('admin/lot-setup')
export class LotSetupController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CategoryService) private readonly categoryService: CategoryService,
    @Inject(LocationService) private readonly locationService: LocationService,
    @Inject(CatalogService) private readonly catalogService: CatalogService,
  ) {}
  private async who(req: AuthRequest, res: ServerResponse, write = false) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    if (write)
      await this.auth.staffActionRate(
        req.identity.user.id,
        req.socket.remoteAddress ?? 'unknown',
      );
    return req.identity;
  }

  @Get('summary')
  @ApiOperation({ summary: 'Counts for the Lot setup tab bar.' })
  @ApiOkResponse({ schema: schema(shapes.lotSetupSummarySchema) })
  async summary(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    noQuery(q);
    return this.catalogService.summary(who);
  }

  @Get('options')
  @ApiOperation({
    summary:
      'Categories with effective defaults and fields, open locations with bins, and brands for the Create lot form.',
  })
  @ApiOkResponse({ schema: schema(shapes.lotSetupOptionsSchema) })
  async options(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    noQuery(q);
    return this.catalogService.options(who);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'Category tree with lot and live counts, in buyer menu order.',
  })
  @ApiOkResponse({ schema: schema(shapes.categoryTreeSchema) })
  async categories(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    noQuery(q);
    return this.categoryService.tree(who);
  }

  @Get('conditions')
  @ApiOperation({
    summary:
      'Item conditions with buyer-facing meaning, colour, order and on/off.',
  })
  @ApiOkResponse({ schema: schema(shapes.conditionListSchema) })
  async conditions(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    noQuery(q);
    return this.catalogService.conditions(who);
  }

  @Get('locations')
  @ApiOperation({
    summary:
      'Pickup location cards with lots here, pickups today and bins used.',
  })
  @ApiOkResponse({ schema: schema(shapes.locationListSchema) })
  async locations(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    noQuery(q);
    return this.locationService.list(who);
  }

  @Get('staff-options')
  @ApiOperation({ summary: 'Active staff that can be assigned to a location.' })
  @ApiOkResponse({ schema: schema(shapes.staffOptionsSchema) })
  async staffOptions(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    return this.locationService.staffOptions(
      who,
      parse(
        z.object({ search: z.string().trim().max(120).optional() }).strict(),
        q,
      ).search,
    );
  }

  @Get('suppliers')
  @ApiOperation({ summary: 'Suppliers, keyset paginated by name (max 50).' })
  @ApiOkResponse({ schema: schema(shapes.supplierPageSchema) })
  async suppliers(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    return this.catalogService.suppliers(who, q);
  }

  @Get('deletions')
  @ApiOperation({
    summary:
      'Deletion history: which setup items were permanently deleted, by whom and when (newest first, max 50 per page).',
  })
  @ApiOkResponse({ schema: schema(shapes.lotSetupDeletionPageSchema) })
  async deletions(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    return this.catalogService.deletions(who, q);
  }

  @Get('brands')
  @ApiOperation({
    summary:
      'Brands with their categories and lot counts, keyset paginated (max 50).',
  })
  @ApiOkResponse({ schema: schema(shapes.brandPageSchema) })
  async brands(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    return this.catalogService.brands(who, q);
  }

  @Get('categories/:id')
  @ApiOperation({
    summary:
      'One category with its own and inherited defaults, fields, stats and delete rule.',
  })
  @ApiOkResponse({ schema: schema(shapes.categoryDetailSchema) })
  async category(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    noQuery(q);
    return this.categoryService.detail(who, uuid(id));
  }

  @Get('locations/:id')
  @ApiOperation({
    summary:
      'One pickup location with hours, pickup rules, bins summary and staff.',
  })
  @ApiOkResponse({ schema: schema(shapes.locationDetailSchema) })
  async location(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    noQuery(q);
    return this.locationService.detail(who, uuid(id));
  }

  @Get('locations/:id/bins')
  @ApiOperation({
    summary:
      'Bins at a location with lots inside and status, plus summary counts.',
  })
  @ApiOkResponse({ schema: schema(shapes.binPageSchema) })
  async bins(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    return this.locationService.bins(who, uuid(id), q);
  }

  @Get('locations/:id/bin-labels')
  @ApiOperation({
    summary: 'QR label data for some or all bins at a location.',
  })
  @ApiOkResponse({ schema: schema(shapes.binLabelsSchema) })
  async binLabels(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s);
    return this.locationService.labels(
      who,
      uuid(id),
      parse(z.object({ ids: z.string().max(3800).optional() }).strict(), q)
        .ids?.split(',')
        .map(uuid),
    );
  }

  @Post('categories')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary:
      'Create or update a category, its defaults, allowed conditions and item details. Applies to new lots only.',
  })
  @ApiBody({ schema: schema(shapes.categorySaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async saveCategory(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.categoryService.save(await this.who(r, s, true), b);
  }

  @Post('categories/order')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary: 'Save the order buyers see for one level of the tree.',
  })
  @ApiBody({ schema: schema(shapes.categoryOrderSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async orderCategories(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.categoryService.order(await this.who(r, s, true), b);
  }

  @Post('categories/visibility')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Show or hide a category from buyers.' })
  @ApiBody({ schema: schema(shapes.categoryVisibilitySchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async categoryVisibility(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.categoryService.visibility(await this.who(r, s, true), b);
  }

  @Post('categories/move-lots')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary: 'Move every lot in a category to another category.',
  })
  @ApiBody({ schema: schema(shapes.categoryMoveLotsSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async moveCategoryLots(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.categoryService.moveLots(await this.who(r, s, true), b);
  }

  @Post('categories/delete')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary: 'Delete a category with no lots and no subcategories.',
  })
  @ApiBody({ schema: schema(shapes.lotSetupDeleteSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async deleteCategory(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.categoryService.remove(await this.who(r, s, true), b);
  }

  @Post('locations')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary:
      'Create or update a pickup location, its hours and pickup rules. Only the storage fee per day is set per location; free collection is 5 working days everywhere.',
  })
  @ApiBody({ schema: schema(shapes.locationSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async saveLocation(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.save(await this.who(r, s, true), b);
  }

  @Post('locations/close')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary:
      'Close or reopen a location. Closed locations disappear from new lots and pickups; existing lots stay.',
  })
  @ApiBody({ schema: schema(shapes.locationCloseSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async closeLocation(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.close(await this.who(r, s, true), b);
  }

  @Post('locations/bin-rule')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary: 'Require a bin before lots at this location can be published.',
  })
  @ApiBody({ schema: schema(shapes.locationBinRuleSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async locationBinRule(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.binRule(await this.who(r, s, true), b);
  }

  @Post('locations/staff')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Set the staff assigned to a location.' })
  @ApiBody({ schema: schema(shapes.locationStaffSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async locationStaff(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.assignStaff(await this.who(r, s, true), b);
  }

  @Post('locations/delete')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Delete a location that has never held a lot.' })
  @ApiBody({ schema: schema(shapes.lotSetupDeleteSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async deleteLocation(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.remove(await this.who(r, s, true), b);
  }

  @Post('bins')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Create or update one bin.' })
  @ApiBody({ schema: schema(shapes.binSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async saveBin(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.saveBin(await this.who(r, s, true), b);
  }

  @Post('bins/batch')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary:
      'Add several bins from a name and number range; stops if a name already exists.',
  })
  @ApiBody({ schema: schema(shapes.binBatchSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async addBins(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.addBins(await this.who(r, s, true), b);
  }

  @Post('bins/delete')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary:
      'Delete an empty bin. Bins holding lots can only stop taking new lots.',
  })
  @ApiBody({ schema: schema(shapes.lotSetupDeleteSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async deleteBin(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.locationService.removeBin(await this.who(r, s, true), b);
  }

  @Post('conditions')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary: 'Edit a condition name, meaning, colour or on/off.',
  })
  @ApiBody({ schema: schema(shapes.conditionSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async saveCondition(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.saveCondition(await this.who(r, s, true), b);
  }

  @Post('conditions/order')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Save the order of conditions.' })
  @ApiBody({ schema: schema(shapes.conditionOrderSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async orderConditions(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.orderConditions(await this.who(r, s, true), b);
  }

  @Post('suppliers')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Create or update a supplier.' })
  @ApiBody({ schema: schema(shapes.supplierSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async saveSupplier(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.saveSupplier(await this.who(r, s, true), b);
  }

  @Post('suppliers/active')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Deactivate or reactivate a supplier.' })
  @ApiBody({ schema: schema(shapes.activeToggleSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async supplierActive(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.supplierActive(await this.who(r, s, true), b);
  }

  @Post('suppliers/delete')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Delete a supplier with no inventory batches.' })
  @ApiBody({ schema: schema(shapes.lotSetupDeleteSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async deleteSupplier(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.removeSupplier(await this.who(r, s, true), b);
  }

  @Post('brands')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Create or update a brand and its categories.' })
  @ApiBody({ schema: schema(shapes.brandSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async saveBrand(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.saveBrand(await this.who(r, s, true), b);
  }

  @Post('brands/merge')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({
    summary: 'Merge one brand into another; lots move to the kept brand.',
  })
  @ApiBody({ schema: schema(shapes.brandMergeSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async mergeBrands(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.mergeBrands(await this.who(r, s, true), b);
  }

  @Post('brands/delete')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiOperation({ summary: 'Delete a brand no lot uses.' })
  @ApiBody({ schema: schema(shapes.lotSetupDeleteSchema) })
  @ApiOkResponse({ schema: schema(shapes.lotSetupResultSchema) })
  async deleteBrand(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.catalogService.removeBrand(await this.who(r, s, true), b);
  }
}
