import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  acceptedBidEventSchema,
  liveMonitorPrefix,
  SOFT_CLOSE_MS,
  streamIdSchema,
} from '@auction-ng/shared';
import type { createClient } from 'redis';

type Redis = ReturnType<typeof createClient>;
const batchSchema = z
  .array(
    z
      .object({
        id: streamIdSchema,
        lotId: z.uuid(),
        bidder: z.string().regex(/^[a-f0-9]{64}$/),
        minute: z.number().int().safe().nonnegative(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        extension: z.boolean(),
      })
      .strict(),
  )
  .max(50);

// Cursor and counters advance together. Competing refresh jobs cannot count a
// batch twice, and a crash cannot acknowledge bids whose metrics were not saved.
const APPLY = `
local p,expected,nextId=KEYS[1],ARGV[1],ARGV[2]
local rows=cjson.decode(ARGV[3])
local function keyType(key,want)
  local actual=redis.call('TYPE',key).ok
  return actual=='none' or actual==want
end
local function counter(key,field)
  local raw=redis.call('HGET',key,field)
  if not raw then return true end
  local value=tonumber(raw)
  return string.match(raw,'^%d+$') and value and value>=0 and value<=9007199254740941
end
if not keyType(p..'cursor','string') or not keyType(p..'coverage','string') then return 'corrupt' end
if not keyType(p..'lot-bids','hash') or not keyType(p..'lot-extensions','hash') then return 'corrupt' end
for _,row in ipairs(rows) do
  if not keyType(p..'minutes:'..row.day,'hash') or not keyType(p..'day:'..row.day,'hash') or not keyType(p..'extended:'..row.day,'hash') or not keyType(p..'bidders:'..row.day,'set') then return 'corrupt' end
end
for _,row in ipairs(rows) do
  if not counter(p..'minutes:'..row.day,tostring(row.minute)) or not counter(p..'day:'..row.day,'bids') or not counter(p..'day:'..row.day,'peak') or not counter(p..'day:'..row.day,'extensions') or not counter(p..'extended:'..row.day,row.lotId) or not counter(p..'lot-bids',row.lotId) or not counter(p..'lot-extensions',row.lotId) then return 'corrupt' end
end
if (redis.call('GET',p..'cursor') or '0-0')~=expected then return 'retry' end
for _,row in ipairs(rows) do
  redis.call('HINCRBY',p..'minutes:'..row.day,tostring(row.minute),1)
  local minuteCount=tonumber(redis.call('HGET',p..'minutes:'..row.day,tostring(row.minute)))
  local peak=tonumber(redis.call('HGET',p..'day:'..row.day,'peak') or '0')
  if minuteCount>peak then redis.call('HSET',p..'day:'..row.day,'peak',minuteCount,'peakMinute',row.minute) end
  redis.call('HINCRBY',p..'day:'..row.day,'bids',1)
  redis.call('HINCRBY',p..'lot-bids',row.lotId,1)
  redis.call('SADD',p..'bidders:'..row.day,row.bidder)
  if row.extension then
    redis.call('HINCRBY',p..'day:'..row.day,'extensions',1)
    redis.call('HINCRBY',p..'extended:'..row.day,row.lotId,1)
    redis.call('HINCRBY',p..'lot-extensions',row.lotId,1)
  end
  redis.call('EXPIRE',p..'day:'..row.day,259200)
  redis.call('EXPIRE',p..'minutes:'..row.day,259200)
  redis.call('EXPIRE',p..'extended:'..row.day,259200)
  redis.call('EXPIRE',p..'bidders:'..row.day,259200)
end
if #rows>0 then redis.call('SET',p..'coverage',ARGV[4],'NX') end
redis.call('SET',p..'cursor',nextId)
return 'applied'
`;

export function monitorBidderKey(userId: string) {
  return createHash('sha256')
    .update('lotvanta-live:' + z.uuid().parse(userId))
    .digest('hex');
}

export function liveBidMetric(id: string, fields: Record<string, string>) {
  const event = acceptedBidEventSchema.parse(
    JSON.parse(fields.result ?? 'null'),
  );
  const userId = z.uuid().parse(fields.userId);
  return batchSchema.element.parse({
    id,
    lotId: fields.lotId,
    bidder: monitorBidderKey(userId),
    minute: Math.floor(event.serverTime / 60000),
    day: new Date(event.serverTime + 3600000).toISOString().slice(0, 10),
    extension: event.state.endsAt === event.serverTime + SOFT_CLOSE_MS,
  });
}

export class LiveBidProjection {
  readonly prefix: string;
  constructor(
    private readonly redis: Redis,
    private readonly namespace: string,
  ) {
    this.prefix = liveMonitorPrefix(namespace) + 'bids:';
  }

  async refresh() {
    const cursor = streamIdSchema.parse(
      (await this.redis.get(this.prefix + 'cursor')) ?? '0-0',
    );
    const source = await this.redis.xRange(
      this.namespace + 'accepted',
      '(' + cursor,
      '+',
      { COUNT: 50 },
    );
    if (!source.length) return { status: 'idle' as const, count: 0 };
    // Validate the entire batch before executing Lua; malformed source events
    // stop the projection instead of silently skipping financial history.
    const metrics = batchSchema.parse(
      source.flatMap((row) => {
        if (row.message.kind === 'cancellation') {
          z.object({
            kind: z.literal('cancellation'),
            approvalId: z.uuid(),
            lotId: z.uuid(),
          })
            .strict()
            .parse(row.message);
          return [];
        }
        if (row.message.kind !== undefined)
          throw Error('Unknown live stream event.');
        return [liveBidMetric(row.id, row.message)];
      }),
    );
    const last = source.at(-1);
    const first = source[0];
    if (!last || !first) throw Error('Live metrics batch unavailable.');
    const result = await this.redis.eval(APPLY, {
      keys: [this.prefix],
      arguments: [cursor, last.id, JSON.stringify(metrics), first.id],
    });
    if (result !== 'applied' && result !== 'retry')
      throw Error('Live metrics storage unavailable.');
    return { status: result, count: result === 'applied' ? metrics.length : 0 };
  }

  async read(now: number) {
    if (!Number.isSafeInteger(now) || now < 0)
      throw Error('Server time required.');
    const minute = Math.floor(now / 60000);
    const day = new Date(now + 3600000).toISOString().slice(0, 10);
    const fields = Array.from({ length: 60 }, (_, i) =>
      String(minute - 59 + i),
    );
    const days = [
      ...new Set(
        fields.map((at) =>
          new Date(Number(at) * 60000 + 3600000).toISOString().slice(0, 10),
        ),
      ),
    ];
    const [counts, daily, extended, coverage] = await Promise.all([
      Promise.all(
        days.map((day) =>
          this.redis.hmGet(this.prefix + 'minutes:' + day, fields),
        ),
      ),
      this.redis.hGetAll(this.prefix + 'day:' + day),
      this.redis.hLen(this.prefix + 'extended:' + day),
      this.redis.get(this.prefix + 'coverage'),
    ]);
    const value = (input: string | null | undefined) => {
      const result = Number(input ?? 0);
      if (!Number.isSafeInteger(result) || result < 0)
        throw Error('Invalid live metric.');
      return result;
    };
    const points = fields.map((at, i) => ({
      at: new Date(Number(at) * 60000).toISOString(),
      value: counts.reduce((sum, day) => sum + value(day[i]), 0),
    }));
    return {
      points,
      // Zero means measured zero only after the accepted-stream coverage begins.
      coverageStreamId: coverage,
      bidsPerMinute: points.at(-1)?.value ?? 0,
      bidsPeak: value(daily.peak),
      bidsPeakAt: daily.peakMinute
        ? new Date(value(daily.peakMinute) * 60000).toISOString()
        : null,
      extensionCount: value(daily.extensions),
      extendedLotCount: extended,
    };
  }
  async lots(ids: string[]) {
    z.array(z.uuid()).max(200).parse(ids);
    if (!ids.length) return [];
    const [bids, extensions] = await Promise.all([
      this.redis.hmGet(this.prefix + 'lot-bids', ids),
      this.redis.hmGet(this.prefix + 'lot-extensions', ids),
    ]);
    return ids.map((id, index) => {
      const bidCount = Number(bids[index] ?? 0),
        count = Number(extensions[index] ?? 0);
      if (
        ![bidCount, count].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        )
      )
        throw Error('Live item metrics unavailable.');
      return { id, bidCount, extensions: count };
    });
  }
}
