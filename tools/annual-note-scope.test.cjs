'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
const start=source.indexOf("app.patch('/api/company-years/:companyId/sections/:section'");
const end=source.indexOf('const companyAttachmentBytesCacheV76401',start);
function fixture(){
 let handler,revision=1,companies=[{id:'alpha69',name:'Alpha',year:'2569',note:'Alpha 69'},{id:'alpha70',name:'Alpha',year:'2570',note:'Alpha 70'},{id:'beta69',name:'Beta',year:'2569',note:'Beta 69'}],pending;
 const writes=[];const client={release(){},async query(sql,args){
 if(sql==='BEGIN'){pending=structuredClone(companies);return {rows:[]};}
 if(sql==='ROLLBACK'){pending=null;return {rows:[]};}
 if(sql==='COMMIT'){companies=pending;return {rows:[]};}
 if(sql.startsWith('SELECT data,revision FROM app_state'))return {rows:[{data:{companies:pending},revision}]};
 if(sql.startsWith('UPDATE app_state')){pending=JSON.parse(args[0]);return {rows:[{revision:++revision}]};}
 if(sql.startsWith('UPDATE company_years')){writes.push(args);return {rows:[]};}
 throw new Error('Unexpected SQL: '+sql);
 }};
 vm.runInNewContext(source.slice(start,end),{app:{patch(...args){handler=args.at(-1)}},pool:{connect:async()=>client},localOnly(){},staffPermissionRequired:()=>()=>{},compressedStateCache:{}});
 return {writes,get companies(){return companies},async save(id,year,note,section='11'){let status=200,body;await handler({params:{companyId:id,section},body:{patch:{note},scope:{companyYearId:id,year}}},{status(code){status=code;return this},json(value){body=value;return this}});return {status,body}}};
}
test('annual note saves and clears affect only the selected company/year',async()=>{
 const f=fixture();assert.equal((await f.save('alpha69','2569','Changed Alpha 69')).status,200);
 assert.deepEqual(f.companies.map(c=>c.note),['Changed Alpha 69','Alpha 70','Beta 69']);
 assert.equal((await f.save('alpha70','2570','Changed Alpha 70')).status,200);
 assert.deepEqual(f.companies.map(c=>c.note),['Changed Alpha 69','Changed Alpha 70','Beta 69']);
 assert.equal((await f.save('alpha69','2569','')).status,200);
 assert.deepEqual(f.companies.map(c=>c.note),['','Changed Alpha 70','Beta 69']);
 assert.equal(f.writes.at(-1)[0],'alpha69');assert.equal(f.writes.at(-1)[2],'');
});
test('wrong year is rejected and additional packages cannot overwrite a note',async()=>{
 const f=fixture();assert.equal((await f.save('alpha69','2570','Wrong year')).status,409);assert.equal(f.writes.length,0);
 assert.equal((await f.save('beta69','2569','Wrong section','10')).status,200);
 assert.deepEqual(f.companies.map(c=>c.note),['Alpha 69','Alpha 70','Beta 69']);
});
