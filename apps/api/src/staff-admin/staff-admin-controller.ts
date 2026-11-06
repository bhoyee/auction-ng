import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Inject,
  Req,
  Query,
  Res,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiHeader,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import * as shapes from '@auction-ng/shared';
import { Public, Capabilities, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { StaffAdminService } from './staff-admin-service';
import { StaffActivityService } from './staff-activity-service';
import { StaffSetupService } from './staff-setup-service';
import { StaffBidReviewService } from './staff-bid-review-service';
const schema = (s: z.ZodType) =>
  z.toJSONSchema(s, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
function parse<T extends z.ZodType>(s: T, v: unknown): z.output<T> {
  const r = s.safeParse(v);
  if (!r.success)
    throw new BadRequestException('Check the form fields and retry.');
  return r.data;
}
@ApiTags('Staff administration')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Controller('staff')
export class StaffAdminController {
  constructor(
    @Inject(StaffBidReviewService)
    private readonly bidReview: StaffBidReviewService,
    @Inject(StaffSetupService) private readonly setup: StaffSetupService,
    @Inject(StaffAdminService) private readonly staff: StaffAdminService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(StaffActivityService)
    private readonly activity: StaffActivityService,
  ) {}
  @Get('bid-review')
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'open', 'scheduled', 'closed', 'cancelled'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @Capabilities('bids.read')
  @ApiOperation({
    summary:
      'Search auction items and recorded bid participation, including archived history.',
  })
  @ApiOkResponse({ schema: schema(shapes.staffBidReviewPageSchema) })
  async bidReviewList(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.bidReview.list(
      await this.who(r, s),
      parse(shapes.staffBidReviewQuerySchema, q),
    );
  }
  @Get('bid-review/:id')
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'view', required: false, enum: ['bids', 'prebids'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @Capabilities('bids.read')
  @ApiOperation({
    summary:
      'Read paginated accepted bids or pre-bids, recorded leader and frozen auction/Buy Now outcome. Private spending limits are excluded.',
  })
  @ApiOkResponse({ schema: schema(shapes.staffBidReviewDetailSchema) })
  async bidReviewDetail(
    @Param('id') id: string,
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.bidReview.detail(
      await this.who(r, s),
      parse(z.uuid(), id),
      parse(shapes.staffBidReviewHistoryQuerySchema, q),
    );
  }
  @Post('bid-review/:id/open')
  @HttpCode(200)
  @Capabilities('bids.read')
  @ApiOperation({
    summary:
      'Record an audited item inspection once per idempotency key; does not change bidding.',
  })
  @ApiBody({ schema: schema(z.object({ idempotencyKey: z.uuid() }).strict()) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async bidReviewOpened(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    const body = parse(z.object({ idempotencyKey: z.uuid() }).strict(), b);
    return this.bidReview.opened(
      await this.who(r, s, true),
      parse(z.uuid(), id),
      body.idempotencyKey,
    );
  }
  @Get('setup')
  @Capabilities('setup.manage')
  @ApiOkResponse({ schema: schema(shapes.staffSetupPageSchema) })
  async setupList(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.setup.list(
      await this.who(r, s),
      parse(shapes.staffSetupQuerySchema, q),
    );
  }
  @Post('setup')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiBody({ schema: schema(shapes.staffSetupSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async setupSave(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.setup.save(
      await this.who(r, s, true),
      parse(shapes.staffSetupSaveSchema, b),
    );
  }
  @Post('setup/archive')
  @HttpCode(200)
  @Capabilities('setup.manage')
  @ApiBody({ schema: schema(shapes.staffSetupArchiveSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async setupArchive(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.setup.archive(
      await this.who(r, s, true),
      parse(shapes.staffSetupArchiveSchema, b),
    );
  }
  @Get('preferences')
  @ApiOkResponse({ schema: schema(shapes.staffPreferencesSchema) })
  async preferences(
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.setup.preferences(await this.who(r, s));
  }
  @Post('preferences')
  @HttpCode(200)
  @ApiBody({ schema: schema(shapes.staffPreferencesSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async savePreferences(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.setup.savePreferences(
      await this.who(r, s, true),
      parse(shapes.staffPreferencesSaveSchema, b),
    );
  }
  @Post('activity')
  @HttpCode(200)
  @ApiBody({ schema: schema(shapes.staffPageVisitSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async visit(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.setup.visit(
      await this.who(r, s, true),
      parse(shapes.staffPageVisitSchema, b),
    );
  }
  @Get('audit/:id')
  @Capabilities('audit.read')
  @ApiOkResponse({ schema: schema(shapes.staffAuditDetailSchema) })
  async auditDetail(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.setup.audit(await this.who(r, s), parse(z.uuid(), id));
  }
  @Get('notifications')
  @ApiOkResponse({ schema: schema(shapes.staffInboxPageSchema) })
  async notifications(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.activity.inbox(
      await this.who(r, s),
      parse(shapes.staffInboxQuerySchema, q),
    );
  }
  @Post('notifications/read')
  @HttpCode(200)
  @ApiBody({ schema: schema(shapes.staffInboxReadSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffInboxReadResultSchema) })
  async readNotifications(
    @Body() body: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.activity.read(
      await this.who(r, s, true),
      parse(shapes.staffInboxReadSchema, body),
    );
  }
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
  @Get('lot-images/:id')
  @Capabilities('inventory.read')
  @ApiOkResponse({ schema: schema(shapes.staffImagesSchema) })
  async images(
    @Param('id') id: string,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.images(await this.who(r, s), parse(z.uuid(), id));
  }
  @Get('me')
  @ApiOkResponse({ schema: schema(shapes.staffAccessSchema) })
  async me(
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.me(await this.who(r, s));
  }
  @Get('overview')
  @Capabilities('dashboard.view')
  @ApiOkResponse({ schema: schema(shapes.staffDashboardSchema) })
  async overview(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    parse(z.object({}).strict(), q);
    return this.staff.dashboard(await this.who(r, s));
  }
  @Get('records')
  @ApiOperation({
    summary:
      'Cursor-paginated permission-scoped staff operations records; private fields are never returned.',
  })
  @ApiOkResponse({ schema: schema(shapes.staffRecordPageSchema) })
  async records(
    @Query() q: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.records(
      await this.who(r, s),
      parse(shapes.staffRecordQuerySchema, q),
    );
  }
  @Post('roles')
  @HttpCode(200)
  @Capabilities('staff.manage')
  @ApiBody({ schema: schema(shapes.staffRoleSaveSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async role(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.saveRole(
      await this.who(r, s, true),
      parse(shapes.staffRoleSaveSchema, b),
    );
  }
  @Post('invite')
  @HttpCode(200)
  @Capabilities('staff.manage')
  @ApiBody({ schema: schema(shapes.staffInviteSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async invite(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.invite(
      await this.who(r, s, true),
      parse(shapes.staffInviteSchema, b),
    );
  }
  @Post('assignment')
  @HttpCode(200)
  @Capabilities('staff.manage')
  @ApiBody({ schema: schema(shapes.staffAssignmentSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async assignment(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.assign(
      await this.who(r, s, true),
      parse(shapes.staffAssignmentSchema, b),
    );
  }
  @Post('archive')
  @HttpCode(200)
  @Capabilities('records.archive')
  @ApiBody({ schema: schema(shapes.staffArchiveSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async archive(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.archive(
      await this.who(r, s, true),
      parse(shapes.staffArchiveSchema, b),
    );
  }
  @Post('buyer-action')
  @HttpCode(200)
  @Capabilities('buyers.manage')
  @ApiBody({ schema: schema(shapes.staffBuyerActionSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async buyer(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.buyerAction(
      await this.who(r, s, true),
      parse(shapes.staffBuyerActionSchema, b),
    );
  }
  @Post('refund')
  @HttpCode(200)
  @Capabilities('refunds.manage')
  @ApiOperation({
    summary:
      'MONEY/BID CHANGE — needs human review. Refund a paid uncollected invoice once to its owner wallet using original ledger charges.',
  })
  @ApiBody({ schema: schema(shapes.staffRefundSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async refund(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.refund(
      await this.who(r, s, true),
      parse(shapes.staffRefundSchema, b),
    );
  }
  @Post('import')
  @HttpCode(200)
  @Capabilities('inventory.write')
  @ApiBody({ schema: schema(shapes.staffCsvSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async importDrafts(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    return this.staff.importDrafts(
      await this.who(r, s, true),
      parse(shapes.staffCsvSchema, b),
    );
  }
  @Post('enrollment/start')
  @Public()
  @HttpCode(200)
  @ApiBody({ schema: schema(shapes.staffEnrollmentStartSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffEnrollmentSchema) })
  async enrollStart(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    s.setHeader('Cache-Control', 'no-store');
    await this.auth.securityRate(
      'staff-enrollment',
      r.socket.remoteAddress ?? 'unknown',
    );
    return this.staff.enrollStart(parse(shapes.staffEnrollmentStartSchema, b));
  }
  @Post('enrollment/finish')
  @Public()
  @HttpCode(200)
  @ApiBody({ schema: schema(shapes.staffEnrollmentFinishSchema) })
  @ApiOkResponse({ schema: schema(shapes.staffMutationResultSchema) })
  async enrollFinish(
    @Body() b: unknown,
    @Req() r: AuthRequest,
    @Res({ passthrough: true }) s: ServerResponse,
  ) {
    s.setHeader('Cache-Control', 'no-store');
    await this.auth.securityRate(
      'staff-enrollment',
      r.socket.remoteAddress ?? 'unknown',
    );
    return this.staff.enrollFinish(
      parse(shapes.staffEnrollmentFinishSchema, b),
    );
  }
}
