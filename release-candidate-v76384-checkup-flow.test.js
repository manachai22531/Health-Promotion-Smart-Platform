'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v7.63.84 defaults extras, removes finalize step and splits Worklist',()=>{
  const flow=fs.readFileSync('assets/flow-v76384.js','utf8');
  const html=fs.readFileSync('app.html','utf8');
  assert.match(flow,/billingPicker input\[type="checkbox"\].*cashPicker/s);
  assert.match(flow,/record\.visitedAt=createdAt/);
  assert.match(flow,/finalize\.hidden=true/);
  assert.match(html,/id="worklistPendingCount"/);
  assert.match(html,/id="worklistPendingRows"/);
});

test('Thai person search cannot match every blank HN',()=>{
  const server=fs.readFileSync('server.js','utf8');
  assert.ok(server.includes("regexp_replace($${n},'[^A-Za-z0-9]','','g')<>''"));
});
