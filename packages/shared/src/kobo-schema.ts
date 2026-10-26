import * as z from 'zod';
export const koboSchema = z
  .number()
  .refine(
    (value) => Number.isSafeInteger(value) && value >= 0,
    'Expected non-negative safe integer kobo.',
  );
