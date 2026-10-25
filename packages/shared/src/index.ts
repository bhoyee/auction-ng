import { z } from 'zod';
export { databaseValues } from './database-values';
export * from './money';
export * from './auction-rules';
export * from './fees';
export * from './proxy';
export * from './schemas';
export * from './auth-schemas';
export * from './wallet-schemas';
export * from './payment-schemas';
export * from './catalogue-schemas';

export const healthSchema = z.object({ status: z.literal('ok') }).strict();
export type HealthResponse = z.infer<typeof healthSchema>;
