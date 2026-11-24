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
  StreamableFile,
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
import { BatchService } from './batch-service';

const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const uuid = (v: string) => {
  const r = z.uuid().safeParse(v);
  if (!r.success) throw new BadRequestException('Check the batch link.');
  return r.data;
};

// Inventory batches (T15e). The guard requires batches.read; each action
// checks its own permission in BatchService, and money fields are null
// without batches.costs.
@ApiTags('Inventory batches')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Controller('admin/batches')
@Roles('admin')
@Capabilities('batches.read')
export class BatchController {
  constructor(
    @Inject(BatchService) private readonly batches: BatchService,
    @Inject(AuthService) private readonly auth: AuthService,
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

  @Get()
  @ApiOperation({
    summary: 'Batches with tab counts and cards (cursor pages, max 50).',
  })
  @ApiOkResponse({ schema: schema(shapes.batchPageSchema) })
  async list(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.list(await this.who(r, s), q);
  }

  @Get('export')
  @ApiOperation({ summary: 'The filtered batches as CSV (up to 5,000).' })
  @ApiOkResponse({ schema: schema(shapes.batchExportSchema) })
  async export(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.exportCsv(await this.who(r, s, true), q);
  }

  @Get('picker')
  @ApiOperation({
    summary: 'Open batches for the lot form (names only, never costs).',
  })
  @ApiOkResponse({ schema: schema(shapes.batchPickerSchema) })
  async picker(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.picker(await this.who(r, s), q);
  }

  @Get('form')
  @ApiOperation({
    summary: 'Active suppliers, locations and categories for Add batch.',
  })
  @ApiOkResponse({ schema: schema(shapes.batchFormSchema) })
  async form(
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.form(await this.who(r, s));
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Add or edit a batch.' })
  @ApiBody({ schema: schema(shapes.batchSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.batchResultSchema) })
  async save(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.save(await this.who(r, s, true), b);
  }

  @Post('receive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a batch received with its real item count.' })
  @ApiBody({ schema: schema(shapes.batchReceiveSchema) })
  @ApiOkResponse({ schema: schema(shapes.batchResultSchema) })
  async receive(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.receive(await this.who(r, s, true), b);
  }

  @Post('close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Close a batch by hand, with a reason.' })
  @ApiBody({ schema: schema(shapes.batchReasonSchema) })
  @ApiOkResponse({ schema: schema(shapes.batchResultSchema) })
  async close(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.close(await this.who(r, s, true), b);
  }

  @Post('reopen')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reopen a closed batch, with a reason.' })
  @ApiBody({ schema: schema(shapes.batchReasonSchema) })
  @ApiOkResponse({ schema: schema(shapes.batchResultSchema) })
  async reopen(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.reopen(await this.who(r, s, true), b);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One batch: numbers, recovery by day and what is left.',
  })
  @ApiOkResponse({ schema: schema(shapes.batchDetailSchema) })
  async detail(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.detail(await this.who(r, s), uuid(id));
  }

  @Get(':id/stuck')
  @ApiOperation({ summary: 'Items unsold after two relists (50 a page).' })
  @ApiOkResponse({ schema: schema(shapes.batchStuckPageSchema) })
  async stuck(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.stuck(await this.who(r, s), uuid(id), q);
  }

  @Post(':id/write-off')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Write off draft or unsold items; their cost stays on the batch.',
  })
  @ApiBody({ schema: schema(shapes.batchWriteOffSchema) })
  @ApiOkResponse({ schema: schema(shapes.batchWriteOffResultSchema) })
  async writeOff(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.writeOff(await this.who(r, s, true), uuid(id), b);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Who did what to this batch (20 a page).' })
  @ApiOkResponse({ schema: schema(shapes.batchActivitySchema) })
  async activity(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.activity(await this.who(r, s), uuid(id), q);
  }

  @Get(':id/files')
  @ApiOperation({ summary: 'Attached invoices and item lists.' })
  @ApiOkResponse({ schema: schema(shapes.batchFilesSchema) })
  async files(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.files(await this.who(r, s), uuid(id));
  }

  @Post(':id/files')
  @HttpCode(200)
  @ApiOperation({ summary: 'Attach a PDF, photo or Excel file (max 5 MB).' })
  @ApiBody({ schema: schema(shapes.batchFileUploadSchema) })
  @ApiOkResponse({ schema: schema(shapes.batchResultSchema) })
  async addFile(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.addFile(await this.who(r, s, true), uuid(id), b);
  }

  @Get(':id/files/:fileId')
  @ApiOperation({ summary: 'Download one attached file.' })
  async file(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const file = await this.batches.file(
      await this.who(r, s),
      uuid(id),
      uuid(fileId),
    );
    // Always a download: uploaded files are never shown inside our pages.
    s.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.content, {
      type: file.type,
      length: file.content.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, '_')}`,
    });
  }

  @Post(':id/files/:fileId/remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove one attached file.' })
  @ApiOkResponse({ schema: schema(shapes.batchResultSchema) })
  async removeFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.batches.removeFile(
      await this.who(r, s, true),
      uuid(id),
      uuid(fileId),
    );
  }
}
