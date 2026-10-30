'use strict';
const norm=v=>String(v??'').trim(),hnKey=v=>norm(v).replace(/[^a-z0-9]/gi,'').toLowerCase();
// One policy for Booking, primary search, Worklist and clinical guards.
function createVisitStatusReader({readOpd,readPatientLog}){
 return async function read(requested=[]){
  const requests=(Array.isArray(requested)?requested:[]).slice(0,2000).map((r,i)=>({key:norm(r?.key??i),hn:norm(r?.hn),vn:norm(r?.vn)}));
  const vns=[...new Set(requests.map(r=>r.vn).filter(Boolean))],opd=new Map();
  // Query errors propagate. They are never treated as a missing Visit.
  for(let i=0;i<vns.length;i+=500)for(const row of await readOpd(vns.slice(i,i+500)))opd.set(norm(row.vn),row);
  const missing=new Map();for(const r of requests)if(r.hn&&r.vn&&!opd.has(r.vn))missing.set(JSON.stringify([r.hn,r.vn]),{key:JSON.stringify([r.hn,r.vn]),hn:r.hn,vn:r.vn});
  const logs=new Map();if(missing.size){const result=await readPatientLog([...missing.values()]);for(const row of result.items||[])logs.set(JSON.stringify([norm(row.hn),norm(row.vn)]),row)}
  return requests.map(r=>{const row=opd.get(r.vn),log=logs.get(JSON.stringify([r.hn,r.vn]));
   if(row){const identityMatched=Boolean(r.hn&&hnKey(row.hn)===hnKey(r.hn));return{...r,hn:norm(row.hn),requestedHn:r.hn,status:norm(row.status)||'Unknown',source:'opdvisit',found:true,identityMatched,reason:identityMatched?'':r.hn?'HN_MISMATCH':'MISSING_HN',message:identityMatched?'':r.hn?'พบ VN ใน HIS แต่ HN ไม่ตรงกับข้อมูลเคส':'พบ VN แต่ยังไม่มี HN สำหรับตรวจสอบ',registeredDate:row.registeredDate||null,chargeClosedDate:row.chargeClosedDate||null,cancelledDate:row.cancelledDate||null,insdate:null,logId:null}}
   if(log&&norm(log.status))return{...r,status:norm(log.status),source:'patientlog',found:true,identityMatched:true,reason:'',message:'',insdate:log.insdate||null,logId:log.logId??null,registeredDate:null,chargeClosedDate:null,cancelledDate:null};
   return{...r,status:'',source:'',found:false,identityMatched:false,reason:!r.vn?'MISSING_VN':!r.hn?'MISSING_HN':'NOT_FOUND',message:!r.vn?'ยังไม่มี VN สำหรับตรวจสถานะ':!r.hn?'ยังไม่มี HN สำหรับค้นหา Patient Log':'ไม่พบสถานะใน opdvisit และ Patient Log',registeredDate:null,chargeClosedDate:null,cancelledDate:null,insdate:null,logId:null};
  });
 };
}
module.exports={createVisitStatusReader};
