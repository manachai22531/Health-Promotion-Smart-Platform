'use strict';
const normalize=v=>String(v??'').replace(/^\uFEFF|[\u200B-\u200D\u2060]/g,'').replace(/（/g,'(').replace(/）/g,')').replace(/／/g,'/').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g,'').trim();
function prepareOrderImport(rows,{items,settings={},types=[],stations=[]}){
 if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('กรุณาใช้ไฟล์ที่มี 1–10,000 รายการ');
 const valid=new Map(),seen=new Set(),changes=[],errors=[];
 for(const item of items){if(!item.code)continue;const key=normalize(item.code);if(!valid.has(key))valid.set(key,item)}
 rows.forEach((row,index)=>{const line=index+2,code=String(row.Code??'').trim(),key=normalize(code),item=valid.get(key);if(!key||!item){errors.push(`แถว ${line}: ไม่พบ Code ${code||'-'}`);return}if(seen.has(key)){errors.push(`แถว ${line}: Code ซ้ำ ${code}`);return}seen.add(key);const before=settings[key]||{},after={...before};
 if(Object.hasOwn(row,'Type')){const v=String(row.Type??'').trim();if(v&&!types.includes(v))errors.push(`แถว ${line}: ไม่พบประเภท ${v}`);after.type=v}
 if(Object.hasOwn(row,'Stations')){const v=Array.isArray(row.Stations)?row.Stations:String(row.Stations??'').split('|').map(x=>x.trim()).filter(Boolean);if(v.some(x=>!stations.includes(x)))errors.push(`แถว ${line}: มีสถานีที่ไม่อยู่ในระบบ`);after.stations=[...new Set(v)]}
 if(Object.hasOwn(row,'Hidden')){const v=String(row.Hidden??'').trim().toLowerCase();if(!['true','false','1','0'].includes(v))errors.push(`แถว ${line}: Hidden ต้องเป็น TRUE หรือ FALSE`);after.hidden=['true','1'].includes(v)}
 if(Object.hasOwn(row,'Specimen'))after.specimen=String(row.Specimen??'').trim().slice(0,300);
 if(Object.hasOwn(row,'SortOrder')){const v=row.SortOrder;if(v===''||v==null)delete after.sortOrder;else if(!Number.isInteger(Number(v))||Number(v)<0||Number(v)>100000)errors.push(`แถว ${line}: SortOrder ต้องเป็นจำนวนเต็ม 0–100000`);else after.sortOrder=Number(v)}
 const fields=['type','stations','hidden','specimen','sortOrder'].filter(f=>JSON.stringify(before[f]??(f==='stations'?[]:f==='hidden'?false:''))!==JSON.stringify(after[f]??(f==='stations'?[]:f==='hidden'?false:'')));
 if(fields.length)changes.push({key,code:item.code,name:item.name,before,after,fields});
 });return{changes,errors};
}
if(typeof module!=='undefined')module.exports={prepareOrderImport,normalize};
if(typeof window!=='undefined')window.HealthCheckOrderExcel={prepareOrderImport};
