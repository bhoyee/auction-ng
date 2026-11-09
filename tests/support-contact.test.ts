import { afterEach, expect, it, vi } from 'vitest';
import { publicSocialLinks, whatsappContact } from '../apps/web/lib/support';

afterEach(() => vi.unstubAllEnvs());

it('uses configured HTTPS social links and rejects unsafe or missing destinations', () => {
  vi.stubEnv('SOCIAL_X_URL', 'https://x.com/example');
  vi.stubEnv('SOCIAL_FACEBOOK_URL', 'javascript:alert(1)');
  vi.stubEnv('SOCIAL_INSTAGRAM_URL', 'https://user:password@example.com');
  vi.stubEnv('SOCIAL_TIKTOK_URL', '');
  expect(publicSocialLinks()).toEqual({ x: 'https://x.com/example' });
});

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
