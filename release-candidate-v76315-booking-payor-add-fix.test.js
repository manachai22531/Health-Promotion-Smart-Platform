
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('assets/app.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const html=fs.readFileSync('app.html','utf8');

test('release identity is v7.63.15 production',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.15-production'/);
  assert.match(html,/app\.js\?v=7\.63\.15-booking-payor-add-fix/);
});

test('Payor search extracts code from Code - Name before searching',()=>{
  assert.match(js,/const raw=String\(input\.value\|\|''\)\.trim\(\),q=masterSelectedCode\(raw\)/);
  assert.match(js,/his-payors\?type=payor&q=\$\{encodeURIComponent\(q\)\}/);
});

test('Add Payor validates Payor Agreement Office using codes',()=>{
  assert.match(js,/payorCode=masterSelectedCode\(input\?\.value\)/);
  assert.match(js,/planCode=masterSelectedCode\(\$\('#projectPayorPlanInput'\)\?\.value\)/);
  assert.match(js,/officeCode=masterSelectedCode\(\$\('#projectPayorOfficeInput'\)\?\.value\)/);
  assert.match(js,/\/api\/his-payors\/selection\?payorCode=/);
  assert.match(js,/String\(x\.office_code\|\|''\)\.trim\(\)===officeCode/);
  assert.match(js,/return oldAdd\?\.\(\)/);
});

test('Existing Payor catalog response compatibility remains',()=>{
  assert.match(js,/x\.code\|\|x\.payor_code/);
  assert.match(js,/x\.name\|\|x\.payor_name/);
});
