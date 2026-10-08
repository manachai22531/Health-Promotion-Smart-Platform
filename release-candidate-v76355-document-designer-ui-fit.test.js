const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const css = fs.readFileSync(path.join(root, 'assets', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('v7.63.55 metadata and cache busting', () => {
  assert.equal(pkg.version, '7.63.55');
  assert.match(html, /style\.css\?v=7\.63\.55-document-designer-fit/);
  assert.match(html, /app\.js\?v=7\.63\.55-document-designer-fit/);
});

test('native document template file input remains hidden', () => {
  assert.match(css, /\.document-upload-button input\[type="file"\][\s\S]*?display:none!important/);
  assert.match(css, /\.document-upload-button\{[\s\S]*?min-height:40px!important/);
});

test('field palette is constrained to left document panel', () => {
  assert.match(css, /body\.document-workspace-active #documentView \.document-palette\{[\s\S]*?overflow:hidden!important/);
  assert.match(css, /#documentFieldPalette\{[\s\S]*?flex:1 1 auto!important[\s\S]*?overflow-y:auto!important/);
});

test('document designer columns can shrink inside viewport', () => {
  assert.match(css, /grid-template-columns:280px minmax\(0,1fr\) 300px!important/);
  assert.match(css, /\.document-canvas-panel #documentCanvasViewport\{[\s\S]*?overflow:auto!important/);
});
