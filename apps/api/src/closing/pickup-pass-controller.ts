import {
  BadRequestException,
  Body,
  Controller,
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
import { pickupPassSchema } from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { AuthService } from '../auth/auth-service';
import { ClosingService } from './closing-service';

@ApiTags('Pickup')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Device-Id', required: true })
@Roles('buyer')
@Controller('invoices')
export class PickupPassController {
  constructor(
    @Inject(ClosingService) private readonly closer: ClosingService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Post(':id/pickup-pass')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Read your own paid pickup pass. Keep this bearer token private.',
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiOkResponse({
    schema: z.toJSONSchema(pickupPassSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  async pass(
    @Param('id') id: string,
    @Body() body: unknown,
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    if (
      !z.uuid().safeParse(id).success ||
      !z
        .object({})
        .strict()
        .safeParse(body ?? {}).success ||
      !z.object({}).strict().safeParse(query).success
    )
      throw new BadRequestException();
    await this.auth.limitPaymentRequests(
      request.identity.user.id,
      request.socket.remoteAddress ?? 'unknown',
    );
    return pickupPassSchema.parse(
      await this.closer.pickupPass(request.identity.user.id, id),
    );
  }
}
