export class LedgerError extends Error {}
export class InsufficientFundsError extends LedgerError {}
export class LedgerConflictError extends LedgerError {}
export class InvalidHoldError extends LedgerError {}
export class InvalidRefundError extends LedgerError {}
export class WalletNotFoundError extends LedgerError {}
export class LedgerInvariantError extends LedgerError {}
export class InvalidLedgerInputError extends LedgerError {}

export function ledgerHttpError(
  error: unknown,
): { status: number; code: string; message: string } | undefined {
  if (error instanceof WalletNotFoundError)
    return {
      status: 404,
      code: 'WALLET_NOT_FOUND',
      message: 'Open your wallet to view its balance and history.',
    };
  if (error instanceof InsufficientFundsError)
    return {
      status: 422,
      code: 'INSUFFICIENT_FUNDS',
      message: 'Your available wallet balance is too low.',
    };
  if (error instanceof InvalidLedgerInputError)
    return {
      status: 400,
      code: 'INVALID_WALLET_REQUEST',
      message: 'Check the wallet request and try again.',
    };
  if (error instanceof LedgerConflictError || error instanceof InvalidHoldError)
    return {
      status: 409,
      code: 'LEDGER_CONFLICT',
      message: 'This request conflicts with an existing wallet operation.',
    };
  if (error instanceof InvalidRefundError)
    return {
      status: 422,
      code: 'INVALID_REFUND',
      message: 'The refund exceeds or does not match the original charge.',
    };
  if (error instanceof LedgerError)
    return {
      status: 500,
      code: 'LEDGER_UNAVAILABLE',
      message:
        'Your wallet is temporarily unavailable. Please try again later.',
    };
  return undefined;
}
