import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { ledgerHttpError } from '../ledger/ledger-errors';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ledger = ledgerHttpError(error);
    const status =
      ledger?.status ??
      (error instanceof HttpException ? error.getStatus() : 500);
    const messages: Record<number, string> = {
      400: 'Check the request fields and try again.',
      401: 'Code or session is invalid or expired. Sign in again.',
      403: 'Your account or website does not have permission.',
      404: 'This endpoint is not available.',
      413: 'Request is too large.',
      429: 'Too many attempts. Try again later.',
      503: 'Email login is unavailable. Please try again later.',
    };
    const response = host.switchToHttp().getResponse<ServerResponse>();
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (status === 429) response.setHeader('Retry-After', '900');
    // Never serialize Prisma errors or request bodies; they may contain PII/tokens.
    response.end(
      JSON.stringify({
        statusCode: status,
        message:
          ledger?.message ??
          messages[status] ??
          'The request could not be completed.',
        ...(ledger ? { code: ledger.code } : {}),
      }),
    );
  }
}
