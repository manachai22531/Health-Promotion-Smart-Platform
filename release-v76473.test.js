'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
test('v7.64.73 runtime, lockfile and installer identify the same release',()=>{
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.version,'7.64.73');assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
 assert.equal(read('VERSION.txt').trim(),'v7.64.73');assert.match(read('server.js'),/const RELEASE_NAME = 'v7\.64\.73-production'/);
 for(const file of ['tools/production-installer-gui.ps1','tools/production-installer-worker.ps1'])assert.match(read(file),/v7\.64\.73/);
 assert.match(read('app.html'),/assets\/auth-session\.js\?v=7\.64\.73/);
});
test('fresh startup creates company tables before circular foreign keys',()=>{
 const server=read('server.js'),start=server.indexOf('async function ensureDatabase()');
 const create=server.indexOf('await ensureRelationalSchema(pool)',start),reference=server.indexOf('REFERENCES company_years(id)',start);
 assert(create>start&&create<reference);
});
test('installer checks public database readiness, integrity and complete runtime prerequisites',()=>{
 const worker=read('tools/production-installer-worker.ps1'),install=read('tools/install.ps1');
 assert.match(worker,/http:\/\/127\.0\.0\.1:3000\/api\/health/);assert.doesNotMatch(worker,/http:\/\/127\.0\.0\.1:3000\/api\/system\/health/);
 assert.match(worker,/Test-PayloadIntegrity -Root \$sourceRoot/);assert.match(worker,/Get-FileHash -LiteralPath \$file -Algorithm SHA256/);
 for(const dependency of ['compression','pdf-lib','fontkit','pg','dotenv','playwright-core'])assert(install.includes(dependency),dependency);
 assert.match(install,/Database backup failed\. Installation stopped to protect existing data/);
 assert.match(read('tools/deploy-environment.ps1'),/Existing .env\/API keys\/database connection files are preserved/);
});
test('memo subsections have separate PATCH field allowlists',()=>{
 const server=read('server.js');
 assert.match(server,/'subsidiaries':\['additionalCompanies'\]/);
 assert.match(server,/'coordinators':\['coordinator','coordinators'\]/);
 assert.match(server,/'employees':\['employeeCount'\]/);
});
test('archive contains the new security runtime and keeps startup read-only',()=>{
 for(const file of ['security-policy.js','assets/auth-session.js','assets/auth-session.css','tools/start-production-installer.vbs','INSTALL-REPAIR.bat'])assert(read(file).length>0,file);
 const html=read('app.html');assert(html.indexOf('assets/auth-session.js')<html.indexOf('assets/app.js'));
 assert.match(read('server.js'),/req\.path\.startsWith\('\/api\/auth\/'\)/);
 assert.match(read('assets/auth-session.js'),/if\(!event\.isTrusted/);
});
