const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const server=fs.readFileSync('server.js','utf8');
const app=fs.readFileSync('assets/app.js','utf8');
const run=fs.readFileSync('tools/run.ps1','utf8');
const install=fs.readFileSync('tools/install.ps1','utf8');
const deploy=fs.readFileSync('tools/deploy-environment.ps1','utf8');
const updater=fs.readFileSync('tools/app-update-helper.js','utf8');

test('release remains production-only after v7.63.35',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.(?:35|36|37|38|39|40|41|42|43|44)-production'/);
  assert.match(server,/const RUNTIME_ENVIRONMENT = 'production'/);
  assert.match(server,/const PRODUCTION_PORT = 3000/);
  assert.match(server,/const PRODUCTION_DATABASE = 'health_check_smart_search'/);
});

test('runtime refuses non-production configuration',()=>{
  assert.match(server,/Refusing to start/);
  assert.match(server,/configuredEnvironment!==RUNTIME_ENVIRONMENT/);
  assert.match(server,/configuredPort!==PRODUCTION_PORT/);
  assert.match(server,/configuredDatabase!==PRODUCTION_DATABASE/);
});

test('launcher and installer are production-only',()=>{
  assert.match(run,/expectedPort = 3000/);
  assert.match(run,/PGDATABASE ต้องเป็น health_check_smart_search/);
  assert.match(install,/\$appPort = 3000/);
  assert.match(install,/\$appEnvironment = 'production'/);
  assert.match(deploy,/ValidateSet\('production'\)/);
  assert.match(deploy,/D:\\HealthCheck\\Production/);
});

test('frontend no longer has environment-switch banner logic',()=>{
  assert.doesNotMatch(app,/environment-warning-banner/i);
  assert.doesNotMatch(app,/ระบบทดสอบ/);
});

test('update center requires production-only package and production server config',()=>{
  assert.match(updater,/Production-only runtime lock/);
  assert.match(updater,/Current \.env is not Production/);
  assert.match(updater,/Production PORT must be 3000/);
  assert.match(updater,/Production PGDATABASE must be health_check_smart_search/);
});

test('alternate environment deployment files are absent',()=>{
  const forbidden=['bootstrap-'+'sta'+'ging.ps1','reset-'+'sta'+'ging-data.js','app-capybara-'+'sta'+'ging.ico'];
  for(const name of forbidden){assert.ok(!fs.existsSync(path.join('tools',name))&&!fs.existsSync(path.join('scripts',name))&&!fs.existsSync(path.join('assets',name)),`unexpected file ${name}`)}
});
