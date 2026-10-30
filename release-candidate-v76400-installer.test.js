'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pkg=require('./package.json');
test('v7.64.06 production installer identity is consistent',()=>{
 assert.equal(pkg.version,'7.64.06');
 assert.match(fs.readFileSync('VERSION.txt','utf8'),/^v7\.64\.06\s*$/);
 assert.match(fs.readFileSync('server.js','utf8'),/RELEASE_NAME = 'v7\.64\.06-production'/);
 assert.match(fs.readFileSync('EXTRACT-FIRST.txt','utf8'),/D:\\HC76406/);
});
test('production installer keeps fixed target, backup and PostgreSQL health gate',()=>{
 const worker=fs.readFileSync('tools/production-installer-worker.ps1','utf8'),deploy=fs.readFileSync('tools/deploy-environment.ps1','utf8');
 assert.match(worker,/targetRoot='D:\\HealthCheck\\Production'/);
 assert.match(worker,/Source and database backups are mandatory/);
 assert.match(worker,/database\.ok -eq \$true/);
 assert.match(deploy,/production/);
});
