'use strict';
const DEFAULT_POLICY=Object.freeze({passwordMaxAgeDays:90,idleTimeoutMinutes:15});
function validatePolicy(value){
  if(!value||typeof value!=='object')throw new Error('กรุณาระบุนโยบายความปลอดภัย');
  const {passwordMaxAgeDays,idleTimeoutMinutes}=value;
  if(!Number.isInteger(passwordMaxAgeDays)||passwordMaxAgeDays<1||passwordMaxAgeDays>365)throw new Error('อายุรหัสผ่านต้องเป็นจำนวนเต็ม 1–365 วัน');
  if(!Number.isInteger(idleTimeoutMinutes)||idleTimeoutMinutes<1||idleTimeoutMinutes>1440)throw new Error('เวลาไม่ใช้งานต้องเป็นจำนวนเต็ม 1–1440 นาที');
  return {passwordMaxAgeDays,idleTimeoutMinutes};
}
function policyForRole(role){try{return validatePolicy(role?.securityPolicy)}catch(_){return {...DEFAULT_POLICY}}}
function passwordExpiresAt(user,role){
  const changed=Date.parse(user?.passwordChangedAt||user?.passwordResetAt||user?.firstLoginAt||user?.createdAt||'');
  return Number.isFinite(changed)?changed+policyForRole(role).passwordMaxAgeDays*86400000:0;
}
function passwordExpired(user,role,now=Date.now()){return now>=passwordExpiresAt(user,role)}
function sessionFailure(session,user,role,now=Date.now()){
  if(!session||!user||user.active===false||session.expiresAt<=now)return 'AUTH_REQUIRED';
  if(user.mustChangePassword===true||passwordExpired(user,role,now))return 'PASSWORD_EXPIRED';
  if(session.passwordHash!==String(user.passwordHash||''))return 'AUTH_REQUIRED';
  if(now-Number(session.lastActivityAt||session.createdAt||0)>=policyForRole(role).idleTimeoutMinutes*60000)return 'SESSION_IDLE';
  return '';
}
function sessionMetadata(session,user,role,now=Date.now()){
  return {policy:policyForRole(role),serverNow:now,sessionStartedAt:session.createdAt,lastActivityAt:session.lastActivityAt,passwordExpiresAt:passwordExpiresAt(user,role)};
}
// Full-state saves must not undo credential changes or overwrite a policy saved
// through the authorized endpoint with a stale browser snapshot.
function preserveSecurityFields(incoming,current){
  const roles=new Map((current.roles||[]).map(role=>[String(role.id),role]));
  for(const role of incoming.roles||[]){const saved=roles.get(String(role.id));role.securityPolicy=policyForRole(saved);}
  const users=new Map((current.users||[]).map(user=>[String(user.id),user]));
  const fields=['passwordHash','mustChangePassword','passwordChangedAt','passwordResetAt','passwordResetBy','firstLoginAt','createdAt'];
  for(const user of incoming.users||[]){const saved=users.get(String(user.id));if(!saved)continue;for(const field of fields){if(Object.prototype.hasOwnProperty.call(saved,field))user[field]=saved[field];else delete user[field];}}
}
module.exports={DEFAULT_POLICY,validatePolicy,policyForRole,passwordExpiresAt,passwordExpired,sessionFailure,sessionMetadata,preserveSecurityFields};
