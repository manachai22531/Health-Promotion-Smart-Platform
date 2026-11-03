'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {choices}=require('./customer-primary-selection');
function fixture(bookings=[]){const captured=[];return {captured,db:{query:async(sql,args)=>{if(sql.includes('FROM checkup_bookings'))return {rows:bookings};if(sql.includes('FROM company_year_circulars'))return {rows:[{memo_data:{hospitalPrograms:[{code:'CIRCULAR'}]}}]};captured.push({sql,args});return {rows:[{package_code:'A',package_name:'A',total_price:10,detail_items:[]}]}}}}}
test('circular tab uses company/year programs, all tab includes active approved catalog when no Booking',async()=>{
 const f=fixture();await choices(f.db,{key:'R',companyId:'CO'});await choices(f.db,{key:'R',companyId:'CO'},'all');
 assert.deepEqual(f.captured[0].args,[['CIRCULAR']]);assert.deepEqual(f.captured[1].args,[null]);
 for(const call of f.captured){assert.match(call.sql,/is_approved IS DISTINCT FROM false/);assert.match(call.sql,/active_from/);assert.match(call.sql,/total_price>=0/)}
});
test('Booking restrictions apply to both tabs, and Booking without entitled codes stays empty',async()=>{
 const f=fixture([{package_code:'BOOK1|BOOK2',default_package_code:'DEFAULT'}]);
 await choices(f.db,{key:'R'},'all');assert.deepEqual(f.captured[0].args,[['BOOK1','BOOK2','DEFAULT']]);
 const circular=fixture([{package_code:'CIRCULAR|OTHER',default_package_code:''}]);await choices(circular.db,{key:'R'},'circular');assert.deepEqual(circular.captured[0].args,[['CIRCULAR']]);
 const empty=fixture([{package_code:'',default_package_code:''}]);assert.deepEqual(await choices(empty.db,{key:'R'},'all'),[]);assert.equal(empty.captured.length,0);
});
const {submit}=require('./customer-primary-selection');
function submissionFixture({booking=false,existing=false}={}){
 const writes=[];const record={key:'R',companyId:'CO',...(existing?{primaryPackages:[{code:'OLD'}]}:{})};
 const db={release(){},async query(sql,args){
  if(sql.startsWith('SELECT data,revision'))return {rows:[{data:{records:[record]},revision:1}]};
  if(sql.startsWith('SELECT source_data,company_year_id'))return {rows:[{source_data:record,company_year_id:'CO'}]};
  if(sql.startsWith('SELECT source_data FROM company_years'))return {rows:[{source_data:{name:'Company'}}]};
  if(sql.includes('FROM contract_packages')||sql.includes('FROM package_categories'))return {rows:[]};
  if(sql.includes('FROM checkup_bookings'))return {rows:booking?[{package_code:'BOOK',default_package_code:''}]:[]};
  if(sql.includes('FROM company_year_circulars'))return {rows:[{memo_data:{hospitalPrograms:[{code:'CIRCULAR'}]}}]};
  if(sql.includes('FROM his_packages'))return {rows:!args[0]||args[0].includes('ALL')?[{package_code:'ALL',package_name:'All catalog package',total_price:100}]:[]};
  if(sql.startsWith('UPDATE company_customers'))writes.push(args);
  if(sql.includes('RETURNING revision'))return {rows:[{revision:2}]};
  return {rows:[]};
 }};
 return {pool:{connect:async()=>db},writes};
}
test('all-tab selection can submit an active catalog package; price, Booking and existing-primary checks remain enforced',async()=>{
 const actor={id:'staff',username:'staff',displayName:'Staff'};
 const body={primaryCode:'ALL',primaryExpectedPrice:100,billingIds:[],cashIds:[],contractIds:[],expectedPrices:{}};
 const f=submissionFixture();const result=await submit({pool:f.pool,key:'R',body,actor,invalidate(){}});assert.equal(result.patch.primaryPackages[0].code,'ALL');assert.equal(f.writes.length,1);
 for(const [options,patch] of [[{booking:true},{}],[{existing:true},{}],[{},{primaryExpectedPrice:99}]]){const denied=submissionFixture(options);await assert.rejects(submit({pool:denied.pool,key:'R',body:{...body,...patch},actor,invalidate(){}}),e=>e.status===409);assert.equal(denied.writes.length,0)}
});
