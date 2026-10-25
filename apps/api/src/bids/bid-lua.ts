import {
  DEFAULT_INCREMENT_TIERS,
  SOFT_CLOSE_MS,
  BID_CONFIRM_IP_LIMIT,
  BID_CONFIRM_GLOBAL_LIMIT,
} from '@auction-ng/shared';

// Generate constants from the same rules as resolveBid; never maintain a second table.
export const BID_LUA = `
local p,op,id,binding,lotId=KEYS[1],ARGV[1],ARGV[2],ARGV[3],ARGV[4]
local clock=redis.call('TIME')
local now=tonumber(ARGV[5]) or tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
-- Redis cjson encodes numbers with only 14 significant digits. Emit integer
-- literals explicitly so safe integer kobo and milliseconds survive round trips.
local function encode(v)
  if type(v)=='number' then return string.format('%.0f',v) end
  if type(v)~='table' then return cjson.encode(v) end
  local fields={}
  for key,value in pairs(v) do fields[#fields+1]=cjson.encode(key)..':'..encode(value) end
  return '{'..table.concat(fields,',')..'}'
end
local function fail(reason) return encode({status='rejected',reason=reason}) end
-- Lua is atomic but does not roll back runtime errors. Validate persistent key
-- types before the first write so a corrupt namespace cannot create half a bid.
for _,entry in ipairs({{'groups','hash'},{'revoked','hash'},{'accepted','stream'},{'proof:'..id,'string'},{'lot:'..lotId,'string'}}) do
  local kind=redis.call('TYPE',p..entry[1]).ok
  if kind~='none' and kind~=entry[2] then return fail('unavailable') end
end
if ARGV[6] then
  for _,bucket in ipairs({{ARGV[6],${BID_CONFIRM_IP_LIMIT}},{'global',${BID_CONFIRM_GLOBAL_LIMIT}}}) do
    local key=p..'rate:'..bucket[1]
    local count=redis.call('INCR',key)
    if count==1 then redis.call('PEXPIRE',key,60000) end
    if count>bucket[2] then return fail('rate') end
  end
end
local raw=redis.call('GET',p..'proof:'..id)
if not raw then return fail('unknown') end
local proof=cjson.decode(raw)
-- Missing mode identifies a pre-upgrade proxy-only proof; never reinterpret it.
local mode=proof.mode or 'automatic'
if mode~='direct' and mode~='automatic' then return fail('unavailable') end
if proof.binding~=binding or proof.lotId~=lotId then return fail('binding') end
if op=='status' then
  if proof.status=='accepted' and redis.call('HGET',p..'groups',proof.groupId)=='released' then return encode({status='outbid'}) end
  return encode({status=proof.status, result=proof.result})
end
if op=='cancel' or op=='expire' then
  if proof.status=='ready' and (op=='cancel' or now>=proof.expiresAt) then
    proof.status='cancelled'; redis.call('SET',p..'proof:'..id,encode(proof))
  end
  return encode({status=proof.status})
end
if proof.status=='accepted' then return encode(proof.result) end
if proof.status~='ready' then return fail(proof.status) end
local function reject(reason)
  proof.status='rejected'; redis.call('SET',p..'proof:'..id,encode(proof)); return fail(reason)
end
if now>=proof.expiresAt then return reject('expired') end
if proof.sessionId and redis.call('HEXISTS',p..'revoked',proof.sessionId)==1 then return reject('revoked') end
local lotRaw=redis.call('GET',p..'lot:'..lotId)
if not lotRaw then return reject('unavailable') end
local lot=cjson.decode(lotRaw)
if not lot.open or now>=lot.endsAt or lot.feeVersion~=proof.feeVersion then return reject('closed') end
local previous=lot.groupId
local price,leader=lot.currentPriceKobo,lot.leader
local own=leader~=cjson.null and leader.bidderId==proof.userId
if not proof.totalKobo or not proof.reservedKobo or proof.totalKobo<proof.maxKobo or proof.reservedKobo<=0 then return reject('funding') end
if own then
  if not lot.heldKobo or proof.totalKobo<lot.heldKobo or proof.totalKobo-lot.heldKobo~=proof.reservedKobo then return reject('funding') end
elseif proof.reservedKobo~=proof.totalKobo then return reject('funding') end
if proof.baseMaxKobo~=cjson.null then
  if not own or lot.groupId~=proof.groupId or leader.maxKobo~=proof.baseMaxKobo then return reject('stale') end
elseif own then return reject('stale') end
local increment=0
if price~=cjson.null then
  ${DEFAULT_INCREMENT_TIERS.map((tier) => `if price>=${tier.fromKobo} then increment=${tier.incrementKobo} end`).join('\n  ')}
end
if own then
  if proof.maxKobo<=leader.maxKobo then return reject('minimum') end
  if mode=='direct' then
    if proof.maxKobo<price or proof.maxKobo-price<increment then return reject('minimum') end
    price=proof.maxKobo
  end
  leader.maxKobo=proof.maxKobo
elseif leader==cjson.null then
  if proof.maxKobo<lot.startPriceKobo then return reject('minimum') end
  price=mode=='direct' and proof.maxKobo or lot.startPriceKobo; leader={bidderId=proof.userId,maxKobo=proof.maxKobo}; lot.groupId=proof.groupId
else
  -- Subtract before adding so intermediate doubles never exceed safe integer kobo.
  if proof.maxKobo<price or proof.maxKobo-price<increment then return reject('minimum') end
  if proof.maxKobo>leader.maxKobo then
    if mode=='direct' or proof.maxKobo-leader.maxKobo<increment then price=proof.maxKobo else price=leader.maxKobo+increment end
    leader={bidderId=proof.userId,maxKobo=proof.maxKobo}; lot.groupId=proof.groupId
  else
    if leader.maxKobo-proof.maxKobo<increment then price=leader.maxKobo else price=proof.maxKobo+increment end
  end
end
if lot.endsAt-now<=${SOFT_CLOSE_MS} then lot.endsAt=now+${SOFT_CLOSE_MS} end
lot.currentPriceKobo=price; lot.leader=leader
if leader.bidderId==proof.userId then lot.heldKobo=proof.totalKobo end
local state={startPriceKobo=lot.startPriceKobo,currentPriceKobo=price,leader=leader,endsAt=lot.endsAt}
local result={status='accepted',mode=mode,isLeader=leader.bidderId==proof.userId,state=state,serverTime=now}
-- All keys are dedicated, initialized types. No trimming before durable T10 consumers exist.
local stream=redis.call('XADD',p..'accepted','*','intentId',id,'lotId',lotId,'userId',proof.userId,'maxKobo',string.format('%.0f',proof.maxKobo),'mode',mode,'result',encode(result))
result.streamId=stream
proof.status='accepted'; proof.result=result
if lot.groupId~=previous and previous~=cjson.null then redis.call('HSET',p..'groups',previous,'released') end
redis.call('HSET',p..'groups',proof.groupId, result.isLeader and 'active' or 'released')
redis.call('SET',p..'lot:'..lotId,encode(lot)); redis.call('SET',p..'proof:'..id,encode(proof))
redis.call('PUBLISH',p..'updates',encode({lotId=lotId,currentPriceKobo=price,endsAt=lot.endsAt,serverTime=now}))
return encode(result)
`;
