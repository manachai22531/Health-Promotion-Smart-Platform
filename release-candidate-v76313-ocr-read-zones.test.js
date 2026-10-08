const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v7.63.13 retains production OCR read zones',()=>{
  const server=fs.readFileSync('server.js','utf8');
  const html=fs.readFileSync('ocr-review-mockup.html','utf8');
  const css=fs.readFileSync('assets/style.css','utf8');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.13-production'/);
  assert.match(html,/PRODUCTION OCR · HUMAN REVIEW/);
  assert.match(html,/id="zoneFieldSelect"/);
  assert.match(html,/function recognizeConfiguredZones/);
  assert.match(html,/function startZoneDrawing/);
  assert.match(html,/documentProfiles/);
  assert.match(html,/ocr-zone-layer/);
  assert.match(css,/customer-list-page-actions/);
  assert.match(css,/min-height:118px!important/);
  assert.match(css,/customer-list-page-badge\{display:none!important\}/);
});

test('read zones remain isolated in OCR setup profile',()=>{
  const server=fs.readFileSync('server.js','utf8');
  assert.match(server,/documentProfiles:value\.documentProfiles/);
  assert.match(server,/ocr_setup_profiles/);
  assert.doesNotMatch(server,/app\.put\('\/api\/ocr\/setup'[\s\S]{0,1800}(?:UPDATE|INSERT INTO)\s+(?:patients?|lab_results?)/i);
});
