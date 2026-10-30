/* Staff idle expiry follows real input, never polling or background requests. */
(function(){
 'use strict';
 const nativeFetch=window.fetch.bind(window);
 let user=null,startedAt=0,lastInputAt=0,offset=0,policy=null,passwordDeadline=Infinity;
 let timer=0,poll=0,pulseTimer=0,lastPulse=0,generation=0,pulsing=false;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('healthcheck.staff.activity'):null;
 const now=()=>Date.now()-offset;
 function stop(){generation++;user=null;policy=null;clearTimeout(timer);clearInterval(poll);clearTimeout(pulseTimer);timer=poll=pulseTimer=0;lastPulse=0;pulsing=false;}
 function expire(message){
  if(!user)return;stop();
  nativeFetch('/api/auth/logout',{method:'POST'}).catch(()=>{});
  document.querySelectorAll('.overlay.open').forEach(el=>el.classList.remove('open'));
  if(typeof window.expireStaffSessionForOcr==='function')window.expireStaffSessionForOcr(message);
 }
 function isExpired(){
  if(!user||!policy)return false;
  if(now()>=passwordDeadline){expire('รหัสผ่านหมดอายุ กรุณาเข้าสู่ระบบเพื่อเปลี่ยนรหัสผ่าน');return true;}
  if(now()-lastInputAt>=policy.idleTimeoutMinutes*60000){expire(`ออกจากระบบเนื่องจากไม่ได้ใช้งาน ${policy.idleTimeoutMinutes} นาที`);return true;}
  return false;
 }
 function schedule(){
  clearTimeout(timer);if(!user||!policy||isExpired())return;
  timer=setTimeout(schedule,Math.max(1,Math.min(lastInputAt+policy.idleTimeoutMinutes*60000,passwordDeadline)-now()));
 }
 function adopt(data){
  offset=Date.now()-data.serverNow;
  if(startedAt&&startedAt!==data.sessionStartedAt){expire('Session เปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่');return;}
  startedAt=data.sessionStartedAt;policy=data.policy;
  lastInputAt=Math.max(lastInputAt,data.lastActivityAt);
  passwordDeadline=Number(data.passwordExpiresAt)||Infinity;schedule();
 }
 async function sync(){
  if(!user)return;const ticket=generation;
  try{
   const response=await nativeFetch('/api/auth/session',{cache:'no-store'}),data=await response.json();
   if(ticket!==generation)return;
   if(response.status===401)return expire(data.error||'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
   if(!response.ok)return;
   if(String(data.user?.id)!==String(user.id))return expire('บัญชีที่เข้าใช้เปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่');
   adopt(data);
  }catch(_){/* Keep the local idle deadline even when the network is unavailable. */}
 }
 async function pulse(){
  pulseTimer=0;if(!user||!policy||pulsing||isExpired())return;
  const ticket=generation,idleForMs=Math.max(0,Math.round(now()-lastInputAt));
  if(idleForMs>60000)return;
  lastPulse=now();pulsing=true;
  try{
   const response=await nativeFetch('/api/auth/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idleForMs})}),data=await response.json();
   if(ticket!==generation)return;
   if(response.status===401)return expire(data.error||'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
   if(response.ok)adopt(data);
  }catch(_){}finally{if(ticket===generation)pulsing=false;}
 }
 function input(event){
  if(!event.isTrusted||!user||!policy||document.hidden||isExpired())return;
  lastInputAt=now();schedule();
  channel?.postMessage({userId:user.id,startedAt,at:lastInputAt});
  if(!pulseTimer)pulseTimer=setTimeout(pulse,Math.max(0,20000-(now()-lastPulse)));
 }
 for(const event of ['pointerdown','pointermove','keydown','wheel','touchstart'])document.addEventListener(event,input,{capture:true,passive:true});
 channel?.addEventListener('message',event=>{
  const data=event.data;
  if(!user||!policy||String(data?.userId)!==String(user.id)||data.startedAt!==startedAt||!Number.isFinite(data.at)||data.at>now()+1000||data.at<now()-policy.idleTimeoutMinutes*60000)return;
  lastInputAt=Math.max(lastInputAt,data.at);schedule();
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!isExpired())sync();});
 window.addEventListener('focus',()=>{if(!isExpired())sync();});
 window.fetch=async function(input,options){
  const response=await nativeFetch(input,options);
  if(response.status===401&&user){
   const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
   if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/auth/')){
    const data=await response.clone().json().catch(()=>({}));expire(data.error||'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
   }
  }
  return response;
 };
 window.HealthCheckAuth={
  start(nextUser){stop();user=nextUser;startedAt=lastInputAt=0;passwordDeadline=Infinity;sync();poll=setInterval(sync,30000);},
  stop,sync
 };
})();
