import { AUCTION_CONTROL_NAMESPACE } from '@auction-ng/shared';
// Prefix deliberately sits outside the guarded bid namespace. Durable SQL commands
// are committed before executing these retry-safe Redis operations.
const helpers = `
local p=KEYS[1];local root='${AUCTION_CONTROL_NAMESPACE}'..p
local function encode(v)
 if type(v)=='number' then return string.format('%.0f',v) end
 if type(v)~='table' then return cjson.encode(v) end
 local fields={};for k,value in pairs(v) do fields[#fields+1]=cjson.encode(k)..':'..encode(value) end
 return '{'..table.concat(fields,',')..'}'
end
local function kind(k,want)local actual=redis.call('TYPE',k).ok;return actual=='none' or actual==want end
if not kind(root..'state','string') or not kind(root..'receipts','hash') or not kind(root..'lots','hash') then return redis.error_reply('Auction control state needs review') end
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local raw=redis.call('GET',root..'state');local state=raw and cjson.decode(raw) or {phase='live'}
if state.resumeId and not kind(root..'resume:'..state.resumeId,'hash') then return redis.error_reply('Resume index needs review') end
`;
export const AUCTION_PAUSE_LUA =
  helpers +
  `
local op,id=ARGV[1],ARGV[2]
local prior=redis.call('HGET',root..'receipts',id..':'..op);if prior then return prior end
if op=='pause' then
 if state.phase~='live' then return redis.error_reply('Bidding is already paused or resuming') end
 state={phase='paused',pausedAt=now,pauseId=id}
elseif op=='resume_begin' then
 if state.phase~='paused' then return redis.error_reply('Bidding is not paused') end
 state.phase='resuming';state.resumedAt=now;state.resumeId=id
elseif op=='resume_finish' then
 if state.phase~='resuming' or state.resumeId~=id then return redis.error_reply('Resume command does not match') end
 local delta=now-state.resumedAt
 if delta<0 then return redis.error_reply('Resume clock moved backwards') end
 local rows=redis.call('HGETALL',root..'resume:'..id)
 local books={}
 for i=1,#rows,2 do
  local key=p..'lot:'..rows[i]
  if not kind(key,'string') then return redis.error_reply('Resume lot type needs review') end
  local raw=redis.call('GET',key)
  if raw then
   local lot=cjson.decode(raw)
   if lot.open and lot.pauseId==state.pauseId then
    if lot.endsAt+delta>9007199254740991 then return redis.error_reply('Resume deadline overflow') end
    lot.endsAt=lot.endsAt+delta;books[#books+1]={key=key,value=encode(lot)}
   end
  end
 end
 for _,book in ipairs(books) do redis.call('SET',book.key,book.value) end
 state.finalAdditionMs=delta;state.resumedAt=now;state.finalizedAt=now
elseif op=='resume_open' then
 if state.phase~='resuming' or state.resumeId~=id or not state.finalizedAt then return redis.error_reply('Resume is not finalized') end
 state.phase='live'
else return redis.error_reply('Unknown auction control') end
local result=encode(state);redis.call('SET',root..'state',result);redis.call('HSET',root..'receipts',id..':'..op,result)
redis.call('PUBLISH',root..'updates',encode({paused=state.phase~='live',serverTime=now}))
return result
`;
export const AUCTION_RESUME_LOT_LUA =
  helpers +
  `
local lotId,id,old,new=ARGV[1],ARGV[2],tonumber(ARGV[3]),tonumber(ARGV[4])
if state.phase~='resuming' then return redis.error_reply('Resume is not active') end
if state.finalizedAt then return redis.error_reply('Resume already finalized') end
if not kind(p..'lot:'..lotId,'string') then return redis.error_reply('Lot state needs review') end
local prior=redis.call('HGET',root..'lots',id);if prior then return prior end
if not old or not new or old<0 or new<old or new>9007199254740991 or old~=math.floor(old) or new~=math.floor(new) then return redis.error_reply('Invalid resume deadline') end
local raw=redis.call('GET',p..'lot:'..lotId);local result='skipped'
if raw then
 local lot=cjson.decode(raw)
 if lot.open and lot.endsAt>state.pausedAt then
  if lot.endsAt~=old then return redis.error_reply('Resume deadline changed') end
  lot.pauseEndsAt=old;lot.pauseId=state.pauseId;lot.endsAt=new;redis.call('SET',p..'lot:'..lotId,encode(lot));redis.call('HSET',root..'resume:'..state.resumeId,lotId,id);result='applied'
 end
end
redis.call('HSET',root..'lots',id,result);return result
`;
