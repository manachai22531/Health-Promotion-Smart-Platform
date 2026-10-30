'use strict';
const noteOf=require('./assets/personal-note-model').value;
function registerPersonalNotes({app,pool,localOnly,staffPermissionRequired,invalidate}){
 app.patch('/api/records/:key/personal-note',localOnly,staffPermissionRequired(null),async(req,res)=>{
  const permissions=new Set(req.staffRole?.permissions||[]);if(String(req.staffUser.roleId)!=='admin'&&!permissions.has('customerEdit')&&!permissions.has('receiveEdit'))return res.status(403).json({error:'ไม่มีสิทธิ์แก้ไขหมายเหตุรายบุคคล'});
  const {note,expectedNote}=req.body||{};if(typeof note!=='string'||note.length>2000||typeof expectedNote!=='string'||expectedNote.length>2000||Object.keys(req.body).some(k=>!['note','expectedNote'].includes(k)))return res.status(400).json({error:'หมายเหตุต้องเป็นข้อความไม่เกิน 2,000 ตัวอักษร และต้องโหลดข้อมูลล่าสุดก่อนบันทึก'});
  const db=await pool.connect();try{
   await db.query('BEGIN');
   // Follow the full-state saver lock order: app_state before membership rows.
   const snapshot=(await db.query('SELECT data,revision FROM app_state WHERE id=1 FOR UPDATE')).rows[0];
   const row=(await db.query('SELECT id,source_data FROM company_customers WHERE legacy_record_key=$1 FOR UPDATE',[req.params.key])).rows[0];if(!row){await db.query('ROLLBACK');return res.status(404).json({error:'ไม่พบผู้รับบริการ'})}
   const before=noteOf(row.source_data);if(before!==expectedNote){await db.query('ROLLBACK');return res.status(409).json({error:'มีผู้แก้ไขหมายเหตุแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก'})}
   const updatedAt=new Date().toISOString(),updatedBy=req.staffUser.username,patch={personalNote:note,personalNoteUpdatedAt:updatedAt,personalNoteUpdatedBy:updatedBy};
   await db.query("UPDATE company_customers SET source_data=COALESCE(source_data,'{}'::jsonb)||$2::jsonb,revision=revision+1,updated_at=NOW() WHERE id=$1",[row.id,JSON.stringify(patch)]);
   let revision;if(Array.isArray(snapshot.data?.records)){const records=snapshot.data.records.map(record=>String(record.key||record.id)===req.params.key?{...record,...patch}:record);revision=(await db.query("UPDATE app_state SET data=jsonb_set(data,'{records}',$1::jsonb),revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision",[JSON.stringify(records)])).rows[0].revision}else revision=(await db.query('UPDATE app_state SET revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision')).rows[0].revision;
   await db.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);
   await db.query("INSERT INTO checkup_workflow_audit(entity_type,entity_id,action,details,performed_by,client_address) VALUES('CUSTOMER_PERSONAL_NOTE',$1,'UPDATE',$2::jsonb,$3,$4)",[req.params.key,JSON.stringify({before,after:note}),updatedBy,String(req.ip||'')]);
   await db.query('COMMIT');invalidate();res.set('Cache-Control','no-store').json({ok:true,...patch,revision:Number(revision)});
  }catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('[PERSONAL NOTE]',error.message);res.status(500).json({error:'บันทึกหมายเหตุไม่สำเร็จ กรุณาลองใหม่'})}finally{db.release()}
 });
}
module.exports={registerPersonalNotes,noteOf};
