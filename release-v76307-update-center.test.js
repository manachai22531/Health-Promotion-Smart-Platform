const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Production release identity is v7.63.07 for Update Center precheck', () => {
  const server = fs.readFileSync('server.js', 'utf8');
  assert.match(server, /RELEASE_NAME\s*=\s*['\"]v7\.63\.07-production['\"]/);
});

test('OCR and DataCenter menu icons point to requested assets', () => {
  const html = fs.readFileSync('app.html', 'utf8');
  assert.match(html, /aria-label="OCR Document"[\s\S]*?assets\/nav\/ocr-menu\.png/);
  assert.match(html, /aria-label="DataCenter"[\s\S]*?assets\/nav\/datacenter\.png/);
});
