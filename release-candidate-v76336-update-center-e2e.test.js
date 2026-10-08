const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const helperText=fs.readFileSync('tools/app-update-helper.js','utf8');
const migration=fs.readFileSync('migrations/0190_production_only_cleanup.up.sql','utf8');
const server=fs.readFileSync('server.js','utf8');
const {T,dependenciesChanged,migrationFiles}=require('./tools/app-update-helper');

test('0190 is transactional, retryable and contains no accidental psql command',()=>{
  assert.doesNotMatch(migration,/^\s*\\/m);
  assert.match(migration,/^BEGIN;/);
  assert.match(migration,/COMMIT;\s*$/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS ocr_review_audit/);
  assert.match(migration,/CREATE INDEX IF NOT EXISTS ocr_review_audit_created_idx/);
  assert.match(migration,/to_regclass\('public\.his_api_connections'\)/);
  assert.match(migration,/ON CONFLICT\(version\) DO UPDATE/);
});

test('preflight precedes stop and validates production health plus rollback tools',()=>{
  assert.match(helperText,/await preflight\(\).*phase='BACKUP'.*phase='STOP'.*phase='DEPLOY'.*phase='MIGRATE'.*phase='START'.*phase='HEALTH'/s);
  assert.match(helperText,/api\/system\/health/);
  assert.match(helperText,/pg_restore --version/);
  assert.match(helperText,/migration .* must be transactional/);
  assert.match(helperText,/contains unsupported psql meta-command/);
});

test('all external phases have finite hard timeouts',()=>{
  assert.deepEqual(T,{archive:180000,copy:600000,dump:300000,restore:300000,psql:120000,npm:300000,probe:30000,stop:30000,start:60000,health:60000});
  assert.match(helperText,/taskkill\.exe.*\/T.*\/F/);
});

test('rollback restores source and database then restarts the old version',()=>{
  assert.match(helperText,/databaseTouched&&db&&has\(db\).*restoreDatabase\(c,db\)/);
  assert.match(helperText,/--clean','--if-exists'.*--single-transaction','--exit-on-error/);
  assert.match(helperText,/if\(!await start\(current\)\)/);
  assert.match(helperText,/databaseRestored:databaseTouched/);
});

test('version-only package metadata does not force npm ci',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hc-deps-'));
  try{
    const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
    pkg.version='99.99.99';lock.version='99.99.99';if(lock.packages?.[''])lock.packages[''].version='99.99.99';
    fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify(pkg));
    fs.writeFileSync(path.join(dir,'package-lock.json'),JSON.stringify(lock));
    assert.equal(dependenciesChanged(dir),false);
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});

test('a corrected migration is retried even when the same filename already exists',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hc-migration-'));
  try{
    fs.mkdirSync(path.join(dir,'migrations'));
    fs.writeFileSync(path.join(dir,'migrations','0190_production_only_cleanup.up.sql'),migration+'\n-- corrected package content\n');
    assert.deepEqual(migrationFiles(dir),['0190_production_only_cleanup.up.sql']);
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});

test('release keeps the v7.63.36 Update Center protections',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.(?:3[6-9]|[4-9]\d)-production'/);
});
