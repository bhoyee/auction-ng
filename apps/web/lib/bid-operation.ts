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
    input: { maxKobo: number; mode: BidMode; idempotencyKey: string },
  ) => Promise<Prepared>;
  confirm: (
    lotId: string,
    input: { preparationId: string; idempotencyKey: string },
  ) => Promise<T>;
  cancel: (preparationId: string) => Promise<unknown>;
};
export class BidFeeChangedError extends Error {}
export class BidPreparationRejectedError extends Error {}
// An uncertain network result must retry the same operation, never reserve a new bid.
export function createBidOperation<T>(
  client: BidTransport<T>,
  lotId: string,
  maxKobo: number,
  mode: BidMode,
  idempotencyKey: string,
  expectedTotal: number,
) {
  let prepared: Prepared | undefined;
  let attempted = false;
  async function prepare() {
    const first = !attempted;
    attempted = true;
    try {
      return await client.prepare(lotId, { maxKobo, mode, idempotencyKey });
    } catch (error) {
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
        prepared.feeVersion !== BID_FEE_VERSION
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
      prepared ??= await prepare();
      return client.cancel(prepared.preparationId);
    },
  };
}
