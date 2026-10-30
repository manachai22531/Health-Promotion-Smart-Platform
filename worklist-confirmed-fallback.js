/* Confirmed checkups can be shown before HIS has assigned a VN. Pure read-only projection. */
'use strict';
function thaiDateKey(value){
 if(!value)return '';
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
function activeOrder(record){
 const orderTime=Date.parse(record?.orderHisAt||'');
 const cancelTime=Date.parse(record?.cancelOrderAt||'');
 return Number.isFinite(orderTime)&&(!Number.isFinite(cancelTime)||orderTime>cancelTime);
}
function worklistStage(record){
 if(!record || !(record.checkupConfirmedAt||record.visitedAt))return 'NOT_CONFIRMED';
 return activeOrder(record)?'ORDERED':'PENDING_ORDER';
}
function worklistDate(record){
 // Before Order: use confirmation date. After Order: use successful Order date.
 const stage=worklistStage(record);
 return thaiDateKey(stage==='ORDERED'?record.orderHisAt:(record.cancelOrderAt||record.checkupConfirmedAt||record.visitedAt));
}
function eligibleConfirmedRecords({records=[],date,companyId='',projectId='',status='',q='',existingKeys=new Set(),bookingByRecord=new Map()}={}){
 const query=String(q||'').trim().toLocaleLowerCase();
 if(status&&status!=='NOT_ARRIVED')return [];
 return records.filter(record=>{
   const key=String(record.key||record.id||'');
   if(!key||existingKeys.has(key)||worklistStage(record)==='NOT_CONFIRMED'||worklistDate(record)!==date)return false;
   if(companyId&&String(record.companyId||'')!==String(companyId))return false;
   const booking=bookingByRecord.get(key)||{};
   if(projectId&&String(booking.project_id||'')!==String(projectId))return false;
   if(query){const text=[record.title,record.first,record.last,record.hn,record.id,record.employeeCode].filter(Boolean).join(' ').toLocaleLowerCase();if(!text.includes(query))return false}
   return true;
 });
}
function buildConfirmedRows({records=[],companies=[],date,companyId='',projectId='',status='',q='',existingKeys=new Set(),bookingByRecord=new Map()}={}){
 const companyMap=new Map(companies.map(c=>[String(c.id),c]));
 return eligibleConfirmedRecords({records,date,companyId,projectId,status,q,existingKeys,bookingByRecord}).map(record=>{
   const key=String(record.key||record.id||'');
   const booking=bookingByRecord.get(key)||{},company=companyMap.get(String(record.companyId||''))||{};
   const primary=Array.isArray(record.primaryPackages)?record.primaryPackages.find(Boolean):null;
   return {booking_id:booking.booking_id||'',project_id:booking.project_id||'',project_code:booking.project_code||'',project_name:booking.project_name||'',record_key:key,
    hn:String(record.hn||''),vn:'',employee_code:String(record.employeeCode||''),patient_name:[record.title,record.first,record.last].filter(Boolean).join(' '),
    company_id:String(record.companyId||''),company_name:String(company.name||booking.company_name||''),department_name:String(record.departmentName||''),
    position_name:String(record.positionName||''),package_code:String(primary?.code||record.code||''),package_name:String(primary?.name||record.packageName||''),
    visit_id:'',visit_date:date,checkin_at:null,confirmed_at:record.checkupConfirmedAt||record.visitedAt,order_at:activeOrder(record)?record.orderHisAt:null,workflow_stage:worklistStage(record),visit_status:'NOT_ARRIVED',
    result_status:'WAITING_RESULT',order_total:0,order_complete:0,source:'CONFIRMED_AWAITING_HIS_VISIT'};
 });
}
function buildUnconfirmedRows({bookings=[],records=[],date,existingKeys=new Set()}={}){
 const index=new Map(records.map(r=>[String(r.key||r.id||''),r])),seen=new Set(existingKeys),rows=[];
 for(const b of bookings){
  const key=String(b.record_key||''),r=index.get(key);
  const scheduled=typeof b.scheduled_date==='string'?b.scheduled_date.slice(0,10):thaiDateKey(b.scheduled_date);
  if(!r||seen.has(key)||worklistStage(r)!=='NOT_CONFIRMED'||scheduled!==date||b.booking_status==='CANCELLED')continue;
  seen.add(key);
  rows.push({...b,record_key:key,hn:String(b.hn||r.hn||''),vn:'',visit_id:'',visit_date:date,checkin_at:null,confirmed_at:null,order_at:null,
   patient_name:b.patient_name||[r.title,r.first,r.last].filter(Boolean).join(' '),workflow_stage:'NOT_CONFIRMED',visit_status:'NOT_ARRIVED',
   result_status:'WAITING_RESULT',order_total:0,order_complete:0,source:'BOOKING_AWAITING_CONFIRMATION'});
 }
 return rows;
}
module.exports={thaiDateKey,activeOrder,worklistStage,worklistDate,eligibleConfirmedRecords,buildConfirmedRows,buildUnconfirmedRows};
