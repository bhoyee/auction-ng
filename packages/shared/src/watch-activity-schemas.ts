import { z } from 'zod';
import { pageQuerySchema } from './catalogue-schemas';
import { koboSchema } from './kobo-schema';
export const watchActivityViewSchema = z.enum(['watching', 'won', 'lost']);
export const watchActivityQuerySchema = pageQuerySchema.extend({
  view: watchActivityViewSchema.default('watching'),
});
export const watchActivityPageSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string(),
            lotNumber: z.string(),
            thumbnailUrl: z.url().nullable(),
            locationName: z.string(),
            locationAddress: z.string(),
            startPriceKobo: koboSchema,
            retailPriceKobo: koboSchema,
            finalPriceKobo: koboSchema.nullable(),
            endsAt: z.iso.datetime(),
            outcome: z.enum(['watching', 'won', 'lost', 'unsold', 'pending']),
          })
          .strict(),
      )
      .max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type WatchActivityPage = z.infer<typeof watchActivityPageSchema>;
