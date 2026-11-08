import type { createClient } from 'redis';
import { LIVE_PRESENCE_LEASE_MS, liveMonitorPrefix } from '@auction-ng/shared';
type Redis = ReturnType<typeof createClient>;
export async function readLivePresence(
  redis: Redis,
  namespace: string,
  now: number,
) {
  const p = liveMonitorPrefix(namespace) + 'presence:';
  try {
    const [heartbeat, observed] = await Promise.all([
      redis.get(p + 'heartbeat'),
      redis.get(p + 'observed'),
    ]);
    if (!heartbeat || !observed) return null;
    const sample = Number(heartbeat),
      since = Number(observed);
    if (
      !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(sample) ||
      !Number.isSafeInteger(since) ||
      since < 0 ||
      sample < 0 ||
      since > sample ||
      sample > now ||
      now - sample >= LIVE_PRESENCE_LEASE_MS
    )
      return null;
    const ids = await redis.zRangeByScore(p + 'leases', now + 1, '+inf');
    const hashes = ids.length ? await redis.hmGet(p + 'buyers', ids) : [];
    if (hashes.some((value) => !value || !/^[a-f0-9]{64}$/.test(value)))
      return null;
    const buyers = [
      ...new Set(hashes.filter((value): value is string => value !== null)),
    ];
    const day = new Date(now + 3600000).toISOString().slice(0, 10);
    const flags = buyers.length
      ? await redis.sendCommand([
          'SMISMEMBER',
          liveMonitorPrefix(namespace) + 'bids:bidders:' + day,
          ...buyers,
        ])
      : [];
    if (
      !Array.isArray(flags) ||
      flags.some((value) => value !== 0 && value !== 1)
    )
      return null;
    const recovered = Number(
      (await redis.get(
        p + 'recovered:' + Math.floor((now + 3600000) / 86400000),
      )) ?? 0,
    );
    if (!Number.isSafeInteger(recovered) || recovered < 0) return null;
    return {
      online: buyers.length,
      haveBid: flags.filter((value) => value === 1).length,
      recovered,
      observedSince: new Date(since).toISOString(),
    };
  } catch {
    return null;
  }
}
