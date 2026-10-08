'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.74 release identity is Production-only and Update Center compatible',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.74');
  assert.equal(lock.version,'7.63.74');
  assert.equal(lock.packages[''].version,'7.63.74');
  assert.equal(read('VERSION.txt').trim(),'v7.63.74');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.74-production'/);
  assert.match(server,/SCHEMA_VERSION = '0210'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(server,/PRODUCTION_DATABASE = 'health_check_smart_search'/);
  assert.match(html,/assets\/style\.css\?v=7\.63\.74-production-readiness/);
  assert.match(html,/assets\/app\.js\?v=7\.63\.74-production-readiness/);
  for(const f of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
});

test('Production Readiness UI covers all six readiness areas',()=>{
  const html=read('app.html'),js=read('assets/app.js');
  assert.match(html,/data-ops-tab="readiness"/);
  assert.match(html,/Production Readiness Pack/);
  for(const id of ['opsUatRows','opsReadinessRows','opsRunLoadTest','opsVerifyBackup','opsRollbackDrill','opsSecurityRows','opsDbMaintenanceRows']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/async function loadOpsReadiness/);
  assert.match(js,/\/api\/ops\/readiness\/load-test/);
  assert.match(js,/\/api\/ops\/readiness\/verify-backup/);
  assert.match(js,/\/api\/ops\/readiness\/rollback-drill/);
});

test('UAT checklist is persisted and migration 0210 is transactional',()=>{
  const server=read('server.js'),sql=read('migrations/0210_production_readiness.up.sql');
  assert.match(server,/CREATE TABLE IF NOT EXISTS production_readiness_uat/);
  for(const key of ['LOGIN_ROLE','PROJECT_BOOKING','HN_VN','PATIENTLOG','BULK_EMR','HIS_USER_SYNC','BACKUP_RESTORE','UPDATE_ROLLBACK']) assert.match(server,new RegExp(key));
  assert.match(server,/app\.put\('\/api\/ops\/readiness\/uat\/:key'/);
  assert.match(sql,/^BEGIN;/m);
  assert.match(sql,/production_readiness_uat_status_idx/);
  assert.match(sql,/VALUES\('0210'/);
  assert.match(sql,/COMMIT;\s*$/m);
});

test('Safe load benchmark is bounded and read-only',()=>{
  const server=read('server.js');
  assert.match(server,/app\.post\('\/api\/ops\/readiness\/load-test'/);
  assert.match(server,/Math\.min\(Math\.max\(Number\(req\.body\?\.concurrency\)\|\|5,1\),20\)/);
  assert.match(server,/Math\.min\(Math\.max\(Number\(req\.body\?\.requests\)\|\|50,5\),500\)/);
  assert.match(server,/SELECT revision FROM app_state WHERE id=1/);
  assert.match(server,/Safe DB-read benchmark only/);
});

test('Backup verification and rollback drill are non-destructive validation tools',()=>{
  const server=read('server.js');
  assert.match(server,/readinessFileSha256/);
  assert.match(server,/app\.post\('\/api\/ops\/readiness\/verify-backup'/);
  assert.match(server,/app\.post\('\/api\/ops\/readiness\/rollback-drill'/);
  assert.match(server,/mode:'VALIDATION_ONLY'/);
  assert.match(server,/ไม่ rollback Production จริง/);
  assert.match(server,/app-update-helper\.js/);
  assert.match(server,/restore\.ps1/);
});

test('Security readiness includes headers, login throttling and server-side permission checks',()=>{
  const server=read('server.js');
  assert.match(server,/app\.disable\('x-powered-by'\)/);
  assert.match(server,/X-Content-Type-Options/);
  assert.match(server,/X-Frame-Options/);
  assert.match(server,/Referrer-Policy/);
  assert.match(server,/staffLoginAttempts=new Map\(\)/);
  assert.match(server,/entry\.fails>=5/);
  assert.match(server,/res\.status\(429\)/);
  assert.match(server,/staffPermissionRequired/);
  assert.match(server,/app\.get\('\/api\/ops\/readiness\/security'/);
});

test('Database maintenance is advisory by default and ANALYZE is allowlisted',()=>{
  const server=read('server.js');
  assert.match(server,/pg_stat_user_tables/);
  assert.match(server,/pg_stat_user_indexes/);
  assert.match(server,/pg_total_relation_size/);
  assert.match(server,/VACUUM_ANALYZE/);
  assert.match(server,/app\.post\('\/api\/ops\/readiness\/analyze'/);
  assert.match(server,/const allowed=new Set\(\['app_state','checkup_bookings','checkup_visits','operations_jobs','operations_job_items','system_action_audit','system_notifications'\]\)/);
});

test('existing v7.63.73 operations suite and v7.63.72 requirements remain present',()=>{
  const server=read('server.js'),html=read('app.html'),js=read('assets/app.js'),css=read('assets/style.css');
  assert.match(server,/OPERATIONS_JOB_TYPES=new Set/);
  assert.match(server,/fetchLatestPatientLogStatuses\(requests\)/);
  assert.match(js,/setInterval\(refreshBookingPatientLogStatusOnly,15000\)/);
  assert.match(js,/customer-package-name-ellipsis/);
  assert.match(css,/customer-package-name-ellipsis\{[^}]*text-overflow:ellipsis/i);
  assert.match(html,/permission-management-grid-v76372/);
  assert.match(server,/app\.post\('\/api\/his-users\/sync'/);
});
