import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import * as shapes from '@auction-ng/shared';
import {
  Capabilities,
  Public,
  Roles,
  type AuthRequest,
} from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { InvoiceService } from './invoice-service';

const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const number = (v: string) => {
  if (!/^[A-Z0-9-]{3,40}$/.test(v))
    throw new BadRequestException('Check the invoice link.');
  return v;
};
const uuid = (v: string) => {
  const r = z.uuid().safeParse(v);
  if (!r.success) throw new BadRequestException('Check the invoice link.');
  return r.data;
};
const pdf = (name: string, content: Buffer) =>
  new StreamableFile(content, {
    type: 'application/pdf',
    length: content.length,
    disposition: `attachment; filename="${name}.pdf"`,
  });

// Invoices (T15f). Each action checks its own permission in InvoiceService.
@ApiTags('Invoices')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Controller('admin/invoices')
@Roles(...shapes.staffRoles)
export class InvoiceController {
  constructor(
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
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
  @Capabilities('invoices.read')
  @ApiOperation({ summary: 'Invoices with tab counts (cursor pages, max 50).' })
  @ApiOkResponse({ schema: schema(shapes.invoiceListPageSchema) })
  async list(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.list(await this.who(r, s), q);
  }
  @Get('export')
  @Capabilities('invoices.read')
  @ApiOperation({ summary: 'The filtered invoices as CSV (up to 5,000).' })
  @ApiOkResponse({ schema: schema(shapes.invoiceExportSchema) })
  async export(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.exportCsv(await this.who(r, s, true), q);
  }
  @Post('refunds')
  @HttpCode(200)
  @Capabilities('refunds.request')
  @ApiOperation({ summary: 'Ask for a full or partial refund.' })
  @ApiBody({ schema: schema(shapes.refundRequestSchema) })
  @ApiOkResponse({ schema: schema(shapes.invoiceResultSchema) })
  async request(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.requestRefund(await this.who(r, s, true), b);
  }
  @Post('refunds/decide')
  @HttpCode(200)
  @Capabilities('invoices.read')
  @ApiOperation({
    summary:
      'MONEY/BID CHANGE — needs human review. Approve (pays the wallet) or reject a refund asked for by someone else.',
  })
  @ApiBody({ schema: schema(shapes.refundDecisionSchema) })
  @ApiOkResponse({ schema: schema(shapes.invoiceResultSchema) })
  async decide(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.decideRefund(await this.who(r, s, true), b);
  }
  @Post('notes')
  @HttpCode(200)
  @Capabilities('invoices.manage')
  @ApiOperation({ summary: 'Add an internal note.' })
  @ApiBody({ schema: schema(shapes.invoiceNoteSchema) })
  @ApiOkResponse({ schema: schema(shapes.invoiceResultSchema) })
  async note(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.addNote(await this.who(r, s, true), b);
  }
  @Post('resend')
  @HttpCode(200)
  @Capabilities('invoices.manage')
  @ApiOperation({ summary: 'Send the invoice again (3 an hour).' })
  @ApiBody({ schema: schema(shapes.invoiceResendSchema) })
  @ApiOkResponse({ schema: schema(shapes.invoiceResultSchema) })
  async resend(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.resend(await this.who(r, s, true), b);
  }
  @Post('disputes')
  @HttpCode(200)
  @Capabilities('invoices.read')
  @ApiOperation({ summary: 'Open a support ticket linked to the invoice.' })
  @ApiBody({ schema: schema(shapes.invoiceDisputeSchema) })
  @ApiOkResponse({ schema: schema(shapes.invoiceResultSchema) })
  async dispute(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.dispute(await this.who(r, s, true), b);
  }
  @Get('company')
  @Capabilities('company.manage')
  @ApiOperation({ summary: 'Company details printed on invoices.' })
  @ApiOkResponse({ schema: schema(shapes.companyViewSchema) })
  async company(
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.company(await this.who(r, s));
  }
  @Post('company')
  @HttpCode(200)
  @Capabilities('company.manage')
  @ApiOperation({ summary: 'Change the company details.' })
  @ApiBody({ schema: schema(shapes.companySaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.invoiceResultSchema) })
  async saveCompany(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.saveCompany(await this.who(r, s, true), b);
  }
  @Get(':number')
  @Capabilities('invoices.read')
  @ApiOperation({ summary: 'One invoice with payments, refunds and history.' })
  @ApiOkResponse({ schema: schema(shapes.invoiceViewSchema) })
  async view(
    @Param('number') n: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.view(await this.who(r, s), number(n));
  }
  @Get(':number/pickup')
  @Capabilities('pickup.manage')
  @ApiOperation({ summary: 'What to hand over, without any money.' })
  @ApiOkResponse({ schema: schema(shapes.invoicePickupViewSchema) })
  async pickup(
    @Param('number') n: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.pickupView(await this.who(r, s), number(n));
  }
  @Get(':number/pdf')
  @Capabilities('invoices.read')
  @ApiOperation({ summary: 'The invoice as an A4 PDF.' })
  async pdf(
    @Param('number') n: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s, true);
    return pdf(number(n), await this.invoices.staffPdf(who, number(n)));
  }
  @Get(':number/receipt')
  @Capabilities('invoices.read')
  @ApiOperation({
    summary: 'One receipt for everything this buyer paid between two dates.',
  })
  async receipt(
    @Param('number') n: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const who = await this.who(r, s, true);
    return pdf('receipt', await this.invoices.staffReceipt(who, number(n), q));
  }
}

@ApiTags('Buyer account')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('buyers')
export class BuyerInvoiceController {
  constructor(
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async buyer(req: AuthRequest, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (!req.identity) throw new UnauthorizedException();
    await this.auth.limitCatalogueRequests(
      req.identity.user.id,
      req.socket.remoteAddress ?? 'unknown',
    );
    return req.identity.user.id;
  }
  @Get('receipt')
  @ApiOperation({
    summary: 'One PDF receipt for everything you paid between two dates.',
  })
  async receipt(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return pdf(
      'giddydeal-receipt',
      await this.invoices.buyerReceipt(await this.buyer(r, s), q),
    );
  }
  @Get('invoices/:id/pdf')
  @ApiOperation({ summary: 'Your invoice as an A4 PDF.' })
  async pdf(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const file = await this.invoices.buyerPdf(await this.buyer(r, s), uuid(id));
    return pdf(file.number, file.content);
  }
  @Get('invoices/:id/refunds')
  @ApiOperation({ summary: 'Money returned to your wallet on this invoice.' })
  @ApiOkResponse({ schema: schema(shapes.buyerInvoiceRefundsSchema) })
  async refunds(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.invoices.buyerRefunds(await this.buyer(r, s), uuid(id));
  }
}

@ApiTags('Private invoice maintenance')
@Controller('internal/invoices')
export class InvoiceMaintenanceController {
  constructor(
    @Inject(InvoiceService) private readonly invoices: InvoiceService,
  ) {}
  @Post('check')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Private nightly check of invoice totals; requires the maintenance bearer token.',
  })
  async check(@Headers('authorization') authorization: unknown) {
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from('Bearer ' + secret);
    const actual = Buffer.from(authorization);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    const result = await this.invoices.mismatches();
    if (result.mismatches.length)
      console.error(
        `Invoice check: ${result.mismatches.length} invoices don't add up: ${result.mismatches.slice(0, 10).join(', ')}`,
      );
    return result;
  }
}
