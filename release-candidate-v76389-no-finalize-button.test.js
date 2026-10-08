'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('A4 summary never exposes the legacy finalize/save button',()=>{
  const flow=fs.readFileSync('assets/flow-v76384.js','utf8');
  assert.match(flow,/syncCheckupWorkflowButtonsWithoutFinalize/);
  assert.match(flow,/finalize\.hidden=true;finalize\.disabled=true/);
});
