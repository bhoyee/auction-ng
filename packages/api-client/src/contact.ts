import {
  contactMessageInputSchema,
  contactMessageResultSchema,
  type ContactMessageInput,
} from '@auction-ng/shared/contact-schemas';
import { ApiError } from './auth';

export function createContactClient(baseUrl: string) {
  return {
    // Retry with the same requestKey after a network error: the server
    // returns the original reference instead of sending a second message.
    async send(input: ContactMessageInput) {
      const body = contactMessageInputSchema.parse(input);
      const response = await fetch(new URL('/contact', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      });
      if (!response.ok) throw new ApiError(response.status);
      return contactMessageResultSchema.parse(await response.json());
    },
  };
}
