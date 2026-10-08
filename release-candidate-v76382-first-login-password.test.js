const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');
const app = fs.readFileSync('assets/app.js', 'utf8');
const html = fs.readFileSync('app.html', 'utf8');

test('HIS users receive configured first-login password and force-change flag', () => {
  assert.match(server, /firstLoginPasswordHash/);
  assert.match(server, /mustChangePassword:Boolean\(firstLoginHash\)/);
});

test('login does not create a staff session until first password is changed', () => {
  assert.match(server, /if\(user\.mustChangePassword===true\)/);
  assert.match(server, /\/api\/auth\/change-first-password/);
  assert.match(server, /firstLoginTokens/);
});

test('administrator can set and bulk reset the shared first-login password', () => {
  assert.match(server, /\/api\/users\/first-login-password/);
  assert.match(app, /setFirstLoginPassword/);
  assert.match(app, /selectedUserIdsV76375/);
});

test('forced password change UI has no close or cancel action', () => {
  const overlay = html.match(/<div aria-hidden="true" class="overlay" id="firstLoginChangeOverlay">([\s\S]*?)<div aria-hidden="true" class="overlay" id="passwordResetOverlay">/)?.[1] || '';
  assert.match(overlay, /saveFirstLoginPassword/);
  assert.doesNotMatch(overlay, /data-close=/);
  assert.doesNotMatch(overlay, /ยกเลิก/);
});
