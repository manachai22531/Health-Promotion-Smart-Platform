'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const fileHash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');

test('release v7.64.20 agrees across server, GUI worker, npm and version stamp',()=>{
  const pkg=JSON.parse(read('package.json'));const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version,'7.64.20');assert.equal(lock.version,'7.64.20');assert.equal(lock.packages[''].version,'7.64.20');
  assert.equal(read('VERSION.txt').trim(),'v7.64.20');
  assert.match(read('server.js'),/const RELEASE_NAME = 'v7\.64\.20-production'/);
  assert.match(read('tools/production-installer-gui.ps1'),/\$version='v7\.64\.20 PRODUCTION'/);
  assert.match(read('tools/production-installer-worker.ps1'),/\$version='v7\.64\.20'/);
  assert.match(read('tools/production-installer-worker.ps1'),/Payload version mismatch/);
  assert.match(read('tools/production-installer-worker.ps1'),/\$releaseMatch\.Groups\[1\]\.Value -ne \$expectedRelease/);
});
test('Production Only Windows target and database, safety/backups retained',()=>{
  const worker=read('tools/production-installer-worker.ps1');
  assert.match(worker,/\$targetRoot='D:\\HealthCheck\\Production'/);
  assert.match(worker,/\$port=3000/);
  assert.match(worker,/health_check_smart_search/);
  assert.match(worker,/New-StagedPayload/);
  assert.match(worker,/Preflight/);
  assert.match(worker,/Wait-Health/);
  const installer=read('tools/deploy-environment.ps1');
  assert.match(installer,/sourceBackup/);assert.match(installer,/\.env/);
});
test('browser files have v7.64.20 cache keys and Word mockup form remains in place',()=>{
  const html=read('app.html');
  for(const asset of ['style.css','global-ui-density.css','app.js','global-ui-density.js'])
    assert.match(html,new RegExp(asset.replace(/\./g,'\\.')+'\\?v=7\\.64\\.20-production-word-pdf'));
  for(const s of ['annual-v76419-company-fields','data-circular-subsection="02"','data-circular-subsection="03"','data-circular-subsection="04"','Payor Code','Payor Plan','เลขที่ผู้เสียภาษี']) assert.ok(html.includes(s),s);
});
test('Word-style corporate PDF continuous table merges Payor and aligns tax ID and address',()=>{
  const code=read('corporate-circular-sections.js');
  assert.match(code,/continuous compact A4 Word-table layout/);
  assert.match(code,/const widths=\[103\.8,257\.3,65\.0,TABLE_WIDTH-426\.1\]/);
  assert.match(code,/pair\('ชื่อบริษัท \(ภาษาไทย\)',company\.name,'Payor Code'/);
  assert.match(code,/pair\('ชื่อบริษัท \(ภาษาอังกฤษ\)',data\.companyNameEn,'Payor Plan'/);
  assert.match(code,/field\('เลขที่ผู้เสียภาษี',data\.taxId\)/);
  assert.match(code,/field\('ที่อยู่บริษัท',data\.address\)/);
  assert.match(code,/contactRow\(/);
  assert.match(code,/programRows\('โปรแกรมพนักงาน'/);
  assert.doesNotMatch(code,/01  ข้อมูลบริษัท|สีฟ้า/);
});
test('PDF exporter retains real program matrix only when present and returns saved PDF buffer',()=>{
  const code=read('corporate-circular-pdf.js');
  assert.match(code,/appendAnnualCircularSections\(/);
  assert.match(code,/if\(hasMatrix\)/);
  assert.match(code,/Buffer\.from\(await pdf\.save\(\)\)/);
  assert.match(code,/Array\.isArray\(company\.billingPackages\)/);
});
test('source hash lists are complete and accurate, no .env file packaged',()=>{
  const sources=read('SOURCE-SHA256.txt').trim().split(/\r?\n/);
  const outer=read('SOURCE-MANIFEST-SHA256.txt').trim().split(/\r?\n/);
  assert.ok(sources.length>=400);
  assert.equal(outer.length,sources.length+5);
  assert.ok(!sources.some(line=>/\.env(?:\s|$)/i.test(line)));
  for(const line of outer){const match=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(match,line);const target=path.join(root,match[2]);assert.ok(fs.existsSync(target),match[2]);assert.equal(fileHash(match[2]),match[1],match[2]);}
  assert.ok(!outer.some(line=>line.includes('  SOURCE-MANIFEST-SHA256.txt')));
});
