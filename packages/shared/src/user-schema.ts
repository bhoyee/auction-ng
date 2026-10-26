import { z } from 'zod';
import { databaseValues } from './database-values';
const id = z.uuid();
export const userSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(120),
    role: z.enum(databaseValues.roles),
    status: z.enum(databaseValues.userStatuses),
    phoneVerified: z.boolean(),
  })
  .strict();
