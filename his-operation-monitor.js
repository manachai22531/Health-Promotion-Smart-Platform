'use strict';
const crypto=require('node:crypto');
const norm=v=>String(v??'').trim();
const pending=op=>['RUNNING','UNKNOWN'].includes(op?.status);
const labels={'open-visit':'เปิด Visit',order:'ส่ง OrderHIS','cancel-order':'ยกเลิก Order','cancel-visit':'ยกเลิก Visit','charge-close':'ปิดค่าใช้จ่าย','profile-save':'บันทึกข้อมูล','customer-selection':'รับรายการลูกค้า',unconfirm:'ยกเลิกยืนยัน'};
const schemaSql=`CREATE TABLE IF NOT EXISTS his_operation_attempts(operation_id TEXT PRIMARY KEY,record_key TEXT NOT NULL,operation TEXT NOT NULL,request_data JSONB NOT NULL DEFAULT '{}'::jsonb,status TEXT NOT NULL DEFAULT 'RUNNING',stage TEXT NOT NULL DEFAULT 'PREPARED',started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ);CREATE INDEX IF NOT EXISTS his_operation_attempts_case_idx ON his_operation_attempts(record_key,started_at DESC);`;
function publicOperation(op,now=Date.now()){
 if(!op)return null;
 const active=pending(op),safeRetry=op.status==='FAILED'&&['PREPARED','REJECTED'].includes(op.stage);
 return {id:op.operation_id,name:op.operation,label:labels[op.operation]||op.operation,status:op.status,stage:op.stage,startedAt:op.started_at,finishedAt:op.finished_at||null,elapsedSeconds:Math.max(0,Math.floor(((op.finished_at?Date.parse(op.finished_at):now)-Date.parse(op.started_at))/1000)),canRetry:safeRetry,canCheck:active,message:op.status==='SUCCESS'?'ทำรายการสำเร็จแล้ว':safeRetry?'คำสั่งเดิมไม่สำเร็จ สามารถตรวจข้อมูลและลองใหม่ได้':op.status==='FAILED'?'คำสั่งสิ้นสุดแล้ว กรุณาตรวจข้อมูลก่อนทำต่อ':op.stage==='PREPARED'?'กำลังเตรียมข้อมูล ยังไม่ส่งคำสั่งไป HIS':op.stage==='ACKNOWLEDGED'?'HIS ตอบรับแล้ว กำลังตรวจการบันทึกผล':op.status==='UNKNOWN'?'ยังยืนยันผลคำสั่งเดิมไม่ได้ กรุณาตรวจสอบผลก่อนส่งซ้ำ':'ส่งคำสั่งแล้ว กำลังรอผลจาก HIS'};
}
// Only accept the exact VN returned by this operation; HN/date alone cannot prove ownership.
function acknowledgedVisit(response){const r=Array.isArray(response)?response[0]:response?.Result||response?.result||response?.Patient||response?.patient||response;return norm(r?.VisitUID||r?.visitUID||r?.VN||r?.vn)}
function registerMonitor({app,pool,localOnly,staffPermissionRequired,load,operation,finish,audit,callHis,patchRecordHisFields,isActive,onOpenVisitRecovered,positiveAck,hisResponseFailed}){
 const checks=new Set();
 async function snapshot(key){const r=await load(key),op=await operation(key),history=(await pool.query('SELECT operation_id,operation,status,stage,started_at,finished_at FROM his_operation_attempts WHERE record_key=$1 ORDER BY started_at DESC LIMIT 10',[key])).rows;const view=publicOperation(op);if(view?.name==='open-visit'&&(r.hisLastVisitUID||r.vn)){view.canRetry=false;if(view.status==='FAILED')view.message='เคสนี้มี VN แล้ว ไม่ต้องเปิด Visit ซ้ำ'}return{ok:true,serverNow:new Date().toISOString(),operation:view,history:history.map(x=>publicOperation(x)),record:{vn:r.hisLastVisitUID||r.vn||'',openVisitAt:r.openVisitAt||null}}}
 async function check(req,key){
  const r=await load(key);let op=await operation(key);if(!pending(op))return snapshot(key);
  if(checks.has(op.operation_id))return snapshot(key);checks.add(op.operation_id);
  try{
   // PREPARED can be revoked safely: the transport CAS refuses to dispatch a revoked token.
   if(op.stage==='PREPARED'&&Date.now()-Date.parse(op.started_at)>5*60000&&!isActive(op.operation_id)){
    const released=await pool.query("UPDATE his_operation_guards SET status='FAILED',finished_at=NOW() WHERE record_key=$1 AND operation_id=$2 AND stage='PREPARED' AND status IN ('RUNNING','UNKNOWN') RETURNING operation_id",[key,op.operation_id]);
    if(released.rows.length){await finish(key,op.operation_id,'FAILED');await audit(pool,req,key,'HIS_UNSENT_OPERATION_RELEASED',{operationId:op.operation_id})}
   }else if(op.operation==='open-visit'&&!isActive(op.operation_id)){
    const meta=(await pool.query('SELECT request_data FROM his_operation_attempts WHERE operation_id=$1',[op.operation_id])).rows[0]?.request_data||{},payload=op.payload||{},vn=acknowledgedVisit(op.response),location=norm(payload.LocationCode);
    if(vn&&positiveAck(op.response)&&!hisResponseFailed(op.response)&&location&&norm(payload.HN)===norm(r.hn)&&(!norm(r.hisLastVisitUID||r.vn)||norm(r.hisLastVisitUID||r.vn)===vn)){
     const lookup=await callHis('GET_VISIT',{HN:payload.HN,Location:location,ContextKey:payload.ContextKey});
     const verified=require('./his-visit-recovery').verifyExistingVisit(lookup.data,{hn:r.hn,vn,location});
     // Recovery is stricter than legacy lookup: the lookup must explicitly identify location.
     const actualLocation=norm(verified?.LocationCode||verified?.Location?.Code||verified?.Location||verified?.locationCode);
     if(verified&&actualLocation.toLowerCase()===location.toLowerCase()){
      const current=await operation(key);if(current?.operation_id!==op.operation_id||!pending(current))return snapshot(key);
      const latest=await load(key);if(norm(latest.hn)!==norm(payload.HN)||norm(latest.hisLastVisitUID||latest.vn)&&norm(latest.hisLastVisitUID||latest.vn)!==vn)throw Error('ข้อมูลผู้รับบริการเปลี่ยนแปลง กรุณาตรวจสอบ');
      const at=new Date(op.started_at).toISOString(),fields={hisLastVisitUID:vn,vn,hisLastVisitAt:at,openVisitAt:at,openVisitRequest:payload,openVisitResponse:op.response,openVisitLocationCode:location,locationCode:location,payor:norm(payload.Payor?.Payor),payorAgreement:norm(payload.Payor?.Agreement),payorOffice:norm(payload.Payor?.PayorOffice),hisVisitRecovery:{verifiedAt:new Date().toISOString(),operationId:op.operation_id,visit:verified}};
      if(meta.bookingId)fields.openVisitBookingId=meta.bookingId;
      await onOpenVisitRecovered?.({req,key,meta,vn,location,at});
      const revision=await patchRecordHisFields(key,fields);if(revision==null)throw Error('ยังบันทึกผลไม่ได้ กรุณาตรวจสอบอีกครั้ง');
      await audit(pool,req,key,'HIS_OPEN_VISIT_RECONCILED',{operationId:op.operation_id,vn});await finish(key,op.operation_id,'SUCCESS');return{...await snapshot(key),revision,record:fields};
     }
    }
   }
   await audit(pool,req,key,'HIS_OPERATION_CHECKED',{operationId:op.operation_id,status:(await operation(key))?.status});
   return snapshot(key);
  }finally{checks.delete(op.operation_id)}
 }
 app.get('/api/clinical/cases/:key/operations',localOnly,staffPermissionRequired(null),async(req,res)=>{try{res.set('Cache-Control','no-store').json(await snapshot(req.params.key))}catch(e){res.status(e.status||500).json({error:e.message})}});
 app.post('/api/clinical/cases/:key/operations/check',localOnly,staffPermissionRequired(null),async(req,res)=>{try{res.set('Cache-Control','no-store').json(await check(req,req.params.key))}catch(e){res.status(e.status||502).json({error:'ตรวจสอบผลคำสั่งไม่สำเร็จ กรุณาลองตรวจสอบอีกครั้ง'})}});
 app.post('/api/clinical/cases/:key/operations/support',localOnly,staffPermissionRequired(null),async(req,res)=>{try{await load(req.params.key);const op=await operation(req.params.key);if(!op)throw Error('ไม่มีคำสั่ง');const ticket='HIS-'+crypto.randomUUID();await audit(pool,req,req.params.key,'HIS_OPERATION_REVIEW_REQUESTED',{ticket,operationId:op.operation_id,operation:op.operation,status:op.status,stage:op.stage});res.json({ok:true,ticket,message:'บันทึกคำขอตรวจสอบในประวัติเคสแล้ว กรุณาแจ้งเลขอ้างอิงนี้แก่ผู้ดูแลระบบ'})}catch(e){res.status(e.status||400).json({error:e.message})}});
 return{snapshot,check};
}
module.exports={schemaSql,publicOperation,acknowledgedVisit,registerMonitor};
