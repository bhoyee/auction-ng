import {
  bidPreparationSchema,
  bidResultSchema,
  cancelBidResultSchema,
  prepareBidSchema,
  confirmBidSchema,
  type PrepareBidInput,
  type ConfirmBidInput,
} from '@auction-ng/shared';
import { ApiError } from './auth';

export function createBidClient(
  baseUrl: string,
  options: { accessToken: string; deviceId: string },
) {
  async function post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(new URL(path, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        'X-Device-Id': options.deviceId,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }
  return {
    async prepare(lotId: string, input: PrepareBidInput) {
      return bidPreparationSchema.parse(
        await post(
          `/lots/${encodeURIComponent(lotId)}/bid-preparations`,
          prepareBidSchema.parse(input),
        ),
      );
    },
    async confirm(lotId: string, input: ConfirmBidInput) {
      return bidResultSchema.parse(
        await post(
          `/lots/${encodeURIComponent(lotId)}/bids`,
          confirmBidSchema.parse({
            preparationId: input.preparationId,
            idempotencyKey: input.idempotencyKey,
          }),
        ),
      );
    },
    async cancel(preparationId: string) {
      return cancelBidResultSchema.parse(
        await post(
          `/bid-preparations/${encodeURIComponent(preparationId)}/cancel`,
          {},
        ),
      );
    },
  };
}
