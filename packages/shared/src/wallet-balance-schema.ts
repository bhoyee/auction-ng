import { koboSchema } from './kobo-schema';
import { walletSchema } from './wallet-schema';

export const walletBalanceSchema = walletSchema
  .extend({ totalKobo: koboSchema })
  .strict();
