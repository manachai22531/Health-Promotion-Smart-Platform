'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {makeStationSync}=require('./package-station-sync');
test('station compatibility sync shares concurrent work, expires and retries failures',async()=>{
 let calls=0,time=0,fail=false;
 const sync=makeStationSync(async()=>{calls++;if(fail)throw Error('database unavailable')},{now:()=>time,ttlMs:30});
 await Promise.all(Array.from({length:10},()=>sync()));assert.equal(calls,1);
 time=29;await sync();assert.equal(calls,1);
 time=30;await sync();assert.equal(calls,2);
 time=60;fail=true;await assert.rejects(sync());assert.equal(calls,3);
 fail=false;await sync();assert.equal(calls,4);
});
test('package reads select only settings, without hydrating the entire customer state',()=>{
 const s=require('node:fs').readFileSync('server.js','utf8');
 const route=s.slice(s.indexOf("app.get('/api/his-packages/by-code/:code'"),s.indexOf('function stationCodeFromName'));
 assert(!route.includes('await readState()'));assert(route.includes("data->'orderItemSettings'"));
});
