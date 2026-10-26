import { z } from 'zod';
import { databaseValues } from './database-values';
import { koboSchema } from './kobo-schema';
const id = z.uuid();
const timestamp = z.iso.datetime();
// Public DTOs omit encrypted PII, provider payloads and private bid limits.
export const lotSchema = z
  .object({
    id,
    title: z.string().trim().min(1).max(200),
    categoryId: id,
    locationId: id,
    condition: z.enum(databaseValues.lotConditions),
    status: z.enum(databaseValues.lotStatuses),
    startPriceKobo: koboSchema.refine((value) => value > 0),
    currentPriceKobo: koboSchema.nullable(),
    startsAt: timestamp,
    endsAt: timestamp,
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'End must follow start.',
  )
  .refine(
    (value) =>
      value.currentPriceKobo === null ||
      value.currentPriceKobo >= value.startPriceKobo,
    'Current price must meet start price.',
  );
