import { z } from 'zod';

export const buyerNotificationPageSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string(),
            href: z.union([
              z
                .string()
                .refine(
                  (value) =>
                    value.startsWith('/customer-service?conversation=') &&
                    z
                      .uuid()
                      .safeParse(
                        value.slice('/customer-service?conversation='.length),
                      ).success,
                ),
              z.enum(['/invoices', '/awaiting-pickup', '/wallet']),
              z
                .string()
                .refine(
                  (value) =>
                    value.startsWith('/lots/') &&
                    z.uuid().safeParse(value.slice(6)).success,
                ),
            ]),
            createdAt: z.iso.datetime(),
            readAt: z.iso.datetime().nullable(),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const buyerNotificationSummarySchema = z
  .object({
    unread: z.number().int().nonnegative().safe(),
    awaitingPickup: z.number().int().nonnegative().safe(),
  })
  .strict();

export const buyerNotificationReadInputSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(50) })
  .strict();

export const buyerNotificationReadResultSchema = z
  .object({ updated: z.number().int().min(0).max(50) })
  .strict();
