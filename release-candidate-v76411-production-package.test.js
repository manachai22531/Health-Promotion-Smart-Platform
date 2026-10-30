'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root,name), 'utf8');

test('Production version is aligned across web, Node, package and installer',()=>{
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  const server=read('server.js');
  const html=read('app.html');
  const installer=read('tools/production-installer-worker.ps1');
  assert.match(pkg.version,/^7\.64\.(?:1[1-9]|[2-9]\d)$/);
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(read('VERSION.txt').trim(),'v'+pkg.version);
  assert.ok(server.includes(`const RELEASE_NAME = 'v${pkg.version}-production'`));
  assert.ok(html.includes(`assets/style.css?v=${pkg.version}-`));
  assert.ok(html.includes(`assets/app.js?v=${pkg.version}-`));
  assert.match(installer,/Payload version mismatch: installer=/);
});

test('Production boundaries remain fixed and updater is retained',()=>{
  const server=read('server.js');
  const worker=read('tools/production-installer-worker.ps1');
  assert.match(server,/const PRODUCTION_PORT = 3000;/);
  assert.match(server,/const PRODUCTION_DATABASE = 'health_check_smart_search'/);
  assert.match(server,/app\.post\('\/api\/system\/update\/upload'/);
  assert.match(worker,/\$targetRoot='D:\\HealthCheck\\Production'/);
  assert.match(worker,/\$port=3000/);
  for(const required of ['tools/app-update-helper.js','tools/production-installer-gui.ps1','tools/deploy-environment.ps1','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,required)),required);
});

test('Full Worklist, section 09 and subsidiary PDF patches are present together',()=>{
  const js=read('assets/app.js');
  const css=read('assets/style.css');
  const pdf=read('corporate-circular-pdf.js');
  assert.match(css,/#worklistView\.workspace-fullpage \.workflow-table-card\.worklist-new-layout\{\s*display:grid!important/);
  assert.match(js,/bindMatrixV76399\(\)/);
  assert.match(pdf,/appendAnnualCircularSections\(pdf,font,company,d/);
  assert.match(pdf,/drawProgramMatrixPages\(pdf,font,company,d\.programMatrix/);
  assert.match(read('corporate-circular-sections.js'),/1\.\$\{i\+1\}/);
});
