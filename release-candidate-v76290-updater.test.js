'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const helper=fs.readFileSync(path.join(root,'tools','app-update-helper.js'),'utf8');
const app=fs.readFileSync(path.join(root,'assets','app.js'),'utf8');

test('updater retries spawn EINVAL through shell',()=>{
  assert.match(helper,/code==='EINVAL'/);
  assert.match(helper,/shell:true/);
});

test('updater prefers node npm-cli over npm.cmd',()=>{
  assert.match(helper,/npm-cli\.js/);
  assert.match(helper,/process\.execPath,\[npmCli/);
});

test('rollback requires completed source backup',()=>{
  assert.match(helper,/backupReady=false/);
  assert.match(helper,/backupReady=true/);
  assert.match(helper,/if\(backupReady&&backup&&exists\(backup\)\)/);
});

test('failed update strip uses failedPhase',()=>{
  assert.match(app,/status\.failedPhase\|\|'PRECHECK'/);
});
