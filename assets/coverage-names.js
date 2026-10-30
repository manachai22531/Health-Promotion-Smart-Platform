/* Resolve payer labels by exact codes in the selected payer/plan scope. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HealthCheckCoverageNames=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const cache=new Map(),pending=new Map(),code=v=>String(v??'').split(/\s+(?:-|—)\s+/)[0].trim();
 const fields=[['payor','payor_code','payor_name','payor'],['payorAgreement','plan_code','plan_name','plan'],['payorOffice','office_code','office_name','office']];
 const key=r=>JSON.stringify(fields.map(([f])=>code(r[f]))),peek=r=>{const c=cache.get(key(r));return c&&c.until>Date.now()?c.names:null};
 async function resolve(r,request=globalThis.fetch){const k=key(r),hit=peek(r);if(hit)return hit;if(pending.has(k))return pending.get(k);
 const task=(async()=>{const p=code(r.payor),plan=code(r.payorAgreement),names={};let failed=false;
  const get=async url=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const response=await request(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Master lookup failed');return (await response.json()).items||[]}finally{clearTimeout(timer)}};
  try{const rows=p?await get('/api/his-payors/selection?payorCode='+encodeURIComponent(p)+(plan?'&planCode='+encodeURIComponent(plan):'')):[];
   for(const [field,col,label,type] of fields){const wanted=code(r[field]);if(!wanted){names[field]='—';continue}
    let found=rows.filter(x=>String(x[col]||'').trim()===wanted&&(!p||String(x.payor_code||'').trim()===p)&&(!plan||field==='payor'||String(x.plan_code||'').trim()===plan));
    let choices=[...new Set(found.map(x=>String(x[label]||'').trim()).filter(Boolean))];
    if(choices.length!==1){const more=await get('/api/his-payors?type='+type+'&q='+encodeURIComponent(wanted)+'&limit=500'+(field!=='payor'&&p?'&payorCode='+encodeURIComponent(p):'')+(field==='payorOffice'&&plan?'&planCode='+encodeURIComponent(plan):''));choices=[...new Set(more.filter(x=>String(x.code||'').trim()===wanted).map(x=>String(x.name||'').trim()).filter(Boolean))]}
    names[field]=choices.length===1?choices[0]:'ไม่พบชื่อใน Master';
   }
  }catch{failed=true;for(const [field] of fields)if(!names[field])names[field]=code(r[field])?'อ่านชื่อไม่สำเร็จ':'—'}
  cache.set(k,{names,until:Date.now()+(failed?5000:60000)});return names;
 })();pending.set(k,task);try{return await task}finally{pending.delete(k)}
 }
 let locationCache=null,locationPending=null,locationUntil=0;
 async function resolveLocation(value,request=globalThis.fetch){const wanted=code(value);if(!wanted)return '—';if(!locationCache||Date.now()>=locationUntil){if(!locationPending)locationPending=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);try{const response=await request('/api/his-locations?activeOnly=false',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Location lookup failed');locationCache=(await response.json()).items||[];locationUntil=Date.now()+60000}finally{clearTimeout(timer);locationPending=null}})();try{await locationPending}catch{return 'อ่านชื่อ Location ไม่สำเร็จ'}}const matches=locationCache.filter(x=>String(x.code||'').trim()===wanted||String(x.id||'').trim()===wanted),names=[...new Set(matches.map(x=>String(x.name||x.description||'').trim()).filter(Boolean))];return names.length===1?names[0]:'ไม่พบชื่อ Location ใน Master';}
 return {code,key,peek,resolve,resolveLocation,format:(value,name)=>{const c=code(value);return c&&name&&!['—','ไม่พบชื่อใน Master','อ่านชื่อไม่สำเร็จ','อ่านชื่อ Location ไม่สำเร็จ','ไม่พบชื่อ Location ใน Master'].includes(name)?c+' - '+name:c}};
});
