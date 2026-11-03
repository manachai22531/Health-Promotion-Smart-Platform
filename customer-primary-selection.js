'use strict';
const crypto=require('node:crypto'),catalog=require('./customer-catalog');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const actual=record=>(record.primaryPackages?.length?record.primaryPackages:[{code:record.code,name:record.packageName,price:record.packagePrice}]).filter(p=>p.code||p.name);
async function choices(db,record,scope='circular'){
 const bookings=(await db.query("SELECT b.package_code,p.default_package_code FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id WHERE b.record_key=$1 AND b.booking_status<>'CANCELLED'",[record.key])).rows;
 const memo=(await db.query('SELECT memo_data FROM company_year_circulars WHERE company_year_id=$1',[record.companyId])).rows[0]?.memo_data||{};
 const split=value=>String(value||'').split(/\s*\|\s*/).filter(Boolean),bookingCodes=bookings.flatMap(b=>[...split(b.package_code),...split(b.default_package_code)]),companyCodes=(memo.hospitalPrograms||[]).map(p=>String(p.code||'').trim()).filter(Boolean);
 // Circular tab intersects company programs with Booking; all tab retains Booking restrictions.
 const codes=scope==='all'?(bookings.length?bookingCodes:null):bookings.length?companyCodes.filter(code=>bookingCodes.includes(code)):companyCodes;if(codes&&!codes.length)return [];
 const rows=(await db.query("SELECT package_code,package_name,total_price,detail_items FROM his_packages WHERE ($1::text[] IS NULL OR package_code=ANY($1::text[])) AND total_price IS NOT NULL AND total_price>=0 AND is_approved IS DISTINCT FROM false AND (active_from='' OR active_from<=to_char(CURRENT_DATE,'YYYY-MM-DD')) AND (active_to='' OR active_to>=to_char(CURRENT_DATE,'YYYY-MM-DD')) ORDER BY package_name",[codes])).rows;
 return rows.map(r=>({code:r.package_code,name:r.package_name,price:Number(r.total_price),details:r.detail_items||[]}));
}
async function submit({pool,key,body,actor,expectedIdentity,invalidate}){
 const db=await pool.connect();try{
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5000ms'");
 const snapshot=(await db.query('SELECT data,revision FROM app_state WHERE id=1 FOR UPDATE')).rows[0];
 const row=(await db.query('SELECT source_data,company_year_id,package_code,package_name,visited_at FROM company_customers WHERE legacy_record_key=$1 FOR UPDATE',[key])).rows[0];if(!row)throw fail('ไม่พบข้อมูลลูกค้า',404);
 const record={...row.source_data,key,companyId:row.company_year_id,visitedAt:row.visited_at||row.source_data?.visitedAt||null,code:row.package_code||row.source_data?.code||'',packageName:row.package_name||row.source_data?.packageName||''};
 if(expectedIdentity&&JSON.stringify([record.id||'',record.first||'',record.last||''])!==expectedIdentity)throw fail('ข้อมูลยืนยันตัวตนเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่');
 if(catalog.locked(record))throw fail('รายการนี้ส่ง Order หรือปิดค่าใช้จ่ายแล้ว ไม่สามารถแก้ไขได้');
 const company=(await db.query('SELECT source_data FROM company_years WHERE id=$1',[record.companyId])).rows[0]?.source_data||{};
 const packages=(await db.query('SELECT id,package_code,package_name,price,source_data FROM contract_packages')).rows.map(r=>({...r.source_data,id:String(r.source_data?.id||r.id),code:r.package_code,name:r.package_name,price:r.price}));
 const masters=(await db.query("SELECT c.code,c.name,c.active,COALESCE(json_agg(json_build_object('name',s.name,'active',s.active)) FILTER(WHERE s.id IS NOT NULL),'[]'::json) subcategories FROM package_categories c LEFT JOIN package_subcategories s ON s.category_id=c.id GROUP BY c.id")).rows;
 const selection=catalog.buildSelection(body,company,{packages,customerCategoryMaster:masters}),patch={};
 if(body.primaryCode){
  if(actual(record).length||record.visitedAt||record.checkupConfirmedAt)throw fail('มีแพ็กเกจหลักหรือยืนยันการตรวจแล้ว กรุณาโหลดข้อมูลล่าสุดหรือติดต่อเจ้าหน้าที่');
  const item=(await choices(db,record,'all')).find(p=>p.code===body.primaryCode);if(!item)throw fail('แพ็กเกจหลักไม่ตรงกับสิทธิ์บริษัทหรือ Booking');
  if(typeof body.primaryExpectedPrice!=='number'||body.primaryExpectedPrice!==item.price)throw fail('ราคาแพ็กเกจหลักเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุด');
  patch.primaryPackages=[{code:item.code,name:item.name,price:item.price}];patch.code=item.code;patch.packageName=item.name;patch.packagePrice=item.price;
 }
 selection.orderId=record.customerPendingSelection?.orderId||crypto.randomUUID();selection.submittedAt=new Date().toISOString();selection.status='PENDING';selection.submittedBy=actor;patch.customerPendingSelection=selection;
 await db.query("UPDATE company_customers SET source_data=COALESCE(source_data,'{}'::jsonb)||$2::jsonb,package_code=$3,package_name=$4,revision=revision+1,updated_at=NOW() WHERE legacy_record_key=$1",[key,JSON.stringify(patch),patch.code??record.code,patch.packageName??record.packageName]);
 const records=Array.isArray(snapshot.data?.records)?snapshot.data.records.map(r=>String(r.key||r.id)===key?{...r,...patch}:r):null;
 const revision=records?(await db.query("UPDATE app_state SET data=jsonb_set(data,'{records}',$1::jsonb),revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision",[JSON.stringify(records)])).rows[0].revision:(await db.query('UPDATE app_state SET revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision')).rows[0].revision;
 await db.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);
 await db.query(`INSERT INTO checkup_audit_log(record_key,customer_name,id_passport,company_id,company_name,company_year,package_code,package_name,action,performed_by_user_id,performed_by_username,performed_by_display_name,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'UPDATE',$9,$10,$11,$12::jsonb)`,[key,[record.title,record.first,record.last].filter(Boolean).join(' '),record.id||'',record.companyId,company.name||'',company.year||'',patch.code??record.code,patch.packageName??record.packageName,actor.id,actor.username,actor.displayName,JSON.stringify({kind:actor.staff?'STAFF_CUSTOMER_SELECTION':'CUSTOMER_SELF_SELECTION_ID_VERIFIED',beforePrimary:actual(record),patch})]);
 await db.query('COMMIT');invalidate();return {ok:true,pendingSelection:selection,patch,revision:Number(revision)};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
module.exports={actual,choices,submit};
