'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./server.js'),'utf8');const block=source.slice(source.indexOf('let systemHealthSchemaReady='),source.indexOf('\nasync function recordSystemHealthEvent'));
function loader(pool){return new Function('pool',block+'\nreturn ensureSystemHealthSchema;')(pool)}
test('health schema initialization shares concurrent callers and stops repeating DDL on every poll',async()=>{
 const calls=[];const ensure=loader({query:async sql=>{calls.push(sql);await new Promise(resolve=>setImmediate(resolve))}});
 await Promise.all([ensure(),ensure(),ensure()]);assert.equal(calls.length,3);await ensure();assert.equal(calls.length,3);
});
test('failed schema initialization is retried instead of being cached as successful',async()=>{
 let fail=true,calls=0;const ensure=loader({query:async()=>{calls++;if(fail)throw Error('temporary database failure')}});
 await assert.rejects(ensure());fail=false;await ensure();assert.equal(calls,4);
});
test('response preparation timing is captured in existing sanitized performance spans',async t=>{
 const {makeMonitor}=require('./performance-monitor');const m=makeMonitor({pool:{query:async()=>({rows:[]})},version:'test'});t.after(()=>m.stop());
 await m.runTask('job-health',null,async()=>{const end=m.span('render',performance.now());await new Promise(r=>setImmediate(r));end(false)});
 const {items}=await m.read();assert.equal(items.length,1);assert.equal(items[0].spans[0].kind,'render');assert.equal(items[0].spans[0].failed,false);
});
