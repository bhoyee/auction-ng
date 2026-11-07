import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  overviewRefreshSchema,
  overviewRefreshReportSchema,
} from '@auction-ng/shared';
import { Public } from '../auth/auth-guard';
import { StaffAdminService } from './staff-admin-service';
import { OverviewMaintenance } from './overview-maintenance';
const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;
@Controller('internal/analytics')
@ApiTags('Private analytics maintenance')
export class OverviewMaintenanceController {
  constructor(
    @Inject(StaffAdminService) private readonly staff: StaffAdminService,
  ) {}
  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Private worker refresh of derived analytics only; requires the maintenance bearer token.',
  })
  @ApiBody({ schema: schema(overviewRefreshSchema) })
  @ApiOkResponse({ schema: schema(overviewRefreshReportSchema) })
  async refresh(
    @Headers('authorization') authorization: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    const secret = process.env.BID_MAINTENANCE_TOKEN;
    if (!secret || secret.length < 32 || typeof authorization !== 'string')
      throw new UnauthorizedException();
    const expected = Buffer.from('Bearer ' + secret),
      actual = Buffer.from(authorization);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new UnauthorizedException();
    const parsed = overviewRefreshSchema.safeParse(body);
    if (!parsed.success || !z.object({}).strict().safeParse(query).success)
      throw new BadRequestException();
    return new OverviewMaintenance(this.staff.ledger).refresh(
      parsed.data.history,
    );
  }
}
