import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  maskMonitorName,
  monitorSecondsLeft,
  monitorTimerText,
  monitorTimerTone,
  liveMonitorQuerySchema,
  monitorCommandSchema,
} from '../packages/shared/src/admin-live-schemas';
import { StaffLiveClock } from '../packages/api-client/src/staff-live-clock';
afterEach(() => vi.useRealTimers());
describe('Live monitor contracts', () => {
  it.each([
    [null, 'normal'],
    [1801, 'normal'],
    [1800, 'closing'],
    [901, 'closing'],
    [900, 'warning'],
    [301, 'warning'],
    [300, 'danger'],
    [1, 'danger'],
    [0, 'danger'],
  ] as const)(
    'assigns the closing badge at %s seconds: %s',
    (seconds, tone) => {
      expect(monitorTimerTone(seconds)).toBe(tone);
    },
  );
  it('advances from monotonic elapsed time and hides the clock on disconnect or stale heartbeat', () => {
    let monotonic = 1000;
    const clock = new StaffLiveClock(() => monotonic);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2090-01-01'));
    const server = '2026-11-07T12:00:00Z';
    expect(clock.now()).toBeNull();
    expect(clock.sync(server, 800)).toBe(true);
    monotonic += 1000;
    vi.setSystemTime(new Date('2000-01-01'));
    expect(clock.now()).toBe(Date.parse(server) + 1100);
    monotonic += 12000;
    expect(clock.now()).toBeNull();
    expect(clock.sync('2026-11-07T12:00:13Z')).toBe(true);
    clock.disconnect();
    expect(clock.now()).toBeNull();
  });
  it('rejects delayed/invalid clock samples rather than rolling live timers backwards', () => {
    let monotonic = 10000;
    const clock = new StaffLiveClock(() => monotonic);
    expect(clock.sync('2026-11-07T12:00:00Z')).toBe(true);
    expect(clock.sync('2026-11-07T11:59:00Z')).toBe(false);
    expect(clock.sync('invalid')).toBe(false);
    expect(clock.sync('2026-11-07T12:01:00Z', 0)).toBe(false);
    monotonic = 0;
    expect(clock.now()).toBeNull();
  });
  it('uses supplied server time even when the browser wall clock is wrong', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2090-01-01'));
    expect(
      monitorSecondsLeft(
        '2026-11-07T12:02:00Z',
        Date.parse('2026-11-07T12:00:36Z'),
      ),
    ).toBe(84);
    expect(monitorTimerText(84)).toBe('1 minute 24 seconds left');
    expect(monitorSecondsLeft('2026-11-07T12:02:00Z', null)).toBeNull();
  });
  it('freezes a paused lot at its saved remaining time and never invents a winner on expiry', () => {
    expect(
      monitorSecondsLeft(
        '2026-11-07T12:02:00Z',
        Date.parse('2026-11-07T19:00:00Z'),
        84000,
      ),
    ).toBe(84);
    expect(monitorTimerText(0)).toBe('Closing');
  });
  it.each([
    ['Adewale Okafor', 'Ad***e'],
    ['Ada', 'A***'],
    ['李明', '李***'],
    ['', 'B***'],
  ])('masks names without copying the full identity: %s', (input, expected) =>
    expect(maskMonitorName(input)).toBe(expected),
  );
  it('keeps the default API page at 25 and caps explicit monitor pages at 50', () => {
    expect(liveMonitorQuerySchema.parse({}).limit).toBe(25);
    expect(liveMonitorQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
  it('requires a reason and a lot on item commands, and rejects unknown fields', () => {
    expect(
      monitorCommandSchema.safeParse({
        idempotencyKey: crypto.randomUUID(),
        operation: 'cancel',
        reason: 'x',
      }).success,
    ).toBe(false);
    expect(
      monitorCommandSchema.safeParse({
        idempotencyKey: crypto.randomUUID(),
        operation: 'pause_all',
        reason: 'Investigate gateway',
        maxKobo: 100,
      }).success,
    ).toBe(false);
  });
});
