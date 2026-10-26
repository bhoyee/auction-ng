import { expect, it, vi } from 'vitest';
import {
  BidPreparationRejectedError,
  createBidOperation,
} from '../apps/web/lib/bid-operation';
import { ApiError } from '../packages/api-client/src/auth';
import { BID_FEE_VERSION } from '../packages/shared/src/index';
const preparation = {
  preparationId: 'prep',
  totalKobo: 90313,
  feeVersion: BID_FEE_VERSION,
};
it('lets a buyer correct a first preparation conflict without confirming or cancelling anything', async () => {
  const confirm = vi.fn();
  const cancel = vi.fn();
  const operation = createBidOperation(
    { prepare: vi.fn().mockRejectedValue(new ApiError(409)), confirm, cancel },
    'lot',
    50000,
    'direct',
    'key',
    90313,
  );
  await expect(operation.run()).rejects.toBeInstanceOf(
    BidPreparationRejectedError,
  );
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});
it('keeps an uncertain preparation pending when a later retry conflicts', async () => {
  const operation = createBidOperation(
    {
      prepare: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockRejectedValue(new ApiError(409)),
      confirm: vi.fn(),
      cancel: vi.fn(),
    },
    'lot',
    50000,
    'direct',
    'key',
    90313,
  );
  await expect(operation.run()).rejects.toThrow('network');
  await expect(operation.run()).rejects.toBeInstanceOf(ApiError);
});
it('retries preparation and confirmation with the original immutable amount and key', async () => {
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(preparation);
  const confirm = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue({ status: 'accepted' });
  const operation = createBidOperation(
    { prepare, confirm, cancel: vi.fn() },
    'lot',
    50000,
    'direct',
    'same-key',
    90313,
  );
  await expect(operation.run()).rejects.toThrow('network');
  await expect(operation.run()).rejects.toThrow('network');
  await operation.run();
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(prepare.mock.calls[0]).toEqual(prepare.mock.calls[1]);
  expect(confirm.mock.calls[0]).toEqual(confirm.mock.calls[1]);
  expect(confirm.mock.calls[0]?.[1]).toEqual({
    preparationId: 'prep',
    idempotencyKey: 'same-key',
  });
});
it('never confirms a different server total or fee version', async () => {
  const confirm = vi.fn();
  const cancel = vi.fn().mockResolvedValue({ status: 'cancelled' });
  const operation = createBidOperation(
    {
      prepare: vi.fn().mockResolvedValue({ ...preparation, totalKobo: 99999 }),
      confirm,
      cancel,
    },
    'lot',
    50000,
    'automatic',
    'key',
    90313,
  );
  await expect(operation.run()).rejects.toThrow('fees');
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledWith('prep');
});
it('reconciles an uncertain preparation with its original key before cancellation', async () => {
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(preparation);
  const cancel = vi.fn().mockResolvedValue({ status: 'accepted' });
  const operation = createBidOperation(
    { prepare, cancel, confirm: vi.fn() },
    'lot',
    50000,
    'direct',
    'same-key',
    90313,
  );
  await expect(operation.run()).rejects.toThrow('network');
  expect(await operation.cancel()).toEqual({ status: 'accepted' });
  expect(prepare.mock.calls[0]).toEqual(prepare.mock.calls[1]);
  expect(cancel).toHaveBeenCalledWith('prep');
});
