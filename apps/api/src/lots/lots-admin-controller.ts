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
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  lotActivityRowSchema,
  lotBidRowSchema,
  lotBulkResultSchema,
  lotBulkSchema,
  lotDeleteSchema,
  lotEditorSchema,
  lotInvoiceSchema,
  lotLabelSchema,
  lotListPageSchema,
  lotListSetupSchema,
  lotPhotoOrderSchema,
  lotPreferencesSchema,
  lotSaveSchema,
  lotSavedViewSchema,
  lotTabPageSchema,
  lotVersionSchema,
  lotViewSaveSchema,
  lotViewSchema,
  lotWatcherRowSchema,
} from '@auction-ng/shared';
import { Capabilities, Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { clientIp } from '../security/client-ip';
import { LotsAdminService } from './lots-admin-service';

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const uuid = (value: string) => {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new BadRequestException('Check the lot link.');
  return result.data;
};

// Lots inventory (T15e). The guard requires inventory.read; each action
// checks its own permission in LotsAdminService.
@ApiTags('Lots inventory')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Controller('admin/inventory')
@Roles('admin')
@Capabilities('inventory.read')
export class LotsAdminController {
  constructor(
    @Inject(LotsAdminService) private readonly lots: LotsAdminService,
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

  @Get('lots')
  @ApiOperation({
    summary:
      'Lots list: tab counts, summary cards and 50 rows per page for the filters (cursor pages).',
  })
  @ApiOkResponse({ schema: schema(lotListPageSchema) })
  async list(
    @Query() query: Record<string, string>,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.list(await this.actor(r, s), query);
  }

  @Get('setup')
  @ApiOperation({ summary: 'This staff member’s saved views and columns.' })
  @ApiOkResponse({ schema: schema(lotListSetupSchema) })
  async setup(
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.setup(await this.actor(r, s));
  }

  @Post('views')
  @HttpCode(200)
  @ApiBody({ schema: schema(lotViewSaveSchema) })
  @ApiOkResponse({ schema: schema(lotSavedViewSchema) })
  async saveView(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.saveView(await this.actor(r, s), body);
  }

  @Post('views/:id/delete')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  async deleteView(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.deleteView(await this.actor(r, s), uuid(id));
  }

  @Patch('preferences')
  @ApiBody({ schema: schema(lotPreferencesSchema) })
  @ApiOkResponse({ schema: schema(lotPreferencesSchema) })
  async preferences(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.savePreferences(await this.actor(r, s), body);
  }

  @Post('lots')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create a draft lot (idempotent).' })
  @ApiBody({ schema: schema(lotSaveSchema) })
  @ApiOkResponse({ schema: schema(lotEditorSchema) })
  async create(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.save(await this.actor(r, s), null, body);
  }

  @Get('lots/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(lotViewSchema) })
  async view(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.view(await this.actor(r, s), uuid(id));
  }

  @Get('lots/:id/editor')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(lotEditorSchema) })
  async editor(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.editor(await this.actor(r, s), uuid(id));
  }

  @Patch('lots/:id')
  @ApiOperation({
    summary:
      'Edit a lot. Price, run time, category and location lock once live or pre-bid on; buyers are told about changes.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(lotSaveSchema) })
  @ApiOkResponse({ schema: schema(lotEditorSchema) })
  async edit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.save(await this.actor(r, s), uuid(id), body);
  }

  @Get('lots/:id/bids')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(lotTabPageSchema(lotBidRowSchema)) })
  async bids(
    @Param('id') id: string,
    @Query() q: Record<string, string>,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.bids(await this.actor(r, s), uuid(id), q);
  }

  @Get('lots/:id/watchers')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(lotTabPageSchema(lotWatcherRowSchema)) })
  async watchers(
    @Param('id') id: string,
    @Query() q: Record<string, string>,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.watchers(await this.actor(r, s), uuid(id), q);
  }

  @Get('lots/:id/activity')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(lotTabPageSchema(lotActivityRowSchema)) })
  async activity(
    @Param('id') id: string,
    @Query() q: Record<string, string>,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.activity(await this.actor(r, s), uuid(id), q);
  }

  @Get('lots/:id/invoice')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ schema: schema(lotInvoiceSchema) })
  async invoice(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.invoice(await this.actor(r, s), uuid(id));
  }

  @Post('lots/:id/photos')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reorder, tag defects on and remove a lot’s photos.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(lotPhotoOrderSchema) })
  @ApiOkResponse({ schema: schema(lotEditorSchema) })
  async photos(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.photos(await this.actor(r, s), uuid(id), body);
  }

  @Post('lots/:id/duplicate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Copy a lot (not photos, bin or history) into a new draft.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async duplicate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.duplicate(await this.actor(r, s), uuid(id), body);
  }

  @Post('lots/:id/archive')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(lotVersionSchema) })
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.archive(await this.actor(r, s), uuid(id), body, true);
  }

  @Post('lots/:id/unarchive')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(lotVersionSchema) })
  async unarchive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.archive(await this.actor(r, s), uuid(id), body, false);
  }

  @Post('lots/:id/delete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Soft delete with a reason (drafts; scheduled lots are cancelled first). Live and ended lots are refused.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(lotDeleteSchema) })
  async remove(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.remove(await this.actor(r, s), uuid(id), body);
  }

  @Post('lots/:id/restore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Admins restore a deleted lot as a draft within 30 days.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: schema(lotVersionSchema) })
  async restore(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.restore(await this.actor(r, s), uuid(id), body);
  }

  @Post('bulk')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Edit fields, move, archive or delete many lots; returns how many changed and which were skipped and why.',
  })
  @ApiBody({ schema: schema(lotBulkSchema) })
  @ApiOkResponse({ schema: schema(lotBulkResultSchema) })
  async bulk(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.bulk(await this.actor(r, s), body);
  }

  @Get('csv-template')
  @ApiOperation({
    summary: 'CSV template for a category, including its custom fields.',
  })
  async template(
    @Query('categoryId') categoryId: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.csvTemplate(
      await this.actor(r, s),
      uuid(categoryId ?? ''),
    );
  }

  @Post('csv-check')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check a lots CSV and list each problem by row and field.',
  })
  async check(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.csvCheck(await this.actor(r, s), body);
  }

  @Post('csv-import')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Import the good rows of a lots CSV as drafts (idempotent).',
  })
  async import(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.csvImport(await this.actor(r, s), body);
  }

  @Get('export')
  @ApiOperation({
    summary: 'The current filtered list as CSV (up to 5,000 lots).',
  })
  async export(
    @Query() query: Record<string, string>,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.exportCsv(await this.actor(r, s), query);
  }

  @Post('labels')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Label data (lot ID for the QR, title, bin, location) for many lots.',
  })
  @ApiOkResponse({ schema: schema(lotLabelSchema) })
  async labels(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.lots.labels(await this.actor(r, s), body);
  }
}
