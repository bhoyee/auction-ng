import { z } from 'zod';
import type { createClient } from 'redis';
import {
  monitorLotSchema,
  monitorClosedRowSchema,
  monitorSignalSchema,
  LIVE_MONITOR_STALE_MS,
  type MonitorLot,
} from '@auction-ng/shared';
type Redis = ReturnType<typeof createClient>;
type Closed = z.infer<typeof monitorClosedRowSchema>;
const scalarNames = ['summary', 'series', 'issues', 'filters'] as const;
const stable = (value: unknown) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const copy = { ...value } as Record<string, unknown>;
    delete copy.serverTime;
    delete copy.revision;
    return JSON.stringify(copy);
  }
  return JSON.stringify(value);
};
const COMMIT = `
local p=KEYS[1]
local kind=redis.call('TYPE',p..'snapshot-revision').ok
if kind~='none' and kind~='string' then return -2 end
local previous=redis.call('GET',p..'snapshot-revision') or '-1'
if previous~=ARGV[1] then return -1 end
if tonumber(ARGV[2])<=tonumber(previous) then return 0 end
local commands=cjson.decode(ARGV[3])
local kinds={SET='string',HSET='hash',HDEL='hash',ZADD='zset',ZREM='zset',PUBLISH='channel'}
for _,command in ipairs(commands) do
  local expected=kinds[command[1]]
  if not expected or string.sub(command[2],1,#p)~=p then return -2 end
  if expected~='channel' then
    local actual=redis.call('TYPE',command[2]).ok
    if actual~='none' and actual~=expected then return -2 end
  end
end
for _,command in ipairs(commands) do redis.call(command[1],unpack(command,2)) end
return 1
`;

/** Atomic deltas avoid rewriting thousands of rows into Redis AOF every second. */
export class LiveSnapshotStore {
  private rows: Map<string, MonitorLot> | null = null;
  private closed = new Map<string, Closed>();
  private values = new Map<string, string>();
  private revision = '-1';
  readonly key: string;
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {
    this.key = prefix + 'current';
  }
  private indexes(row: MonitorLot) {
    return [
      `${this.key}:order:all:all`,
      `${this.key}:order:${row.categoryId}:all`,
      `${this.key}:order:all:${row.locationId}`,
      `${this.key}:order:${row.categoryId}:${row.locationId}`,
    ];
  }
  private async restore() {
    const result = await this.redis
      .multi()
      .hGetAll(this.key + ':rows')
      .hGetAll(this.key + ':closed-rows')
      .mGet(scalarNames.map((name) => this.key + ':' + name))
      .get(this.prefix + 'snapshot-revision')
      .exec();
    const hash = z.record(z.string(), z.string());
    this.rows = new Map(
      Object.entries(hash.parse(result[0])).map(([id, raw]) => [
        id,
        monitorLotSchema.parse(JSON.parse(raw)),
      ]),
    );
    this.closed = new Map(
      Object.entries(hash.parse(result[1])).map(([id, raw]) => [
        id,
        monitorClosedRowSchema.parse(JSON.parse(raw)),
      ]),
    );
    const values = z.array(z.string().nullable()).parse(result[2]);
    this.values = new Map(
      scalarNames.flatMap((name, i) =>
        values[i] ? [[name, stable(JSON.parse(values[i]))] as const] : [],
      ),
    );
    this.revision = z.string().nullable().parse(result[3]) ?? '-1';
  }
  async save(input: {
    rows: MonitorLot[];
    closed: Closed[];
    values: Record<(typeof scalarNames)[number], unknown>;
    clock: z.infer<typeof monitorSignalSchema>;
  }) {
    monitorSignalSchema.parse(input.clock);
    if (!this.rows) await this.restore();
    const old = this.rows;
    if (!old) throw Error('Live projection unavailable.');
    const commands: string[][] = [],
      next = new Map(input.rows.map((row) => [row.id, row]));
    for (const [id, row] of old)
      if (!next.has(id)) {
        commands.push(['HDEL', this.key + ':rows', id]);
        for (const index of this.indexes(row))
          commands.push(['ZREM', index, id]);
      }
    for (const [id, row] of next) {
      const previous = old.get(id);
      if (!previous || stable(previous) !== stable(row))
        commands.push(['HSET', this.key + ':rows', id, JSON.stringify(row)]);
      if (
        !previous ||
        previous.endsAt !== row.endsAt ||
        previous.categoryId !== row.categoryId ||
        previous.locationId !== row.locationId
      ) {
        if (previous)
          for (const index of this.indexes(previous))
            commands.push(['ZREM', index, id]);
        for (const index of this.indexes(row))
          commands.push(['ZADD', index, String(Date.parse(row.endsAt)), id]);
      }
    }
    const closed = new Map(input.closed.map((row) => [row.id, row]));
    for (const id of this.closed.keys())
      if (!closed.has(id))
        commands.push(
          ['HDEL', this.key + ':closed-rows', id],
          ['ZREM', this.key + ':closed-order', id],
        );
    for (const [id, row] of closed) {
      const previous = this.closed.get(id);
      if (!previous || stable(previous) !== stable(row))
        commands.push([
          'HSET',
          this.key + ':closed-rows',
          id,
          JSON.stringify(row),
        ]);
      if (!previous || previous.closedAt !== row.closedAt)
        commands.push([
          'ZADD',
          this.key + ':closed-order',
          String(Date.parse(row.closedAt)),
          id,
        ]);
    }
    const values = new Map<string, string>();
    for (const name of scalarNames) {
      const value = input.values[name],
        signature = stable(value);
      values.set(name, signature);
      if (this.values.get(name) !== signature)
        commands.push(['SET', this.key + ':' + name, JSON.stringify(value)]);
    }
    const signal = JSON.stringify(input.clock);
    commands.push(
      [
        'SET',
        this.prefix + 'live_auction_stats',
        signal,
        'PX',
        String(LIVE_MONITOR_STALE_MS),
      ],
      ['SET', this.prefix + 'snapshot-revision', String(input.clock.revision)],
      ['PUBLISH', this.prefix + 'updates', signal],
    );
    const applied = Number(
      await this.redis.eval(COMMIT, {
        keys: [this.prefix],
        arguments: [
          this.revision,
          String(input.clock.revision),
          JSON.stringify(commands),
        ],
      }),
    );
    if (applied === -2) throw Error('Live projection storage is inconsistent.');
    if (applied === 1) {
      this.rows = next;
      this.closed = closed;
      this.values = values;
      this.revision = String(input.clock.revision);
    } else this.rows = null;
    return {
      applied: applied === 1,
      commands: applied === 1 ? commands.length : 0,
    };
  }
}
