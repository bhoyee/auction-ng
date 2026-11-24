// Node IPC controls exist only in this isolated test process, never in the HTTP API.
import { randomBytes, randomUUID } from 'node:crypto';
import { calculateInvoiceLine } from '@auction-ng/shared';
import { createApi } from '../src/app';
import { LedgerService } from '../src/ledger/ledger-service';
import { encryptPii, hashPii } from '../src/security/pii';

const buyers = [
  ['Chiamaka Obi', '+2348035558841'],
  ['Emeka Nwosu', '+2348175551120'],
  ['Aisha Bello', '+2349025557733'],
  ['Tunde Adeyemi', '+2348065554402'],
] as const;
const items = [
  ['Binatone blender BLG-452, 1.5 L', 950_000],
  ['Scanfrost standing fan 18 inch', 1_820_000],
  ['Nexus microwave oven 20 L', 2_450_000],
  ['Philips dry iron', 720_000],
  ['LG soundbar SN4', 6_100_000],
  ['Kenwood electric kettle', 540_000],
] as const;

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (
    process.env.NODE_ENV !== 'test' ||
    !process.send ||
    !/^\/auction_ng_test_[a-f0-9]{16}$/.test(new URL(url).pathname)
  )
    throw new Error('Isolated browser test process required.');
  const app = await createApi({
    databaseUrl: url,
    mode: 'local',
    origins: ['http://localhost:3301'],
    emailProvider: { async sendCode() {} },
  });
  await app.listen(0, '127.0.0.1');
  const ledger = new LedgerService(url);
  const { db } = ledger;
  const sessions = {} as Record<
    string,
    { token: string; device: string; id: string }
  >;
  async function person(name: string, role: string, phone?: string) {
    const token = randomBytes(32).toString('base64url');
    const device = randomUUID();
    const email = `${name.split(' ')[0]?.toLowerCase()}@example.test`;
    const user = await db.user.create({
      data: {
        name,
        role,
        emailHash: hashPii(email, 'email'),
        emailCiphertext: encryptPii(email, 'email'),
        emailVerifiedAt: new Date(),
        ...(phone
          ? {
              phoneHash: hashPii(phone, 'phone'),
              phoneCiphertext: encryptPii(phone, 'phone'),
            }
          : {
              staffCredential: {
                create: { passwordHash: 'synthetic-not-a-login' },
              },
            }),
      },
    });
    await db.authSession.create({
      data: {
        userId: user.id,
        client: 'web',
        ...(role === 'buyer'
          ? { buyerMfa: true }
          : { staffAuthenticated: true }),
        familyId: randomUUID(),
        deviceHash: hashPii(`web:${device}`, 'auth-device'),
        accessHash: hashPii(token, 'auth-token'),
        refreshHash: hashPii(randomUUID(), 'refresh'),
        accessExpiresAt: new Date(Date.now() + 3600000),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    return { token, device, id: user.id };
  }
  sessions.admin = await person('Olumide Sanni', 'admin');
  sessions.manager = await person('Funke Bello', 'manager');
  sessions.finance = await person('Ngozi Eze', 'finance');
  sessions.warehouse = await person('Musa Ibrahim', 'warehouse');
  const category = await db.category.create({
    data: { name: 'Kitchen', slug: 'kitchen' },
  });
  const location = await db.location.create({
    data: {
      code: 'IKEJA',
      name: 'Ikeja hub',
      address: '14 Oba Akran Avenue, Ikeja, Lagos',
      hours: {},
      capacityPerSlot: 20,
    },
  });
  let n = 0;
  for (const [name, phone] of buyers) {
    const buyer = await person(name, 'buyer', phone);
    const wallet = await ledger.openWallet(buyer.id);
    await ledger.topup({
      walletId: wallet.id,
      amountKobo: 30_000_000n,
      idempotencyKey: randomUUID(),
      reference: randomUUID(),
    });
    for (let i = 0; i < 4; i++, n++) {
      const [title, hammer] = items[n % items.length] ?? items[0];
      const closedAt = new Date(Date.now() - n * 7 * 3_600_000 - 3_600_000);
      const lot = await db.lot.create({
        data: {
          title,
          description: 'Synthetic',
          condition: 'open_box',
          retailPriceKobo: BigInt(hammer * 3),
          startPriceKobo: 100_000n,
          status: 'closed',
          startAt: new Date(closedAt.getTime() - 86_400_000),
          endAt: closedAt,
          categoryId: category.id,
          locationId: location.id,
        },
      });
      const line = calculateInvoiceLine(hammer);
      const amounts = {
        premiumKobo: BigInt(line.premiumKobo),
        lotFeeKobo: BigInt(line.lotFeeKobo),
        vatKobo: BigInt(line.vatKobo),
        totalKobo: BigInt(line.totalKobo),
      };
      await ledger.debit({
        walletId: wallet.id,
        amountKobo: BigInt(line.totalKobo),
        idempotencyKey: `settlement:debit:${lot.id}`,
        reference: `settlement:debit:${lot.id}`,
      });
      const invoice = await db.invoice.create({
        data: {
          userId: buyer.id,
          status: 'paid',
          createdAt: closedAt,
          hammerTotalKobo: BigInt(hammer),
          ...amounts,
          lines: {
            create: { lotId: lot.id, hammerKobo: BigInt(hammer), ...amounts },
          },
        },
      });
      await db.fulfilment.create({
        data: {
          invoiceId: invoice.id,
          userId: buyer.id,
          locationId: location.id,
          qrTokenHash: randomUUID(),
          qrTokenCiphertext: encryptPii('synthetic', 'pickup-pass'),
        },
      });
    }
  }
  process.on('message', (message: { command: string }) => {
    if (message.command === 'stop') process.exit();
  });
  process.on('disconnect', () => process.exit());
  process.send({ ready: true, url: await app.getUrl(), sessions });
}
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
