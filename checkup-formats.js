'use strict';
const fs=require('fs'),path=require('path');
async function ensureCheckupFormats(pool){await pool.query(fs.readFileSync(path.join(__dirname,'migrations/0214_checkup_formats.up.sql'),'utf8'))}
function normalizeFormat(body){const code=String(body.code||'').trim().toUpperCase(),name=String(body.name||'').trim(),printLabel=String(body.printLabel||'').trim(),sortOrder=Number(body.sortOrder);if(!/^[A-Z0-9_-]{1,40}$/.test(code)||!name||name.length>150||!printLabel||printLabel.length>200||!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>9999||typeof body.active!=='boolean')throw Object.assign(Error('กรุณากรอกรหัส ชื่อ ข้อความบน A4 ลำดับ 0–9999 และสถานะให้ถูกต้อง'),{status:400});return {code,name,printLabel,sortOrder,active:body.active}}
async function validateFormatChange(db,previous,next){
 const initial=!(previous.checkupConfirmedAt||previous.visitedAt)&&Boolean(next.checkupConfirmedAt||next.visitedAt),changed=String(previous.healthCheckFormat?.code||'')!==String(next.healthCheckFormat?.code||'');
 if(!initial&&!changed){if(previous.healthCheckFormat)next.healthCheckFormat=previous.healthCheckFormat;return}
 if(!initial&&(previous.orderHisAt&&(!previous.cancelOrderAt||Date.parse(previous.orderHisAt)>Date.parse(previous.cancelOrderAt))))throw Object.assign(Error('กรุณา Cancel Order ก่อนเปลี่ยนรูปแบบการตรวจ'),{status:409});
 const code=String(next.healthCheckFormat?.code||'').trim().toUpperCase();
 const row=(await db.query('SELECT code,name,print_label FROM checkup_formats WHERE code=$1 AND active=true',[code])).rows[0];
 if(!row)throw Object.assign(Error('กรุณาเลือกรูปแบบการตรวจที่เปิดใช้งาน'),{status:400});
 next.healthCheckFormat={code:row.code,name:row.name,printLabel:row.print_label};
}
function registerCheckupFormats(app,{pool,localOnly,staffPermissionRequired}){
 app.get('/api/checkup-formats',localOnly,staffPermissionRequired(null),async(req,res)=>{try{const rows=await pool.query('SELECT code,name,print_label AS "printLabel",sort_order AS "sortOrder",active,revision FROM checkup_formats ORDER BY sort_order,code');res.set('Cache-Control','no-store');res.json({items:rows.rows})}catch(e){res.status(500).json({error:'โหลดรูปแบบการตรวจไม่สำเร็จ'})}});
 app.put('/api/checkup-formats/:code',localOnly,staffPermissionRequired('setupMasterEdit'),async(req,res)=>{try{const item=normalizeFormat(req.body||{});if(item.code!==String(req.params.code).toUpperCase())return res.status(400).json({error:'ไม่สามารถเปลี่ยนรหัสได้'});const revision=Number(req.body.revision);if(!Number.isInteger(revision)||revision<0)return res.status(400).json({error:'ไม่พบ Revision'});let result;if(revision===0)result=await pool.query('INSERT INTO checkup_formats(code,name,print_label,sort_order,active,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(code) DO NOTHING RETURNING revision',[item.code,item.name,item.printLabel,item.sortOrder,item.active,req.staffUser.id]);else result=await pool.query('UPDATE checkup_formats SET name=$2,print_label=$3,sort_order=$4,active=$5,revision=revision+1,updated_by=$6,updated_at=NOW() WHERE code=$1 AND revision=$7 RETURNING revision',[item.code,item.name,item.printLabel,item.sortOrder,item.active,req.staffUser.id,revision]);if(!result.rows.length)return res.status(409).json({error:'ข้อมูลถูกแก้ไขแล้วหรือรหัสซ้ำ กรุณาโหลดใหม่'});res.json({ok:true,revision:result.rows[0].revision})}catch(e){res.status(e.status||500).json({error:e.status?e.message:'บันทึกรูปแบบการตรวจไม่สำเร็จ'})}});
}
module.exports={ensureCheckupFormats,normalizeFormat,validateFormatChange,registerCheckupFormats};
