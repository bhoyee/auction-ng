import { z } from 'zod';
import { koboSchema } from './kobo-schema';

// Invoices module (T15f). One invoice per item won, paid from the wallet when
// the auction ends (owner decision 2026-11-24). Partial refunds leave an
// invoice paid with money returned; a full refund before collection cancels
// the pickup.

export const invoicePaymentStates = [
  'paid',
  'refund_pending',
  'partly_refunded',
  'refunded',
  'disputed',
  'cancelled',
  'pending',
] as const;
export type InvoicePaymentState = (typeof invoicePaymentStates)[number];
export const invoicePaymentLabels: Record<InvoicePaymentState, string> = {
  paid: 'Paid',
  refund_pending: 'Refund pending',
  partly_refunded: 'Partly refunded',
  refunded: 'Refunded',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  pending: 'Processing',
};
export const invoicePickupStates = [
  'preparing',
  'ready',
  'overdue',
  'collected',
  'cancelled',
  'none',
] as const;
export type InvoicePickupState = (typeof invoicePickupStates)[number];
export const invoicePickupLabels: Record<InvoicePickupState, string> = {
  preparing: 'Being prepared',
  ready: 'Ready to collect',
  overdue: 'Overdue',
  collected: 'Collected',
  cancelled: 'Cancelled',
  none: '—',
};
export const invoiceTabs = [
  'all',
  'not_collected',
  'refund_pending',
  'refunded',
  'disputed',
] as const;
export type InvoiceTab = (typeof invoiceTabs)[number];
export const refundReasons = [
  'not_as_described',
  'damaged',
  'missing_item',
  'duplicate_charge',
  'goodwill',
  'other',
] as const;
export type RefundReason = (typeof refundReasons)[number];
export const refundReasonLabels: Record<RefundReason, string> = {
  not_as_described: 'Not as described',
  damaged: 'Damaged',
  missing_item: 'Missing item',
  duplicate_charge: 'Duplicate charge',
  goodwill: 'Goodwill',
  other: 'Other',
};
export const INVOICE_PAGE_SIZE = 50;
export const INVOICE_EXPORT_MAX_ROWS = 5_000;
export const INVOICE_RESENDS_PER_HOUR = 3;
export const RECEIPT_MAX_INVOICES = 100;

/** What an invoice shows as: the most important thing first. */
export function invoicePaymentState(input: {
  status: string;
  refundedKobo: number;
  refundPending: boolean;
  disputed: boolean;
}): InvoicePaymentState {
  if (input.status === 'cancelled') return 'cancelled';
  if (input.status === 'refunded') return 'refunded';
  if (input.disputed) return 'disputed';
  if (input.refundPending) return 'refund_pending';
  if (input.status === 'pending') return 'pending';
  return input.refundedKobo > 0 ? 'partly_refunded' : 'paid';
}

export function invoicePickupState(input: {
  fulfilment: string | null;
  collectedAt: Date | null;
  dueAt: Date | null;
  now: Date;
}): InvoicePickupState {
  if (!input.fulfilment) return 'none';
  if (input.collectedAt || input.fulfilment === 'collected') return 'collected';
  if (input.fulfilment === 'cancelled') return 'cancelled';
  if (!input.dueAt) return 'preparing';
  return input.dueAt < input.now ? 'overdue' : 'ready';
}

export type InvoiceLineMoney = {
  hammerKobo: number;
  premiumKobo: number;
  lotFeeKobo: number;
  vatKobo: number;
  totalKobo: number;
};
/**
 * How much of one refund is hammer, premium, lot fee and VAT. Each part is the
 * running share of the line, so several refunds add up exactly to the line.
 */
export function splitRefund(
  line: InvoiceLineMoney,
  alreadyKobo: number,
  amountKobo: number,
) {
  for (const value of [alreadyKobo, amountKobo])
    if (!Number.isSafeInteger(value) || value < 0)
      throw new RangeError('Refund amounts are whole kobo.');
  const after = alreadyKobo + amountKobo;
  if (amountKobo < 1 || after > line.totalKobo)
    throw new RangeError('A refund can’t be more than what was paid.');
  const share = (part: number, upTo: number) =>
    Number((BigInt(part) * BigInt(upTo)) / BigInt(line.totalKobo));
  const part = (value: number) =>
    share(value, after) - share(value, alreadyKobo);
  const premiumKobo = part(line.premiumKobo);
  const lotFeeKobo = part(line.lotFeeKobo);
  const vatKobo = part(line.vatKobo);
  // Hammer takes the odd kobo, so the parts always equal the refund.
  return {
    hammerKobo: amountKobo - premiumKobo - lotFeeKobo - vatKobo,
    premiumKobo,
    lotFeeKobo,
    vatKobo,
  };
}

/** Spread a refund over the wallet charges that paid for a line, in order. */
export function allocateRefund(
  charges: readonly { id: string; leftKobo: number }[],
  amountKobo: number,
) {
  let left = amountKobo;
  const parts: { id: string; amountKobo: number }[] = [];
  for (const charge of charges) {
    const part = Math.min(left, charge.leftKobo);
    if (part > 0) parts.push({ id: charge.id, amountKobo: part });
    left -= part;
  }
  if (left > 0)
    throw new RangeError('The original charge doesn’t cover this refund.');
  return parts;
}

const text = (max: number) => z.string().trim().max(max);
const day = z.iso.date();
const csvUuids = z
  .string()
  .max(2000)
  .transform((v) => v.split(',').filter(Boolean))
  .pipe(z.array(z.uuid()).max(50));
export const invoiceListQuerySchema = z
  .object({
    tab: z.enum(invoiceTabs).default('all'),
    search: text(100).optional(),
    from: day.optional(),
    to: day.optional(),
    payment: z.enum(invoicePaymentStates).optional(),
    locationIds: csvUuids.optional(),
    minKobo: z.coerce.number().int().nonnegative().optional(),
    maxKobo: z.coerce.number().int().nonnegative().optional(),
    cursor: z.string().max(400).optional(),
    limit: z.coerce.number().int().min(1).max(INVOICE_PAGE_SIZE).default(50),
  })
  .strict();
export type InvoiceListFilters = z.output<typeof invoiceListQuerySchema>;

export const invoiceRowSchema = z
  .object({
    id: z.uuid(),
    number: z.string(),
    buyerName: z.string(),
    phone: z.string().nullable(),
    lots: z.number().int(),
    hammerKobo: koboSchema,
    feesKobo: koboSchema,
    totalKobo: koboSchema,
    payment: z.enum(invoicePaymentStates),
    pickup: z.enum(invoicePickupStates),
    locationName: z.string().nullable(),
    issuedAt: z.iso.datetime(),
  })
  .strict();
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;
export const invoiceAccessSchema = z
  .object({
    canManage: z.boolean(),
    canDispute: z.boolean(),
    canRequestRefund: z.boolean(),
    canDecideRefund: z.boolean(),
  })
  .strict();
export const invoiceListPageSchema = z
  .object({
    items: z.array(invoiceRowSchema).max(INVOICE_PAGE_SIZE),
    counts: z
      .object({
        all: z.number().int(),
        not_collected: z.number().int(),
        refund_pending: z.number().int(),
        refunded: z.number().int(),
        disputed: z.number().int(),
      })
      .strict(),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type InvoiceListPage = z.infer<typeof invoiceListPageSchema>;

export const invoiceLineSchema = z
  .object({
    id: z.uuid(),
    lotId: z.uuid(),
    lotNumber: z.string(),
    title: z.string(),
    thumbnailUrl: z.string().nullable(),
    binCode: z.string().nullable(),
    wonAt: z.iso.datetime(),
    hammerKobo: koboSchema,
    premiumKobo: koboSchema,
    lotFeeKobo: koboSchema,
    vatKobo: koboSchema,
    totalKobo: koboSchema,
    refundedKobo: koboSchema,
  })
  .strict();
export type InvoiceLineView = z.infer<typeof invoiceLineSchema>;
export const invoiceRefundSchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z.string(),
    buyerName: z.string(),
    reason: z.enum(refundReasons),
    note: z.string().nullable(),
    amountKobo: koboSchema,
    lines: z.array(
      z
        .object({
          lotNumber: z.string(),
          title: z.string(),
          amountKobo: koboSchema,
        })
        .strict(),
    ),
    status: z.enum(['requested', 'approved', 'rejected']),
    requestedBy: z.string(),
    requestedAt: z.iso.datetime(),
    decidedBy: z.string().nullable(),
    decidedAt: z.iso.datetime().nullable(),
    decisionNote: z.string().nullable(),
    /** This person asked for it, so someone else has to decide. */
    own: z.boolean(),
  })
  .strict();
export type InvoiceRefund = z.infer<typeof invoiceRefundSchema>;
export const invoicePickupSchema = z
  .object({
    state: z.enum(invoicePickupStates),
    locationName: z.string(),
    address: z.string(),
    dueAt: z.iso.datetime().nullable(),
    dailyKobo: koboSchema.nullable(),
    storageWaived: z.boolean(),
    collectedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const invoiceTimelineSchema = z
  .object({
    label: z.string(),
    detail: z.string(),
    at: z.iso.datetime().nullable(),
  })
  .strict();
export const invoiceViewSchema = z
  .object({
    id: z.uuid(),
    number: z.string(),
    saleType: z.enum(['auction', 'fixed_price']),
    payment: z.enum(invoicePaymentStates),
    issuedAt: z.iso.datetime(),
    paidAt: z.iso.datetime().nullable(),
    hammerKobo: koboSchema,
    premiumKobo: koboSchema,
    lotFeeKobo: koboSchema,
    vatKobo: koboSchema,
    totalKobo: koboSchema,
    paidKobo: koboSchema,
    refundedKobo: koboSchema,
    balanceKobo: koboSchema,
    premiumBps: z.number().int().nullable(),
    vatBps: z.number().int().nullable(),
    buyer: z
      .object({
        id: z.uuid(),
        name: z.string(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
        wins: z.number().int(),
        strikes: z.number().int(),
        walletKobo: koboSchema,
      })
      .strict(),
    lines: z.array(invoiceLineSchema).max(200),
    pickup: invoicePickupSchema.nullable(),
    timeline: z.array(invoiceTimelineSchema),
    payments: z.array(
      z
        .object({
          id: z.uuid(),
          at: z.iso.datetime(),
          what: z.string(),
          account: z.string(),
          /** Negative when money left the buyer's wallet. */
          amountKobo: z.number().int(),
          reference: z.string(),
        })
        .strict(),
    ),
    refunds: z.array(invoiceRefundSchema),
    messages: z.array(
      z
        .object({
          id: z.uuid(),
          at: z.iso.datetime(),
          channel: z.string(),
          what: z.string(),
          status: z.enum(['pending', 'sent', 'failed']),
          sentAt: z.iso.datetime().nullable(),
        })
        .strict(),
    ),
    notes: z.array(
      z
        .object({
          id: z.uuid(),
          at: z.iso.datetime(),
          author: z.string(),
          body: z.string(),
        })
        .strict(),
    ),
    disputes: z.array(
      z
        .object({
          conversationId: z.uuid(),
          number: z.string(),
          status: z.string(),
          openedBy: z.string(),
          at: z.iso.datetime(),
        })
        .strict(),
    ),
    activity: z.array(
      z
        .object({
          id: z.uuid(),
          at: z.iso.datetime(),
          actor: z.string(),
          label: z.string(),
        })
        .strict(),
    ),
    /** Why a refund can't be requested now; null when it can. */
    refundBlocked: z.string().nullable(),
    access: invoiceAccessSchema,
  })
  .strict();
export type InvoiceView = z.infer<typeof invoiceViewSchema>;

/** For the pickup desk: no money at all. */
export const invoicePickupViewSchema = z
  .object({
    number: z.string(),
    buyerName: z.string(),
    collectable: z.boolean(),
    pickup: invoicePickupSchema.omit({ dailyKobo: true }).nullable(),
    lines: z.array(
      invoiceLineSchema.pick({
        id: true,
        lotId: true,
        lotNumber: true,
        title: true,
        thumbnailUrl: true,
        binCode: true,
      }),
    ),
  })
  .strict();

const key = { idempotencyKey: z.uuid() };
export const refundRequestSchema = z
  .object({
    ...key,
    invoiceId: z.uuid(),
    reason: z.enum(refundReasons, 'Choose a reason.'),
    note: text(500).min(3, 'Add a short note.'),
    lines: z
      .array(
        z
          .object({
            lineId: z.uuid(),
            amountKobo: koboSchema.refine((v) => v > 0, 'Enter an amount.'),
          })
          .strict(),
      )
      .min(1, 'Choose what to refund.')
      .max(50)
      .refine(
        (v) => new Set(v.map((l) => l.lineId)).size === v.length,
        'Each item can be listed once.',
      ),
  })
  .strict();
export type RefundRequestInput = z.input<typeof refundRequestSchema>;
export const refundDecisionSchema = z
  .object({
    ...key,
    requestId: z.uuid(),
    approve: z.boolean(),
    note: text(500).min(3, 'Add a short note.'),
  })
  .strict();
export const invoiceNoteSchema = z
  .object({
    ...key,
    invoiceId: z.uuid(),
    body: text(1000).min(1, 'Write a note.'),
  })
  .strict();
export const invoiceResendSchema = z
  .object({ ...key, invoiceId: z.uuid() })
  .strict();
export const invoiceDisputeSchema = z
  .object({
    ...key,
    invoiceId: z.uuid(),
    message: text(1000).min(10, 'Say what is wrong, in a sentence or two.'),
  })
  .strict();
export const refundQueueSchema = z
  .object({
    items: z.array(invoiceRefundSchema).max(INVOICE_PAGE_SIZE),
    waiting: z.number().int(),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const invoiceResultSchema = z
  .object({ id: z.uuid(), message: z.string() })
  .strict();
export const invoiceExportSchema = z
  .object({ filename: z.string(), csv: z.string(), rows: z.number().int() })
  .strict();

export const companyFields = [
  'name',
  'parent',
  'rcNumber',
  'tin',
  'address',
  'email',
  'phone',
  'website',
  'terms',
] as const;
export const companyLabels: Record<(typeof companyFields)[number], string> = {
  name: 'Company name',
  parent: 'Second line (for example, parent company)',
  rcNumber: 'RC number',
  tin: 'TIN',
  address: 'Address',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  terms: 'Terms at the bottom of invoices',
};
export const companyDetailsSchema = z
  .object({
    name: text(120).min(2, 'Enter the company name.'),
    parent: text(160).default(''),
    rcNumber: text(40).default(''),
    tin: text(40).default(''),
    address: text(240).default(''),
    email: z.union([z.literal(''), z.email('Check the email.')]).default(''),
    phone: text(40).default(''),
    website: text(120).default(''),
    terms: text(600).default(''),
  })
  .strict();
export type CompanyDetails = z.infer<typeof companyDetailsSchema>;
export const companyViewSchema = z
  .object({
    details: companyDetailsSchema,
    revision: z.number().int(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const companySaveSchema = z
  .object({
    ...key,
    details: companyDetailsSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export const DEFAULT_INVOICE_TERMS =
  'Items are sold as described on the lot page, in the condition shown. VAT is charged on our fees, not on the hammer price.';

/** Buyers: money returned on one invoice. */
export const buyerInvoiceRefundsSchema = z
  .object({
    refundedKobo: koboSchema,
    refunds: z.array(
      z.object({ at: z.iso.datetime(), amountKobo: koboSchema }).strict(),
    ),
  })
  .strict();
export const receiptQuerySchema = z
  .object({ from: day, to: day })
  .strict()
  .refine((v) => v.from <= v.to, 'The dates are the wrong way round.')
  .refine(
    (v) => Date.parse(v.to) - Date.parse(v.from) <= 92 * 86_400_000,
    'Choose up to three months.',
  );
export const invoiceCheckSchema = z
  .object({ mismatches: z.array(z.string()) })
  .strict();
