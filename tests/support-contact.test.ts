import { expect, it } from 'vitest';
import { whatsappContact } from '../apps/web/lib/support';

it('opens only the configured international WhatsApp number without accepting links or scripts', () => {
  expect(whatsappContact(' +2348012345678 ')).toBe(
    'https://wa.me/2348012345678',
  );
  for (const value of [
    undefined,
    '',
    '08012345678',
    'https://example.com',
    'javascript:alert(1)',
    '+2348012345678?text=private',
    '+0000000000',
  ])
    expect(whatsappContact(value)).toBeUndefined();
});
