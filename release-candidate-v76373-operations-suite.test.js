'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('v7.63.73 release remains Production-only and Update Center compatible',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json')),server=read('server.js'),html=read('app.html');
  assert.equal(pkg.version,'7.63.73');
  assert.equal(lock.version,'7.63.73');
  assert.equal(lock.packages[''].version,'7.63.73');
  assert.equal(read('VERSION.txt').trim(),'v7.63.73');
  assert.match(server,/RELEASE_NAME = 'v7\.63\.73-production'/);
  assert.match(server,/SCHEMA_VERSION = '0200'/);
  assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/PRODUCTION_PORT = 3000/);
  assert.match(server,/PRODUCTION_DATABASE = 'health_check_smart_search'/);
  assert.match(html,/assets\/style\.css\?v=7\.63\.73-operations-suite/);
  assert.match(html,/assets\/app\.js\?v=7\.63\.73-operations-suite/);
  assert.match(html,/assets\/ocr-native\.js\?v=7\.63\.73-operations-suite/);
  for(const file of ['server.js','package.json','VERSION.txt','INSTALL-REPAIR.bat']) assert.ok(fs.existsSync(path.join(root,file)),file+' missing at ZIP root');
});

test('Operations Center provides pending/error dashboard and persistent job queue with retry/cancel',()=>{
  const server=read('server.js'),html=read('app.html'),js=read('assets/app.js');
  assert.match(server,/CREATE TABLE IF NOT EXISTS operations_jobs/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS operations_job_items/);
  assert.match(server,/OPERATIONS_JOB_TYPES=new Set\(\['CHECK_HN','CHECK_VN','BULK_EMR','REFRESH_PATIENTLOG','SYSTEM_HEALTH','BACKUP'\]\)/);
  assert.match(server,/async function operationsWorkerTick\(\)/);
  assert.match(server,/app\.get\('\/api\/ops\/summary'/);
  assert.match(server,/app\.get\('\/api\/ops\/work-items'/);
  assert.match(server,/app\.post\('\/api\/ops\/jobs'/);
  assert.match(server,/app\.post\('\/api\/ops\/jobs\/:id\/retry'/);
  assert.match(server,/app\.post\('\/api\/ops\/jobs\/:id\/cancel'/);
  assert.match(server,/function operationsPermissionForType/);
  assert.match(server,/async function recoverInterruptedOperationsJobs/);
  assert.match(server,/payload=\$2::jsonb ORDER BY created_at DESC LIMIT 1/);
  assert.match(html,/id="opsCenterView"/);
  for(const id of ['opsNoHn','opsNoVn','opsNoEmr','opsHisError','opsActiveJobs','opsUnreadNotifications','opsWorkRows','opsJobRows']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(js,/async function loadOpsSummary/);
  assert.match(js,/async function loadOpsWorkItems/);
  assert.match(js,/async function loadOpsJobs/);
});

test('Audit Log records mutating API actions without request bodies',()=>{
  const server=read('server.js'),html=read('app.html');
  assert.match(server,/CREATE TABLE IF NOT EXISTS system_action_audit/);
  assert.match(server,/async function recordSystemActionAudit/);
  assert.match(server,/\['POST','PUT','PATCH','DELETE'\]/);
  assert.match(server,/contentLength:Number\(req\.headers\['content-length'\]/);
  assert.doesNotMatch(server,/recordSystemActionAudit[\s\S]{0,1800}req\.body/);
  assert.match(server,/app\.get\('\/api\/ops\/audit'/);
  assert.match(html,/data-ops-panel="audit"/);
});

test('Health/performance, notifications, backup and rollback visibility are integrated',()=>{
  const server=read('server.js'),html=read('app.html'),helper=read('tools/app-update-helper.js');
  assert.match(server,/CREATE TABLE IF NOT EXISTS system_notifications/);
  assert.match(server,/app\.get\('\/api\/ops\/notifications'/);
  assert.match(server,/app\.get\('\/api\/ops\/performance'/);
  assert.match(server,/app\.get\('\/api\/ops\/backups'/);
  assert.match(server,/processBackupJob/);
  assert.match(server,/processSystemHealthJob/);
  assert.match(html,/data-ops-panel="health"/);
  assert.match(html,/data-ops-panel="backup"/);
  assert.match(html,/data-ops-panel="notifications"/);
  assert.match(helper,/state\('ROLLBACK'/);
  assert.match(helper,/restoreDatabase/);
  assert.match(helper,/rolledBack:true/);
  const backup=read('tools/backup.ps1');
  assert.match(backup,/VERSION\.txt/);
  assert.doesNotMatch(backup,/health-check-v7\.1-/);
});

test('patientlog status auto-refresh and bulk refresh use HN/VN latest status flow',()=>{
  const server=read('server.js'),js=read('assets/app.js');
  assert.match(server,/async function processPatientLogJob/);
  assert.match(server,/fetchLatestPatientLogStatuses\(requests\)/);
  assert.match(server,/hisPatientLogStatus/);
  assert.match(js,/async function refreshBookingPatientLogStatusOnly/);
  assert.match(js,/setInterval\(refreshBookingPatientLogStatusOnly,15000\)/);
  assert.match(js,/\/api\/his\/patientlog-status/);
});

test('migration 0200 is transactional and includes production indexes',()=>{
  const sql=read('migrations/0200_operations_center.up.sql');
  assert.match(sql,/^BEGIN;/m);
  assert.match(sql,/COMMIT;\s*$/m);
  for(const index of ['checkup_bookings_hn_idx','checkup_bookings_record_key_idx','checkup_bookings_status_updated_idx','checkup_visits_vn_idx','checkup_visits_result_status_idx','checkup_workflow_audit_time_idx']) assert.match(sql,new RegExp(index));
  assert.match(sql,/VALUES\('0200','Operations Center:/);
});

test('new Operations UI preserves previously approved v7.63.72 booking/user requirements',()=>{
  const server=read('server.js'),html=read('app.html'),js=read('assets/app.js'),css=read('assets/style.css');
  assert.match(js,/customer-package-name-ellipsis/);
  assert.match(css,/customer-package-name-ellipsis\{[^}]*text-overflow:ellipsis/i);
  assert.match(server,/HIS_PATIENT_LOG_TABLE\|\|'patientlog'/);
  assert.match(server,/AS tovalue/);
  assert.match(html,/class="modal-close booking-close-button"/);
  assert.match(css,/booking-close-button\{[\s\S]*position:static!important/);
  assert.match(html,/permission-management-grid-v76372/);
  assert.ok(html.indexOf('id="syncHisUsers"') < html.indexOf('id="addUser"'));
  assert.match(server,/app\.post\('\/api\/his-users\/sync'/);
});

test('Operations Center has responsive styling and permission-aware navigation',()=>{
  const html=read('app.html'),css=read('assets/style.css'),js=read('assets/app.js');
  assert.match(html,/data-permission="worklistView" data-view="opsCenterView"/);
  assert.match(css,/\/\* v7\.63\.73 Production Operations Center \*\//);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(js,/can\('auditView'\)/);
  assert.match(js,/can\('apiView'\)/);
  assert.match(js,/function opsCanJobType/);
  assert.match(js,/opsCenterView:\{title:'ศูนย์ปฏิบัติการ'/);
});
