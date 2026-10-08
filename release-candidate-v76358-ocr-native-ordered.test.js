'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('OCR is a native application view with no iframe',()=>{
  const html=read('app.html');
  assert.match(html,/id="ocrNativeHost"/);
  assert.match(html,/assets\/ocr-native\.js\?v=7\.63\.(?:58|59)[^"']*/);
  const block=html.match(/<div class="app-view ocr-integrated-view" id="ocrView">[\s\S]*?<\/div>\s*<div class="app-view" id="interpretView">/);
  assert.ok(block,'OCR view block must exist');
  assert.doesNotMatch(block[0],/<iframe/i);
});

test('OCR navigation validates staff session and never relies on standalone page',()=>{
  const js=read('assets/app.js');
  assert.match(js,/async function openOcrViewSecure\(\)/);
  assert.match(js,/fetch\('\/api\/auth\/session'/);
  assert.match(js,/showView\('ocrView',\{ocrSessionVerified:true\}\)/);
  assert.doesNotMatch(js,/window\.location\.assign\('\/ocr-review-mockup\.html'\)/);
});

test('legacy OCR routes redirect into main application',()=>{
  const server=read('server.js');
  assert.match(server,/app\.get\('\/ocr'.*res\.redirect\(302,'\/\?view=ocr'\)/);
  assert.match(server,/app\.get\('\/ocr-review-mockup\.html'.*res\.redirect\(302,'\/\?view=ocr'\)/);
});

test('OCR workspace keeps clear three-column hierarchy and v7.63.58 version',()=>{
  const native=read('assets/ocr-native.js');
  const pkg=JSON.parse(read('package.json'));
  assert.match(native,/grid-template-columns:minmax\(190px,22fr\) minmax\(320px,36fr\) minmax\(430px,42fr\)/);
  assert.match(native,/OCR ที่เลือก/);
  assert.match(native,/OCR ทั้งหมด/);
  assert.match(native,/OCR เอกสารนี้/);
  assert.ok(Number(pkg.version.split('.').at(-1))>=58);
  assert.ok(/^v7\.63\.(?:5[8-9]|[6-9]\d)$/.test(read('VERSION.txt').trim()));
});
