'use strict';
const text=v=>String(v??'').trim();
const identity=v=>text(v).replace(/[^a-z0-9]/gi,'').toLowerCase();
// An error message is only a hint. Never attach a VN without a confirming HIS lookup.
function existingVisitHint(message){const m=text(message).match(/\bHave\s+VisitUID\s+([A-Za-z0-9-]+)\s+In\s+La?cation\s+([A-Za-z0-9_-]+)/i);return m?{vn:m[1],location:m[2]}:null}
function verifyExistingVisit(data,{hn,vn,location}){
 const roots=Array.isArray(data)?data:[data?.Patient||data?.patient||data];
 for(const p of roots){if(!p||identity(p.HN||p.hn)!==identity(hn))continue;
  const visits=Array.isArray(p.Visit)?p.Visit:[];
  const v=visits.find(v=>text(v.VisitUID||v.VN||v.vn)===text(vn));if(!v)continue;
  const loc=text(v.LocationCode||v.Location?.Code||v.Location||v.locationCode);
  if(loc&&loc.toLowerCase()!==text(location).toLowerCase())continue;
  const status=text(v.Status||v.VisitStatus||v.status);if(/cancel|closed|discharg/i.test(status)||v.CancelledDate||v.cancelleddate)continue;
  return v;
 }return null;
}
module.exports={existingVisitHint,verifyExistingVisit};
