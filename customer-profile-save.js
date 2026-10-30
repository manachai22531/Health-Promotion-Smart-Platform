'use strict';
const fields=['title','firstName','lastName','phone','email'];
const personal=record=>({title:String(record.title||''),firstName:String(record.first||''),lastName:String(record.last||''),phone:String(record.phone||''),email:String(record.email||'')});
const locked=record=>Boolean(record.visitedAt||record.chargeCloseAt||(record.orderHisAt&&(!record.cancelOrderAt||Date.parse(record.orderHisAt)>Date.parse(record.cancelOrderAt))));
const failure=(message,status=400)=>Object.assign(Error(message),{status});
const readSql=`SELECT cc.id AS membership_id,cc.customer_id,cc.company_year_id,cc.source_data,cc.visited_at,c.title,c.first_name,c.last_name,c.phone,c.email,c.identification_number FROM company_customers cc JOIN customers c ON c.id=cc.customer_id WHERE cc.legacy_record_key=$1`;
function recordOf(row){return {...row.source_data,key:row.source_data?.key||'',companyId:row.company_year_id,title:row.title||row.source_data?.title||'',first:row.first_name||row.source_data?.first||'',last:row.last_name||row.source_data?.last||'',phone:row.phone||row.source_data?.phone||'',email:row.email||row.source_data?.email||'',id:row.identification_number||row.source_data?.id||'',visitedAt:row.visited_at||row.source_data?.visitedAt||null}}
function compact(record,contextKey){return {name:[record.title,record.first,record.last].filter(Boolean).join(' '),profile:personal(record),locked:locked(record),confirmedAt:record.visitedAt||null,contextKey}}
function normalize(body){const next={};for(const [key,max] of [['title',30],['firstName',100],['lastName',100],['phone',30],['email',160]]){if(typeof body?.[key]!=='string'||body[key].length>max)throw failure('ข้อมูลส่วนบุคคลไม่ถูกต้อง: '+key);next[key]=body[key].trim()}if(!next.firstName||!next.lastName)throw failure('กรุณากรอกชื่อและนามสกุล');if(next.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))throw failure('รูปแบบอีเมลไม่ถูกต้อง');return next}
function registerCustomerProfileSave({app,pool,customerSessionRequired,safeCustomerProfile,invalidate}){
 const compactRequest=req=>req.query.compact==='1';
 app.get('/customer-api/me/personal-profile',customerSessionRequired,async(req,res)=>{const recordKey=String(req.customerSession.recordKey);try{const row=(await pool.query({text:readSql,values:[recordKey],query_timeout:8000})).rows[0];if(!row)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});res.set('Cache-Control','private, no-store').json({ok:true,profile:compact(recordOf(row),recordKey)})}catch(error){res.status(503).json({error:'ตรวจสอบข้อมูลล่าสุดไม่สำเร็จ กรุณาลองตรวจสอบอีกครั้ง'})}});
 app.put('/customer-api/me/profile',customerSessionRequired,async(req,res)=>{
  const recordKey=String(req.customerSession.recordKey);
  if(req.customerSession.loginMethod==='qr')return res.status(403).json({error:'ลิงก์นี้ใช้เลือกแพ็กเกจเท่านั้น กรุณาติดต่อเจ้าหน้าที่เพื่อแก้ข้อมูลส่วนตัว'});
  let next;try{next=normalize(req.body);if(req.body.expectedProfile!==undefined&&(!req.body.expectedProfile||typeof req.body.expectedProfile!=='object'||Array.isArray(req.body.expectedProfile)||fields.some(key=>typeof req.body.expectedProfile[key]!=='string')))throw failure('กรุณาโหลดข้อมูลส่วนบุคคลล่าสุดก่อนบันทึก')}catch(error){return res.status(error.status||400).json({error:error.message})}
  let db,committed=false;try{
   db=await pool.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='8000ms'");
   // Same lock order as the full-state saver. Never hydrate or replay all customer rows.
   const snapshot=(await db.query('SELECT data,revision FROM app_state WHERE id=1 FOR UPDATE')).rows[0];if(!snapshot)throw failure('ไม่พบข้อมูลระบบ',503);
   const row=(await db.query(readSql+' FOR UPDATE OF cc,c',[recordKey])).rows[0];if(!row)throw failure('ไม่พบข้อมูลลูกค้า',404);const record=recordOf(row);record.key=recordKey;
   if(locked(record))throw failure('เจ้าหน้าที่ยืนยันรายการหรือส่งคำสั่งตรวจแล้ว ไม่สามารถแก้ไขข้อมูลได้อีก',409);
   const before=personal(record);if(req.body.expectedProfile&&fields.some(key=>req.body.expectedProfile[key]!==before[key]))throw failure('ข้อมูลถูกแก้ไขแล้ว กรุณาตรวจสอบข้อมูลล่าสุดก่อนบันทึก',409);
   const changed=fields.some(key=>before[key]!==next[key]);let revision=Number(snapshot.revision);
   const patch={title:next.title,first:next.firstName,last:next.lastName,phone:next.phone,email:next.email};
   if(changed){
    await db.query(`UPDATE customers SET title=$2,first_name=$3,last_name=$4,phone=$5,email=$6,source_data=COALESCE(source_data,'{}'::jsonb)||$7::jsonb,revision=revision+1,updated_at=NOW() WHERE id=$1`,[row.customer_id,next.title,next.firstName,next.lastName,next.phone,next.email,JSON.stringify(patch)]);
    // Personal identity/contact is shared by this customer; membership-specific clinical/package/note fields are preserved.
    const memberships=(await db.query("UPDATE company_customers SET source_data=COALESCE(source_data,'{}'::jsonb)||$2::jsonb,revision=revision+1,updated_at=NOW() WHERE customer_id=$1 RETURNING legacy_record_key",[row.customer_id,JSON.stringify(patch)])).rows;const keys=new Set(memberships.map(item=>String(item.legacy_record_key)));
    if(Array.isArray(snapshot.data?.records)){const records=snapshot.data.records.map(item=>keys.has(String(item.key||item.id))?{...item,...patch}:item);revision=Number((await db.query("UPDATE app_state SET data=jsonb_set(data,'{records}',$1::jsonb),revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision",[JSON.stringify(records)])).rows[0].revision)}else revision=Number((await db.query('UPDATE app_state SET revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision')).rows[0].revision);
    await db.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);
    const company=(await db.query('SELECT cy.screening_year,c.company_name FROM company_years cy JOIN companies c ON c.id=cy.company_id WHERE cy.id=$1',[row.company_year_id])).rows[0];
    await db.query(`INSERT INTO checkup_audit_log(record_key,customer_name,id_passport,company_id,company_name,company_year,package_code,package_name,action,performed_by_user_id,performed_by_username,performed_by_display_name,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'UPDATE','customer-self-service','customer','ลูกค้าแก้ไขข้อมูลส่วนตัว',$9::jsonb)`,[recordKey,[next.title,next.firstName,next.lastName].filter(Boolean).join(' '),record.id||'',row.company_year_id,company?.company_name||'',company?.screening_year||'',record.code||'',record.packageName||'',JSON.stringify({kind:'CUSTOMER_PROFILE_UPDATE',before,after:next})]);
   }
   Object.assign(record,patch);let profile;
   if(compactRequest(req)){profile=compact(record,recordKey)}else{
    const companyRow=(await db.query('SELECT cy.id,cy.screening_year,cy.source_data,c.company_name FROM company_years cy JOIN companies c ON c.id=cy.company_id WHERE cy.id=$1',[row.company_year_id])).rows[0],company=companyRow?{...companyRow.source_data,id:companyRow.id,name:companyRow.company_name,year:companyRow.screening_year}:null;
    const packages=(await db.query('SELECT id,package_code,package_name,price,usage_condition,source_data FROM contract_packages ORDER BY updated_at DESC,id')).rows.map(item=>({...item.source_data,id:String(item.source_data?.id||item.id),code:item.package_code,name:item.package_name,price:item.price,usageCondition:item.usage_condition}));
    profile={...safeCustomerProfile(record,company,{...snapshot.data,packages}),contextKey:recordKey};
   }
   await db.query('COMMIT');committed=true;if(changed)invalidate();res.set('Cache-Control','private, no-store').json({ok:true,profile,compact:compactRequest(req),changed,revision,health:{fastPath:true,customerRows:changed?1:0}});
  }catch(error){if(db&&!committed)await db.query('ROLLBACK').catch(()=>{});const busy=['55P03','57014'].includes(error.code);console.error('[CUSTOMER PROFILE SAVE]',error.code||error.status||'error');res.status(error.status||(busy?503:500)).json({error:error.status?error.message:busy?'ระบบกำลังบันทึกข้อมูลอื่น กรุณาตรวจสอบข้อมูลล่าสุดแล้วลองใหม่':'บันทึกข้อมูลส่วนบุคคลไม่สำเร็จ กรุณาตรวจสอบข้อมูลล่าสุด'})}finally{db?.release()}
 });
}
module.exports={registerCustomerProfileSave,normalize,personal};
