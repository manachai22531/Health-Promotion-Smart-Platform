'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const{registerCustomerSelectionReview}=require('./customer-selection-review');
test('review HTTP supports re-edit, idempotent retry, legacy audit ownership and authoritative rejection paths',async t=>{
 let record={key:'p',companyId:'co',visitedAt:'2026-10-30T01:00:00Z',acceptedCashItems:[{code:'STAFF',price:5}],primaryPackages:[{code:'MAIN'}],customerPendingSelection:{orderId:'one',cashIds:['a','b'],items:[{id:'a',type:'cash',code:'A',price:10},{id:'b',type:'cash',code:'B',price:20}]}};
 let revision=0,staged,stagedAudit,audits=[],leases=0,validated=0;
 const company={cashPackages:[{id:'a',code:'A',name:'A',price:10},{id:'b',code:'B',name:'B',price:20}]};
 const db={release(){},async query(sql,args=[]){
 if(sql==='BEGIN'){staged=null;stagedAudit=null;return{rows:[]}}
 if(sql==='ROLLBACK'){staged=null;stagedAudit=null;return{rows:[]}}
 if(sql==='COMMIT'){if(staged){record={...record,...staged};revision++}if(stagedAudit)audits.push(stagedAudit);return{rows:[]}}
 if(sql.startsWith('SELECT data,revision'))return{rows:[{data:{records:[record]},revision}]};
 if(sql.startsWith('SELECT company_year_id'))return{rows:[{company_year_id:'co'}]};
 if(sql.startsWith('SELECT source_data'))return{rows:[{source_data:company}]};
 if(sql.startsWith('SELECT id,package_code')||sql.startsWith('SELECT c.code'))return{rows:[]};
 if(sql.startsWith('SELECT details'))return{rows:audits.filter(a=>a.after.customerSelectionReview.sourceVersion===args[1]).slice(-1).map(details=>({details}))};
 if(sql.startsWith('UPDATE company_customers')){staged=JSON.parse(args[1]);return{rows:[]}}
 if(sql.startsWith('UPDATE app_state'))return{rows:[{revision:revision+1}]};
 if(sql.startsWith('INSERT INTO checkup_audit_log')){stagedAudit=JSON.parse(args.at(-1));return{rows:[]}}
 if(sql.startsWith('SET LOCAL')||sql.startsWith('UPDATE relational_sync_status'))return{rows:[]};throw Error('Unexpected SQL '+sql);
 }};
 const pool={query:db.query.bind(db),connect:async()=>db};
 const app=express();app.use(express.json());registerCustomerSelectionReview({app,pool,localOnly:(_req,_res,next)=>next(),staffPermissionRequired:permission=>(req,res,next)=>{if(req.get('x-role')!=='staff')return res.status(403).json({error:'denied'});req.staffUser={id:'u',username:'staff'};next()},clinical:{load:async()=>structuredClone(record),acquireCustomerSelection:async()=>{leases++;return'lease'},finishCustomerSelection:async()=>{},validateSelectionReview:async()=>{validated++;if(record.orderHisAt||record.chargeCloseAt)throw Object.assign(Error('Order closed'),{status:423})}},invalidate(){}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port+'/api/customer-selections/p/review';
 const get=async()=>{const r=await fetch(url,{headers:{'x-role':'staff'}});assert.equal(r.status,200);return r.json()};
 const post=async(data,keys,prices,role='staff')=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-role':role},body:JSON.stringify({expectedReview:data.expectedReview,keys,expectedPrices:prices})});return{status:r.status,body:await r.json()}};
 const a=JSON.stringify(['cash','a']),b=JSON.stringify(['cash','b']);let data=await get();let r=await post(data,[a],{[a]:10});assert.equal(r.status,200);assert.deepEqual(record.acceptedCashItems.map(x=>x.code),['STAFF','A']);assert.equal(record.customerSelectionReview.managedItems.length,1);
 const stale=data;data=await get();assert.equal(data.rows.length,2);r=await post(data,[b],{[b]:20});assert.equal(r.status,200);assert.deepEqual(record.acceptedCashItems.map(x=>x.code),['STAFF','B']);assert.equal(audits.length,2);assert.equal(audits[1].editing,true);assert.deepEqual(record.primaryPackages,[{code:'MAIN'}]);
 r=await post(data,[b],{[b]:20});assert.equal(r.status,200);assert.equal(r.body.changed,false);assert.equal(audits.length,2);
 assert.equal((await post(stale,[a],{[a]:10})).status,409);data=await get();assert.equal((await post(data,[a],{[a]:999})).status,409);assert.deepEqual(record.acceptedCashItems.map(x=>x.code),['STAFF','B']);
 const previousLeases=leases;assert.equal((await post(data,[a],{[a]:10},'viewer')).status,403);assert.equal(leases,previousLeases);
 record.orderHisAt='now';data=await get();assert.equal((await post(data,[a],{[a]:10})).status,423);delete record.orderHisAt;record.chargeCloseAt='now';data=await get();assert.equal((await post(data,[a],{[a]:10})).status,423);delete record.chargeCloseAt;
 delete record.customerSelectionReview.managedItems;delete record.customerSelectionReview.sourceSelection;data=await get();r=await post(data,[a],{[a]:10});assert.equal(r.status,200);assert.deepEqual(record.acceptedCashItems.map(x=>x.code),['STAFF','A']);
 delete record.customerSelectionReview.managedItems;audits=[];data=await get();assert.equal((await post(data,[],{})).status,409);assert.deepEqual(record.acceptedCashItems.map(x=>x.code),['STAFF','A']);assert.ok(validated>=6);
});
