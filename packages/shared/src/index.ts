import { z } from 'zod';
export { databaseValues } from './database-values';

export const healthSchema = z.object({ status: z.literal('ok') }).strict();
export type HealthResponse = z.infer<typeof healthSchema>;
