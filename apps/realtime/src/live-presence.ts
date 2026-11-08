import { createHash } from 'node:crypto';
import type { createClient } from 'redis';
import {
  liveMonitorPrefix,
  LIVE_BIDDER_HASH_DOMAIN,
  LIVE_PRESENCE_LEASE_MS,
  LIVE_RECOVERY_WINDOW_MS,
} from '@auction-ng/shared';
type Redis = ReturnType<typeof createClient>;
export type LivePresencePeer = {
  socketId: string;
  userId: string;
  deviceId: string;
};
const SCRIPT = `
local p,op=KEYS[1],ARGV[1]
local peers=cjson.decode(ARGV[2])
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local day=tostring(math.floor((now+3600000)/86400000))
local function kind(key,want) local actual=redis.call('TYPE',key).ok;return actual=='none' or actual==want end
for _,pair in ipairs({{p..'leases','zset'},{p..'buyers','hash'},{p..'heartbeat','string'},{p..'observed','string'}}) do if not kind(pair[1],pair[2]) then return -1 end end
for _,peer in ipairs(peers) do if not kind(p..'dropped:'..peer.device,'string') then return -1 end end
if op=='disconnect' then
  for _,peer in ipairs(peers) do
    redis.call('ZREM',p..'leases',peer.id);redis.call('HDEL',p..'buyers',peer.id)
    if ARGV[3]=='recoverable' then redis.call('SET',p..'dropped:'..peer.device,string.format('%.0f',now),'PX',${LIVE_RECOVERY_WINDOW_MS}) end
  end
  return now
end
if not kind(p..'recovered:'..day,'string') then return -1 end
local count=tonumber(redis.call('GET',p..'recovered:'..day) or '0')
if not count or count<0 or count>9007199254740990 or count~=math.floor(count) then return -1 end
for _,peer in ipairs(peers) do
  local raw=redis.call('GET',p..'dropped:'..peer.device)
  if raw and not tonumber(raw) then return -1 end
end
for _,peer in ipairs(peers) do
  if op=='connect' then
    local dropped=tonumber(redis.call('GET',p..'dropped:'..peer.device) or '-1')
    if dropped and dropped>=0 and now>=dropped and now-dropped<=${LIVE_RECOVERY_WINDOW_MS} then
      redis.call('INCR',p..'recovered:'..day);redis.call('EXPIRE',p..'recovered:'..day,259200)
    end
    redis.call('DEL',p..'dropped:'..peer.device)
  end
  redis.call('ZADD',p..'leases',string.format('%.0f',now+${LIVE_PRESENCE_LEASE_MS}),peer.id)
  redis.call('HSET',p..'buyers',peer.id,peer.buyer)
end
local old=redis.call('ZRANGEBYSCORE',p..'leases','-inf',string.format('%.0f',now),'LIMIT',0,500)
for _,id in ipairs(old) do redis.call('ZREM',p..'leases',id);redis.call('HDEL',p..'buyers',id) end
redis.call('SET',p..'heartbeat',string.format('%.0f',now),'PX',${LIVE_PRESENCE_LEASE_MS})
redis.call('SET',p..'observed',string.format('%.0f',now),'NX')
return now
`;
export class LivePresence {
  readonly prefix: string;
  constructor(
    private readonly redis: Redis,
    namespace: string,
  ) {
    this.prefix = liveMonitorPrefix(namespace) + 'presence:';
  }
  private encode(peers: LivePresencePeer[]) {
    return JSON.stringify(
      peers.map((peer) => ({
        id: peer.socketId,
        buyer: createHash('sha256')
          .update(LIVE_BIDDER_HASH_DOMAIN + peer.userId)
          .digest('hex'),
        device: createHash('sha256')
          .update(LIVE_BIDDER_HASH_DOMAIN + peer.userId + ':' + peer.deviceId)
          .digest('hex'),
      })),
    );
  }
  private async command(
    operation: 'connect' | 'disconnect' | 'heartbeat',
    peers: LivePresencePeer[],
    disconnectKind: string,
  ) {
    const result = Number(
      await this.redis.eval(SCRIPT, {
        keys: [this.prefix],
        arguments: [operation, this.encode(peers), disconnectKind],
      }),
    );
    if (!Number.isSafeInteger(result) || result < 0)
      throw Error('Presence telemetry unavailable.');
    return result;
  }
  connect(peer: LivePresencePeer) {
    return this.command('connect', [peer], '');
  }
  disconnect(peer: LivePresencePeer, reason: string) {
    return this.command(
      'disconnect',
      [peer],
      ['transport close', 'transport error', 'ping timeout'].includes(reason)
        ? 'recoverable'
        : 'intentional',
    );
  }
  heartbeat(peers: LivePresencePeer[]) {
    return this.command('heartbeat', peers, '');
  }
}
