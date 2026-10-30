const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('app.html','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');

test('search page no longer contains the TOP 5 sales box',()=>{
  assert.doesNotMatch(html,/id="salesRankingRail"/);
  assert.doesNotMatch(html,/id="topContractPackages"/);
});

test('user management uses full-width task tabs and keeps existing actions',()=>{
  for(const token of ['data-permission-tab="users"','data-permission-tab="roles"','id="openHisRoleMapping"','id="openPermissionAudit"','id="syncHisUsers"','id="setFirstLoginPassword"','id="addUser"']) assert.match(html,new RegExp(token));
  assert.match(css,/full-width task tabs/);
  assert.match(js,/document\.querySelectorAll\('\[data-permission-tab\]'\)/);
});

test('summary KPIs and compact grouped user rows are wired',()=>{
  for(const id of ['permissionKpiTotal','permissionKpiActive','permissionKpiRoles','permissionKpiUnmapped']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/permission-user-org-v76430/);
  assert.match(js,/permissionKpiUnmapped/);
});

test('release identity is v7.64.30 production',()=>{
  assert.match(fs.readFileSync('package.json','utf8'),/"version": "7\.64\.30"/);
  assert.match(fs.readFileSync('server.js','utf8'),/v7\.64\.30-production/);
});
