import { z } from 'zod';

// Customer references are separate from the UUIDs used for identity and authorisation.
export const lotNumberInputSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,40}$/)
  .refine(
    (value) => !z.uuid().safeParse(value).success,
    'Use a readable lot code or omit it to allocate one automatically.',
  );
