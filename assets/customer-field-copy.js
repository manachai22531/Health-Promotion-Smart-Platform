/* Copy only already-visible values. Split compound fields into independent targets. */
(()=>{'use strict';const root=document.getElementById('resultRows');if(!root)return;let scheduled=false,timer;
 const icon='<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><path d="M5 5h8v9H5zM3 11H1V1h9v2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
 function decorate(){scheduled=false;for(const td of root.querySelectorAll('.customer-compact-card .cc-data td,.customer-compact-card .cc-packages tbody td:nth-child(2)')){const text=td.textContent.trim(),label=td.parentElement.querySelector('th')?.textContent.trim()||'รหัสแพ็กเกจ';if(!text||['-','—'].includes(text))continue;if(td.dataset.copySignature===text&&td.querySelector('[data-field-copy]'))continue;
  const multiple=/วันเกิด|สัญชาติ|ตำแหน่ง|Payor.*Agreement|PayorOffice/.test(label),parts=multiple?text.split(' / '):[text];
  const button=(display,copy,caption,all=false)=>'<button type="button" class="cc-value-copy '+(all?'cc-copy-all':'')+'" data-field-copy="'+esc(copy)+'" title="'+esc(caption)+'" aria-label="'+esc(caption)+'">'+(all?'':'<span>'+esc(display)+'</span>')+icon+'</button>';
  td.classList.add('cc-copy-value');td.dataset.fieldCopy=text;
  const coverage=/^(Payor|Agreement)$/.test(label)&&td.matches('[data-cc-payor],[data-cc-agreement]');
  if(coverage){
   const code=typeof HealthCheckCoverageNames!=='undefined'?HealthCheckCoverageNames.code(text):text.split(/\s+(?:-|—)\s+/)[0].trim();
   td.innerHTML='<span class="cc-copy-parts">'+button(code,code,'คัดลอกรหัส '+label)+'<span class="cc-coverage-name">'+esc(text.slice(code.length))+'</span></span>'+button('',text,'คัดลอกทั้งหมด '+label,true);
  }else if(parts.length>1){td.innerHTML='<span class="cc-copy-parts">'+parts.map((part,i)=>button(part,/วันเกิด/.test(label)&&i===1?part.replace(/\s*ปี$/,''):part,'คัดลอก '+part)).join('<span class="cc-copy-separator" aria-hidden="true"> / </span>')+'</span>'+button('',text,'คัดลอกทั้งหมด',true)}else td.innerHTML=button(text,text,'คัดลอก '+label);
  td.dataset.copySignature=td.textContent.trim();
 }}
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(decorate)}}new MutationObserver(schedule).observe(root,{childList:true,subtree:true});schedule();
 document.addEventListener('click',async event=>{const target=event.target.closest('[data-field-copy]');if(!target||!root.contains(target))return;event.preventDefault();event.stopImmediatePropagation();const value=target.dataset.fieldCopy;if(!value)return;let ok=true;
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const input=document.createElement('textarea');input.value=value;input.style.cssText='position:fixed;left:-9999px';document.body.append(input);input.select();ok=document.execCommand('copy');input.remove()}}catch{ok=false}
  let toast=document.getElementById('fieldCopyToast');if(!toast){toast=document.createElement('div');toast.id='fieldCopyToast';toast.setAttribute('role','status');document.body.append(toast)}toast.textContent=ok?'คัดลอกแล้ว':'คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอก';toast.hidden=false;clearTimeout(timer);timer=setTimeout(()=>toast.hidden=true,1800);
 },true);
})();
