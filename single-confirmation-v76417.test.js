'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=(p)=>fs.readFileSync(path.join(__dirname,p),'utf8');
const source=read('assets/app.js');
const start=source.indexOf('function normalizedCheckupChoicesV76416(');
const end=source.indexOf('// Override legacy two-click handlers',start);
assert(start!==-1&&end>start);
const block=source.slice(start,end);
function mockSystem(permissions=['receiveCreate','receiveEdit']){
 let persisted=[], logged=[], failSave=false, failAudit=false;
 const ctx={Date,JSON,String,Boolean,Array,Number,Error,console,
  can:(name)=>permissions.includes(name),
  auditSnapshot:rec=>({visitedAt:rec.visitedAt||null,acceptedBillingItems:rec.acceptedBillingItems||[]}),
  auditChanges:()=>[],
  persistRecordNow:async rec=>{if(failSave)throw new Error('TEST DB FAILED');persisted.push({...rec})},
  fetch:async (_url,opts)=>{logged.push(JSON.parse(opts.body));if(failAudit)return {ok:false,json:async()=>({error:'LOG FAILED'})};return {ok:true,json:async()=>({ok:true})}},
  currentUser:{id:'user-1'},state:{at:null}};
 vm.createContext(ctx);vm.runInContext(block,ctx);
 return {ctx,persisted,logged,setFailSave:val=>failSave=val,setFailAudit:val=>failAudit=val};
}
const draft=()=>({recordKey:'case-1',primaryPackages:[{code:'P1',name:'Primary',price:1200}],acceptedBillingItems:[{id:'x',code:'EXTRA',name:'Billing',price:200}],acceptedCashItems:[],selectedPackages:[]});
function record(){return {key:'case-1',primaryPackages:[{code:'P0',name:'Old'}],acceptedBillingItems:[],acceptedCashItems:[],selectedPackages:[],code:'P0',visitedAt:null,checkupConfirmedAt:null,customerPendingSelection:{foo:'bar'}}}
test('one confirmation persists all packages and both timestamps before enabling HIS Order',async()=>{
 const t=mockSystem(),r=record();
 await t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:true});
 assert.equal(t.persisted.length,1);assert.equal(t.logged.length,1);
 assert(r.visitedAt&&r.checkupConfirmedAt);
 assert.equal(r.primaryPackages[0].code,'P1');assert.equal(r.acceptedBillingItems[0].code,'EXTRA');
 assert.equal(r.customerPendingSelection,null);assert.equal(t.logged[0].action,'CREATE');
 assert.equal(t.ctx.checkupChoicesChangedV76416(draft(),r),false);
});
test('failed database save never modifies patient confirmation',async()=>{
 const t=mockSystem(),r=record();t.setFailSave(true);
 await assert.rejects(t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:true}),/TEST DB FAILED/);
 assert.equal(r.visitedAt,null);assert.equal(r.checkupConfirmedAt,null);assert.equal(t.logged.length,0);
});
test('audit failure is distinguishable from saved confirmation',async()=>{
 const t=mockSystem(),r=record();t.setFailAudit(true);
 const result=await t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:true});
 assert(r.visitedAt);assert.match(result.auditWarning,/LOG FAILED/);
});
test('no first confirmation without receiveCreate permission',async()=>{
 const t=mockSystem(['receiveFinalize']),r=record();
 await assert.rejects(t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:true}),/ไม่มีสิทธิ์/);
 assert.equal(t.persisted.length,0);
});
test('existing confirmation does not allow duplicate confirmation',async()=>{
 const t=mockSystem(),r={...record(),visitedAt:'2026-10-10T12:00:00Z'};
 await assert.rejects(t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:true}),/ได้รับการยืนยันแล้ว/);
});
test('changed selections save as an edit while retaining original confirmed timestamps',async()=>{
 const t=mockSystem(),r=record();await t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:true});
 const prior=r.visitedAt, edited=draft();edited.acceptedCashItems=[{code:'NEW',name:'Cash'}];
 assert.equal(t.ctx.checkupChoicesChangedV76416(edited,r),true);
 await t.ctx.saveConfirmedCheckupV76416(r,edited,{initial:false});
 assert.equal(r.visitedAt,prior);assert.equal(r.acceptedCashItems[0].code,'NEW');assert.equal(t.logged[1].action,'UPDATE');
});
test('no edits after HIS order until cancelled',async()=>{
 const t=mockSystem(),r={...record(),visitedAt:'2026-10-10T11:00:00Z',orderHisAt:'2026-10-10T12:00:00Z'};
 await assert.rejects(t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:false}),/CancelOrder/);
});
test('legacy records with no stored price are not falsely marked as changed',()=>{
 const t=mockSystem(),r={...record(),visitedAt:'2026-10-10T12:00:00Z',primaryPackages:[{code:'P1',name:'Primary'}]};
 const existing={recordKey:r.key,primaryPackages:[{code:'P1',name:'Primary',price:1200}],acceptedBillingItems:[],acceptedCashItems:[],selectedPackages:[]};
 assert.equal(t.ctx.checkupChoicesChangedV76416(existing,r),false);
});
test('A4 footer does not contain the old confirmation call to action',()=>{
 const html=read('app.html');assert.doesNotMatch(html,/id="confirmCheckup"[^>]*>\s*ยืนยันและบันทึกการตรวจ/);
 assert.match(html,/<button class="button primary" hidden data-checkup-edit-ready="0" id="confirmCheckup"/);
 assert.match(read('assets/style.css'),/#confirmCheckup\[hidden\]\{display:none!important\}/);
});
test('OrderHIS remains gated by persisted visitedAt, HN, VN, and an active order guard',()=>{
 const server=read('server.js');const order=server.slice(server.indexOf("app.post('/api/his/order'"),server.indexOf("app.post('/api/his/cancel-visit'"));
 assert.match(order,/!record\.visitedAt/);assert.match(order,/!hn/);assert.match(order,/!visitUID/);assert.match(order,/record\.orderHisAt/);
 assert.match(read('worklist-confirmed-fallback.js'),/return activeOrder\(record\)\?'ORDERED':'PENDING_ORDER'/);
});
test('A4 status buttons keep receiveFinalize for HIS Order, receiveEdit for changed selections',()=>{
 assert.match(source,/orderHis\.disabled=!confirmed\|\|!finalized\|\|!visitActive\|\|orderActive\|\|!can\('receiveFinalize'\)/);
 assert.match(source,/const mayEdit=Boolean\(changed&&can\('receiveEdit'\)\)/);
 assert.match(source,/finalize\.dataset\.checkupEditReady=mayEdit\?'1':'0'/);
});

test('legacy checkupConfirmedAt prevents an initial duplicate and permits a permission-checked repeat edit',async()=>{
 const t=mockSystem(),r={...record(),checkupConfirmedAt:'2026-10-15T08:00:00Z'};
 await assert.rejects(t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:true}),/ได้รับการยืนยันแล้ว/);
 assert.equal(t.persisted.length,0);
 await t.ctx.saveConfirmedCheckupV76416(r,draft(),{initial:false});
 assert.equal(t.persisted.length,1);assert.equal(r.checkupConfirmedAt,'2026-10-15T08:00:00Z');assert.equal(t.logged[0].action,'UPDATE');
 const denied=mockSystem(['receiveCreate']);
 await assert.rejects(denied.ctx.saveConfirmedCheckupV76416({...r},draft(),{initial:false}),/ไม่มีสิทธิ์/);assert.equal(denied.persisted.length,0);
});
