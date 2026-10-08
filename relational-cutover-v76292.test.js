'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');
const server=fs.readFileSync('server.js','utf8'),app=fs.readFileSync('assets/app.js','utf8');
test('startup hydrates compact app_state before relational sync',()=>{
  assert.match(server,/const relationalSyncState=\(Array\.isArray\(stateData\.companies\).*await hydrateRelationalState\(stateData\)/s);
  assert.match(server,/syncStateToRelational\(client,relationalSyncState,revision\)/);
});
test('browser release query follows running server version without reload',()=>{
  assert.match(app,/url\.searchParams\.set\('release',release\)/);
  assert.match(app,/history\.replaceState/);
});
test('recovery restores only company customer relational tables',()=>{
  const ps=fs.readFileSync('tools/recover-company-data.ps1','utf8');
  assert.match(ps,/-t companies -t company_years -t customers -t company_customers/);
  assert.doesNotMatch(ps,/-t checkup_projects|-t checkup_bookings|-t checkup_visits/);
});
