'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('daily case summary contains no pending confirmation UI',()=>{
  const html=fs.readFileSync('app.html','utf8'),app=fs.readFileSync('assets/app.js','utf8');
  assert.doesNotMatch(html,/todayCasePending|todayPendingToggle/);
  assert.doesNotMatch(app,/todayOnlyPending|todayCasePending|todayPendingToggle/);
  assert.match(app,/const completedAt=record\.visitedAt/);
});
