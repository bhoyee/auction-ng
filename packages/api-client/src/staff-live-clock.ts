import { LIVE_MONITOR_STALE_MS } from '@auction-ng/shared';

/** Server samples + monotonic elapsed time; device wall-clock changes are irrelevant. */
export class StaffLiveClock {
  private sample: { server: number; received: number; transit: number } | null =
    null;
  constructor(
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {}

  sync(serverTime: string, sentAt?: number) {
    const server = Date.parse(serverTime),
      received = this.monotonicNow();
    const roundTrip = sentAt === undefined ? 0 : received - sentAt;
    if (
      !Number.isSafeInteger(server) ||
      server < 0 ||
      !Number.isFinite(received) ||
      roundTrip < 0 ||
      roundTrip > 5000
    )
      return false;
    if (this.sample && server < this.sample.server) return false;
    this.sample = { server, received, transit: roundTrip / 2 };
    return true;
  }

  now() {
    if (!this.sample) return null;
    const elapsed = this.monotonicNow() - this.sample.received;
    if (
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      elapsed >= LIVE_MONITOR_STALE_MS
    )
      return null;
    return this.sample.server + this.sample.transit + elapsed;
  }

  disconnect() {
    this.sample = null;
  }
}
