import * as z from 'zod';

export const watchInputSchema = z.object({ watching: z.boolean() }).strict();
export const watchStatusInputSchema = z
  .object({ lotIds: z.array(z.uuid()).min(1).max(50) })
  .strict();
export const watchStatusSchema = z
  .object({ lotIds: z.array(z.uuid()).max(50) })
  .strict();
