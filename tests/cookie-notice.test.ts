import { expect, it } from 'vitest';
import {
  cookieNoticeLifetimeMs,
  hasCookieAcknowledgement,
} from '../apps/web/lib/cookie-notice';

it('remembers the current notice only within its acknowledgement lifetime', () => {
  const now = Date.now();
  const saved = (acknowledgedAt: number, version = 1) =>
    JSON.stringify({ version, acknowledgedAt });
  expect(hasCookieAcknowledgement(saved(now), now)).toBe(true);
  expect(
    hasCookieAcknowledgement(saved(now - cookieNoticeLifetimeMs + 1), now),
  ).toBe(true);
  expect(
    hasCookieAcknowledgement(saved(now - cookieNoticeLifetimeMs), now),
  ).toBe(false);
  expect(hasCookieAcknowledgement(saved(now + 1), now)).toBe(false);
  expect(hasCookieAcknowledgement(saved(now, 2), now)).toBe(false);
});

it.each([
  null,
  '',
  'bad json',
  '{}',
  'null',
  '[]',
  '{"version":1,"acknowledgedAt":"yesterday"}',
])('rejects missing or invalid notice state %s', (value) => {
  expect(hasCookieAcknowledgement(value, Date.now())).toBe(false);
});
