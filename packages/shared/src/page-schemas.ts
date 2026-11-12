import { z } from 'zod';

// Cursor pagination shared by every list endpoint (AGENTS.md §7: max 50).
// Kept apart from catalogue-schemas so wallet and withdrawal clients can page
// without bundling the whole catalogue schema set.
export const pageCursorSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,2048}$/)
  .optional();
const limit = z.number().int().min(1).max(50).default(50);
export const pageInputSchema = z
  .object({ limit, cursor: pageCursorSchema })
  .strict();
export type PageInput = z.input<typeof pageInputSchema>;
