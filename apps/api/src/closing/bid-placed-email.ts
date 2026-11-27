import { auctionUpdateEmail, watchLostMailSchema } from './watch-lost-email';
import type { z } from 'zod';
import template from './bid-placed-email.generated.json';
export function bidPlacedEmail(input: z.input<typeof watchLostMailSchema>) {
  return auctionUpdateEmail(input, template, 'Your bid is live');
}
