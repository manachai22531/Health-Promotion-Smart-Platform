'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validatePolicy,policyForRole,passwordExpiresAt,passwordExpired,sessionFailure,preserveSecurityFields}=require('./security-policy');
const now=Date.parse('2026-10-22T04:00:00Z');
const user={id:'fixture-user',active:true,passwordHash:'fixture-hash',passwordChangedAt:new Date(now-86400000).toISOString()};
const role={securityPolicy:{passwordMaxAgeDays:90,idleTimeoutMinutes:15}};
const session=()=>({createdAt:now,lastActivityAt:now,expiresAt:now+43200000,passwordHash:user.passwordHash});
test('default and per-role policies validate integer bounds',()=>{
 assert.deepEqual(policyForRole({}),{passwordMaxAgeDays:90,idleTimeoutMinutes:15});
 assert.deepEqual(policyForRole({securityPolicy:{passwordMaxAgeDays:45,idleTimeoutMinutes:30}}),{passwordMaxAgeDays:45,idleTimeoutMinutes:30});
 for(const value of [{passwordMaxAgeDays:0,idleTimeoutMinutes:15},{passwordMaxAgeDays:366,idleTimeoutMinutes:15},{passwordMaxAgeDays:90,idleTimeoutMinutes:0},{passwordMaxAgeDays:90,idleTimeoutMinutes:1441},{passwordMaxAgeDays:90,idleTimeoutMinutes:1.5}])assert.throws(()=>validatePolicy(value));
});
test('password expiry is computed from the last change, with safe legacy fallback',()=>{
 assert.equal(passwordExpiresAt(user,role),now+89*86400000);
 assert.equal(passwordExpired(user,role,now+89*86400000),true);
 assert.equal(passwordExpired({...user,passwordChangedAt:'',createdAt:new Date(now-91*86400000).toISOString()},role,now),true);
 assert.equal(passwordExpired({passwordHash:'legacy'},role,now),true);
});
test('session expires at exactly the role idle boundary, regardless of keep-signed-in TTL',()=>{
 for(const ttl of [43200000,2592000000]){
  const s={...session(),expiresAt:now+ttl};
  assert.equal(sessionFailure(s,user,role,now+15*60000-1),'');
  assert.equal(sessionFailure(s,user,role,now+15*60000),'SESSION_IDLE');
 }
});
test('a role change applies to an already-open session',()=>{
 assert.equal(sessionFailure(session(),user,{securityPolicy:{passwordMaxAgeDays:90,idleTimeoutMinutes:30}},now+20*60000),'');
 assert.equal(sessionFailure(session(),user,role,now+20*60000),'SESSION_IDLE');
 assert.equal(sessionFailure(session(),user,{securityPolicy:{passwordMaxAgeDays:1,idleTimeoutMinutes:15}},now),'PASSWORD_EXPIRED');
});
test('forced change, disabled accounts, changed credentials and absolute session expiry are enforced',()=>{
 assert.equal(sessionFailure(session(),{...user,mustChangePassword:true},role,now),'PASSWORD_EXPIRED');
 assert.equal(sessionFailure(session(),{...user,active:false},role,now),'AUTH_REQUIRED');
 assert.equal(sessionFailure(session(),{...user,passwordHash:'replacement'},role,now),'AUTH_REQUIRED');
 assert.equal(sessionFailure({...session(),expiresAt:now},user,role,now),'AUTH_REQUIRED');
});
test('full-state saves cannot extend password age or overwrite role security policy',()=>{
 const current={users:[user],roles:[{id:'fixture-role',...role}]};
 const incoming={users:[{...user,passwordChangedAt:'9999-01-01',passwordHash:'tampered',mustChangePassword:false}],roles:[{id:'fixture-role',securityPolicy:{passwordMaxAgeDays:365,idleTimeoutMinutes:1440}}]};
 preserveSecurityFields(incoming,current);
 assert.equal(incoming.users[0].passwordChangedAt,user.passwordChangedAt);
 assert.equal(incoming.users[0].passwordHash,user.passwordHash);
 assert.equal('mustChangePassword' in incoming.users[0],false);
 assert.deepEqual(incoming.roles[0].securityPolicy,role.securityPolicy);
});
