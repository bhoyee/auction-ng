// The same Redis process serializes reservations with bid acceptance and closing.
export const PURCHASE_LUA = `
local p,id,order,op=KEYS[1],ARGV[1],ARGV[2],ARGV[3]
local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local function encode(v)
  if type(v)=='number' then return string.format('%.0f',v) end
  if type(v)~='table' then return cjson.encode(v) end
  local fields={}
  for k,value in pairs(v) do fields[#fields+1]=cjson.encode(k)..':'..encode(value) end
  return '{'..table.concat(fields,',')..'}'
end
local key=p..'purchase:'..id
for _,entry in ipairs({{key,'string'},{p..'lot:'..id,'string'},{p..'groups','hash'},{p..'accepted','stream'}}) do
  local kind=redis.call('TYPE',entry[1]).ok
  if kind~='none' and kind~=entry[2] then return cjson.encode({status='unavailable'}) end
end
local raw=redis.call('GET',key); local lock=raw and cjson.decode(raw) or nil
if op=='release' then
  if lock and lock.id==order and lock.mode~='sold' then redis.call('DEL',key) end
  return cjson.encode({status='released'})
end
local lotRaw=redis.call('GET',p..'lot:'..id)
if not lotRaw then return cjson.encode({status='unavailable'}) end
local lot=cjson.decode(lotRaw)
if op=='sold' then
  if not lock or lock.id~=order then return cjson.encode({status='unavailable'}) end
  if lock.mode=='sold' then return cjson.encode({status='sold'}) end
  lock.mode='sold'; redis.call('SET',key,cjson.encode(lock))
  if lot.groupId and lot.groupId~=cjson.null then redis.call('HSET',p..'groups',lot.groupId,'released') end
  lot.open=false; lot.endsAt=now
  local millis,sequence=string.match(lot.streamId or '0-0','^(%d+)%-(%d+)$')
  lot.streamId=now>tonumber(millis) and string.format('%.0f',now)..'-0' or millis..'-'..string.format('%.0f',tonumber(sequence)+1)
  redis.call('SET',p..'lot:'..id,encode(lot))
  redis.call('PUBLISH',p..'purchase-updates',encode({lotId=id,streamId=lot.streamId,currentPriceKobo=lot.currentPriceKobo,endsAt=now,serverTime=now}))
  return cjson.encode({status='sold'})
end
if not lot.open or now>=lot.endsAt then return cjson.encode({status='closed'}) end
if lock and lock.id~=order then return cjson.encode({status='reserved'}) end
if op=='reserve' then
  if not lock then
    local expires=math.min(tonumber(ARGV[4]),lot.endsAt)
    if expires<=now then return cjson.encode({status='expired'}) end
    lock={id=order,expiresAt=expires,mode='reserved'}
    redis.call('SET',key,cjson.encode(lock),'PXAT',expires)
  end
else
  if not lock or now>=lock.expiresAt then return cjson.encode({status='expired'}) end
  lock.mode='committing'; redis.call('SET',key,cjson.encode(lock))
end
local last=redis.call('XREVRANGE',p..'accepted','+','-','COUNT',1)
return cjson.encode({status='ok',expiresAt=lock.expiresAt,barrierId=last[1] and last[1][1] or '0-0'})
`;
