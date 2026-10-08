'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('Age is recalculated from BirthDate immediately and after HIS data is applied',()=>{
  const flow=fs.readFileSync('assets/flow-v76384.js','utf8');
  assert.match(flow,/const ageFromBirthDate=value=>/);
  assert.match(flow,/age\.readOnly=true/);
  assert.match(flow,/birth\.addEventListener\('input',syncDetailAge\)/);
  assert.match(flow,/applyPatientData=function\(\).*syncDetailAge\(\)/s);
});
