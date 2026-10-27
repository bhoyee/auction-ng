import { afterEach, expect, it, vi } from 'vitest';
import { NotificationService } from '../apps/api/src/closing/notification-service';
import type { LedgerService } from '../apps/api/src/ledger/ledger-service';

const send = vi.fn();
vi.mock('../apps/api/src/email/mail-delivery', async (original) => ({
  ...(await original<typeof import('../apps/api/src/email/mail-delivery')>()),
  createMailDelivery: () => ({ send }),
}));
vi.mock('../apps/api/src/security/pii', () => ({
  decryptPii: (value: Buffer) => value.toString(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function fixture(email: string) {
  const message = {
    invoiceNumber: 'INV-TESTCODE',
    title: 'Demo item',
    lotNumber: 'LOT-TESTCODE',
    hammerKobo: 500000,
    premiumKobo: 75000,
    lotFeeKobo: 30000,
    vatKobo: 7875,
    totalKobo: 612875,
    location: 'Ikeja hub',
    address: 'Demo pickup',
    status: 'paid',
    deadline: null,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'receipt-1' }]),
    notification: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'receipt-1',
        payloadCiphertext: Buffer.from(
          JSON.stringify({
            emailCiphertext: Buffer.from(email).toString('base64'),
            message,
          }),
        ),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const ledger = {
    db: {
      $transaction: (work: (client: typeof tx) => Promise<void>) => work(tx),
    },
  } as unknown as LedgerService;
  return {
    service: new NotificationService(ledger),
    update: tx.notification.update,
  };
}
it('marks synthetic SMTP receipts failed without sending or blocking real recipients', async () => {
  vi.stubEnv('AUTH_MODE', 'smtp');
  const { service, update } = fixture('demo-buyer@example.test');
  await service.deliver();
  expect(send).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith({
    where: { id: 'receipt-1' },
    data: { status: 'failed' },
  });
});
it('marks an accepted real receipt sent using a stable idempotency key', async () => {
  vi.stubEnv('AUTH_MODE', 'smtp');
  send.mockResolvedValueOnce(undefined);
  const { service, update } = fixture('buyer@example.com');
  await service.deliver();
  expect(send).toHaveBeenCalledWith(
    'buyer@example.com',
    expect.objectContaining({
      Subject: expect.stringContaining('LOT-TESTCODE'),
    }),
    'auction-ng/notification/receipt-1',
  );
  expect(update).toHaveBeenCalledWith({
    where: { id: 'receipt-1' },
    data: { status: 'sent', sentAt: expect.any(Date) },
  });
});
it('leaves a failed SMTP attempt pending for retry', async () => {
  vi.stubEnv('AUTH_MODE', 'smtp');
  send.mockRejectedValueOnce(new Error('Delivery unavailable'));
  const { service, update } = fixture('buyer@example.com');
  await expect(service.deliver()).rejects.toThrow('Delivery unavailable');
  expect(update).not.toHaveBeenCalled();
});
