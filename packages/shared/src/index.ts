import { z } from 'zod';
export { databaseValues } from './database-values';
export * from './money';
export * from './auction-rules';
export * from './fees';
export * from './prebid-schemas';
export * from './auction-fee-schemas';
export * from './proxy';
export * from './schemas';
export * from './auth-schemas';
export * from './wallet-schemas';
export * from './payment-schemas';
export * from './catalogue-schemas';
export * from './merchandising';
export * from './staff-auth-schemas';
export { webRefreshSchema } from './auth-session-schemas';
export * from './search-schemas';
export * from './bid-schemas';
export * from './bid-persistence';
export * from './realtime';

export const healthSchema = z.object({ status: z.literal('ok') }).strict();
export type HealthResponse = z.infer<typeof healthSchema>;
export * from './closing';
export * from './references';
export * from './buyer-schemas';
export * from './buyer-eligibility';
export * from './purchase-schemas';
export * from './collection-policy';
export * from './deal-filters';
export * from './withdrawal-schemas';
export * from './wallet-controls-schemas';

export * from './pickup-arrival-schemas';

export * from './pickup-visit-schemas';
export * from './two-factor-schemas';
export * from './support-schemas';
export * from './bid-cancellation-schemas';

export * from './native-push-schemas';

export * from './staff-permissions';
export * from './staff-admin-schemas';
export * from './staff-csv';
