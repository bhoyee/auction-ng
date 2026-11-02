import { expect, it } from 'vitest';
import { mobileEnvironment } from '../scripts/mobile-environment.cjs';

it('uses local LAN public origins for development while preserving explicit shell overrides', () => {
  expect(
    mobileEnvironment(
      {},
      { EXPO_PUBLIC_API_URL: 'http://localhost:4000' },
      { EXPO_PUBLIC_API_URL: 'http://192.168.1.125:4000' },
      'start',
    ).EXPO_PUBLIC_API_URL,
  ).toBe('http://192.168.1.125:4000');
  expect(
    mobileEnvironment(
      { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:4000' },
      {},
      { EXPO_PUBLIC_API_URL: 'http://192.168.1.125:4000' },
      'start',
    ).EXPO_PUBLIC_API_URL,
  ).toBe('http://10.0.2.2:4000');
});
it('never uses a development-only LAN file for release export', () => {
  expect(
    mobileEnvironment(
      {},
      { EXPO_PUBLIC_API_URL: 'https://api.example.com' },
      { EXPO_PUBLIC_API_URL: 'http://192.168.1.125:4000' },
      'export',
    ).EXPO_PUBLIC_API_URL,
  ).toBe('https://api.example.com');
  expect(
    mobileEnvironment(
      {},
      {},
      { EXPO_PUBLIC_API_URL: 'http://192.168.1.125:4000' },
      'export',
    ).EXPO_PUBLIC_API_URL,
  ).toBeUndefined();
});
it('does not copy backend credentials from either configuration file', () => {
  expect(
    mobileEnvironment(
      {},
      { SMTP_PASSWORD: 'synthetic-marker' },
      {
        PAYSTACK_SECRET_KEY: 'synthetic-marker',
        MOBILE_BIND_ADDRESS: '192.168.1.125',
      },
      'start',
    ),
  ).toEqual({});
});
