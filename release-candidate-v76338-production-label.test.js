'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');
test('release is v7.63.44 production',()=>assert.match(server,/RELEASE_NAME = 'v7\.63\.44-production'/));
test('Update Center identifies the live Production Server without staging wording',()=>{
  assert.match(html,/Production Server จริง · D:\\HealthCheck\\Production/);
  assert.match(html,/กำลังใช้งานบน Production Server จริง/);
  assert.doesNotMatch(html,/ถูกปิดบน staging/i);
});
