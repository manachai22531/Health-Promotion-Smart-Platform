'use strict';
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const NEW_HASH = '85dd2de461d3cc8e';
const OLD_HASH = '3f708bf99ab7e362';

test('release keeps the v7.63.81 administrator password baseline', () => {
  assert.match(read('VERSION.txt').trim(), /^v7\.(?:63\.(?:8[1-9]|9\d)|64\.\d+)$/);
  assert.match(require('./package.json').version, /^7\.(?:63\.(?:8[1-9]|9\d)|64\.\d+)$/);
});

test('runtime source no longer contains the legacy plaintext default password', () => {
  for (const file of ['server.js','assets/app.js','tools/repair-admin.js']) {
    const legacyPlaintext=['admin','123'].join('');
    assert.equal(read(file).includes(legacyPlaintext), false, `${file} still exposes legacy default password`);
  }
});

test('server fallback and startup migration use the new administrator hash', () => {
  const server = read('server.js');
  assert.match(server, new RegExp(`DEFAULT_ADMIN_PASSWORD_HASH = '${NEW_HASH}'`));
  assert.match(server, new RegExp(`LEGACY_DEFAULT_ADMIN_PASSWORD_HASH = '${OLD_HASH}'`));
  assert.match(server, /currentHash===LEGACY_DEFAULT_ADMIN_PASSWORD_HASH/);
  assert.match(server, /admin\.passwordHash=DEFAULT_ADMIN_PASSWORD_HASH/);
  assert.match(server, /ADMIN_PASSWORD_BASELINE_VERSION = 'v7\.63\.81'/);
});

test('repair-admin migrates only legacy or missing password hashes and preserves custom passwords', () => {
  const repair = read('tools/repair-admin.js');
  assert.match(repair, new RegExp(`DEFAULT_ADMIN_PASSWORD_HASH = '${NEW_HASH}'`));
  assert.match(repair, /if \(!currentHash \|\| currentHash === LEGACY_DEFAULT_ADMIN_PASSWORD_HASH\) admin\.passwordHash = DEFAULT_ADMIN_PASSWORD_HASH;/);
  assert.doesNotMatch(repair, /admin\.passwordHash\s*=\s*DEFAULT_ADMIN_PASSWORD_HASH;\s*admin\.roleId/);
});

test('browser fallback creates missing admin with the same new hash', () => {
  const app = read('assets/app.js');
  assert.match(app, new RegExp(`passwordHash:'${NEW_HASH}'`));
});
