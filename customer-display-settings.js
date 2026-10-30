'use strict';
const {defaults,normalize}=require('./assets/customer-display-model');
const key='customer_display_settings';
function decode(raw){if(!raw)return {revision:0,settings:{...defaults}};const value=JSON.parse(raw);return {...value,settings:normalize(value.settings)}}
function registerCustomerDisplay({app,pool,localOnly,staffPermissionRequired}){
 const read=async()=>{const result=await pool.query('SELECT value,updated_at FROM system_settings WHERE key=$1',[key]);return {...decode(result.rows[0]?.value),updatedAt:result.rows[0]?.updated_at||null}};
 app.get('/customer-api/display-settings',async(_req,res)=>{try{const value=await read();res.set('Cache-Control','no-store').json({settings:{...value.settings,knowledgeArticles:value.settings.knowledgeArticles.filter(article=>article.published)},revision:value.revision})}catch(error){console.error('[CUSTOMER DISPLAY READ]',error.message);res.status(500).json({error:'อ่านการตั้งค่าหน้าลูกค้าไม่สำเร็จ'})}});
 app.get('/api/customer-display-settings',localOnly,staffPermissionRequired('customerPageManage'),async(_req,res)=>{try{res.set('Cache-Control','no-store').json(await read())}catch(error){res.status(500).json({error:'อ่านการตั้งค่าหน้าลูกค้าไม่สำเร็จ'})}});
 app.put('/api/customer-display-settings',localOnly,staffPermissionRequired('customerPageManage'),async(req,res)=>{
  let settings;const revision=req.body?.expectedRevision;
  try{if(!Number.isSafeInteger(revision)||revision<0)throw Error('กรุณาโหลดค่าล่าสุดก่อนบันทึก');settings=normalize(req.body?.settings)}catch(error){return res.status(400).json({error:error.message})}
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query("INSERT INTO system_settings(key,value) VALUES($1,'') ON CONFLICT(key) DO NOTHING",[key]);
   const before=decode((await db.query('SELECT value FROM system_settings WHERE key=$1 FOR UPDATE',[key])).rows[0].value);
   if(before.revision!==revision){await db.query('ROLLBACK');return res.status(409).json({error:'มีผู้ดูแลบันทึกค่าใหม่แล้ว กรุณาโหลดค่าล่าสุดก่อนบันทึก'})}
   const updatedBy=req.staffUser.username||'system',value={revision:revision+1,settings,updatedBy};
   const updated=await db.query('UPDATE system_settings SET value=$2,updated_at=NOW() WHERE key=$1 RETURNING updated_at',[key,JSON.stringify(value)]);
   await db.query("INSERT INTO checkup_workflow_audit(entity_type,entity_id,action,details,performed_by,client_address) VALUES('SYSTEM_CONFIG','customer-display-settings','UPDATE',$1::jsonb,$2,$3)",[JSON.stringify({before:before.settings,after:settings,revision:value.revision}),updatedBy,String(req.ip||'')]);
   await db.query('COMMIT');res.set('Cache-Control','no-store').json({...value,updatedAt:updated.rows[0].updated_at});
  }catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('[CUSTOMER DISPLAY SAVE]',error.message);res.status(500).json({error:'บันทึกการตั้งค่าไม่สำเร็จ'})}finally{db.release()}
 });
}
async function ensureCustomerDisplayPermission(pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const marker=await db.query("INSERT INTO system_settings(key,value) VALUES('customer_display_permission_v1','1') ON CONFLICT(key) DO NOTHING RETURNING key");
  if(!marker.rowCount){await db.query('COMMIT');return false}
  const row=(await db.query('SELECT data FROM app_state WHERE id=1 FOR UPDATE')).rows[0];
  const roles=row?.data?.roles||[],changed=[];
  for(const role of roles){
   if(!['admin','marketing'].includes(String(role.id)))continue;
   const permissions=Array.isArray(role.permissions)?role.permissions:[];
   if(permissions.includes('customerPageManage'))continue;
   changed.push({roleId:role.id,before:[...permissions],after:[...permissions,'customerPageManage']});role.permissions=[...permissions,'customerPageManage'];
  }
  if(changed.length){
   await db.query("UPDATE app_state SET data=jsonb_set(data,'{roles}',$1::jsonb),revision=revision+1 WHERE id=1",[JSON.stringify(roles)]);
   await db.query("INSERT INTO checkup_workflow_audit(entity_type,entity_id,action,details,performed_by) VALUES('ROLE_PERMISSION','customer-page-setup','MIGRATE',$1::jsonb,'system')",[JSON.stringify({roles:changed})]);
  }
  await db.query('COMMIT');return Boolean(changed.length);
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}finally{db.release()}
}
module.exports={registerCustomerDisplay,ensureCustomerDisplayPermission};
