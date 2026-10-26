import * as z from 'zod';
import { koboSchema } from './kobo-schema';
const id = z.uuid();
export const walletSchema = z
  .object({
    id,
    userId: id,
    currency: z.literal('NGN'),
    availableKobo: koboSchema,
    heldKobo: koboSchema,
  })
  .strict();
