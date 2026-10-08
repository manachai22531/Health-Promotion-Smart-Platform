
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('v7.63.09 customer list is a full-page workspace', () => {
  const html = fs.readFileSync('app.html','utf8');
  const css = fs.readFileSync('assets/style.css','utf8');
  const server = fs.readFileSync('server.js','utf8');
  assert.match(html, /id="customerListOverlay"/);
  assert.match(html, /customer-list-page-overlay/);
  assert.match(html, /customer-list-page-header/);
  assert.match(html, /← กลับหน้าบริษัท/);
  assert.match(css, /#customerListOverlay\.customer-list-page-overlay\.open\{display:block!important\}/);
  assert.match(css, /width:100vw!important/);
  assert.match(css, /height:100vh!important/);
  assert.match(server, /v7\.63\.09-production/);
});
