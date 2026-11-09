import * as z from 'zod';
import { userRoles, userStatuses } from './user-values';
const id = z.uuid();
export const userSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    role: z.enum(userRoles),
    status: z.enum(userStatuses),
    phoneVerified: z.boolean(),
  })
  .strict();
