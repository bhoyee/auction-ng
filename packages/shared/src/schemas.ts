import { z } from 'zod';
import { prepareBidSchema } from './bid-schemas';
import { databaseValues } from './database-values';

export const koboSchema = z
  .number()
  .refine(
    (value) => Number.isSafeInteger(value) && value >= 0,
    'Expected non-negative safe integer kobo.',
  );
const id = z.uuid();
const timestamp = z.iso.datetime();

// Public DTOs deliberately omit encrypted PII, provider payloads and proxy maxima.
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
export const bidSchema = prepareBidSchema.extend({ lotId: id });
export const userSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    role: z.enum(databaseValues.roles),
    status: z.enum(databaseValues.userStatuses),
    phoneVerified: z.boolean(),
  })
  .strict();
export const walletSchema = z
  .object({
    id,
    userId: id,
    currency: z.literal('NGN'),
    availableKobo: koboSchema,
    heldKobo: koboSchema,
  })
  .strict();
export type LotDto = z.infer<typeof lotSchema>;
export type BidDto = z.infer<typeof bidSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type WalletDto = z.infer<typeof walletSchema>;
