const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const server=fs.readFileSync('server.js','utf8');

test('OCR participates in menu ordering',()=>{
  assert.match(html,/data-nav-id="ocrDocument"[^>]*href="\/ocr-review-mockup\.html"/);
  assert.match(js,/function navMenuItemId\(button\)/);
  assert.match(js,/navMenuItems\(\)\.map\(navMenuItemId\)/);
});

test('Vimut logo toggles sidebar',()=>{
  assert.match(html,/id="appMenuToggle"/);
  assert.match(html,/id="appMenuSidebar"/);
  assert.match(js,/function openAppMenuSidebar\(\)/);
  assert.match(js,/function closeAppMenuSidebar\(\)/);
  assert.match(css,/\.app-menu-sidebar\{/);
});

test('release identity is v7.63.08',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.08-production'/);
});
