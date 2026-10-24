import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import type { ServerResponse } from 'node:http';
import {
  walletBalanceSchema,
  walletHistorySchema,
  walletHistoryQuerySchema,
} from '@auction-ng/shared';
import { Roles, type AuthRequest } from '../auth/auth-guard';
import { LedgerService } from './ledger-service';
import { InvalidLedgerInputError } from './ledger-errors';

const responseSchema = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
@ApiTags('Wallet')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Device-Id',
  required: true,
  description: 'The installation UUID used during sign-in.',
})
@Roles('buyer')
@Controller('wallet')
export class WalletController {
  constructor(@Inject(LedgerService) private readonly ledger: LedgerService) {}
  private user(request: AuthRequest, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    if (!request.identity) throw new UnauthorizedException();
    return request.identity.user.id;
  }
  @Post()
  @HttpCode(200)
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiOkResponse({
    description:
      'Open an empty wallet or return the existing one. This does not fund it or create a bank account.',
    schema: responseSchema(walletBalanceSchema),
  })
  open(
    @Body() body: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    if (
      !z
        .object({})
        .strict()
        .safeParse(body ?? {}).success
    )
      throw new BadRequestException('Use an empty request body.');
    return this.ledger.openWallet(this.user(request, response));
  }
  @Get()
  @ApiOkResponse({
    schema: responseSchema(walletBalanceSchema),
    description: 'Own wallet balances derived from ledger postings.',
  })
  balance(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    if (!z.object({}).strict().safeParse(query).success)
      throw new InvalidLedgerInputError('No wallet query fields are accepted.');
    return this.ledger.getWallet(this.user(request, response));
  }
  @Get('history')
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 50,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Opaque nextCursor from the previous page.',
  })
  @ApiOkResponse({
    schema: responseSchema(walletHistorySchema),
    description: 'Own cursor-paginated wallet history, newest first.',
  })
  history(
    @Query() query: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const parsed = walletHistoryQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new InvalidLedgerInputError('Invalid wallet history query.');
    return this.ledger.history(this.user(request, response), parsed.data);
  }
}
