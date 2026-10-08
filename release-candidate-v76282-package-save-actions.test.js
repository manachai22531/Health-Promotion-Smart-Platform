const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const app=fs.readFileSync(path.join(root,'assets','app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'app.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets','style.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');

test('customer package save buttons exist',()=>{
  assert.match(html,/id="saveCustomerPackages"/);
  assert.match(html,/id="saveCustomerPackageSettings"/);
});

test('package settings use delegated dynamic change tracking',()=>{
  assert.match(app,/document\.addEventListener\('change'[\s\S]*?#customerHisPackage \[data-package-station-item\]/);
  assert.match(app,/collectPackageSettingsDraftsFromDomV76282/);
  assert.match(app,/data-current-type=/);
});

test('save actions are delegated and result dialog is visible',()=>{
  assert.match(app,/delegated capture binding/);
  assert.match(app,/savePrimaryPackageOnlyV76278\(\)/);
  assert.match(app,/savePackageTypeStationOnlyV76278\(\)/);
  assert.match(css,/\.save-result-dialog\{position:fixed/);
  assert.match(css,/\.save-result-dialog\[hidden\]\{display:none!important\}/);
});

test('package type and station save remains transactional',()=>{
  assert.match(server,/app\.patch\('\/api\/package-item-settings\/batch'/);
  const p=server.indexOf("app.patch('/api/package-item-settings/batch'");
  const q=server.indexOf("app.patch('/api/package-item-stations/batch'",p);
  const block=server.slice(p,q>p?q:p+12000);
  assert.match(block,/client\.query\('BEGIN'\)/);
  assert.match(block,/client\.query\('COMMIT'\)/);
  assert.match(block,/client\.query\('ROLLBACK'\)/);
});
