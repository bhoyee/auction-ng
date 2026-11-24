import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { batchRecalcSchema } from '@auction-ng/shared';
import { Public } from '../auth/auth-guard';
import { BatchService } from './batch-service';

@Controller('internal/batches')
@ApiTags('Private batch maintenance')
export class BatchMaintenanceController {
  constructor(@Inject(BatchService) private readonly batches: BatchService) {}

  @Post('recalculate')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Private worker recalculation of changed batches; requires the maintenance bearer token.',
  })
  @ApiOkResponse({
    schema: z.toJSONSchema(batchRecalcSchema, {
      target: 'openapi-3.0',
      io: 'input',
    }) as SchemaObject,
  })
  async recalculate(
    @Headers('authorization') authorization: unknown,
    @Body() body: unknown,
  ) {
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from('Bearer ' + secret);
    const actual = Buffer.from(authorization);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    if (!z.object({}).strict().safeParse(body).success)
      throw new BadRequestException();
    return this.batches.recalculate();
  }
}
