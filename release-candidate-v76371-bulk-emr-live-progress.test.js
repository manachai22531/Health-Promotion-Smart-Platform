'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.71 has blocking live bulk EMR modal',()=>{
  const html=read('app.html'),js=read('assets/app.js'),css=read('assets/style.css');
  assert.match(html,/id="projectBulkEmrOverlay"/);
  assert.match(html,/id="projectBulkEmrLogRows"/);
  assert.match(js,/projectBulkEmrOpen\(projects,estimated\)/);
  assert.match(js,/projectBulkEmrRun\?\.running/);
  assert.match(js,/projectBulkEmrLog\(/);
  assert.match(css,/\.project-bulk-emr-dialog\{width:min\(1180px/);
});

test('v7.63.71 compact project EMR leaves more room for remarks',()=>{
  const js=read('assets/app.js'),css=read('assets/style.css');
  assert.match(js,/function workflowProjectCompactEmrHtml/);
  assert.match(js,/workflowProjectCompactEmrHtml\(p\)/);
  assert.match(css,/workflow-project-emr-cell\{width:170px;min-width:170px;max-width:170px\}/);
  assert.match(css,/workflow-project-note-inline\{flex:1 1 220px;max-width:none/);
});

test('v7.63.71 version/cache key updated',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'7.63.71');
  assert.equal(read('VERSION.txt').trim(),'v7.63.71');
  assert.match(read('app.html'),/7\.63\.71-bulk-emr-live-progress/);
});

test('v7.63.71 remains production-only and Update Center compatible',()=>{
  const server=read('server.js');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.71-production'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  for(const file of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat'])assert.ok(fs.existsSync(path.join(root,file)),file+' missing at ZIP root');
});
