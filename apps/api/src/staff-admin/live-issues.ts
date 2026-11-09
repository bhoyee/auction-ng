import { createHash } from 'node:crypto';
import type { createClient } from 'redis';
import { liveMonitorPrefix } from '@auction-ng/shared';

type Redis = ReturnType<typeof createClient>;
// Separate from the guarded bid namespace: telemetry cannot change an auction.
const WRITE = `
local p=KEYS[1];local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local day=tostring(math.floor((now+3600000)/86400000));local root=p..day..':'
if ARGV[1]=='heartbeat' then
 redis.call('SET',root..'since',string.format('%.0f',now),'NX','EX',259200)
 redis.call('SET',p..'heartbeat',string.format('%.0f',now),'PX',30000)
else
 redis.call('SADD',root..ARGV[1],ARGV[2]);redis.call('EXPIRE',root..ARGV[1],259200)
end
return now`;
export class LiveIssues {
  readonly prefix: string;
  constructor(
    private readonly redis: Redis,
    namespace: string,
  ) {
    this.prefix = liveMonitorPrefix(namespace) + 'issues:';
  }
  async heartbeat() {
    try {
      await this.redis.eval(WRITE, {
        keys: [this.prefix],
        arguments: ['heartbeat', ''],
      });
    } catch {
      /* Telemetry must not alter readiness or a financial result. */
    }
  }
  async record(kind: 'wallet' | 'release', operationId: string) {
    try {
      await this.redis.eval(WRITE, {
        keys: [this.prefix],
        arguments: [
          kind,
          createHash('sha256').update(operationId).digest('hex'),
        ],
      });
    } catch {
      /* Preserve the original money/bid error when telemetry is unavailable. */
    }
  }
  async read(now: number) {
    try {
      const day = Math.floor((now + 3600000) / 86400000),
        root = this.prefix + day + ':';
      const [raw, sinceRaw, wallet, release] = await Promise.all([
        this.redis.get(this.prefix + 'heartbeat'),
        this.redis.get(root + 'since'),
        this.redis.sCard(root + 'wallet'),
        this.redis.sCard(root + 'release'),
      ]);
      const heartbeat = Number(raw),
        since = Number(sinceRaw);
      if (
        !raw ||
        !sinceRaw ||
        !Number.isSafeInteger(heartbeat) ||
        !Number.isSafeInteger(since) ||
        heartbeat > now ||
        now - heartbeat >= 30000 ||
        since > heartbeat ||
        since < day * 86400000 - 3600000
      )
        return null;
      return { wallet, release, since: new Date(since).toISOString() };
    } catch {
      return null;
    }
  }
}
