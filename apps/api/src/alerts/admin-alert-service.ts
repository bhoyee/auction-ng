import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { decryptPii, encryptPii } from '../security/pii';
import {
  adminAlertsEnabled,
  createAdminAlertProvider,
  type AdminAlertProvider,
} from './admin-alert-provider';
import {
  buyerDisplayName,
  saleAlertSchema,
  saleAlertText,
  type SaleAlert,
} from './sale-alert-message';

type Tx = Prisma.TransactionClient;

export const ALERT_MAX_ATTEMPTS = 8;
/** Rows sent per run; a closing wave drains over several runs. */
export const ALERT_BATCH = 3;
/** Pause between messages so CallMeBot does not block the number. */
export const ALERT_GAP_MS = 5000;
const LEASE_MS = 2 * 60_000;
const PURPOSE = 'admin-alert';

/**
 * Queues one WhatsApp alert for a paid sale, inside the caller's
 * transaction. The unique source event makes a repeat call a no-op.
 */
export async function queueSaleAlert(
  tx: Tx,
  eventId: string,
  invoiceId: string,
  paidAt: Date,
  env: Record<string, string | undefined> = process.env,
) {
  if (!adminAlertsEnabled(env)) return false;
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      number: true,
      status: true,
      hammerTotalKobo: true,
      totalKobo: true,
      user: { select: { name: true } },
      purchase: { select: { priceKobo: true } },
      lines: {
        orderBy: { id: 'asc' },
        select: {
          lot: {
            select: {
              title: true,
              lotNumber: true,
              location: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const first = invoice?.lines[0]?.lot;
  if (!invoice || invoice.status !== 'paid' || !first) return false;
  // A malformed alert is skipped rather than thrown, so it can never block
  // the staff email and in-app notifications in the same transaction.
  const parsed = saleAlertSchema.safeParse({
    kind: invoice.purchase ? 'buy-now' : 'auction',
    orderNumber: invoice.number,
    title: first.title,
    lotNumber: first.lotNumber,
    location: first.location.name || null,
    priceKobo: Number(
      invoice.purchase ? invoice.purchase.priceKobo : invoice.hammerTotalKobo,
    ),
    totalKobo: Number(invoice.totalKobo),
    moreItems: invoice.lines.length - 1,
    buyer: buyerDisplayName(invoice.user.name),
    paidAt: paidAt.toISOString(),
  });
  if (!parsed.success) return false;
  const alert: SaleAlert = parsed.data;
  const created = await tx.adminAlert.createMany({
    data: [
      {
        sourceEventId: eventId,
        payloadCiphertext: encryptPii(JSON.stringify(alert), PURPOSE),
      },
    ],
    skipDuplicates: true,
  });
  return created.count === 1;
}

/**
 * Sends pending alerts one at a time, oldest first. Rows are leased and
 * the transaction committed before any network call, so a slow provider
 * never holds database locks. If the process dies after the provider
 * accepted a message but before it is marked sent, the lease expires and
 * that one alert may repeat; alerts never move money.
 */
export class AdminAlertService {
  constructor(
    private readonly db: PrismaClient,
    private readonly provider:
      AdminAlertProvider | undefined = createAdminAlertProvider(),
    private readonly options: {
      gapMs?: number;
      sleep?: (ms: number) => Promise<void>;
      now?: () => Date;
    } = {},
  ) {}

  async deliver() {
    const provider = this.provider;
    if (!provider) return { sent: 0, failed: 0 };
    const now = this.options.now?.() ?? new Date();
    const claimed = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM admin_alerts
        WHERE status = 'pending'
           OR (status = 'sending' AND locked_until < ${now})
        ORDER BY created_at, id
        LIMIT ${ALERT_BATCH}
        FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return [];
      const ids = rows.map((row) => row.id);
      await tx.adminAlert.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'sending',
          lockedUntil: new Date(now.getTime() + LEASE_MS),
        },
      });
      return tx.adminAlert.findMany({
        where: { id: { in: ids } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, attempts: true, payloadCiphertext: true },
      });
    });
    const sleep =
      this.options.sleep ??
      ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
    const gap = this.options.gapMs ?? ALERT_GAP_MS;
    let sent = 0,
      failed = 0;
    for (const [index, row] of claimed.entries()) {
      if (index > 0) await sleep(gap);
      let text: string | undefined;
      try {
        text = saleAlertText(
          saleAlertSchema.parse(
            JSON.parse(decryptPii(Buffer.from(row.payloadCiphertext), PURPOSE)),
          ),
        );
      } catch {
        // A damaged payload can never succeed; stop retrying it.
        await this.db.adminAlert.update({
          where: { id: row.id },
          data: { status: 'failed', lockedUntil: null },
        });
        failed++;
        continue;
      }
      try {
        await provider.send(text);
        await this.db.adminAlert.update({
          where: { id: row.id },
          data: { status: 'sent', sentAt: new Date(), lockedUntil: null },
        });
        sent++;
      } catch {
        const attempts = row.attempts + 1;
        await this.db.adminAlert.update({
          where: { id: row.id },
          data: {
            attempts,
            status: attempts >= ALERT_MAX_ATTEMPTS ? 'failed' : 'pending',
            lockedUntil: null,
          },
        });
        failed++;
      }
    }
    return { sent, failed };
  }
}
