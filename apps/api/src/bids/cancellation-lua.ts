import { AUCTION_CONTROL_NAMESPACE } from '@auction-ng/shared';
import { CANCELLATION_REBID_MS } from '@auction-ng/shared';
export const CANCELLATION_LUA = `
local p,id,op,request,buyer=KEYS[1],ARGV[1],ARGV[2],ARGV[3],ARGV[4]
local key=p..'cancellation:'..id
local function encode(v)
 if type(v)=='number' then return string.format('%.0f',v) end
 if type(v)~='table' then return cjson.encode(v) end
 local fields={};for k,x in pairs(v) do fields[#fields+1]=cjson.encode(k)..':'..encode(x) end
 return '{'..table.concat(fields,',')..'}'
end
for _,entry in ipairs({{key,'string'},{p..'lot:'..id,'string'},{p..'blocked:'..id,'hash'},{p..'groups','hash'},{p..'accepted','stream'}}) do
 local kind=redis.call('TYPE',entry[1]).ok;if kind~='none' and kind~=entry[2] then return encode({status='unavailable'}) end
end
local raw=redis.call('GET',key);local pending=raw and cjson.decode(raw) or nil
if op=='abort' then if pending and pending.id==request then redis.call('DEL',key) end;return encode({status='aborted'}) end
if op=='begin' then
 if redis.call('EXISTS',p..'lot-control:'..id)==1 then return encode({status='busy'}) end
 if pending then return pending.id==request and raw or encode({status='busy'}) end
 local pause=redis.call('GET','${AUCTION_CONTROL_NAMESPACE}'..p..'state')
 if pause and cjson.decode(pause).phase~='live' then return encode({status='stale'}) end
 if redis.call('EXISTS',p..'purchase:'..id)==1 then return encode({status='stale'}) end
 local book=redis.call('GET',p..'lot:'..id);if not book then return encode({status='unavailable'}) end
 local lot=cjson.decode(book);local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
 if lot.pausedAt then return encode({status='stale'}) end
 if not lot.open or lot.launching or now>=lot.endsAt or (lot.streamId or '0-0')~=ARGV[5] or lot.leader==cjson.null then return encode({status='stale'}) end
 local last=redis.call('XREVRANGE',p..'accepted','+','-','COUNT',1)
 pending={status='fenced',id=request,lot=lot,barrierId=last[1] and last[1][1] or '0-0',approvedAt=now,reopened=lot.leader.bidderId==buyer}
 if pending.reopened then pending.newEndAt=math.max(lot.endsAt,now+${CANCELLATION_REBID_MS}) else pending.newEndAt=lot.endsAt end
 redis.call('SET',key,encode(pending));return encode(pending)
end
if redis.call('HGET',p..'blocked:'..id,buyer)==request then local current=redis.call('GET',p..'lot:'..id);return encode({status='completed',endsAt=current and cjson.decode(current).endsAt or 0}) end
if not pending or pending.id~=request then return encode({status='unavailable'}) end
local lot=pending.lot
local t=redis.call('TIME');local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
if pending.reopened then
 if lot.groupId~=cjson.null then redis.call('HSET',p..'groups',lot.groupId,'released') end
 lot.leader=cjson.null;lot.groupId=cjson.null;lot.currentPriceKobo=cjson.null;lot.heldKobo=0;lot.bidRound=(lot.bidRound or 0)+1;lot.endsAt=math.max(pending.newEndAt,now+${CANCELLATION_REBID_MS})
end
local stream=redis.call('XADD',p..'accepted','*','kind','cancellation','approvalId',request,'lotId',id)
lot.streamId=stream
redis.call('HSET',p..'blocked:'..id,buyer,request)
redis.call('SET',p..'lot:'..id,encode(lot));redis.call('DEL',key)
if pending.reopened then redis.call('PUBLISH',p..'cancellation-updates',encode({lotId=id,streamId=stream,currentPriceKobo=cjson.null,endsAt=lot.endsAt,serverTime=now}))
else redis.call('PUBLISH',p..'personal-updates',encode({lotId=id,streamId=stream,currentPriceKobo=lot.currentPriceKobo,endsAt=lot.endsAt,serverTime=now,leaderId=lot.leader.bidderId,previousLeaderId=buyer,requesterId=buyer})) end
return encode({status='completed',endsAt=lot.endsAt})
`;
