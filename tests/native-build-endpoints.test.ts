import { expect, it } from 'vitest';
import { validateBuildEndpoints } from '../apps/mobile/lib/build-endpoints.cjs';

const endpoints = {
  EXPO_PUBLIC_API_URL: 'https://api.example.com',
  EXPO_PUBLIC_REALTIME_URL: 'https://realtime.example.com',
  EXPO_PUBLIC_WEB_URL: 'https://example.com',
};
it('allows local development before public services exist', () => {
  expect(() => validateBuildEndpoints('development', {})).not.toThrow();
});
it('requires all public origins for release profiles', () => {
  expect(() => validateBuildEndpoints('production', {})).toThrow(
    'EXPO_PUBLIC_API_URL',
  );
  expect(() => validateBuildEndpoints('preview', endpoints)).not.toThrow();
});
it.each([
  'http://api.example.com',
  'https://localhost',
  'https://127.0.0.1',
  'https://192.168.1.20',
  'https://10.0.0.1',
  'https://172.16.0.2',
  'https://[::1]',
  'https://user:secret@api.example.com',
  'https://api.example.com/path',
  'https://api.example.com/?token=private',
])('rejects unsafe release origin %s', (url) => {
  expect(() =>
    validateBuildEndpoints('production', {
      ...endpoints,
      EXPO_PUBLIC_API_URL: url,
    }),
  ).toThrow();
});
