const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('app.html','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const server=fs.readFileSync('server.js','utf8');

test('release identity is v7.63.13 production',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.13-production'/);
  assert.match(html,/style\.css\?v=7\.63\.13-global-version-safe/);
});

test('version is rendered inline in topbar and remains available in sidebar',()=>{
  assert.match(html,/class="app-version-inline"[^>]*>[\s\S]*?data-app-version/);
  assert.match(html,/class="app-menu-sidebar-version"[\s\S]*?data-app-version/);
});

test('legacy floating version badge is disabled globally',()=>{
  assert.match(css,/\/\* v7\.63\.13 — GLOBAL VERSION SAFE AREA/);
  assert.match(css,/\.app-version-corner\{\s*display:none!important;\s*\}/);
});

test('inline version yields space on narrow screens',()=>{
  assert.match(css,/@media\(max-width:1280px\)\{\s*\.app-version-inline\{display:none!important\}/);
});
