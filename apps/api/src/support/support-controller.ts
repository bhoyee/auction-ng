import { clientIp } from '../security/client-ip';
import { Capabilities } from '../auth/auth-guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  supportActionSchema,
  supportAvailabilitySchema,
  supportConversationSchema,
  supportCreateSchema,
  supportListInputSchema,
  supportMessageInputSchema,
  supportMessagePageSchema,
  supportMessagesInputSchema,
  supportPageSchema,
  supportPresenceSchema,
  supportStaffCreateSchema,
  bidCancellationRequestSchema,
  bidCancellationStateSchema,
} from '@auction-ng/shared';
import { AuthService } from '../auth/auth-service';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { SupportService } from './support-service';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
const parse = <T>(value: z.ZodType<T>, input: unknown) => {
  const result = value.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Check the conversation fields.');
  return result.data;
};
@Controller('support')
@ApiTags('Customer support')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer', 'admin', 'support')
@Capabilities('support.manage', true)
export class SupportController {
  constructor(
    @Inject(SupportService) private readonly service: SupportService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async owner(req: AuthRequest, write = false) {
    if (!req.identity) throw new UnauthorizedException();
    await this.auth.supportRate(req.identity.user.id, clientIp(req), write);
    return req.identity;
  }
  @Get('lots/:id/bid-cancellation')
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Read your accepted commitment and human-review conversation; never changes a bid.',
  })
  @ApiOkResponse({ schema: schema(bidCancellationStateSchema) })
  async bidCancellation(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.bidCancellation(
      await this.owner(req),
      parse(z.uuid(), id),
    );
  }
  @Post('lots/:id/bid-cancellation')
  @HttpCode(200)
  @Roles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Ask a human to review an owned live bid; leaves bids and reserved funds active.',
  })
  @ApiBody({ schema: schema(bidCancellationRequestSchema) })
  @ApiOkResponse({ schema: schema(bidCancellationStateSchema) })
  async requestBidCancellation(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.requestBidCancellation(
      await this.owner(req, true),
      parse(z.uuid(), id),
      parse(bidCancellationRequestSchema, body),
    );
  }
  @Get('availability')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Whether an active support agent is accepting conversations; no fabricated online claim.',
  })
  @ApiOkResponse({ schema: schema(supportAvailabilitySchema) })
  async availability(@Query() query: unknown, @Req() req: AuthRequest) {
    parse(z.object({}).strict(), query);
    await this.owner(req);
    return this.service.availability();
  }
  @Post('presence')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Roles('admin', 'support')
  @Capabilities('support.manage')
  @ApiOperation({
    summary: 'Heartbeat your own support availability for sixty seconds.',
  })
  @ApiBody({ schema: schema(supportPresenceSchema) })
  @ApiOkResponse({ schema: schema(supportAvailabilitySchema) })
  async presence(@Body() body: unknown, @Req() req: AuthRequest) {
    const value = parse(supportPresenceSchema, body);
    return this.service.presence(await this.owner(req, true), value.accepting);
  }
  @Get('conversations')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'open', 'in_progress', 'resolved'],
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 50 })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Cursor-paginated owned buyer conversations or authorised staff inbox.',
  })
  @ApiOkResponse({ schema: schema(supportPageSchema) })
  async list(@Query() query: unknown, @Req() req: AuthRequest) {
    return this.service.list(
      await this.owner(req),
      parse(supportListInputSchema, query),
    );
  }
  @Post('conversations')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Roles('buyer')
  @ApiOperation({
    summary: 'Create one buyer conversation with an immutable retry key.',
  })
  @ApiBody({ schema: schema(supportCreateSchema) })
  @ApiOkResponse({ schema: schema(supportConversationSchema) })
  async create(@Body() body: unknown, @Req() req: AuthRequest) {
    return this.service.create(
      await this.owner(req, true),
      parse(supportCreateSchema, body),
    );
  }
  @Post('staff/conversations')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Roles('admin', 'support')
  @Capabilities('support.manage')
  @ApiOperation({
    summary:
      'Open a conversation on behalf of an active buyer; public replies notify that buyer.',
  })
  @ApiBody({ schema: schema(supportStaffCreateSchema) })
  @ApiOkResponse({ schema: schema(supportConversationSchema) })
  async staffCreate(@Body() body: unknown, @Req() req: AuthRequest) {
    return this.service.create(
      await this.owner(req, true),
      parse(supportStaffCreateSchema, body),
    );
  }
  @Get('conversations/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Read an authorised conversation; never another buyer’s conversation.',
  })
  @ApiOkResponse({ schema: schema(supportConversationSchema) })
  async get(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    parse(z.object({}).strict(), query);
    return this.service.get(await this.owner(req), parse(z.uuid(), id));
  }
  @Get('conversations/:id/messages')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 50 })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Newest message page, displayed chronologically; older cursor pages. Buyer reads exclude private notes and their files.',
  })
  @ApiOkResponse({ schema: schema(supportMessagePageSchema) })
  async messages(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
  ) {
    const value = parse(supportMessagesInputSchema, query);
    return this.service.messages(
      await this.owner(req),
      parse(z.uuid(), id),
      value.limit,
      value.cursor,
    );
  }
  @Post('conversations/:id/messages')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Save an idempotent text/image reply or staff-only private note; guided FAQ replies stop after human handoff.',
  })
  @ApiBody({ schema: schema(supportMessageInputSchema) })
  @ApiOkResponse({ schema: schema(supportConversationSchema) })
  async send(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.send(
      await this.owner(req, true),
      parse(z.uuid(), id),
      parse(supportMessageInputSchema, body),
    );
  }
  @Post('conversations/:id/actions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Request human handoff, claim/release a staff conversation, resolve or reopen with version checks and idempotency.',
  })
  @ApiBody({ schema: schema(supportActionSchema) })
  @ApiOkResponse({ schema: schema(supportConversationSchema) })
  async action(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.service.action(
      await this.owner(req, true),
      parse(z.uuid(), id),
      parse(supportActionSchema, body),
    );
  }
  @Get('attachments/:id')
  @ApiOkResponse({
    description: 'Authorised private WebP image, no-store.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiOperation({
    summary:
      'Download an authorised private, metadata-stripped WebP attachment. Bearer session required.',
  })
  async attachment(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() req: AuthRequest,
    @Res() res: ServerResponse,
  ) {
    parse(z.object({}).strict(), query);
    const bytes = await this.service.attachment(
      await this.owner(req),
      parse(z.uuid(), id),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="support-image.webp"',
    );
    res.end(bytes);
  }
}
