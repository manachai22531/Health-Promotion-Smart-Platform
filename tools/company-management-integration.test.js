'use strict';
// Run only against an empty disposable app/database, never a real installation:
// COMPANY_TEST_BASE_URL=http://127.0.0.1:3000 COMPANY_TEST_PGPORT=55432 node --test tools/company-management-integration.test.js
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {selection,hasClinicalWork}=require('../company-management');
function hash(text){let h1=0xdeadbeef,h2=0x41c6ce57;for(const ch of text){h1=Math.imul(h1^ch.charCodeAt(0),2654435761);h2=Math.imul(h2^ch.charCodeAt(0),1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return(h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0')}
test('selection rejects empty, unknown and invalid ids, and counts selected records',()=>{
  const state={companies:[{id:'a'},{id:'b'}],records:[{companyId:'a'},{companyId:'b'}]};
  for(const ids of [[],['missing'],[null],Array(501).fill('a')])assert.throws(()=>selection({companyYearIds:ids},state));
  assert.deepEqual(selection({companyYearIds:['a','a']},state).ids,['a']);
  assert.equal(selection({companyYearIds:['a']},state).records.length,1);
});
test('clinical work detection blocks visits and result payloads but allows empty metadata',()=>{
 for(const record of [{visitedAt:'2026-10-29'},{checkupConfirmedAt:'now'},{vn:'VN1'},{hisEmrResult:{items:[1]}},{hisPrimaryVisitUIDs:['v1']}])assert.equal(hasClinicalWork(record),true);
 assert.equal(hasClinicalWork({hisEmrResult:{},hisPrimaryVisitUIDs:[],visitedAt:null}),false);
});
test('real HTTP and PostgreSQL deletion and import history', {skip:!process.env.COMPANY_TEST_BASE_URL},async t=>{
  const base=process.env.COMPANY_TEST_BASE_URL,port=Number(process.env.COMPANY_TEST_PGPORT);
  assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);assert.ok(port>=55000,'Use a dedicated disposable database port >=55000');
  const pool=new Pool({host:'127.0.0.1',port,user:'health_check',database:'health_check_smart_search'});t.after(()=>pool.end());
  let cookie='';
  async function request(path,body,auth=true,method='POST'){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
  }
  async function state(){return(await request('/api/state',undefined,true,'GET')).body}
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM company_years')).rows[0].count,0,'Disposable app must start empty');
  const stored=(await pool.query('SELECT data,revision FROM app_state WHERE id=1')).rows[0];
  const original={...stored.data,companies:[],records:[],packages:[],_revision:Number(stored.revision)};
  const password='Local-fixture-86742';
  const user={id:'company-test-user',username:'company-test',displayName:'Test',roleId:'company-test-role',active:true,passwordChangedAt:new Date().toISOString(),passwordHash:hash(password)};
  let seeded={...original,roles:[...original.roles,{id:user.roleId,name:'Test',permissions:['companyView','companyDelete','customerImport']},{id:'denied-test-role',name:'Denied',permissions:[]}],users:[...original.users,user,{...user,id:'denied-test-user',username:'denied-test',roleId:'denied-test-role'}],companies:[{id:'cy-a',code:'A',name:'Same Company',year:'2569'},{id:'cy-b',code:'A',name:'Same Company',year:'2570'},{id:'cy-c',code:'C',name:'Other Company',year:'2569'}],records:[{key:'fixture-record',companyId:'cy-a',id:'fixture-person',first:'Test',last:'Customer'}]};
  const seedClient=await pool.connect();
  try{await seedClient.query('BEGIN');await require('../relational-store').syncStateToRelational(seedClient,seeded,original._revision+1);await seedClient.query('UPDATE app_state SET data=$1::jsonb,revision=$2 WHERE id=1',[JSON.stringify(seeded),original._revision+1]);await seedClient.query('COMMIT')}finally{seedClient.release()}
  const logged=await request('/api/auth/login',{username:user.username,password},false);assert.equal(logged.status,200);cookie=logged.cookie.split(';')[0];
  let current=await state();
  const deletion=(extra={})=>({companyYearIds:['cy-a','cy-c'],_revision:current._revision,reason:'Remove test fixture',...extra});
  await t.test('requires authentication and permission',async()=>{
    assert.equal((await request('/api/companies/bulk-delete',deletion({preview:true}),false)).status,401);
    assert.equal((await request('/api/company-import-history',undefined,false,'GET')).status,401);
    const denied=await request('/api/auth/login',{username:'denied-test',password},false),saved=cookie;cookie=denied.cookie.split(';')[0];
    assert.equal((await request('/api/companies/bulk-delete',deletion({preview:true}))).status,403);assert.equal((await request('/api/company-import-history',undefined,true,'GET')).status,403);cookie=saved;
  });
  let versions;
  await t.test('retains both uploaded versions and returns exact original bytes',async()=>{
    for(const bytes of ['first-version','second-version']){
      const r=await fetch(base+'/api/company-import-files/cy-a',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/octet-stream','X-File-Name':'fixture.xlsx','X-Row-Count':'1'},body:Buffer.from(bytes)});assert.equal(r.status,200,await r.text());
    }
    const history=await request('/api/company-import-history?companyId=cy-a',undefined,true,'GET');assert.equal(history.status,200);versions=history.body.items;assert.equal(versions.length,2);
    assert.equal(await(await fetch(base+`/api/company-import-history/${versions[1].id}/file`,{headers:{Cookie:cookie}})).text(),'first-version');
  });
  await t.test('preview reports all selected years and customer impact without deleting',async()=>{
    const r=await request('/api/companies/bulk-delete',deletion({preview:true}));assert.equal(r.status,200);assert.equal(r.body.customerCount,1);assert.equal(r.body.companies.length,2);assert.equal((await state()).companies.length,3);
    assert.equal((await request('/api/companies/bulk-delete',deletion({_revision:current._revision-1,preview:true}))).status,409);
    assert.equal((await request('/api/companies/bulk-delete',deletion({confirmation:'wrong'}))).status,400);
    assert.equal((await request('/api/companies/bulk-delete',deletion({confirmation:'ลบ 2 รายการ',reason:'  '}))).status,400);
  });
  await t.test('Booking blocks the whole batch',async()=>{
    await pool.query("INSERT INTO checkup_projects(id,project_name,company_id) VALUES('fixture-project','Test','cy-a')");
    assert.equal((await request('/api/companies/bulk-delete',deletion({confirmation:'ลบ 2 รายการ'}))).status,409);
    assert.equal((await state()).companies.length,3);await pool.query("DELETE FROM checkup_projects WHERE id='fixture-project'");
  });
  await t.test('clinical records block deletion without changing any year',async()=>{
    await pool.query(`UPDATE company_customers SET source_data=source_data || '{"checkupConfirmedAt":"2026-10-29"}'::jsonb WHERE legacy_record_key='fixture-record'`);
    try{const result=await request('/api/companies/bulk-delete',deletion({preview:true}));assert.equal(result.status,409);assert.match(result.body.error,/งานตรวจ/);assert.equal((await state()).companies.length,3)}
    finally{await pool.query("UPDATE company_customers SET source_data=source_data - 'checkupConfirmedAt' WHERE legacy_record_key='fixture-record'")}
  });
  await t.test('v7.64.87 clinical operation history protects a case even after confirmation is cleared',async()=>{
    await pool.query("INSERT INTO his_operation_attempts(operation_id,record_key,operation) VALUES('fixture-operation','fixture-record','open-visit')");
    try{assert.equal((await request('/api/companies/bulk-delete',deletion({preview:true}))).status,409);assert.equal((await state()).companies.length,3)}
    finally{await pool.query("DELETE FROM his_operation_attempts WHERE operation_id='fixture-operation'")}
  });
  await t.test('late database failure rolls back deletions and backup creation together',async()=>{
    await pool.query("CREATE FUNCTION reject_test_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test late failure'; END $$");
    await pool.query('CREATE TRIGGER reject_test_state BEFORE UPDATE ON app_state FOR EACH ROW EXECUTE FUNCTION reject_test_state()');
    try{assert.equal((await request('/api/companies/bulk-delete',deletion({confirmation:'ลบ 2 รายการ'}))).status,500);assert.equal((await pool.query('SELECT count(*)::int AS count FROM company_years')).rows[0].count,3);assert.equal((await pool.query('SELECT count(*)::int AS count FROM company_deletion_backups')).rows[0].count,0)}
    finally{await pool.query('DROP TRIGGER reject_test_state ON app_state');await pool.query('DROP FUNCTION reject_test_state()')}
  });
  await t.test('deletes only selected years and preserves backup and historical files',async()=>{
    const r=await request('/api/companies/bulk-delete',deletion({confirmation:'ลบ 2 รายการ'}));assert.equal(r.status,200,JSON.stringify(r.body));
    current=await state();assert.deepEqual(current.companies.map(c=>c.id),['cy-b']);assert.equal(current.records.length,0);
    const backup=(await pool.query('SELECT data FROM company_deletion_backups WHERE id=$1',[r.body.backupId])).rows[0].data;assert.equal(backup.reason,'Remove test fixture');assert.equal(backup.state.records.length,1);assert.equal(backup.state.companies.length,3);assert.equal(backup.documents.company_year_import_files.length,1);
    assert.equal(await(await fetch(base+`/api/company-import-history/${versions[0].id}/file`,{headers:{Cookie:cookie}})).text(),'second-version');
    assert.equal((await request('/api/companies/bulk-delete',deletion({confirmation:'ลบ 2 รายการ'}))).status,409);
  });
});
