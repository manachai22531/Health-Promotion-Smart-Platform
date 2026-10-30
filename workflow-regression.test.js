'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {activeOrder,worklistStage,worklistDate,eligibleConfirmedRecords,buildConfirmedRows}=require('./worklist-confirmed-fallback');
const date='2026-10-10',confirmed='2026-10-10T03:00:00.000Z',ordered='2026-10-10T04:00:00.000Z';
const base=()=>({key:'caseA',companyId:'companyA',first:'Sample',last:'Case',hn:'H123',checkupConfirmedAt:confirmed,visitedAt:confirmed,primaryPackages:[{code:'CHECK01',name:'Package'}]});
test('a newly confirmed patient first appears in pending, not TODAY cases',()=>{
  const r=base();assert.equal(worklistStage(r),'PENDING_ORDER');assert.equal(worklistDate(r),date);
  const rows=buildConfirmedRows({records:[r],companies:[{id:'companyA',name:'Test Company'}],date});
  assert.equal(rows.length,1);assert.equal(rows[0].workflow_stage,'PENDING_ORDER');assert.equal(rows[0].vn,'');
  assert.equal(rows[0].checkin_at,null);
});
test('HIS OpenVisit alone does not advance a patient',()=>{
  const r={...base(),hisLastVisitUID:'VN098'};assert.equal(worklistStage(r),'PENDING_ORDER');
});
test('only successfully ordered patients move to TODAY cases',()=>{
  const r={...base(),orderHisAt:ordered,hisLastVisitUID:'VN098'};
  assert.equal(activeOrder(r),true);assert.equal(worklistStage(r),'ORDERED');
  assert.equal(buildConfirmedRows({records:[r],date})[0].workflow_stage,'ORDERED');
});
test('canceling HIS Order moves the case back to pending',()=>{
  const r={...base(),orderHisAt:ordered,cancelOrderAt:'2026-10-10T05:00:00.000Z'};
  assert.equal(activeOrder(r),false);assert.equal(worklistStage(r),'PENDING_ORDER');
});
test('older cancellation does not override a newer successful order',()=>{
  const r={...base(),cancelOrderAt:'2026-10-10T01:00:00Z',orderHisAt:ordered};assert.equal(worklistStage(r),'ORDERED');
});
test('unconfirmed records do not appear in either Worklist panel',()=>{
  const r={key:'A',first:'Not confirmed'};assert.equal(worklistStage(r),'NOT_CONFIRMED');assert.equal(eligibleConfirmedRecords({records:[r],date}).length,0);
});
test('status and company filters are honored',()=>{
  const r=base();assert.equal(eligibleConfirmedRecords({records:[r],date,status:'COMPLETE'}).length,0);
  assert.equal(eligibleConfirmedRecords({records:[r],date,companyId:'different'}).length,0);
  assert.equal(eligibleConfirmedRecords({records:[r],date,q:'nobody'}).length,0);
});
test('existingKeys prevent duplicate true visits and fallback rows',()=>{
  assert.equal(eligibleConfirmedRecords({records:[base()],date,existingKeys:new Set(['caseA'])}).length,0);
});
test('Order on a later date moves the record onto its order date, not confirmation date',()=>{
  const r={...base(),orderHisAt:'2026-10-11T03:00:00Z'};
  assert.equal(worklistDate(r),'2026-10-11');assert.equal(eligibleConfirmedRecords({records:[r],date}).length,0);
  assert.equal(eligibleConfirmedRecords({records:[r],date:'2026-10-11'}).length,1);
});
test('frontend partitions by explicit backend workflow_stage, not confirmed flag',()=>{
  const flow=fs.readFileSync('assets/flow-v76384.js','utf8');
  assert.match(flow,/pending=items\.filter\(x=>x\.workflow_stage==='PENDING_ORDER'\)/);
  assert.match(flow,/confirmed=items\.filter\(x=>x\.workflow_stage==='ORDERED'\)/);
  assert.match(flow,/renderTodayRegistrations\(\)/);
});
test('API uses a successful order as the gate, not a nonempty VN',()=>{
  const server=fs.readFileSync('server.js','utf8');
  assert.match(server,/result\.rows\.filter\(row=>worklistStage\(recordMap\.get/);
  assert.match(server,/item\.workflow_stage=worklistStage\(r\)/);
});
test('new PDF workflow saves existing company/circular through one company-scoped API',()=>{
  const app=fs.readFileSync('assets/app.js','utf8'),server=fs.readFileSync('server.js','utf8');
  assert.match(app,/suppressStateSaveForCircular=true/);
  assert.match(app,/save-and-generate-pdf/);
  assert.match(server,/POST.+/i);assert.match(server,/app\.post\('\/api\/company-years\/:companyId\/save-and-generate-pdf'/);
  assert.match(server,/SELECT data FROM app_state WHERE id=1 FOR UPDATE/);
  assert.match(server,/saved:true,revision,error:'บันทึกข้อมูลสำเร็จ แต่สร้าง PDF ไม่สำเร็จ'/);
});
test('no extra PDF parsing and save for an empty attachments list',()=>{
  const server=fs.readFileSync('server.js','utf8');
  assert.match(server,/if\(!attachmentRows\.some\(row=>row\.file_data\?\.length\)\)return/);
});
test('Thai text wrapping runs at close to linear glyph measuring cost',()=>{
  const source=fs.readFileSync('corporate-circular-pdf.js','utf8');
  const body=source.slice(source.indexOf('function splitByWidth('),source.indexOf('async function buildCorporateCircularPdf('));
  const context={Intl,createPdfWrapper:require('./pdf-text-layout').createPdfWrapper};vm.runInNewContext(body+'\nthis.wrap=splitByWidth;',context);
  let calls=0;const fakeFont={widthOfTextAtSize(str){calls++;return [...str].length*5;}};
  const lines=context.wrap('ก'.repeat(4000),fakeFont,8,100);
  assert.ok(lines.length>100);assert.ok(lines.every(v=>[...v].length<=20));
  assert.ok(calls<8000,`expected near linear wrapping; actual calls=${calls}`);
});

test('company-scoped PDF API commits company/circular once without patient table writes',async()=>{
 const source=fs.readFileSync('server.js','utf8');
 const begin=source.indexOf("app.post('/api/company-years/:companyId/save-and-generate-pdf'");
 const end=source.indexOf('// Save one editor section without serialising',begin);
 assert.ok(begin>0&&end>begin);
 const registered={},queries=[],ctx={
  app:{post(_route,...args){registered.handler=args.at(-1);}},
  localOnly() {},staffPermissionRequired(){return ()=>{}},
  pool:{connect:async()=>({query:async(sql)=>{queries.push(sql);
   if(sql.includes('SELECT data FROM app_state'))return {rows:[{data:{companies:[{id:'companyA',name:'Old'}]}}]};
   if(sql.includes('FROM company_years cy JOIN companies c'))return {rows:[{id:'companyA',company_id:'rootCo',source_data:{id:'companyA',name:'Old',year:'2569'},company_name:'Old',company_code:'001'}]};
   if(sql.includes('RETURNING revision'))return {rows:[{revision:44}]};
   return {rows:[]};},release(){}}),query:async(sql)=>{queries.push(sql);return {rows:[{id:'pdf1',file_name:'generated.pdf'}]}}},
  normalizeCircular:x=>x,
  buildCorporateCircularPdf:async()=>Buffer.from('%PDF-mock'),
  defaultCircular:(co,memo)=>memo,
  mergeCompanyAttachmentPdfsV76401:async(bytes)=>({bytes,attachmentCount:0,attachmentPages:0}),
  crypto:{},Buffer,console,Date,
  compressedStateCache:{revision:1,body:'old'}
 };
 vm.runInNewContext(source.slice(begin,end),ctx);
 const req={params:{companyId:'companyA'},body:{company:{name:'New Company',year:'2569',code:'001'},circular:{subject:'TEST'}},staffUser:{username:'tester'}};
 const result={};const res={status(n){result.status=n;return this},json(d){result.body=d;return this}};
 await registered.handler(req,res);
 assert.equal(result.status,201);assert.equal(result.body.saved,true);
 assert.ok(queries.some(sql=>sql.includes('company_year_circulars')));
 assert.ok(queries.some(sql=>sql.includes('company_year_primary_pdfs')));
 assert.equal(queries.filter(sql=>sql.includes('COMMIT')).length,1);
 assert.ok(!queries.some(sql=>/UPDATE customers|INSERT INTO customers|company_customers/i.test(sql)));
});
