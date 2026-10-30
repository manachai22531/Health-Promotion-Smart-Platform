'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const server=fs.readFileSync('server.js','utf8');
const app=fs.readFileSync('assets/app.js','utf8');
const html=fs.readFileSync('app.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

test('release identity and browser cache key are v7.64.63',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.64\.63-production'/);
  assert.equal(pkg.version,'7.64.63');
  assert.match(html,/assets\/app\.js\?v=7\.64\.63-performance/);
});

test('production responses use compression and version-aware asset caching',()=>{
  assert.match(server,/require\('compression'\)/);
  assert.match(server,/app\.use\(compression\(\{threshold:1024\}\)\)/);
  assert.match(server,/max-age=31536000, immutable/);
  assert.match(server,/max-age=3600/);
});

test('state response is coalesced and cached as JSON and gzip per revision',()=>{
  assert.match(server,/async function buildStateResponse\(revision\)/);
  assert.match(server,/stateResponseBuild\?\.revision===revision/);
  assert.match(server,/jsonBody=Buffer\.from\(JSON\.stringify\(wireState\)\)/);
  assert.match(server,/return res\.send\(cached\.jsonBody\)/);
});

test('auto refresh is slower, jittered, and pauses in hidden tabs',()=>{
  assert.match(app,/document\.hidden/);
  assert.match(app,/20000\+Math\.floor\(Math\.random\(\)\*5000\)/);
  assert.match(app,/visibilitychange/);
  assert.doesNotMatch(app,/setInterval\(runAutoRefresh,5000\)/);
});
