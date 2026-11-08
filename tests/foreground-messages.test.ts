import { expect, it } from 'vitest';
import {
  createForegroundMessageTracker,
  type ForegroundMessage,
} from '../packages/shared/src/foreground-messages';
const message = (
  n: number,
  readAt: string | null = null,
): ForegroundMessage => ({
  id: n.toString().padStart(8, '0') + '-0000-4000-8000-000000000001',
  title: 'A staff message',
  href: '/lots/10000000-0000-4000-8000-000000000001',
  createdAt: new Date(1000 * n).toISOString(),
  readAt,
});
it('baselines old unread messages and alerts once for new messages', () => {
  const tracker = createForegroundMessageTracker();
  expect(tracker.observe([message(2), message(1)])).toEqual([]);
  expect(tracker.observe([message(4), message(3), message(2)])).toEqual([
    message(3),
    message(4),
  ]);
  expect(tracker.observe([message(4), message(3)])).toEqual([]);
});
it('does not alert for older messages exposed by marking the newest page read', () => {
  const tracker = createForegroundMessageTracker();
  tracker.observe([message(5), message(4)]);
  expect(tracker.observe([message(3), message(2)])).toEqual([]);
  expect(
    tracker.observe([message(6, '2026-11-08T00:00:00Z'), message(5)]),
  ).toEqual([]);
});
it('handles an initially empty inbox and resets the baseline independently for another account', () => {
  const tracker = createForegroundMessageTracker();
  tracker.observe([]);
  expect(tracker.observe([message(1)])).toEqual([message(1)]);
  const other = createForegroundMessageTracker();
  expect(other.observe([message(1)])).toEqual([]);
});
