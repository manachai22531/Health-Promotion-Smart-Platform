'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=__dirname;
const {thaiDateKey,buildConfirmedRows,eligibleConfirmedRecords}=require('./worklist-confirmed-fallback');
const record={key:'record-1',companyId:'co1',checkupConfirmedAt:'2026-10-10T04:20:00Z',hn:'HN-001',first:'สมหญิง',last:'ทดสอบ',id:'123456',primaryPackages:[{code:'PKG1',name:'ตรวจสุขภาพ'}]};
const base={records:[record],companies:[{id:'co1',name:'บริษัททดสอบ'}],date:'2026-10-10'};
test('Thai date boundary honors hospital date',()=>{
 assert.equal(thaiDateKey('2026-10-09T18:30:00Z'),'2026-10-10');
 assert.equal(thaiDateKey('2026-10-10T17:30:00Z'),'2026-10-11');
});
test('confirmed without VN reaches Worklist without invented HIS identifiers',()=>{
 const rows=buildConfirmedRows(base);assert.equal(rows.length,1);
 assert.equal(rows[0].record_key,'record-1');assert.equal(rows[0].vn,'');assert.equal(rows[0].checkin_at,null);
 assert.equal(rows[0].source,'CONFIRMED_AWAITING_HIS_VISIT');assert.equal(rows[0].company_name,'บริษัททดสอบ');
});
test('wrong date, unrelated company, status and text are excluded',()=>{
 for(const opts of [{date:'2026-10-09'},{companyId:'co2'},{status:'CHECKED_IN'},{q:'other'}])assert.equal(buildConfirmedRows({...base,...opts}).length,0);
});
test('already-open HIS visit is not duplicated',()=>{
 assert.equal(buildConfirmedRows({...base,existingKeys:new Set(['record-1'])}).length,0);
});
test('project filter only returns matched booking',()=>{
 const found=new Map([['record-1',{project_id:'project-1',project_name:'โครงการ 1'}]]);
 assert.equal(buildConfirmedRows({...base,projectId:'project-2',bookingByRecord:found}).length,0);
 assert.equal(buildConfirmedRows({...base,projectId:'project-1',bookingByRecord:found})[0].project_name,'โครงการ 1');
});
test('Worklist endpoint merges confirmed state and bookings',async()=>{
 const source=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const begin=source.indexOf("app.get('/api/checkup-worklist'");
 const end=source.indexOf("app.get('/api/checkup-logs'",begin);
 assert.ok(begin>0&&end>begin);
 let handler;
 const queries=[];
 const fakePool={query:async(sql,params)=>{
  queries.push(sql);
  if(sql.includes('FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id JOIN checkup_visits'))return {rows:[]};
  if(sql.includes('FROM checkup_bookings b LEFT JOIN checkup_projects'))return {rows:[{record_key:'record-1',booking_id:'book1',project_id:'proj1',project_code:'PRJ1',project_name:'ตรวจปี 2569',company_name:'บริษัททดสอบ'}]};
  if(sql.includes('FROM checkup_audit_log'))return {rows:[]};
  throw new Error('Unexpected SQL: '+sql.slice(0,80));
 }};
 const context={app:{get:(url,_,fn)=>{handler=fn}},localOnly:()=>{},pool:fakePool,
   ensureLegacyStationVisits:async()=>{},readState:async()=>({records:[record],companies:base.companies}),eligibleConfirmedRecords,buildConfirmedRows,
   Date,Number,String,Map,Set,Math,Intl,console};
 vm.runInNewContext(source.slice(begin,end),context,{filename:'worklist-route.js'});
 let body,status;
 await handler({query:{date:base.date}},{json:o=>body=o,status:n=>{status=n;return{json:o=>body=o}}});
 assert.equal(status,undefined,JSON.stringify(body));assert.equal(body.items.length,1);assert.equal(body.items[0].project_code,'PRJ1');assert.equal(body.items[0].vn,'');
 assert.equal(queries.length,3);
});
test('A4 summary opens synchronously before HIS package fetch',()=>{
 const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
 const body=source.slice(source.indexOf('showA4Summary=async function(draft){const r=state.records.find(x=>x.key===draft.recordKey);'),source.indexOf('const showA4SummaryV725=',source.indexOf('showA4Summary=async function(draft){const r=state.records.find(x=>x.key===draft.recordKey);')));
 assert.ok(body.indexOf('showA4SummaryV41(draft);') < body.indexOf('const packages=await Promise.all('));
 assert.match(body,/AbortSignal\.timeout\(6000\)/);
});
test('confirmed Summary click has explicit permission/error handling',()=>{
 const source=fs.readFileSync(path.join(root,'assets/flow-v76384.js'),'utf8');
 assert.match(source,/if\(!canOpenCheckupSummary\(record\)\)return alert\(/);
 assert.match(source,/await showA4Summary\(pendingCheckup\)/);
 assert.match(source,/await loadWorklist\(\)/);
 assert.match(source,/todayBody\.innerHTML=confirmed\.map\(todayWorklistRow\)/);
});
