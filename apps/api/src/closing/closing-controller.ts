import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth-guard';
import { ClosingService } from './closing-service';
import { NotificationService } from './notification-service';

@ApiTags('Internal settlement')
@Controller('internal/lots')
export class ClosingController {
  constructor(
    @Inject(ClosingService) private readonly closer: ClosingService,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}
  @Post('close')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Private worker-only closing batch. Requires the bid maintenance bearer secret.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['checked', 'failed'],
      additionalProperties: false,
      properties: {
        checked: { type: 'integer', minimum: 0, maximum: 100 },
        failed: { type: 'integer', minimum: 0, maximum: 100 },
      },
    },
  })
  async run(
    @Headers('authorization') authorization: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from(`Bearer ${secret}`),
      actual = Buffer.from(authorization);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    if (
      !z
        .object({})
        .strict()
        .safeParse(body ?? {}).success ||
      !z.object({}).strict().safeParse(query).success
    )
      throw new BadRequestException();
    const report = await this.closer.run();
    await this.notifications.deliver();
    return report;
  }
}
