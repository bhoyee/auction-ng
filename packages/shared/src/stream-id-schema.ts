import * as z from 'zod';

export const streamIdSchema = z.string().regex(/^\d{1,20}-\d{1,20}$/);
