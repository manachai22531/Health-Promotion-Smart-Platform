'use strict';
const ACTIVITIES=Object.freeze([
 {id:'CONFIRM_CASE',name:'ยืนยันเคสสำเร็จ',exp:10,permissions:['receiveCreate'],unit:'เคส',condition:'ยืนยันและบันทึกสำเร็จ ครั้งเดียวต่อเคส'},
 {id:'WORKLIST_CHECKIN',name:'Check-in จาก Worklist',exp:5,permissions:['worklistCheckin'],unit:'เคส',condition:'เปลี่ยนจากยังไม่มาเป็นมาถึงแล้ว ครั้งเดียวต่อเคส'},
 {id:'HIS_ORDER',name:'ส่ง Order HIS สำเร็จ',exp:10,permissions:['receiveFinalize'],unit:'เคส',condition:'HIS ตอบรับและบันทึกสำเร็จ ไม่รับซ้ำหลัง Cancel/ส่งใหม่'},
 {id:'DOCTOR_HANDOFF',name:'ส่งต่อแพทย์จาก Worklist',exp:10,permissions:['emrAssign'],unit:'เคส',condition:'มี HN / VN ยืนยันเคสแล้ว และเลือกแพทย์ที่เปิดใช้งาน'},
 {id:'APPROVE_CASE',name:'อนุมัติผลตรวจ / รับรองเล่ม',exp:20,permissions:['emrEdit'],unit:'เคส',condition:'บันทึกสถานะอนุมัติสำเร็จ ไม่นับซ้ำเมื่ออนุมัติใหม่'},
 {id:'PROJECT_READY',name:'เปิดโครงการที่พร้อมใช้งาน',exp:20,permissions:['projectCreate','projectEdit','projectManage'],unit:'โครงการ',condition:'มีบริษัท รอบตรวจ และแพ็กเกจครบ สถานะเปิดรับ/กำลังดำเนินการ'},
 {id:'IMPORT_BATCH',name:'นำเข้าข้อมูลสำเร็จ',exp:10,permissions:['customerImport'],unit:'ชุดนำเข้า',condition:'ข้อมูลผ่านตรวจสอบ มีข้อมูลเพิ่ม/เปลี่ยนจริง ชุดเดิมไม่รับซ้ำ'}
]);
function canActivity(role,activity){if(!role||!activity)return false;if(String(role.id)==='admin')return true;return activity.permissions.some(key=>(Array.isArray(role.permissions)?role.permissions:[]).includes(key))}
function defaultPolicy(role={}){
 const text=String(role.name||'')+' '+String(role.id||'');let selected=[];
 if(String(role.id)==='admin'||/ผู้ดูข้อมูล|viewer|readonly/i.test(text))selected=[];
 else if(/พยาบาล|nurs/i.test(text))selected=['WORKLIST_CHECKIN','HIS_ORDER','DOCTOR_HANDOFF'];
 else if(/แพทย์|doctor/i.test(text))selected=['APPROVE_CASE'];
 else if(/การตลาด|marketing/i.test(text))selected=['PROJECT_READY'];
 else if(/ทำข้อมูล|นำเข้า|import/i.test(text))selected=['IMPORT_BATCH'];
 else if(/ลงทะเบียน|รับบริการ|registration|\bstaff\b/i.test(text))selected=['CONFIRM_CASE'];
 const activities=Object.fromEntries(ACTIVITIES.map(a=>[a.id,{enabled:selected.includes(a.id)&&canActivity(role,a),exp:a.exp}]));
 return {enabled:Object.values(activities).some(a=>a.enabled),activities};
}
function normalizePolicy(input,role){
 if(!input||typeof input.enabled!=='boolean'||!input.activities||typeof input.activities!=='object'||Array.isArray(input.activities))throw new Error('รูปแบบการตั้งค่า EXP ไม่ถูกต้อง');
 for(const id of Object.keys(input.activities))if(!ACTIVITIES.some(a=>a.id===id))throw new Error('กิจกรรม EXP ไม่อยู่ในรายการที่รองรับ');
 const activities={};for(const a of ACTIVITIES){const v=input.activities[a.id]||{enabled:false,exp:a.exp};if(typeof v.enabled!=='boolean'||!Number.isInteger(v.exp)||v.exp<1||v.exp>1000)throw new Error('EXP ต้องเป็นจำนวนเต็ม 1–1,000');if(input.enabled&&v.enabled&&!canActivity(role,a))throw new Error('Role ไม่มีสิทธิ์ทำกิจกรรม: '+a.name);activities[a.id]={enabled:v.enabled,exp:v.exp}}
 if(input.enabled&&!Object.values(activities).some(a=>a.enabled))throw new Error('กรุณาเลือกอย่างน้อยหนึ่งกิจกรรมก่อนเปิดการสะสม EXP');
 return {enabled:input.enabled,activities};
}
module.exports={ACTIVITIES,canActivity,defaultPolicy,normalizePolicy};
function projectReady(project={}){return ['OPEN','IN_PROGRESS'].includes(project.status)&&Boolean(String(project.company_id||'').trim()&&String(project.project_name||'').trim()&&String(project.default_package_code||'').trim()&&project.start_date&&project.end_date)&&Number.isFinite(Date.parse(project.start_date))&&Date.parse(project.start_date)<=Date.parse(project.end_date)}
const importFields=['id','idPassport','identificationType','title','first','last','birth','sex','hn','employeeCode','departmentName','positionName','code','packageName','phone','email'];
function importSignature(record={}){return JSON.stringify(importFields.map(k=>String(record[k]??'').trim()))}
function importBatchKey(companyId,records){const crypto=require('node:crypto');return String(companyId)+':'+crypto.createHash('sha256').update([...new Set(records.map(importSignature))].sort().join('\n')).digest('hex')}
module.exports.projectReady=projectReady;module.exports.importSignature=importSignature;module.exports.importBatchKey=importBatchKey;
