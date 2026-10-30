'use strict';
function selection(body,state){
  const ids=body?.companyYearIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!id))throw Object.assign(new Error('กรุณาเลือกบริษัท/ปี 1–500 รายการ'),{status:400});
  const selected=new Set(ids),companies=state.companies.filter(c=>selected.has(c.id));
  if(companies.length!==selected.size)throw Object.assign(new Error('รายชื่อบริษัทเปลี่ยนแปลง กรุณาโหลดใหม่'),{status:409});
  return {ids:[...selected],companies,records:state.records.filter(r=>selected.has(r.companyId))};
}
function hasClinicalWork(record){
  const fields=['visitedAt','checkupConfirmedAt','vn','hisLastVisitUID','hisPrimaryVisitUIDs','hisLastResultAt','hisEmrResult','hisEmrResultsByVisit','hisVisitResult','healthBookApprovedAt','orderHisAt','openVisitAt','chargeCloseAt'];
  return fields.some(key=>{const value=record[key];return Array.isArray(value)?value.length>0:value&&typeof value==='object'?Object.keys(value).length>0:Boolean(String(value??'').trim())});
}
function registerCompanyManagement({app,pool,localOnly,staffPermissionRequired,readState,syncStateToRelational,compactAppState,invalidate}){
  app.get('/api/company-import-history',localOnly,staffPermissionRequired('customerImport'),async(req,res)=>{
    try{const result=await pool.query('SELECT id,company_id,file_name,mime_type,file_size,row_count,uploaded_at,uploaded_by FROM company_import_history WHERE ($1::text IS NULL OR company_id=$1) ORDER BY id DESC',[req.query.companyId?String(req.query.companyId):null]);res.set('Cache-Control','no-store');res.json({items:result.rows})}catch(error){res.status(500).json({error:'อ่านประวัติไฟล์ไม่สำเร็จ'})}
  });
  app.get('/api/company-import-history/:id/file',localOnly,staffPermissionRequired('customerImport'),async(req,res)=>{
    if(!/^\d+$/.test(req.params.id))return res.status(400).end();
    try{const result=await pool.query('SELECT file_name,file_data FROM company_import_history WHERE id=$1',[req.params.id]);if(!result.rowCount)return res.status(404).send('ไม่พบไฟล์');const row=result.rows[0];res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.send(row.file_data)}catch(error){res.status(500).send('ดาวน์โหลดไม่สำเร็จ')}
  });
  app.post('/api/companies/bulk-delete',localOnly,staffPermissionRequired('companyDelete'),async(req,res)=>{
    let client;
    try{
      const state=await readState(),chosen=selection(req.body,state),revision=Number(req.body._revision);
      if(!Number.isInteger(revision)||revision!==Number(state._revision))return res.status(409).json({error:'ข้อมูลเปลี่ยนแปลง กรุณาโหลดใหม่ก่อนลบ'});
      client=await pool.connect();await client.query('BEGIN');
      const locked=await client.query('SELECT revision FROM app_state WHERE id=1 FOR UPDATE');
      if(Number(locked.rows[0]?.revision)!==revision)throw Object.assign(new Error('ข้อมูลเปลี่ยนแปลง กรุณาโหลดใหม่'),{status:409});
      // Lock project changes while checking links, including projects created concurrently.
      await client.query('LOCK TABLE checkup_projects,checkup_bookings,checkup_visits,emr_cases,clinical_case_controls,his_operation_guards,his_operation_attempts IN SHARE ROW EXCLUSIVE MODE');
      const projects=await client.query('SELECT id FROM checkup_projects WHERE company_id=ANY($1::text[])', [chosen.ids]);
      if(projects.rowCount)throw Object.assign(new Error('มี Booking ผูกกับบริษัทที่เลือก กรุณาจัดการ Booking ก่อนลบ ระบบยังไม่ลบรายการใด'),{status:409});
      const recordKeys=chosen.records.map(record=>String(record.key||record.id||''));
      const linkedWork=await client.query(`SELECT EXISTS(SELECT 1 FROM checkup_bookings WHERE company_id=ANY($1::text[]) OR record_key=ANY($2::text[]))
        OR EXISTS(SELECT 1 FROM emr_cases e LEFT JOIN company_customers cc ON cc.id=e.company_customer_id
          WHERE cc.company_year_id=ANY($1::text[]) OR e.legacy_record_key=ANY($2::text[])) OR EXISTS(SELECT 1 FROM clinical_case_controls WHERE record_key=ANY($2::text[]) AND data<>'{}'::jsonb)
        OR EXISTS(SELECT 1 FROM his_operation_guards WHERE record_key=ANY($2::text[]))
        OR EXISTS(SELECT 1 FROM his_operation_attempts WHERE record_key=ANY($2::text[])) AS found`,[chosen.ids,recordKeys]);
      if(chosen.records.some(hasClinicalWork)||linkedWork.rows[0].found)throw Object.assign(new Error('มีงานตรวจหรือ Booking ในบริษัท/ปีที่เลือก ระบบยังไม่ลบรายการใด'),{status:409});
      if(req.body.preview===true){await client.query('ROLLBACK');return res.json({companies:chosen.companies.map(c=>({id:c.id,name:c.name,code:c.code,year:c.year})),customerCount:chosen.records.length,revision})}
      if(req.body.confirmation!==`ลบ ${chosen.companies.length} รายการ`)throw Object.assign(new Error('ข้อความยืนยันไม่ถูกต้อง'),{status:400});
      const reason=String(req.body.reason||'').trim();
      if(reason.length<3||reason.length>1000)throw Object.assign(new Error('กรุณาระบุเหตุผลการลบ 3–1,000 ตัวอักษร'),{status:400});
      const documents={};
      for(const [table,column] of [['company_year_documents','company_id'],['company_year_attachments','company_year_id'],['company_year_primary_pdfs','company_year_id'],['company_year_circulars','company_year_id'],['company_year_import_files','company_id']]){
        // Only backup tables present in this version; identifiers above are fixed constants.
        const exists=await client.query('SELECT to_regclass($1) AS name',[table]);
        if(exists.rows[0].name)documents[table]=(await client.query(`SELECT * FROM ${table} WHERE ${column}=ANY($1::text[])`,[chosen.ids])).rows;
      }
      const backup=await client.query('INSERT INTO company_deletion_backups(performed_by,source_revision,data,reason) VALUES($1,$2,$3::jsonb,$4) RETURNING id',[req.staffUser?.username||'staff',revision,JSON.stringify({state,companyYearIds:chosen.ids,documents,reason}),reason]);
      const ids=new Set(chosen.ids),next={...state,companies:state.companies.filter(c=>!ids.has(c.id)),records:state.records.filter(r=>!ids.has(r.companyId)),at:new Date().toISOString()};delete next._revision;
      await syncStateToRelational(client,next,revision+1);
      await client.query('UPDATE app_state SET data=$1::jsonb,revision=$2,updated_at=NOW() WHERE id=1',[JSON.stringify(compactAppState(next)),revision+1]);
      await client.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision+1]);
      await client.query('COMMIT');invalidate();res.json({ok:true,revision:revision+1,deleted:chosen.companies.length,backupId:backup.rows[0].id});
    }catch(error){if(client)await client.query('ROLLBACK');res.status(error.status||500).json({error:error.status?error.message:'ลบไม่สำเร็จ ระบบยกเลิกการลบทั้งหมด'})}finally{if(client)client.release()}
  });
}
module.exports={selection,hasClinicalWork,registerCompanyManagement};
