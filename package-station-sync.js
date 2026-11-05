'use strict';
// Share concurrent compatibility migrations and retry failures on the next request.
function makeStationSync(run,{now=Date.now,ttlMs=30000}={}) {
 let pending=null,validUntil=0;
 return function sync(){
  if(pending)return pending;
  if(now()<validUntil)return Promise.resolve();
  pending=Promise.resolve().then(run).then(()=>{validUntil=now()+ttlMs}).finally(()=>{pending=null});
  return pending;
 };
}
module.exports={makeStationSync};
