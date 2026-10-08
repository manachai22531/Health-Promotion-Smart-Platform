'use strict';
require('dotenv').config();
const { Pool } = require('pg');

function passwordHash(value) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index++) {
    const character = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ character, 2654435761);
    h2 = Math.imul(h2 ^ character, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

const LEGACY_DEFAULT_ADMIN_PASSWORD_HASH = '3f708bf99ab7e362';
const DEFAULT_ADMIN_PASSWORD_HASH = '85dd2de461d3cc8e';
const ADMIN_PASSWORD_BASELINE_VERSION = 'v7.63.81';

function normalizeUsername(value) {
  return String(value == null ? '' : value)
    .replace(/^\uFEFF|[\u200B-\u200D\u2060]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '')
    .trim();
}

async function main() {
  const pool = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
  });
  try {
    const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
    if (!result.rows.length) {
      throw new Error('app_state row id=1 was not found.');
    }
    const state = result.rows[0].data || {};
    state.users = Array.isArray(state.users) ? state.users : [];
    const adminCandidates = state.users.filter(user => normalizeUsername(user.username) === 'admin');
    let admin = adminCandidates[0];
    if (!admin) {
      admin = {
        id: `user-admin-${Date.now().toString(36)}`,
        displayName: 'ผู้ดูแลระบบ',
        username: 'admin',
        createdAt: new Date().toISOString()
      };
      state.users.push(admin);
    }
    state.users = state.users.filter(user => user === admin || normalizeUsername(user.username) !== 'admin');
    admin.displayName = admin.displayName || 'ผู้ดูแลระบบ';
    admin.username = 'admin';
    const currentHash = String(admin.passwordHash || '');
    if (!currentHash || currentHash === LEGACY_DEFAULT_ADMIN_PASSWORD_HASH) admin.passwordHash = DEFAULT_ADMIN_PASSWORD_HASH;
    state.adminPasswordBaselineVersion = ADMIN_PASSWORD_BASELINE_VERSION;
    admin.roleId = 'admin';
    admin.active = true;
    const updateResult = await pool.query(
      'UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1',
      [JSON.stringify(state)]
    );
    if (updateResult.rowCount !== 1) {
      throw new Error('Could not save the admin account.');
    }
    const verification = await pool.query(`SELECT data->'users' AS users FROM app_state WHERE id = 1`);
    const savedUsers = verification.rows[0]?.users;
    const savedAdmin = Array.isArray(savedUsers)
      ? savedUsers.find(user => normalizeUsername(user.username) === 'admin')
      : null;
    if (!savedAdmin || !savedAdmin.active || !savedAdmin.passwordHash) {
      throw new Error('Admin account verification failed after save.');
    }
    console.log('Admin account is ready and verified.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
