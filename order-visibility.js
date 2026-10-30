 'use strict';
// Update only visibility metadata: never replay the customer/company tables.
function registerOrderVisibility(app,{pool,localOnly,staffPermissionRequired,invalidate}){
 app.patch('/api/order-items/visibility',localOnly,staffPermissionRequired('orderItemManage'),async(req,res)=>{
  const {key,hidden,expectedHidden}=req.body||{};
  if(typeof key!=='string'||!key||key.length>1000||['__proto__','constructor','prototype'].includes(key)||typeof hidden!=='boolean'||typeof expectedHidden!=='boolean')return res.status(400).json({error:'ข้อมูลรายการไม่ถูกต้อง'});
  let db;try{db=await pool.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='5000ms'");
   const found=await db.query("SELECT data->'orderItemSettings'->$1 AS setting FROM app_state WHERE id=1 FOR UPDATE",[key]);
   if(!found.rows.length)throw Object.assign(Error('ไม่พบข้อมูลระบบ'),{status:404});
   const before=found.rows[0].setting||{};
   if(Boolean(before.hidden)!==expectedHidden)throw Object.assign(Error('รายการนี้ถูกแก้ไขแล้ว กรุณารีเฟรชก่อนลองใหม่'),{status:409});
   const setting={...before,hidden};
   const result=await db.query("UPDATE app_state SET data=jsonb_set(data,'{orderItemSettings}',COALESCE(data->'orderItemSettings','{}'::jsonb)||jsonb_build_object($1::text,$2::jsonb),true),revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision",[key,JSON.stringify(setting)]);
   const revision=Number(result.rows[0].revision);
   await db.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);
   await db.query("INSERT INTO audit_logs(entity_type,entity_id,action,before_data,after_data,changed_fields,performed_by,client_address) VALUES('ORDER_VISIBILITY',$1,'PATCH',$2::jsonb,$3::jsonb,'[\"hidden\"]'::jsonb,$4,$5)",[key,JSON.stringify(before),JSON.stringify(setting),String(req.staffUser.displayName||req.staffUser.username||req.staffUser.id),String(req.ip||'')]);
   await db.query('COMMIT');invalidate();res.json({ok:true,key,setting,revision});
  }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});res.status(e.status||500).json({error:e.status?e.message:'บันทึกการซ่อนไม่สำเร็จ กรุณาลองใหม่'})}finally{db?.release()}
 });
}
module.exports={registerOrderVisibility};
