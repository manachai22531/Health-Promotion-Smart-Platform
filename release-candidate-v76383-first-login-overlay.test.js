const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('assets/style.css', 'utf8');
const html = fs.readFileSync('app.html', 'utf8');

test('first-login password dialog stacks above login screen', () => {
  const loginZ = Number(css.match(/\.auth-screen\s*\{[^}]*z-index:\s*(\d+)/s)?.[1] || 0);
  const firstLoginZ = Number(css.match(/#firstLoginChangeOverlay\s*\{[^}]*z-index:\s*(\d+)/s)?.[1] || 0);
  assert.ok(loginZ > 0);
  assert.ok(firstLoginZ > loginZ, `first-login z-index ${firstLoginZ} must exceed login z-index ${loginZ}`);
  assert.match(html, /id="firstLoginChangeOverlay"/);
});
