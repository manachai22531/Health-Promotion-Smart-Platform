'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('search page separates name, identity and HN',()=>{
  const html=fs.readFileSync('app.html','utf8'),flow=fs.readFileSync('assets/flow-v76384.js','utf8'),server=fs.readFileSync('server.js','utf8');
  assert.match(html,/id="searchName"/);assert.match(html,/id="searchIdentity"/);assert.match(html,/id="searchHn"/);
  assert.match(flow,/name:nameRaw,identity:identityRaw,hn:hnRaw/);
  assert.match(server,/nameText=String\(req\.query\.name/);assert.match(server,/identityText=String\(req\.query\.identity/);assert.match(server,/hnText=String\(req\.query\.hn/);
});
