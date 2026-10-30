'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {authenticationAudit}=require('./login-history');
test('authentication audit records only approved identity fields and never credentials',()=>{
  const info=authenticationAudit({path:'/api/auth/login',body:{password:'secret'},loginAudit:{username:'admin',displayName:'Admin',roleId:'admin',roleName:'Admin',outcome:'SUCCESS',password:'secret',passwordHash:'hash',changeToken:'token'}},200);
  assert.deepEqual(Object.keys(info).sort(),['username','displayName','roleId','roleName','outcome','reason'].sort());
  assert(!JSON.stringify(info).includes('secret'));assert(!JSON.stringify(info).includes('hash'));assert(!JSON.stringify(info).includes('token'));
  assert.equal(authenticationAudit({path:'/api/auth/activity'},200),null);
});
test('login outcome distinguishes challenge, failure, throttle and server error',()=>{
  assert.equal(authenticationAudit({path:'/api/auth/login',loginAudit:{outcome:'PASSWORD_CHANGE_REQUIRED'}},200).outcome,'PASSWORD_CHANGE_REQUIRED');
  for(const [status,outcome] of [[401,'FAILED'],[429,'RATE_LIMITED'],[500,'ERROR']])assert.equal(authenticationAudit({path:'/api/auth/login',loginAudit:{outcome:'SUCCESS'}},status).outcome,outcome);
  assert.equal(authenticationAudit({path:'/api/auth/login'},200).outcome,'LEGACY');
});
