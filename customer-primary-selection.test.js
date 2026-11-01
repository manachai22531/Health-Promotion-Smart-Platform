'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),{registerCustomerAccess}=require('./customer-access');
test('initial ID-verified primary selection works before visit while QR, existing primary and closed cases retain gates',async t=>{
 const app=express();app.use(express.json());let record={},finishes=0;
 const {selectionLease}=registerCustomerAccess({app,pool:{query:async()=>({rows:[]})},localOnly:(_q,_r,n)=>n(),staffPermissionRequired:()=> (_q,_r,n)=>n(),customerSessions:new Map(),readState:async()=>({}),clinical:{acquireCustomerSelection:async()=> 'lease',load:async()=>record,finishCustomerSelection:async()=>{finishes++}}});
 app.post('/test',(req,_res,next)=>{req.customerSession={recordKey:'case',loginMethod:req.get('x-method')||'id'};next()},selectionLease,(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port+'/test';
 const post=(body,method='id')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-method':method},body:JSON.stringify(body)});
 assert.equal((await post({primaryCode:'MAIN'})).status,200);
 assert.equal((await post({primaryCode:'MAIN'},'name')).status,200);
 assert.equal((await post({primaryCode:'MAIN'},'qr')).status,410);
 assert.equal((await post({})).status,410);
 record={code:'EXISTING'};assert.equal((await post({primaryCode:'MAIN'})).status,410);
 record={primaryPackages:[{code:'EXISTING'}]};assert.equal((await post({primaryCode:'MAIN'})).status,410);
 record={chargeCloseAt:'2026-11-01'};assert.equal((await post({primaryCode:'MAIN'})).status,409);
 assert.equal(finishes,7,'each operation lease is released');
});
