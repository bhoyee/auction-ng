// Activation and the first accepted bid are serialized by Redis. A delayed
// activation must never restore an older policy after another admin save.
export const ACTIVATE_AUCTION_FEES_LUA = `
local revision=tonumber(ARGV[1])
local current=tonumber(redis.call('HGET',KEYS[1],'revision') or '-1')
if current>revision then return 0 end
if current==revision then
  if redis.call('HGET',KEYS[1],'version')~=ARGV[2] then return redis.error_reply('Fee revision conflict') end
  return 0
end
redis.call('HSET',KEYS[1],'revision',ARGV[1],'version',ARGV[2])
return 1
`;
