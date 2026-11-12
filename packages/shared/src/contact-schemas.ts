import { z } from 'zod';

// Public "Contact us" form. Guests and buyers alike; messages go to the
// support inbox by email (reply-to the sender) and are stored encrypted.
export const contactTopics = [
  'account',
  'wallet',
  'bidding',
  'buy-now',
  'pickup',
  'refund',
  'other',
] as const;
export const contactTopicLabels: Record<
  (typeof contactTopics)[number],
  string
> = {
  account: 'Account and sign-in',
  wallet: 'Wallet and payments',
  bidding: 'Bidding',
  'buy-now': 'Buy Now',
  pickup: 'Pickup and collection',
  refund: 'Problem with an item or refund',
  other: 'Something else',
};

export const contactMessageInputSchema = z
  .object({
    requestKey: z.uuid(),
    // No line breaks or control characters: the name is used in a subject line.
    name: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[^\p{Cc}]+$/u),
    email: z.email().max(254),
    topic: z.enum(contactTopics),
    // Digits only: a Nigerian mobile as 0803… (11 digits) or 234803… (13).
    phone: z.string().regex(/^(?:0|234)[789]\d{9}$/),
    message: z.string().trim().min(10).max(3000),
    // Hidden field that people never fill in; bots usually do.
    website: z.string().max(0).optional(),
    turnstileToken: z.string().max(2048).optional(),
  })
  .strict();
export type ContactMessageInput = z.input<typeof contactMessageInputSchema>;

export const contactMessageResultSchema = z
  .object({ reference: z.string().regex(/^CS-\d{6}$/) })
  .strict();
export type ContactMessageResult = z.infer<typeof contactMessageResultSchema>;
