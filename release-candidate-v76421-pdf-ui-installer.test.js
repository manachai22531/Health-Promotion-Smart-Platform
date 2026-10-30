'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.64.21 versions agree across runtime and installer',()=>{
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version,'7.64.21');
  assert.equal(lock.version,'7.64.21');
  assert.equal(lock.packages[''].version,'7.64.21');
  assert.equal(read('VERSION.txt').trim(),'v7.64.21');
  assert.match(read('server.js'),/const RELEASE_NAME = 'v7\.64\.21-production'/);
  assert.match(read('tools/production-installer-gui.ps1'),/v7\.64\.21 PRODUCTION/);
  assert.match(read('tools/production-installer-worker.ps1'),/v7\.64\.21/);
});

test('live Corporate preview requires Word renderer and server advertises it',()=>{
  const app=read('assets/app.js'),server=read('server.js');
  assert.match(app,/X-HealthCheck-Circular-Layout/);
  assert.match(app,/word-table-v1/);
  assert.match(app,/Never load them into the LIVE preview iframe/);
  assert.match(server,/'X-HealthCheck-Circular-Layout':'word-table-v1'/);
});

test('section 12 matrix PDF is monochrome and redundant numbered title is not drawn',()=>{
  const s=read('company-program-matrix.js');
  assert.match(s,/const black=rgb\(0,0,0\),grid=rgb\(0,0,0\),white=rgb\(1,1,1\)/);
  assert.doesNotMatch(s,/text\(page,'12 ตารางโปรแกรมตรวจสุขภาพ'/);
  assert.doesNotMatch(s,/choice==='na'\?gray/);
  assert.match(s,/choice==='na'\)lines\(page,'X'/);
  assert.doesNotMatch(s,/\bpale\b/);
  assert.doesNotMatch(s,/\bblue\b/);
});

test('section 13 PDF is monochrome and no numbered page title is rendered',()=>{
  const s=read('corporate-circular-pdf.js');
  assert.match(s,/strict black\/white/);
  assert.match(s,/const ink=rgb\(0,0,0\),white=rgb\(1,1,1\),line=rgb\(0,0,0\)/);
  assert.doesNotMatch(s,/p\.drawText\(title,/);
  assert.match(s,/color:white,borderColor:line/);
  assert.doesNotMatch(s,/i===1\?soft:white/);
});

test('billing delete icon matches cash delete icon red borderless style',()=>{
  const css=read('assets/style.css');
  assert.match(css,/remove-cash-package, \.cash-package-row \.remove-billing-package/);
  assert.match(css,/#companyOverlay \.cash-package-row \.remove-billing-package,#companyOverlay \.cash-package-row \.remove-cash-package\{border:0!important/);
});

test('annual Payor fields display names but save code-only values',()=>{
  const app=read('assets/app.js');
  assert.match(app,/payorCode:masterSelectedCode\(raw\.payorCode\)/);
  assert.match(app,/payorPlan:masterSelectedCode\(raw\.payorPlan\)/);
  assert.match(app,/masterDisplay\(x\.code,x\.name\)/);
  assert.match(app,/masterDisplay\(x\.plan_code,x\.plan_name\)/);
  assert.match(app,/resolveAnnualPayorNamesV76421/);
});

test('installer validation allows slow production startup and GUI uses literal status path',()=>{
  const installer=read('tools/install.ps1'),gui=read('tools/production-installer-gui.ps1');
  assert.match(installer,/\$attempt -lt 180/);
  assert.match(installer,/did not respond within 90 seconds/);
  assert.match(gui,/Test-Path -LiteralPath \$statusFile -PathType Leaf/);
  assert.match(gui,/Set-Location -LiteralPath \$runtimeRoot/);
});
