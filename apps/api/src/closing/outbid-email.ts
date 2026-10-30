import { auctionUpdateEmail, watchLostMailSchema } from './watch-lost-email';
import type { z } from 'zod';
import template from './outbid-email.generated.json';
export function outbidEmail(input: z.input<typeof watchLostMailSchema>) {
  return auctionUpdateEmail(input, template, 'You were outbid');
}
