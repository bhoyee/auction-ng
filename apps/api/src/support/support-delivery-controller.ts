import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Public, type AuthRequest } from '../auth/auth-guard';
import { NotificationService } from '../closing/notification-service';
import { SupportService } from './support-service';
@Controller('internal/support')
@ApiTags('Support delivery worker')
export class SupportDeliveryController {
  constructor(
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
    @Inject(SupportService) private readonly support: SupportService,
  ) {}
  @Post('deliver')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Private worker only: deliver the bounded support email outbox independently of auction activity.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { type: 'boolean', enum: [true] } },
    },
  })
  async deliver(
    @Req() req: AuthRequest,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    const expected = process.env.SUPPORT_DELIVERY_TOKEN ?? '',
      actual = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '';
    if (
      expected.length < 32 ||
      Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw new UnauthorizedException();
    if (
      !z
        .object({})
        .strict()
        .safeParse(body ?? {}).success ||
      !z.object({}).strict().safeParse(query).success
    )
      throw new BadRequestException();
    await this.notifications.deliver(true);
    await this.support.flushAttachments();
    return { ok: true };
  }
}
