import { describe, expect, it } from 'vitest';
import { formatCollectionDeadline } from '../packages/shared/src/collection-deadline';

describe('formatCollectionDeadline', () => {
  it.each([
    // 16:00 UTC is 17:00 in Lagos (WAT, UTC+1, no daylight saving).
    [
      '2026-11-13T16:00:00.000Z',
      'long',
      'Friday, 13 November 2026, 5:00pm WAT',
    ],
    ['2026-11-13T16:00:00.000Z', 'short', '13 Nov 2026, 5:00pm WAT'],
    ['2026-11-12T23:30:00.000Z', 'short', '13 Nov 2026, 12:30am WAT'],
    [
      '2026-11-13T11:05:00.000Z',
      'long',
      'Friday, 13 November 2026, 12:05pm WAT',
    ],
  ] as const)('%s (%s) → %s', (dueAt, style, expected) => {
    expect(formatCollectionDeadline(dueAt, style)).toBe(expected);
  });
});
