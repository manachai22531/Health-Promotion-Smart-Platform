'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('server.js','utf8'),start=source.indexOf("const RUNTIME_ENVIRONMENT = 'production';"),end=source.indexOf('\nfunction isNonProductionUrl',start),guard=source.slice(start,end);
function run(env){const result={...env},errors=[];vm.runInNewContext(guard,{installHealthCheck:false,process:{env:result,exit:()=>{throw Error('refused')}},console:{error:s=>errors.push(s)},URL});return result}
test('integrated main preserves hosted port and Windows production defaults',()=>{assert.equal(run({RENDER_DEPLOYMENT:'true',PORT:'10000'}).PORT,'10000');assert.equal(run({RENDER_SERVICE_ID:'fixture'}).PORT,'10000');assert.equal(run({}).PORT,'3000')});
test('Windows runtime still rejects wrong ports and production database guard remains',()=>{assert.throws(()=>run({PORT:'10000'}),/refused/);assert.throws(()=>run({PGDATABASE:'wrong'}),/refused/);assert.throws(()=>run({APP_ENV:'development'}),/refused/)});
