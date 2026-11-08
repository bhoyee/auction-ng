import {
  AUCTION_CONTROL_NAMESPACE,
  LOT_EXTENSION_OPTIONS,
} from '@auction-ng/shared';
// Durable command intent commits before begin. A permanent per-lot fence stays
// in place until SQL/audit/ledger commit and the matching Redis receipt exists.
export const LOT_CONTROL_LUA = `
local p,lotId,id,op,stage=KEYS[1],ARGV[1],ARGV[2],ARGV[3],ARGV[4]
local root='${AUCTION_CONTROL_NAMESPACE}'..p
local fence=p..'lot-control:'..lotId;local receipts=root..'lot-receipts'
local function encode(v)
 if type(v)=='number' then return string.format('%.0f',v) end
 if type(v)~='table' then return cjson.encode(v) end
 local fields={};for k,x in pairs(v) do fields[#fields+1]=cjson.encode(k)..':'..encode(x) end
 return '{'..table.concat(fields,',')..'}'
end
for _,entry in ipairs({{fence,'string'},{receipts,'hash'},{root..'state','string'},{p..'lot:'..lotId,'string'},{p..'groups','hash'},{p..'accepted','stream'}}) do
 local kind=redis.call('TYPE',entry[1]).ok;if kind~='none' and kind~=entry[2] then return encode({status='unavailable'}) end
end
local prior=redis.call('HGET',receipts,id..':'..stage);if prior and stage~='finalize' then return prior end
if stage=='finalize' then local opened=redis.call('HGET',receipts,id..':open');if opened then return opened end end
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local raw=redis.call('GET',fence);local plan=raw and cjson.decode(raw) or nil
if stage=='abort' then
 if plan and plan.id==id and not redis.call('HGET',receipts,id..':commit') then redis.call('DEL',fence) end
 return encode({status='aborted'})
end
if stage=='begin' then
 if plan then return plan.id==id and raw or encode({status='busy'}) end
 local global=redis.call('GET',root..'state')
 if global and cjson.decode(global).phase~='live' then return encode({status='busy'}) end
 if redis.call('EXISTS',p..'purchase:'..lotId)==1 or redis.call('EXISTS',p..'cancellation:'..lotId)==1 then return encode({status='busy'}) end
 local book=redis.call('GET',p..'lot:'..lotId);if not book then return encode({status='unavailable'}) end
 local lot=cjson.decode(book)
 if not lot.open or lot.launching or (lot.streamId or '0-0')~=ARGV[5] then return encode({status='stale'}) end
 local effective=lot.pausedAt or now
 if effective>=lot.endsAt then return encode({status='stale'}) end
 if (op=='pause' and lot.pausedAt) or (op=='resume' and not lot.pausedAt) then return encode({status='stale'}) end
 local remaining=lot.endsAt-effective
 if (op=='pause' or op=='cancel') and remaining<=120000 and ARGV[7]~=string.upper(op) then return encode({status='confirm'}) end
 local new=lot.endsAt
 if op=='extend' then
  local addition=tonumber(ARGV[6]);if ${LOT_EXTENSION_OPTIONS.map((option) => 'addition~=' + option.value).join(' and ')} then return encode({status='invalid'}) end
  new=new+addition
 elseif op=='resume' then new=now+remaining
 elseif op~='pause' and op~='cancel' then return encode({status='invalid'}) end
 if new>9007199254740991 then return encode({status='invalid'}) end
 local last=redis.call('XREVRANGE',p..'accepted','+','-','COUNT',1)
 plan={status='fenced',id=id,operation=op,lotId=lotId,endsAt=new,oldEndAt=lot.endsAt,pausedAt=lot.pausedAt or now,remainingMs=remaining,at=now,barrierId=last[1] and last[1][1] or '0-0',lot=lot}
 local result=encode(plan);redis.call('SET',fence,result);redis.call('HSET',receipts,id..':begin',result);return result
end
if not plan or plan.id~=id or plan.operation~=op then return encode({status='unavailable'}) end
local lot=plan.lot
if stage=='commit' then
 lot.endsAt=plan.endsAt
 if op=='pause' then lot.pausedAt=plan.pausedAt
 elseif op=='resume' then lot.endsAt=plan.oldEndAt
 elseif op=='cancel' then
  lot.open=false;lot.cancelled=true;lot.pausedAt=nil
  if lot.groupId and lot.groupId~=cjson.null then redis.call('HSET',p..'groups',lot.groupId,'released') end
 end
 redis.call('SET',p..'lot:'..lotId,encode(lot))
 local result=encode({status='completed',endsAt=plan.endsAt,at=plan.at})
 redis.call('HSET',receipts,id..':commit',result)
 return result
elseif stage=='finalize' and op=='resume' then
 if not redis.call('HGET',receipts,id..':commit') then return encode({status='unavailable'}) end
 local book=redis.call('GET',p..'lot:'..lotId);if not book then return encode({status='unavailable'}) end
 local current=cjson.decode(book)
 current.endsAt=now+plan.remainingMs;current.pausedAt=now
 if current.endsAt>9007199254740991 then return encode({status='invalid'}) end
 redis.call('SET',p..'lot:'..lotId,encode(current))
 local result=encode({status='ready',endsAt=current.endsAt,at=now})
 redis.call('HSET',receipts,id..':finalize',result);return result
elseif stage=='open' then
 if not redis.call('HGET',receipts,id..':commit') then return encode({status='unavailable'}) end
 local endAt=plan.endsAt
 if op=='resume' then
  local rawFinal=redis.call('HGET',receipts,id..':finalize')
  if not rawFinal then return encode({status='needs_finalization'}) end
  local final=cjson.decode(rawFinal)
  if now-final.at>1000 or now<final.at then return encode({status='needs_finalization'}) end
  local book=redis.call('GET',p..'lot:'..lotId);if not book then return encode({status='unavailable'}) end
  local current=cjson.decode(book);current.pausedAt=nil
  redis.call('SET',p..'lot:'..lotId,encode(current));endAt=final.endsAt
 end
 redis.call('DEL',fence)
 local result=encode({status='completed',endsAt=endAt,at=now})
 redis.call('HSET',receipts,id..':open',result)
 redis.call('PUBLISH',root..'lot-updates',encode({lotId=lotId,revision=id,serverTime=now}))
 return result
end
return encode({status='invalid'})
`;
