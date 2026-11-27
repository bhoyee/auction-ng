import { ApiError } from '@auction-ng/api-client/auth';

// Bids, pre-bids and Buy Now ask the buyer to confirm it's them (password,
// email code, authenticator when on) once every 30 minutes. The item screen
// mounts the sheet and registers how to open it.
let open: (() => Promise<boolean>) | undefined;
let pending: Promise<boolean> | undefined;

export function registerPurchaseUnlock(opener?: () => Promise<boolean>) {
  open = opener;
}
export class PurchaseUnlockCancelledError extends Error {
  constructor() {
    super('Confirm it’s you to continue. Nothing was reserved or charged.');
  }
}
export const needsPurchaseUnlock = (error: unknown) =>
  error instanceof ApiError && error.code === 'PURCHASE_UNLOCK_REQUIRED';

/**
 * Runs a bid or purchase request; if the server asks for the check first,
 * shows the sheet and, once confirmed, sends the same request again (same
 * retry key, so nothing is placed twice).
 */
export async function withPurchaseUnlock<T>(task: () => Promise<T>) {
  try {
    return await task();
  } catch (error) {
    if (!needsPurchaseUnlock(error) || !open) throw error;
    pending ??= open().finally(() => {
      pending = undefined;
    });
    if (!(await pending)) throw new PurchaseUnlockCancelledError();
    return task();
  }
}
