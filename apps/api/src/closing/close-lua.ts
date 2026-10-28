// The optional second argument is used only by isolated clock-controlled tests.
// Production always uses Redis TIME, serialized with funded bid acceptance.
export const CLOSE_LUA = `
local p,id=KEYS[1],ARGV[1]
local clock=redis.call('TIME')
local now=tonumber(ARGV[2]) or tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
local function encode(v)
  if type(v)=='number' then return string.format('%.0f',v) end
  if type(v)~='table' then return cjson.encode(v) end
  local fields={}
  for key,value in pairs(v) do fields[#fields+1]=cjson.encode(key)..':'..encode(value) end
  return '{'..table.concat(fields,',')..'}'
end
if redis.call('EXISTS',p..'purchase:'..id)==1 then return encode({status='reserved'}) end
local raw=redis.call('GET',p..'lot:'..id)
if not raw then return encode({status='unavailable'}) end
local lot=cjson.decode(raw)
if lot.open and now<lot.endsAt then return encode({status='extended',endsAt=lot.endsAt}) end
if lot.open then
  local last=redis.call('XREVRANGE',p..'accepted','+','-','COUNT',1)
  lot.open=false; lot.closedAt=now; lot.barrierId=last[1] and last[1][1] or '0-0'
  redis.call('SET',p..'lot:'..id,encode(lot))
end
return encode({status='frozen',snapshot=lot})
`;
