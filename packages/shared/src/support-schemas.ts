import { z } from 'zod';
import { koboSchema } from './kobo-schema';
export const LIVE_BID_COMMITMENT_NOTICE =
  'Accepted bids cannot be cancelled. Reserved funds are released when you’re outbid.';
export const bidCancellationRequestSchema = z
  .object({
    reason: z.string().trim().min(10).max(1000),
    acknowledged: z.literal(true),
    feeAcknowledged: z.literal(true),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type BidCancellationRequestInput = z.input<
  typeof bidCancellationRequestSchema
>;
// Deliberately narrow intent matching, not generative interpretation of messages.
export function requestsSupportHuman(text: string): boolean {
  const value = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    /\b(?:dont|do not|no need to)\s+(?:(?:want|need)\s+(?:to\s+)?)?(?:(?:talk|speak|chat|connect|transfer)\s+(?:me\s+)?(?:(?:to|with)\s+)?)?(?:(?:a|an|real|live|the)\s+)*(?:human|person|agent|someone|customer care|support team)\b/.test(
      value,
    )
  )
    return false;
  return (
    /\b(?:talk|speak|chat|connect|transfer|handoff|hand off|need|want)\b.{0,35}\b(?:human|person|agent|someone|customer care|support team)\b/.test(
      value,
    ) ||
    /^(?:a |an |real |live )?(?:human|agent|person)(?: please)?$/.test(value)
  );
}
export const supportRules = {
  dailyBuyerConversations: 5,
  dailyStaffConversations: 50,
  readPerMinute: 180,
  writePerMinute: 30,
  readIpPerMinute: 600,
  writeIpPerMinute: 90,
  deliveryQueue: 'auction-ng-support-delivery',
  deliveryPollMs: 5000,
  imageOffloadBatch: 2,
  pageSize: 10,
  maxPageSize: 50,
  maxText: 4000,
  maxImages: 2,
  maxImageBytes: 300000,
  maxStoredImageBytes: 220000,
  maxConversationImages: 20,
  maxMessages: 1000,
  presenceMs: 60000,
} as const;
export const supportTopics = [
  'bidding',
  'payments',
  'wallet',
  'withdrawals',
  'pickup',
  'condition',
  'account',
  'other',
] as const;
export const supportFaqs = [
  {
    id: 'bidding',
    title: 'How do I bid?',
    answer:
      'Verify your email and fund your wallet before bidding. Direct bidding is the default; automatic bidding is an optional private spending limit. Review the total cost before confirming. Late accepted bids can extend an auction. You can follow your position in Bid history.',
  },
  {
    id: 'payments',
    title: 'A payment is pending',
    answer:
      'Open Wallet to check the payment status. A successful payment must be verified before your wallet is credited. Avoid paying again while the first payment is being checked. If it remains unresolved, ask our team and include the payment reference. Never send card details or verification codes.',
  },
  {
    id: 'wallet',
    title: 'Understand my wallet',
    answer:
      'Available funds can be used for new bids and eligible withdrawals. Reserved funds cover existing bid commitments or withdrawals and cannot be spent twice. Your wallet activity shows the recorded credits, reservations and payments.',
  },
  {
    id: 'withdrawals',
    title: 'Help with a withdrawal',
    answer:
      'Withdrawals use your verified own-name bank account. Review the fee and total deduction before confirming. Bank-funded money may qualify for automatic processing; card-funded or unclassified money requires review. Processing is not a promise of instant arrival. Open Wallet for the latest recorded status.',
  },
  {
    id: 'pickup',
    title: 'Collect my purchase',
    answer:
      'Open Awaiting pickup to see paid orders and their collection location. At the collection centre, open Check-in to show your private collection pass to staff. Inspect and test your item before leaving. Do not share your pickup pass in this chat.',
  },
  {
    id: 'condition',
    title: 'Understand item condition',
    answer:
      'Read the condition grade, notes and actual item photos before bidding or buying. Grades describe the listing; they do not replace checking the item. Inspect and test the item at the collection centre before taking it away. Auction NG does not offer change-of-mind returns after collection.',
  },
  {
    id: 'account',
    title: 'Keep my account secure',
    answer:
      'Use a unique password and enable an authenticator from Profile. Never share passwords, email codes, authenticator codes, recovery codes, BVN or full card details with support. If you suspect unauthorised access, ask our team immediately.',
  },
] as const;
export const supportStatusSchema = z.enum(['open', 'in_progress', 'resolved']);
export const supportTopicSchema = z.enum(supportTopics);
export const supportFaqIdSchema = z.enum([
  'bidding',
  'payments',
  'wallet',
  'withdrawals',
  'pickup',
  'condition',
  'account',
]);
export const supportCreateSchema = z
  .object({
    subject: z.string().trim().min(3).max(120),
    topic: supportTopicSchema,
    text: z.string().trim().min(1).max(supportRules.maxText),
    reference: z.string().trim().max(80).default(''),
    human: z.boolean().default(false),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const supportStaffCreateSchema = supportCreateSchema
  .extend({ buyerEmail: z.email().trim().toLowerCase() })
  .strict();
export const supportImageInputSchema = z
  .object({
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z
      .string()
      .max(400000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export const supportMessageInputSchema = z
  .object({
    text: z.string().trim().max(supportRules.maxText),
    images: z
      .array(supportImageInputSchema)
      .max(supportRules.maxImages)
      .default([]),
    internal: z.boolean().default(false),
    faqId: supportFaqIdSchema.optional(),
    idempotencyKey: z.uuid(),
  })
  .strict()
  .refine(
    (v) => v.text.length > 0 || v.images.length > 0 || !!v.faqId,
    'Enter a message or add an image.',
  );
export const supportActionSchema = z
  .object({
    action: z.enum(['handoff', 'claim', 'release', 'resolve', 'reopen']),
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const supportListInputSchema = z
  .object({
    status: z.enum(['all', 'open', 'in_progress', 'resolved']).default('all'),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export const supportMessagesInputSchema = supportListInputSchema
  .omit({ status: true })
  .strict();
export const supportAttachmentSchema = z
  .object({
    id: z.uuid(),
    mime: z.literal('image/webp'),
    bytes: z.number().int().positive(),
  })
  .strict();
export const supportMessageSchema = z
  .object({
    id: z.uuid(),
    author: z.enum(['buyer', 'staff', 'assistant', 'system']),
    authorName: z.string(),
    text: z.string(),
    internal: z.boolean(),
    createdAt: z.iso.datetime(),
    attachments: z.array(supportAttachmentSchema),
  })
  .strict();
export const supportConversationSchema = z
  .object({
    id: z.uuid(),
    number: z.string(),
    subject: z.string(),
    topic: supportTopicSchema,
    reference: z.string(),
    status: supportStatusSchema,
    mode: z.enum(['assistant', 'human']),
    version: z.number().int(),
    buyerName: z.string(),
    assigneeName: z.string().nullable(),
    assignedToMe: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const supportPageSchema = z
  .object({
    items: z.array(supportConversationSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const bidCancellationStateSchema = z
  .object({
    commitment: z
      .object({
        maxKobo: koboSchema,
        automatic: z.boolean(),
        createdAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    canRequest: z.boolean(),
    blocked: z.boolean().default(false),
    feeBps: z.number().int().min(0).max(10000).default(0),
    feeConsent: z.boolean().default(false),
    conversation: supportConversationSchema.nullable(),
  })
  .strict();
export const supportMessagePageSchema = z
  .object({
    items: z.array(supportMessageSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const supportAvailabilitySchema = z
  .object({
    available: z.boolean(),
    attachmentsEnabled: z.boolean().default(false),
  })
  .strict();
export const supportDeliveryReportSchema = z
  .object({ ok: z.literal(true) })
  .strict();
export const supportPresenceSchema = z
  .object({ accepting: z.boolean() })
  .strict();
export const supportSignalSchema = z
  .object({ conversationId: z.uuid() })
  .strict();
export const supportBridgeSchema = supportSignalSchema
  .extend({ buyerId: z.uuid(), staffOnly: z.boolean() })
  .strict();
export type SupportConversation = z.infer<typeof supportConversationSchema>;
export type SupportMessage = z.infer<typeof supportMessageSchema>;
export type SupportCreate = z.input<typeof supportCreateSchema>;
export type SupportMessageInput = z.input<typeof supportMessageInputSchema>;
export type SupportAction = z.infer<typeof supportActionSchema>;
export type SupportListInput = z.input<typeof supportListInputSchema>;
