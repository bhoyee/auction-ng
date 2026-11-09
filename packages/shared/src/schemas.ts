import { z } from 'zod';
import { prepareBidSchema } from './bid-schemas';
export { koboSchema } from './kobo-schema';
import { userSchema } from './user-schema';
export { userSchema } from './user-schema';
import { walletSchema } from './wallet-schema';
export { walletSchema } from './wallet-schema';
import { lotSchema } from './lot-schema';
export { lotSchema } from './lot-schema';
const id = z.uuid();

export const bidSchema = prepareBidSchema.extend({ lotId: id });
export type LotDto = z.infer<typeof lotSchema>;
export type BidDto = z.infer<typeof bidSchema>;
export type UserDto = z.infer<typeof userSchema>;
export type WalletDto = z.infer<typeof walletSchema>;
