import { BID_FEE_VERSION } from '@auction-ng/shared/fees';
import type { BidMode } from '@auction-ng/shared/auction-rules';
import { ApiError } from '@auction-ng/api-client/auth';
type Prepared = {
  preparationId: string;
  totalKobo: number;
  feeVersion: string;
};
type BidTransport<T> = {
  prepare: (
    lotId: string,
    input: {
      maxKobo: number;
      mode: BidMode;
      idempotencyKey: string;
      feeVersion?: string;
    },
  ) => Promise<Prepared>;
  confirm: (
    lotId: string,
    input: { preparationId: string; idempotencyKey: string },
  ) => Promise<T>;
  cancel: (preparationId: string) => Promise<unknown>;
};
export class BidFeeChangedError extends Error {}
export class BidPreparationRejectedError extends Error {}
// The server refused before reserving anything: the buyer must confirm their
// identity, then the same operation can safely run again.
export class BidVerificationRequiredError extends Error {}
// An uncertain network result must retry the same operation, never reserve a new bid.
export function createBidOperation<T>(
  client: BidTransport<T>,
  lotId: string,
  maxKobo: number,
  mode: BidMode,
  idempotencyKey: string,
  expectedTotal: number,
  feeVersion = BID_FEE_VERSION,
) {
  let prepared: Prepared | undefined;
  let attempted = false;
  async function prepare() {
    const first = !attempted;
    attempted = true;
    try {
      return await client.prepare(lotId, {
        maxKobo,
        mode,
        idempotencyKey,
        ...(feeVersion === BID_FEE_VERSION ? {} : { feeVersion }),
      });
    } catch (error) {
      // The server replays any earlier preparation under this key before it
      // checks, so this 403 proves nothing was ever reserved under the key:
      // callers discard this operation and start a fresh one after the check.
      if (error instanceof ApiError && error.code === 'VERIFICATION_REQUIRED') {
        attempted = false;
        throw new BidVerificationRequiredError(
          'Confirm it’s you to keep bidding.',
        );
      }
      // A first 409 is a pre-reservation conflict; never make this assumption after an uncertain attempt.
      if (first && error instanceof ApiError && error.status === 409)
        throw new BidPreparationRejectedError(
          'This bid could not be prepared. Check the minimum bid, any earlier spending limit and your wallet balance, then try again.',
        );
      throw error;
    }
  }
  return {
    async run() {
      prepared ??= await prepare();
      if (
        prepared.totalKobo !== expectedTotal ||
        prepared.feeVersion !== feeVersion
      ) {
        await client.cancel(prepared.preparationId);
        throw new BidFeeChangedError(
          'Auction fees changed. Review the current total before bidding again.',
        );
      }
      return client.confirm(lotId, {
        preparationId: prepared.preparationId,
        idempotencyKey,
      });
    },
    async cancel() {
      // Nothing to release when no preparation was ever attempted.
      if (!prepared && !attempted) return undefined;
      prepared ??= await prepare();
      return client.cancel(prepared.preparationId);
    },
  };
}
