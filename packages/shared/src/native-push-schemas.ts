import { z } from 'zod';
export const nativePushRegisterSchema = z
  .object({
    token: z
      .string()
      .regex(/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{16,100}\]$/),
    platform: z.enum(['android', 'ios']),
  })
  .strict();
export const nativePushStatusSchema = z
  .object({ enabled: z.boolean() })
  .strict();
export type NativePushRegister = z.infer<typeof nativePushRegisterSchema>;
