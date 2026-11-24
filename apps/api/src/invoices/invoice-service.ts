import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  allocateRefund,
  buyerInvoiceRefundsSchema,
  companyDetailsSchema,
  companySaveSchema,
  companyViewSchema,
  fromLedgerKobo,
  INVOICE_EXPORT_MAX_ROWS,
  INVOICE_RESENDS_PER_HOUR,
  invoiceDisputeSchema,
  invoiceListPageSchema,
  invoiceListQuerySchema,
  invoiceNoteSchema,
  invoicePaymentLabels,
  invoicePaymentState,
  invoicePickupLabels,
  invoicePickupState,
  invoicePickupViewSchema,
  invoiceResendSchema,
  invoiceRowSchema,
  invoiceViewSchema,
  normalizeNigerianPhone,
  receiptQuerySchema,
  RECEIPT_MAX_INVOICES,
  refundDecisionSchema,
  refundReasonLabels,
  refundRequestSchema,
  splitRefund,
  type InvoiceListFilters,
  type InvoicePaymentState,
  type InvoiceRefund,
  type StaffPermission,
} from '@auction-ng/shared';
import { Prisma } from '../generated/prisma/client';
import type { AuthIdentity } from '../auth/auth-service';
import { staffAccess } from '../auth/staff-access';
import {
  blocked,
  fieldError,
  LotSetupBase,
  parseInput,
  type Tx,
} from '../lot-setup/lot-setup-base';
import { decryptPii, encryptPii, hashPii } from '../security/pii';
import type { SupportService } from '../support/support-service';
import { invoicePdf, receiptPdf } from './invoice-pdf';

const sql = Prisma.sql;
const join = Prisma.join;
const kobo = fromLedgerKobo;
const notePurpose = 'invoice-note';
const webOrigin = () =>
  process.env.PAYMENT_RETURN_ORIGIN ?? 'http://localhost:3300';

const cursorSchema = z.object({ at: z.iso.datetime(), id: z.uuid() }).strict();
const cursor = {
  read(value?: string) {
    if (!value) return null;
    try {
      const c = cursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString()),
      );
      return { at: new Date(c.at), id: c.id };
    } catch {
      throw new BadRequestException('Reload the list and try again.');
    }
  },
  write: (at: Date, id: string) =>
    Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString(
      'base64url',
    ),
};
/** WAT calendar date → the UTC instant its day starts. */
const watStart = (date: string) => new Date(`${date}T00:00:00+01:00`);
const nextDay = (date: string) =>
  new Date(watStart(date).getTime() + 86_400_000);
const decrypt = (value: Uint8Array | null, purpose: string) =>
  value ? decryptPii(Buffer.from(value), purpose) : null;
/** +2348035554417 → 0803 ••• 4417 */
const maskPhone = (phone: string | null) =>
  phone ? `0${phone.slice(4, 7)} ••• ${phone.slice(-4)}` : null;
const localPhone = (phone: string | null) =>
  phone?.startsWith('+234') ? '0' + phone.slice(4) : phone;

const activityLabels: Record<string, string> = {
  'invoices.resent': 'Invoice sent to the buyer again',
  'invoices.note_added': 'Note added',
  'invoices.dispute_opened': 'Dispute opened',
  'invoices.refund_requested': 'Refund requested',
  'invoices.refund_approved': 'Refund approved and paid to the wallet',
  'invoices.refund_rejected': 'Refund rejected',
  'invoices.pdf_downloaded': 'PDF downloaded',
};

type ListRow = {
  id: string;
  number: string;
  status: string;
  buyer_name: string;
  phone: Uint8Array | null;
  lots: bigint;
  hammer: bigint;
  fees: bigint;
  total: bigint;
  refunded: bigint;
  pending: boolean;
  disputed: boolean;
  fulfilment: string | null;
  collected_at: Date | null;
  due_at: Date | null;
  location_name: string | null;
  created_at: Date;
};
const PENDING = sql`EXISTS (SELECT 1 FROM refund_requests rr WHERE rr.invoice_id = i.id AND rr.status = 'requested')`;
const DISPUTED = sql`EXISTS (SELECT 1 FROM invoice_disputes d JOIN support_conversations sc ON sc.id = d.conversation_id WHERE d.invoice_id = i.id AND sc.status <> 'resolved')`;
const LIST_FROM = sql`FROM invoices i
  JOIN users u ON u.id = i.user_id
  LEFT JOIN fulfilments f ON f.invoice_id = i.id
  LEFT JOIN locations loc ON loc.id = f.location_id`;
const tabSql = {
  all: sql`true`,
  not_collected: sql`i.status = 'paid' AND f.collected_at IS NULL AND f.status NOT IN ('cancelled','collected')`,
  refund_pending: PENDING,
  refunded: sql`i.refunded_kobo > 0`,
  disputed: DISPUTED,
};
const paymentSql: Record<InvoicePaymentState, Prisma.Sql> = {
  cancelled: sql`i.status = 'cancelled'`,
  refunded: sql`i.status = 'refunded'`,
  disputed: sql`i.status NOT IN ('cancelled','refunded') AND ${DISPUTED}`,
  refund_pending: sql`i.status NOT IN ('cancelled','refunded') AND NOT ${DISPUTED} AND ${PENDING}`,
  pending: sql`i.status = 'pending' AND NOT ${DISPUTED} AND NOT ${PENDING}`,
  partly_refunded: sql`i.status = 'paid' AND i.refunded_kobo > 0 AND NOT ${DISPUTED} AND NOT ${PENDING}`,
  paid: sql`i.status = 'paid' AND i.refunded_kobo = 0 AND NOT ${DISPUTED} AND NOT ${PENDING}`,
};

const fullInclude = {
  user: {
    select: {
      id: true,
      name: true,
      phoneCiphertext: true,
      emailCiphertext: true,
    },
  },
  purchase: { select: { id: true, verifiedAt: true } },
  settlement: { select: { feeVersion: true } },
  fulfilment: { include: { location: true } },
  lines: {
    orderBy: { id: 'asc' as const },
    include: {
      storageCase: true,
      collection: { select: { invoiceLineId: true } },
      lot: {
        include: {
          bin: { select: { code: true } },
          settlement: { select: { closedAt: true } },
          images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;
type Full = Prisma.InvoiceGetPayload<{ include: typeof fullInclude }>;

const requestInclude = {
  requestedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
  invoice: { select: { number: true, user: { select: { name: true } } } },
  lines: {
    include: {
      line: { select: { lot: { select: { lotNumber: true, title: true } } } },
    },
  },
} satisfies Prisma.RefundRequestInclude;

// Invoices (T15f). Permissions are checked here, not only in the UI. Money
// moves only through the ledger service, when a refund is approved.
export class InvoiceService extends LotSetupBase {
  constructor(
    staff: ConstructorParameters<typeof LotSetupBase>[0],
    private readonly support: SupportService,
  ) {
    super(staff);
  }
  private get ledger() {
    return this.staff.ledger;
  }
  private async access(
    tx: Tx,
    who: AuthIdentity,
    permission: StaffPermission = 'invoices.read',
  ) {
    await this.staff.actor(tx, who, permission);
    const { permissions } = await staffAccess(tx, who.user.id);
    const can = (p: StaffPermission) => permissions.includes(p);
    return {
      can,
      flags: {
        canManage: can('invoices.manage'),
        canDispute: can('support.manage'),
        canRequestRefund: can('refunds.request'),
        canDecideRefund: can('refunds.manage'),
      },
    };
  }

  // ---------------------------------------------------------------- list ----

  private where(f: InvoiceListFilters) {
    const parts: Prisma.Sql[] = [];
    if (f.search) {
      let phone: string | null = null;
      try {
        phone = hashPii(normalizeNigerianPhone(f.search), 'phone');
      } catch {
        // Not a full phone number: search names and numbers.
      }
      const like = `%${f.search.replace(/[\\%_]/g, '\\$&')}%`;
      parts.push(
        phone
          ? sql`u.phone_hash = ${phone}`
          : sql`(i.number ILIKE ${like} OR u.name ILIKE ${like})`,
      );
    }
    // Work that is waiting shows whatever its date.
    const dated = !['refund_pending', 'disputed'].includes(f.tab);
    if (dated && f.from) parts.push(sql`i.created_at >= ${watStart(f.from)}`);
    if (dated && f.to) parts.push(sql`i.created_at < ${nextDay(f.to)}`);
    if (f.payment) parts.push(paymentSql[f.payment]);
    if (f.locationIds?.length)
      parts.push(
        sql`f.location_id IN (${join(f.locationIds.map((id) => sql`${id}::uuid`))})`,
      );
    if (f.minKobo !== undefined)
      parts.push(sql`i.total_kobo >= ${BigInt(f.minKobo)}`);
    if (f.maxKobo !== undefined)
      parts.push(sql`i.total_kobo <= ${BigInt(f.maxKobo)}`);
    return parts.length ? sql`AND ${join(parts, ' AND ')}` : Prisma.empty;
  }

  private async rows(tx: Tx, f: InvoiceListFilters, limit: number) {
    const after = cursor.read(f.cursor);
    const rows = await tx.$queryRaw<ListRow[]>`
      SELECT i.id::text, i.number, i.status, u.name AS buyer_name, u.phone_ciphertext AS phone,
        (SELECT count(*) FROM invoice_lines il WHERE il.invoice_id = i.id) AS lots,
        i.hammer_total_kobo AS hammer, (i.premium_kobo + i.lot_fee_kobo + i.vat_kobo) AS fees,
        i.total_kobo AS total, i.refunded_kobo AS refunded,
        ${PENDING} AS pending, ${DISPUTED} AS disputed,
        f.status AS fulfilment, f.collected_at, loc.name AS location_name,
        (SELECT min(c.due_at) FROM pickup_storage_cases c JOIN invoice_lines il ON il.id = c.invoice_line_id
          WHERE il.invoice_id = i.id AND c.collected_at IS NULL) AS due_at,
        i.created_at
      ${LIST_FROM}
      WHERE ${tabSql[f.tab]} ${this.where(f)}
        AND ${after ? sql`(i.created_at, i.id) < (${after.at}, ${after.id}::uuid)` : sql`true`}
      ORDER BY i.created_at DESC, i.id DESC LIMIT ${limit + 1}`;
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      page,
      nextCursor:
        rows.length > limit && last
          ? cursor.write(last.created_at, last.id)
          : null,
    };
  }
  private row(r: ListRow) {
    return invoiceRowSchema.parse({
      id: r.id,
      number: r.number,
      buyerName: r.buyer_name,
      phone: maskPhone(decrypt(r.phone, 'phone')),
      lots: Number(r.lots),
      hammerKobo: kobo(r.hammer),
      feesKobo: kobo(r.fees),
      totalKobo: kobo(r.total),
      payment: invoicePaymentState({
        status: r.status,
        refundedKobo: kobo(r.refunded),
        refundPending: r.pending,
        disputed: r.disputed,
      }),
      pickup: invoicePickupState({
        fulfilment: r.fulfilment,
        collectedAt: r.collected_at,
        dueAt: r.due_at,
        now: new Date(),
      }),
      locationName: r.location_name,
      issuedAt: r.created_at.toISOString(),
    });
  }

  async list(who: AuthIdentity, input: unknown) {
    const f = parseInput(invoiceListQuerySchema, input);
    return this.db.$transaction(async (tx) => {
      await this.access(tx, who);
      const { page, nextCursor } = await this.rows(tx, f, f.limit);
      const [c] = await tx.$queryRaw<Record<string, bigint>[]>`
        SELECT count(*) AS "all",
          count(*) FILTER (WHERE ${tabSql.not_collected}) AS not_collected,
          count(*) FILTER (WHERE ${tabSql.refunded}) AS refunded,
          (SELECT count(*) FROM refund_requests WHERE status = 'requested') AS refund_pending,
          (SELECT count(DISTINCT d.invoice_id) FROM invoice_disputes d JOIN support_conversations sc ON sc.id = d.conversation_id WHERE sc.status <> 'resolved') AS disputed
        ${LIST_FROM} WHERE true ${this.where({ ...f, tab: 'all' })}`;
      return invoiceListPageSchema.parse({
        items: page.map((r) => this.row(r)),
        counts: {
          all: Number(c?.all ?? 0),
          not_collected: Number(c?.not_collected ?? 0),
          refund_pending: Number(c?.refund_pending ?? 0),
          refunded: Number(c?.refunded ?? 0),
          disputed: Number(c?.disputed ?? 0),
        },
        nextCursor,
      });
    });
  }

  async exportCsv(who: AuthIdentity, input: unknown) {
    const f = parseInput(invoiceListQuerySchema, input);
    return this.db.$transaction(
      async (tx) => {
        await this.access(tx, who);
        const { page, nextCursor } = await this.rows(
          tx,
          { ...f, cursor: undefined },
          INVOICE_EXPORT_MAX_ROWS,
        );
        if (nextCursor)
          throw new BadRequestException(
            `Narrow the filters to ${INVOICE_EXPORT_MAX_ROWS.toLocaleString('en-NG')} invoices or fewer to export.`,
          );
        const naira = (v: number) => (v / 100).toFixed(2);
        const cell = (v: string) => {
          const safe = /^[=+@\t\r-]/.test(v) ? `'${v}` : v;
          return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
        };
        const lines = page.map((raw) => {
          const r = this.row(raw);
          return [
            r.number,
            r.buyerName,
            String(r.lots),
            naira(r.hammerKobo),
            naira(r.feesKobo),
            naira(r.totalKobo),
            naira(kobo(raw.refunded)),
            invoicePaymentLabels[r.payment],
            invoicePickupLabels[r.pickup],
            r.locationName ?? '',
            r.issuedAt,
          ]
            .map(cell)
            .join(',');
        });
        await this.auditRow(tx, who.user.id, 'exported', who.user.id, {
          rows: lines.length,
        });
        return {
          filename: 'invoices.csv',
          csv: `${String.fromCharCode(0xfeff)}Invoice,Buyer,Lots,Hammer (NGN),Fees and VAT (NGN),Total (NGN),Refunded (NGN),Payment,Pickup,Location,Issued (UTC)\n${lines.join('\n')}\n`,
          rows: lines.length,
        };
      },
      { timeout: 30_000 },
    );
  }

  // ------------------------------------------------------------- one ----

  private async find(tx: Tx, number: string): Promise<Full> {
    const row = await tx.invoice.findUnique({
      where: { number },
      include: fullInclude,
    });
    if (!row) throw new NotFoundException('Invoice not found.');
    return row;
  }
  private async feeRates(tx: Tx, row: Full) {
    if (row.purchase) return { premiumBps: null, vatBps: 750 };
    const policy = row.settlement
      ? await tx.auctionFeePolicy.findUnique({
          where: { version: row.settlement.feeVersion },
        })
      : null;
    // A policy with a switched-off fee prints no rate rather than a wrong one.
    const first = row.lines[0];
    const exact = (part: bigint, base: bigint, bps: number | undefined) =>
      bps !== undefined && (base * BigInt(bps) + 5000n) / 10000n === part
        ? bps
        : null;
    return {
      premiumBps: first
        ? exact(first.premiumKobo, first.hammerKobo, policy?.premiumBps)
        : null,
      vatBps: first
        ? exact(
            first.vatKobo,
            first.premiumKobo + first.lotFeeKobo,
            policy?.vatBps,
          )
        : null,
    };
  }
  private async marks(tx: Tx, invoiceId: string) {
    const refundPending =
      (await tx.refundRequest.count({
        where: { invoiceId, status: 'requested' },
      })) > 0;
    const disputed =
      (await tx.invoiceDispute.count({
        where: { invoiceId, conversation: { status: { not: 'resolved' } } },
      })) > 0;
    return { refundPending, disputed };
  }
  /** Why a refund can't be requested or paid now; null when it can. */
  private refundProblem(row: Full): string | null {
    if (row.status !== 'paid')
      return 'Only paid invoices that aren’t fully refunded can be refunded.';
    if (
      row.fulfilment?.collectedAt ||
      row.lines.some((l) => l.collection !== null)
    )
      return 'Collected items can’t be refunded.';
    return null;
  }
  private dueAt(row: Full) {
    return row.lines.reduce<Date | null>(
      (min, l) =>
        l.storageCase &&
        !l.storageCase.collectedAt &&
        (!min || l.storageCase.dueAt < min)
          ? l.storageCase.dueAt
          : min,
      null,
    );
  }
  private pickup(row: Full) {
    const f = row.fulfilment;
    if (!f) return null;
    const held = row.lines.find((l) => l.storageCase)?.storageCase;
    const dueAt = this.dueAt(row);
    return {
      state: invoicePickupState({
        fulfilment: f.status,
        collectedAt: f.collectedAt,
        dueAt,
        now: new Date(),
      }),
      locationName: f.location.name,
      address: f.location.address,
      dueAt: dueAt?.toISOString() ?? null,
      dailyKobo: held ? kobo(held.dailyKobo) : null,
      storageWaived: held?.waived ?? false,
      collectedAt: f.collectedAt?.toISOString() ?? null,
    };
  }
  private lines(row: Full) {
    return row.lines.map((l) => ({
      id: l.id,
      lotId: l.lotId,
      lotNumber: l.lot.lotNumber,
      title: l.lot.title,
      thumbnailUrl:
        l.lot.images[0]?.thumbnailUrl ?? l.lot.images[0]?.url ?? null,
      binCode: l.lot.bin?.code ?? null,
      wonAt: (l.lot.settlement?.closedAt ?? row.createdAt).toISOString(),
      hammerKobo: kobo(l.hammerKobo),
      premiumKobo: kobo(l.premiumKobo),
      lotFeeKobo: kobo(l.lotFeeKobo),
      vatKobo: kobo(l.vatKobo),
      totalKobo: kobo(l.totalKobo),
      refundedKobo: kobo(l.refundedKobo),
    }));
  }
  /** The wallet charges that paid this invoice, grouped by line. */
  private async charges(tx: Tx, row: Full) {
    const references: Prisma.LedgerTransactionWhereInput[] = row.purchase
      ? [{ reference: 'purchase:debit:' + row.purchase.id }]
      : row.lines.flatMap((l) => [
          { reference: 'settlement:debit:' + l.lotId },
          { reference: { startsWith: 'settlement:' + l.lotId + ':' } },
        ]);
    const charges = references.length
      ? await tx.ledgerTransaction.findMany({
          where: {
            operation: { in: ['debit', 'capture'] },
            OR: references,
          },
          orderBy: { id: 'asc' },
          take: 501,
          include: { refunds: { where: { operation: 'refund' } } },
        })
      : [];
    if (charges.length > 500)
      throw new ConflictException('This invoice needs finance review.');
    return charges;
  }
  private request(
    r: Prisma.RefundRequestGetPayload<{ include: typeof requestInclude }>,
    userId: string,
  ): InvoiceRefund {
    return {
      id: r.id,
      invoiceNumber: r.invoice.number,
      buyerName: r.invoice.user.name,
      reason: r.reason as InvoiceRefund['reason'],
      note: decrypt(r.noteCiphertext, notePurpose),
      amountKobo: kobo(r.amountKobo),
      lines: r.lines.map((l) => ({
        lotNumber: l.line.lot.lotNumber,
        title: l.line.lot.title,
        amountKobo: kobo(l.amountKobo),
      })),
      status: r.status as InvoiceRefund['status'],
      requestedBy: r.requestedBy.name,
      requestedAt: r.createdAt.toISOString(),
      decidedBy: r.decidedBy?.name ?? null,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: decrypt(r.decisionCiphertext, notePurpose),
      own: r.requestedById === userId,
    };
  }

  async view(who: AuthIdentity, number: string) {
    return this.db.$transaction(
      async (tx) => {
        const { flags } = await this.access(tx, who);
        const row = await this.find(tx, number);
        const marks = await this.marks(tx, row.id);
        const rates = await this.feeRates(tx, row);
        const charges = await this.charges(tx, row);
        const requests = await tx.refundRequest.findMany({
          where: { invoiceId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: requestInclude,
        });
        const notes = await tx.invoiceNote.findMany({
          where: { invoiceId: row.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
          include: { author: { select: { name: true } } },
        });
        const disputes = await tx.invoiceDispute.findMany({
          where: { invoiceId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            openedBy: { select: { name: true } },
            conversation: { select: { number: true, status: true } },
          },
        });
        const messages = await tx.notification.findMany({
          where: {
            userId: row.userId,
            OR: [
              ...row.lines.map((l) => ({
                reference: { startsWith: `settlement:${l.lotId}:` },
              })),
              ...(row.purchase
                ? [{ reference: `purchase:${row.purchase.id}:paid` }]
                : []),
              { reference: { startsWith: `staff-refund:${row.id}` } },
              { reference: { startsWith: `invoice:${row.id}:` } },
            ],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
          select: {
            id: true,
            reference: true,
            status: true,
            channel: true,
            createdAt: true,
            sentAt: true,
          },
        });
        const activity = await tx.auditLog.findMany({
          where: { entityType: 'invoice', entityId: row.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
          include: { actor: { select: { name: true } } },
        });
        const wins = await tx.invoice.count({
          where: { userId: row.userId, status: { in: ['paid', 'refunded'] } },
        });
        const strikes = await tx.strike.count({
          where: { userId: row.userId, revokedAt: null },
        });
        const wallet = await tx.wallet.findUnique({
          where: { userId: row.userId },
        });
        const balances = wallet
          ? await this.ledger.readBalances(tx, wallet.id)
          : null;
        const paid = ['paid', 'refunded'].includes(row.status);
        const total = kobo(row.totalKobo);
        const refunded = kobo(row.refundedKobo);
        const payments = charges.flatMap((c) => [
          {
            id: c.id,
            at: c.createdAt.toISOString(),
            what:
              c.operation === 'capture' ? 'Hold captured' : 'Paid from wallet',
            account: 'Buyer wallet',
            amountKobo: -kobo(c.amountKobo ?? 0n),
            reference: 'LE-' + c.id.slice(0, 8).toUpperCase(),
          },
          ...c.refunds.map((r) => ({
            id: r.id,
            at: r.createdAt.toISOString(),
            what: 'Refund to wallet',
            account: 'Buyer wallet',
            amountKobo: kobo(r.amountKobo ?? 0n),
            reference: 'LE-' + r.id.slice(0, 8).toUpperCase(),
          })),
        ]);
        payments.sort((a, b) => a.at.localeCompare(b.at));
        const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
        const ready = row.lines.find((l) => l.storageCase)?.storageCase;
        return invoiceViewSchema.parse({
          id: row.id,
          number: row.number,
          saleType: row.purchase ? 'fixed_price' : 'auction',
          payment: invoicePaymentState({
            status: row.status,
            refundedKobo: refunded,
            ...marks,
          }),
          issuedAt: row.createdAt.toISOString(),
          paidAt: iso(row.paidAt),
          hammerKobo: kobo(row.hammerTotalKobo),
          premiumKobo: kobo(row.premiumKobo),
          lotFeeKobo: kobo(row.lotFeeKobo),
          vatKobo: kobo(row.vatKobo),
          totalKobo: total,
          paidKobo: paid ? total : 0,
          refundedKobo: refunded,
          balanceKobo: row.status === 'pending' ? total : 0,
          ...rates,
          buyer: {
            id: row.userId,
            name: row.user.name,
            phone: localPhone(decrypt(row.user.phoneCiphertext, 'phone')),
            email: decrypt(row.user.emailCiphertext, 'email'),
            wins,
            strikes,
            walletKobo: balances ? kobo(balances.availableKobo) : 0,
          },
          lines: this.lines(row),
          pickup: this.pickup(row),
          timeline: [
            {
              label: row.purchase ? 'Bought now' : 'Auction won',
              detail: row.lines[0]?.lot.lotNumber ?? '',
              at: iso(row.lines[0]?.lot.settlement?.closedAt ?? row.createdAt),
            },
            {
              label: 'Invoice issued',
              detail: 'sent to the buyer by email and in-app',
              at: row.createdAt.toISOString(),
            },
            {
              label: 'Paid from wallet',
              detail: row.purchase ? 'at checkout' : 'when the auction ended',
              at: iso(row.paidAt),
            },
            {
              label: 'Ready to collect',
              detail: row.fulfilment
                ? `at ${row.fulfilment.location.name}`
                : 'when staff put it on the shelf',
              at: iso(ready?.readyAt),
            },
            {
              label: 'Collected',
              detail: 'staff scan the pickup pass and tick each item',
              at: iso(row.fulfilment?.collectedAt),
            },
          ],
          payments,
          refunds: requests.map((r) => this.request(r, who.user.id)),
          messages: messages.map((m) => ({
            id: m.id,
            at: m.createdAt.toISOString(),
            channel: 'Email and in-app',
            what: m.reference?.startsWith('staff-refund:')
              ? 'Refund confirmation'
              : m.reference?.startsWith('invoice:')
                ? 'Invoice sent again'
                : 'Purchase confirmation',
            status: m.status,
            sentAt: iso(m.sentAt),
          })),
          notes: notes.map((n) => ({
            id: n.id,
            at: n.createdAt.toISOString(),
            author: n.author.name,
            body: decrypt(n.bodyCiphertext, notePurpose) ?? '',
          })),
          disputes: disputes.map((d) => ({
            conversationId: d.conversationId,
            number: d.conversation.number,
            status: d.conversation.status,
            openedBy: d.openedBy.name,
            at: d.createdAt.toISOString(),
          })),
          activity: activity.map((a) => ({
            id: a.id,
            at: a.createdAt.toISOString(),
            actor: a.actor?.name ?? 'GiddyDeal',
            label: activityLabels[a.action] ?? 'Changed',
          })),
          refundBlocked: marks.refundPending
            ? 'A refund is already waiting for approval.'
            : this.refundProblem(row),
          access: flags,
        });
      },
      { timeout: 15_000 },
    );
  }

  /** Pickup desk: what to hand over, with no money in the answer. */
  async pickupView(who: AuthIdentity, number: string) {
    return this.db.$transaction(async (tx) => {
      await this.access(tx, who, 'pickup.manage');
      const row = await this.find(tx, number);
      const pickup = this.pickup(row);
      if (pickup) delete (pickup as { dailyKobo?: unknown }).dailyKobo;
      return invoicePickupViewSchema.parse({
        number: row.number,
        buyerName: row.user.name,
        collectable:
          row.status === 'paid' &&
          !!row.fulfilment &&
          !row.fulfilment.collectedAt &&
          row.fulfilment.status !== 'cancelled',
        pickup,
        lines: row.lines.map((l) => ({
          id: l.id,
          lotId: l.lotId,
          lotNumber: l.lot.lotNumber,
          title: l.lot.title,
          thumbnailUrl:
            l.lot.images[0]?.thumbnailUrl ?? l.lot.images[0]?.url ?? null,
          binCode: l.lot.bin?.code ?? null,
        })),
      });
    });
  }

  // ------------------------------------------------------------- PDF ----

  private async companyOf(tx: Pick<Tx, 'companyDetails'>) {
    const row = await tx.companyDetails.findUnique({ where: { id: 1 } });
    return companyDetailsSchema.parse({
      name: 'GiddyDeal',
      ...((row?.details ?? {}) as object),
    });
  }
  private async pdfOf(tx: Tx, row: Full) {
    const refunded = kobo(row.refundedKobo);
    const refunds = await tx.staffRefund.findMany({
      where: { invoiceId: row.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, amountKobo: true },
    });
    const rates = await this.feeRates(tx, row);
    const held = row.lines.find((l) => l.storageCase)?.storageCase;
    const f = row.fulfilment;
    const company = await this.companyOf(tx);
    return {
      company,
      data: {
        number: row.number,
        status: row.status,
        stamp:
          row.status === 'refunded'
            ? ('REFUNDED' as const)
            : row.status === 'cancelled'
              ? ('CANCELLED' as const)
              : row.status === 'pending'
                ? ('PROCESSING' as const)
                : refunded > 0
                  ? ('PARTLY REFUNDED' as const)
                  : ('PAID' as const),
        fixedPrice: !!row.purchase,
        issuedAt: row.createdAt,
        paidAt: row.paidAt,
        buyer: {
          name: row.user.name,
          phone: localPhone(decrypt(row.user.phoneCiphertext, 'phone')),
          email: decrypt(row.user.emailCiphertext, 'email'),
        },
        pickup: f
          ? {
              name: f.location.name,
              address: f.location.address,
              dueAt: this.dueAt(row),
              dailyKobo: held && !held.waived ? kobo(held.dailyKobo) : null,
              collectedAt: f.collectedAt,
              open:
                row.status === 'paid' &&
                !f.collectedAt &&
                f.status !== 'cancelled',
            }
          : null,
        ...rates,
        lines: row.lines.map((l) => ({
          title: l.lot.title,
          lotNumber: l.lot.lotNumber,
          hammerKobo: kobo(l.hammerKobo),
          premiumKobo: kobo(l.premiumKobo),
          lotFeeKobo: kobo(l.lotFeeKobo),
          vatKobo: kobo(l.vatKobo),
          totalKobo: kobo(l.totalKobo),
        })),
        hammerKobo: kobo(row.hammerTotalKobo),
        premiumKobo: kobo(row.premiumKobo),
        lotFeeKobo: kobo(row.lotFeeKobo),
        vatKobo: kobo(row.vatKobo),
        totalKobo: kobo(row.totalKobo),
        paidKobo: ['paid', 'refunded'].includes(row.status)
          ? kobo(row.totalKobo)
          : 0,
        refunds: refunds.map((r) => ({
          at: r.createdAt,
          amountKobo: kobo(r.amountKobo),
        })),
      },
    };
  }
  async staffPdf(who: AuthIdentity, number: string) {
    const { data, company } = await this.db.$transaction(async (tx) => {
      await this.access(tx, who);
      const row = await this.find(tx, number);
      await this.auditRow(tx, who.user.id, 'pdf_downloaded', row.id, {});
      return this.pdfOf(tx, row);
    });
    return invoicePdf(data, company);
  }
  async buyerPdf(userId: string, id: string) {
    const { data, company } = await this.db.$transaction(async (tx) => {
      const row = await tx.invoice.findFirst({
        where: { id, userId },
        include: fullInclude,
      });
      if (!row) throw new NotFoundException('Invoice not found.');
      return this.pdfOf(tx, row);
    });
    return {
      number: data.number,
      content: await invoicePdf(data, company),
    };
  }
  async buyerRefunds(userId: string, id: string) {
    const row = await this.db.invoice.findFirst({
      where: { id, userId },
      select: {
        refundedKobo: true,
        staffRefunds: {
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, amountKobo: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Invoice not found.');
    return buyerInvoiceRefundsSchema.parse({
      refundedKobo: kobo(row.refundedKobo),
      refunds: row.staffRefunds.map((r) => ({
        at: r.createdAt.toISOString(),
        amountKobo: kobo(r.amountKobo),
      })),
    });
  }

  /** One receipt for everything a buyer paid for between two dates. */
  private async receipt(tx: Tx, userId: string, input: unknown) {
    const q = parseInput(receiptQuerySchema, input);
    const rows = await tx.invoice.findMany({
      where: {
        userId,
        status: { in: ['paid', 'refunded'] },
        paidAt: { gte: watStart(q.from), lt: nextDay(q.to) },
      },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      take: RECEIPT_MAX_INVOICES + 1,
      include: {
        lines: { select: { lot: { select: { title: true } } } },
        user: { select: { name: true, emailCiphertext: true } },
      },
    });
    const first = rows[0];
    if (!first)
      throw fieldError('from', 'Nothing was bought between these dates.', 404);
    if (rows.length > RECEIPT_MAX_INVOICES)
      throw fieldError(
        'from',
        `A receipt holds ${RECEIPT_MAX_INVOICES} purchases. Choose a shorter time.`,
        400,
      );
    return {
      company: await this.companyOf(tx),
      data: {
        buyer: {
          name: first.user.name,
          email: decrypt(first.user.emailCiphertext, 'email'),
        },
        from: watStart(q.from),
        to: watStart(q.to),
        invoices: rows.map((r) => ({
          number: r.number,
          paidAt: r.paidAt ?? r.createdAt,
          items: r.lines.map((l) => l.lot.title).join(', '),
          hammerKobo: kobo(r.hammerTotalKobo),
          feesKobo: kobo(r.premiumKobo + r.lotFeeKobo + r.vatKobo),
          totalKobo: kobo(r.totalKobo),
          refundedKobo: kobo(r.refundedKobo),
        })),
      },
    };
  }
  async buyerReceipt(userId: string, input: unknown) {
    const { data, company } = await this.db.$transaction((tx) =>
      this.receipt(tx, userId, input),
    );
    return receiptPdf(data, company);
  }
  async staffReceipt(who: AuthIdentity, number: string, input: unknown) {
    const { data, company } = await this.db.$transaction(async (tx) => {
      await this.access(tx, who);
      const { userId } = await this.find(tx, number);
      return this.receipt(tx, userId, input);
    });
    return receiptPdf(data, company);
  }

  // --------------------------------------------------------- changes ----

  private async auditRow(
    tx: Tx,
    actorId: string,
    action: string,
    entityId: string,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        actorId,
        action: `invoices.${action}`,
        entityType: 'invoice',
        entityId,
        afterCiphertext: encryptPii(JSON.stringify(after), 'audit'),
      },
    });
  }
  private act<T extends { idempotencyKey: string }>(
    who: AuthIdentity,
    input: T,
    action: string,
    permission: StaffPermission,
    work: Parameters<InvoiceService['change']>[4],
  ) {
    return this.change(who, input, 'invoice', action, work, {
      permission,
      auditAction: `invoices.${action}`,
    });
  }
  private async locked(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.invoice.findUnique({
      where: { id },
      include: fullInclude,
    });
    if (!row) throw new NotFoundException('Invoice not found.');
    return row;
  }

  async addNote(who: AuthIdentity, input: unknown) {
    const v = parseInput(invoiceNoteSchema, input);
    return this.act(who, v, 'note_added', 'invoices.manage', async (tx) => {
      const row = await this.locked(tx, v.invoiceId);
      await tx.invoiceNote.create({
        data: {
          id: v.idempotencyKey,
          invoiceId: row.id,
          authorId: who.user.id,
          bodyCiphertext: encryptPii(v.body, notePurpose),
        },
      });
      return {
        result: { id: row.id, message: 'Note added.' },
        before: null,
        after: {},
      };
    });
  }

  async resend(who: AuthIdentity, input: unknown) {
    const v = parseInput(invoiceResendSchema, input);
    return this.act(who, v, 'resent', 'invoices.manage', async (tx) => {
      const row = await this.locked(tx, v.invoiceId);
      const recent = await tx.notification.count({
        where: {
          userId: row.userId,
          reference: { startsWith: `invoice:${row.id}:` },
          createdAt: { gt: new Date(Date.now() - 3_600_000) },
        },
      });
      if (recent >= INVOICE_RESENDS_PER_HOUR)
        throw new HttpException(
          {
            code: 'FIELD_ERROR',
            field: 'form',
            message: 'Sent 3 times in the last hour. Try again later.',
          },
          429,
        );
      if (!row.user.emailCiphertext)
        throw blocked('This buyer has no email address.');
      await tx.notification.create({
        data: {
          userId: row.userId,
          channel: 'email',
          template: 'invoice-v1',
          reference: `invoice:${row.id}:${v.idempotencyKey}`,
          payloadCiphertext: encryptPii(
            JSON.stringify({
              emailCiphertext: Buffer.from(row.user.emailCiphertext).toString(
                'base64',
              ),
              message: {
                reference: row.number,
                amountKobo: kobo(row.totalKobo),
                walletUrl: `${webOrigin()}/invoices/${row.id}`,
              },
            }),
            'notification',
          ),
        },
      });
      return {
        result: { id: row.id, message: `${row.number} sent to the buyer.` },
        before: null,
        after: {},
      };
    });
  }

  /** A support conversation with the buyer, linked to the invoice. */
  async dispute(who: AuthIdentity, input: unknown) {
    const v = parseInput(invoiceDisputeSchema, input);
    const row = await this.db.$transaction(async (tx) => {
      await this.access(tx, who);
      await this.access(tx, who, 'support.manage');
      const invoice = await tx.invoice.findUnique({
        where: { id: v.invoiceId },
        include: { user: { select: { emailCiphertext: true } }, lines: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found.');
      const open = await tx.invoiceDispute.findFirst({
        where: {
          invoiceId: invoice.id,
          conversation: { status: { not: 'resolved' } },
        },
        include: { conversation: { select: { createKey: true } } },
      });
      if (open && open.conversation.createKey !== v.idempotencyKey)
        throw blocked('This invoice already has an open dispute.');
      return invoice;
    });
    const email = decrypt(row.user.emailCiphertext, 'email');
    if (!email) throw blocked('This buyer has no email address.');
    // Replaying the same key returns the same conversation.
    const conversation = await this.support.create(who, {
      buyerEmail: email,
      subject: `Dispute about ${row.number}`,
      topic: 'condition',
      text: v.message,
      reference: row.number,
      human: true,
      idempotencyKey: v.idempotencyKey,
    });
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${row.id}::uuid FOR UPDATE`;
      const created = await tx.invoiceDispute.createMany({
        data: [
          {
            conversationId: conversation.id,
            invoiceId: row.id,
            openedById: who.user.id,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count)
        await this.auditRow(tx, who.user.id, 'dispute_opened', row.id, {
          conversation: conversation.number,
        });
    });
    return {
      id: row.id,
      message: `Dispute ${conversation.number} opened. The buyer has been told.`,
    };
  }

  // --------------------------------------------------------- refunds ----
  // One person asks, another decides. Money moves only on approval, through
  // the ledger, back to the buyer's wallet.

  async requestRefund(who: AuthIdentity, input: unknown) {
    const v = parseInput(refundRequestSchema, input);
    return this.act(
      who,
      v,
      'refund_requested',
      'refunds.request',
      async (tx) => {
        const row = await this.locked(tx, v.invoiceId);
        const problem = this.refundProblem(row);
        if (problem) throw blocked(problem);
        if (
          await tx.refundRequest.count({
            where: { invoiceId: row.id, status: 'requested' },
          })
        )
          throw blocked('A refund is already waiting for approval.');
        let total = 0;
        for (const part of v.lines) {
          const line = row.lines.find((l) => l.id === part.lineId);
          if (!line) throw fieldError('lines', 'Reload the invoice.', 400);
          const left = kobo(line.totalKobo - line.refundedKobo);
          if (part.amountKobo > left)
            throw fieldError(
              'lines',
              `${line.lot.lotNumber} has only ₦${(left / 100).toLocaleString('en-NG')} left to refund.`,
              400,
            );
          total += part.amountKobo;
        }
        await tx.refundRequest.create({
          data: {
            id: v.idempotencyKey,
            invoiceId: row.id,
            requestedById: who.user.id,
            reason: v.reason,
            noteCiphertext: encryptPii(v.note, notePurpose),
            amountKobo: BigInt(total),
            lines: {
              create: v.lines.map((l) => ({
                lineId: l.lineId,
                amountKobo: BigInt(l.amountKobo),
              })),
            },
          },
        });
        return {
          result: {
            id: row.id,
            message: 'Refund requested. Someone else must approve it.',
          },
          before: null,
          after: { reason: refundReasonLabels[v.reason], amountKobo: total },
        };
      },
    );
  }

  async decideRefund(who: AuthIdentity, input: unknown) {
    const v = parseInput(refundDecisionSchema, input);
    return this.act(
      who,
      v,
      v.approve ? 'refund_approved' : 'refund_rejected',
      'refunds.manage',
      async (tx) => {
        const found = await tx.refundRequest.findUnique({
          where: { id: v.requestId },
          select: { invoiceId: true },
        });
        if (!found) throw new NotFoundException('Refund request not found.');
        // Invoice first, as collection and other refunds lock it.
        const row = await this.locked(tx, found.invoiceId);
        await tx.$queryRaw`SELECT id FROM refund_requests WHERE id = ${v.requestId}::uuid FOR UPDATE`;
        const request = await tx.refundRequest.findUniqueOrThrow({
          where: { id: v.requestId },
          include: { lines: true },
        });
        if (request.status !== 'requested')
          throw blocked('This refund was already decided.');
        if (request.requestedById === who.user.id)
          throw new ForbiddenException(
            'You asked for this refund, so someone else must decide it.',
          );
        if (v.approve) {
          const problem = this.refundProblem(row);
          if (problem) throw blocked(problem);
          await this.pay(tx, who, row, request);
        }
        await tx.refundRequest.update({
          where: { id: request.id },
          data: {
            status: v.approve ? 'approved' : 'rejected',
            decidedById: who.user.id,
            decidedAt: new Date(),
            decisionCiphertext: encryptPii(v.note, notePurpose),
          },
        });
        return {
          result: {
            id: row.id,
            message: v.approve
              ? 'Refund approved. The money is in the buyer’s wallet.'
              : 'Refund rejected.',
          },
          before: { status: 'requested' },
          after: {
            requestId: request.id,
            amountKobo: request.amountKobo.toString(),
            approved: v.approve,
          },
        };
      },
    );
  }

  private async pay(
    tx: Tx,
    who: AuthIdentity,
    row: Full,
    request: Prisma.RefundRequestGetPayload<{ include: { lines: true } }>,
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId: row.userId },
    });
    await this.ledger.lockedBalances(tx, wallet.id);
    const charges = await this.charges(tx, row);
    if (
      charges.some((c) => c.walletId !== wallet.id) ||
      charges.reduce((s, c) => s + (c.amountKobo ?? 0n), 0n) !== row.totalKobo
    )
      throw blocked('The original charge doesn’t match this invoice.');
    let fees = 0;
    let total = 0n;
    for (const part of request.lines) {
      const line = row.lines.find((l) => l.id === part.lineId);
      if (!line) throw blocked('Reload the invoice and try again.');
      const amount = kobo(part.amountKobo);
      let split;
      try {
        split = splitRefund(
          {
            hammerKobo: kobo(line.hammerKobo),
            premiumKobo: kobo(line.premiumKobo),
            lotFeeKobo: kobo(line.lotFeeKobo),
            vatKobo: kobo(line.vatKobo),
            totalKobo: kobo(line.totalKobo),
          },
          kobo(line.refundedKobo),
          amount,
        );
      } catch {
        throw blocked('A refund can’t be more than what was paid.');
      }
      // The charges that paid for this line (the whole invoice for Buy now).
      const mine = charges.filter(
        (c) =>
          row.purchase ||
          c.reference === 'settlement:debit:' + line.lotId ||
          c.reference.startsWith('settlement:' + line.lotId + ':'),
      );
      const parts = allocateRefund(
        mine.map((c) => ({
          id: c.id,
          leftKobo: kobo(
            (c.amountKobo ?? 0n) -
              c.refunds.reduce((s, r) => s + (r.amountKobo ?? 0n), 0n),
          ),
        })),
        amount,
      );
      for (const p of parts)
        await this.ledger.refundInTransaction(tx, {
          walletId: wallet.id,
          sourceTransactionId: p.id,
          amountKobo: BigInt(p.amountKobo),
          idempotencyKey: `staff-refund:${request.id}:${p.id}`,
          reference: `staff-refund:${request.id}`,
        });
      await tx.invoiceLine.update({
        where: { id: line.id },
        data: {
          refundedKobo: { increment: part.amountKobo },
          refundedHammerKobo: { increment: BigInt(split.hammerKobo) },
          refundedPremiumKobo: { increment: BigInt(split.premiumKobo) },
        },
      });
      fees += split.premiumKobo + split.lotFeeKobo;
      total += part.amountKobo;
    }
    const full = row.refundedKobo + total === row.totalKobo;
    await tx.staffRefund.create({
      data: {
        invoiceId: row.id,
        actorId: who.user.id,
        amountKobo: total,
        feeKobo: BigInt(fees),
        requestId: request.id,
        reasonCiphertext: encryptPii(
          JSON.stringify({ reason: request.reason }),
          'staff-result',
        ),
      },
    });
    await tx.invoice.update({
      where: { id: row.id },
      data: {
        refundedKobo: { increment: total },
        ...(full ? { status: 'refunded' } : {}),
      },
    });
    // A full refund cancels the pickup; after a part refund the buyer keeps
    // the item and still collects it.
    if (full && row.fulfilment)
      await tx.fulfilment.update({
        where: { id: row.fulfilment.id },
        data: {
          status: 'cancelled',
          qrTokenHash: null,
          qrTokenCiphertext: null,
        },
      });
    await tx.notification.create({
      data: {
        userId: row.userId,
        channel: 'email',
        template: 'staff-refund-v1',
        reference: `staff-refund:${row.id}:${request.id}`,
        payloadCiphertext: encryptPii(
          JSON.stringify({
            emailCiphertext: row.user.emailCiphertext
              ? Buffer.from(row.user.emailCiphertext).toString('base64')
              : null,
            message: {
              reference: row.number,
              amountKobo: kobo(total),
              walletUrl: `${webOrigin()}/wallet`,
            },
          }),
          'notification',
        ),
      },
    });
  }

  // --------------------------------------------------------- company ----

  async company(who: AuthIdentity) {
    return this.db.$transaction(async (tx) => {
      await this.access(tx, who, 'company.manage');
      const row = await tx.companyDetails.findUniqueOrThrow({
        where: { id: 1 },
      });
      return companyViewSchema.parse({
        details: await this.companyOf(tx),
        revision: row.revision,
        updatedAt: row.updatedAt.toISOString(),
      });
    });
  }
  async saveCompany(who: AuthIdentity, input: unknown) {
    const v = parseInput(companySaveSchema, input);
    return this.change(
      who,
      v,
      'company',
      'updated',
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM company_details WHERE id = 1 FOR UPDATE`;
        const before = await tx.companyDetails.findUniqueOrThrow({
          where: { id: 1 },
        });
        if (before.revision !== v.expectedRevision)
          throw blocked('Someone else changed these details. Reload them.');
        const after = await tx.companyDetails.update({
          where: { id: 1 },
          data: {
            details: v.details,
            revision: { increment: 1 },
            updatedAt: new Date(),
          },
        });
        return {
          result: { id: v.idempotencyKey, message: 'Company details saved.' },
          before,
          after,
        };
      },
      { permission: 'company.manage', auditAction: 'company.updated' },
    );
  }

  /** Nightly: invoices whose totals or refunds don't add up. */
  async mismatches() {
    const rows = await this.db.$queryRaw<{ number: string }[]>`
      SELECT i.number FROM invoices i
      LEFT JOIN LATERAL (
        SELECT sum(l.hammer_kobo) AS hammer, sum(l.premium_kobo) AS premium,
          sum(l.lot_fee_kobo) AS fee, sum(l.vat_kobo) AS vat,
          sum(l.total_kobo) AS total, sum(l.refunded_kobo) AS refunded
        FROM invoice_lines l WHERE l.invoice_id = i.id) s ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(r.amount_kobo), 0) AS refunds FROM staff_refunds r WHERE r.invoice_id = i.id) r ON true
      WHERE (i.hammer_total_kobo, i.premium_kobo, i.lot_fee_kobo, i.vat_kobo, i.total_kobo)
          IS DISTINCT FROM (s.hammer, s.premium, s.fee, s.vat, s.total)
        OR i.refunded_kobo IS DISTINCT FROM s.refunded
        OR i.refunded_kobo <> r.refunds
        OR (i.status = 'refunded' AND i.refunded_kobo <> i.total_kobo)
      ORDER BY i.number LIMIT 100`;
    return { mismatches: rows.map((r) => r.number) };
  }
}
