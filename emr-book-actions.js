'use strict';
const {PDFDocument,StandardFonts,rgb,degrees}=require('pdf-lib');
const model=require('./assets/emr-book-model');
function registerEmrBooks({app,pool,localOnly,staffPermissionRequired,readState,renderPdf}){
 app.post('/api/emr/books/pdf',localOnly,staffPermissionRequired('emrView'),async(req,res)=>{
  try{
   const mode=req.body?.mode,raw=req.body?.caseIds;
   if(!['review','print'].includes(mode)||!Array.isArray(raw)||raw.length>25||raw.some(id=>typeof id!=='string'||!id||id.length>160))return res.status(400).json({error:'รูปแบบรายการเล่มไม่ถูกต้อง'});
   const ids=[...new Set(raw)];if(!ids.length||ids.length>(mode==='review'?1:25))return res.status(400).json({error:mode==='review'?'รีวิวได้ครั้งละ 1 เล่ม':'เลือกพิมพ์ได้ครั้งละไม่เกิน 25 เล่ม'});
   const state=await readState(),records=new Map((state.records||[]).map(r=>[String(r.key||r.id),r])),queue=new Map((state.emrQueue||[]).map(item=>[String(item.id),item])),cases=[];
   for(const id of ids){const item=queue.get(id),record=item&&records.get(String(item.recordKey));if(!item||!record)return res.status(404).json({error:'ไม่พบเคส EMR'});if(!model.assigned(item,req.staffUser,req.staffRole))return res.status(403).json({error:'ไม่มีสิทธิ์เปิดเล่มของเคสนี้'});if(mode==='print'&&!model.approved(item,record))return res.status(409).json({error:'ต้องอนุมัติเล่มของ VN นี้ก่อนพิมพ์ฉบับจริง กรุณารีเฟรชรายการ'});cases.push({item,record})}
   const combined=await PDFDocument.create();
   for(const {item,record} of cases){
    const scoped=model.scopedRecord(item,record),source=await PDFDocument.load(await renderPdf(scoped,state));
    if(!model.approved(item,record)){const font=await source.embedFont(StandardFonts.Helvetica);for(const page of source.getPages()){page.drawText('DRAFT',{x:80,y:page.getHeight()/2,size:62,font,color:rgb(.75,.18,.13),opacity:.16,rotate:degrees(30)});page.drawText('DRAFT - NOT APPROVED',{x:40,y:22,size:10,font,color:rgb(.68,.17,.12)})}}
    const pages=await combined.copyPages(source,source.getPageIndices());for(const page of pages)combined.addPage(page);
   }
   const bytes=await combined.save();
   await pool.query("INSERT INTO checkup_workflow_audit(entity_type,entity_id,action,details,performed_by,client_address) VALUES('EMR_BOOK',$1,$2,$3::jsonb,$4,$5)",[ids.join(','),mode==='print'?'PRINT':'REVIEW',JSON.stringify({caseIds:ids,visits:cases.map(({item,record})=>({recordKey:item.recordKey,vn:item.vn,approvedAt:record.healthBookApprovedAt||null}))}),req.staffUser.username||'system',String(req.ip||'')]);
   res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename="emr-${mode}-${cases.length}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-EMR-Book-Approved':String(cases.every(({item,record})=>model.approved(item,record)))}).send(Buffer.from(bytes));
  }catch(error){console.error('[EMR BOOK]',error);res.status(500).json({error:'สร้าง PDF เล่มตรวจสุขภาพไม่สำเร็จ'})}
 });
}
module.exports={registerEmrBooks};
