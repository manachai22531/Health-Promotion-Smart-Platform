'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const helper=fs.readFileSync('tools/app-update-helper.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const updater=require('./tools/app-update-helper');

test('v7.63.44+ release identity is production only',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.(?:4[4-9]|[5-9]\d)-production'/);
  assert.match(server,/const RUNTIME_ENVIRONMENT = 'production'/);
});

test('STOP kills only the exact production PID and never the process tree',()=>{
  const stop=helper.match(/async function stopServer[\s\S]*?function migrationFiles/)[0];
  assert.match(stop,/taskkill\.exe',\['\/PID',String\(targetPid\),'\/F'\]/);
  assert.doesNotMatch(stop,/'\/T'/);
  assert.match(stop,/targetPid===process\.pid/);
  assert.match(stop,/helperPid:process\.pid/);
  assert.match(stop,/process-tree kill disabled/);
});

test('timeout cleanup may still terminate child command trees without changing STOP behavior',()=>{
  assert.match(helper,/function terminate\(cp\)[\s\S]*?'\/T','\/F'/);
});

test('updater semantic version comparison rejects lower minor versions',()=>{
  assert.equal(updater.newer('v7.63.44','v7.63.43'),true);
  assert.equal(updater.newer('v7.62.99','v7.63.1'),false);
  assert.equal(updater.newer('v8.0.0','v7.99.99'),true);
  assert.equal(updater.newer('v7.63.44','v7.63.44'),false);
});
