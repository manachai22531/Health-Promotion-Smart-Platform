/* Compact customer overview: presentation never changes actual ordered selections. */
(()=>{'use strict';
  const priceOf=item=>{const his=hisPackageByCode(item.code||'');const value=item.price??item.total_price??his?.total_price;return value==null?null:Number(value)};
  const priceText=value=>value==null?'ยังไม่ระบุราคา':money(value);
  function packageRows(r,co){
    const primary=r.primaryPackages?.length?r.primaryPackages:[{code:r.code,name:r.packageName,price:r.packagePrice}];
    const chosen=(p,kind)=>(kind==='billing'?r.acceptedBillingItems:kind==='cash'?r.acceptedCashItems:[] )?.some(x=>String(x.code||x.name||x)===String(p.code||p.name));
    const row=(p,kind,label)=>`<tr class="cc-package-${kind}"><td>${label}</td><td>${esc(p.code||'-')}</td><td>${esc(p.name||'-')}</td><td>${priceText(priceOf(p))}</td><td>${kind==='main'?'แพ็กหลัก':chosen(p,kind)?'✓ เลือกแล้ว':'รอเลือกจริง'}</td></tr>`;
    return primary.filter(p=>p.code||p.name).map(p=>row(p,'main','แพ็กเกจหลัก')).join('')+(co?.billingPackages||[]).map(p=>row(p,'billing','วางบิล')).join('')+(co?.cashPackages||[]).map(p=>row(p,'cash','ชำระเอง')).join('');
  }
  function arrivalDate(r){const value=r.visitedAt||r.checkupConfirmedAt;if(!value)return '';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'ไม่ระบุวันที่'}
  function renderCompact(){
    document.querySelectorAll('#resultRows .person-card:not([data-compact-ready])').forEach(card=>{
      const r=state.records.find(r=>String(r.key)===String(card.dataset.key));if(!r)return;
      const co=company(r.companyId),confirmed=Boolean(r.visitedAt||r.checkupConfirmedAt),tools=card.querySelector('.post-checkup-tools'),log=card.querySelector('.card-visit-log');
      card.dataset.compactReady='1';card.classList.add('customer-compact-card');
      const field=(label,value)=>`<tr><th>${esc(label)}</th><td>${esc(value||'-')}</td></tr>`;
      const copyBox=(label,value,allowed=true)=>`<button type="button" class="cc-copy-box" data-clinical-copy="${esc(value||'')}" ${value&&allowed?'':'disabled'} aria-label="คัดลอก ${esc(label)}"><small>${esc(label)} <span aria-hidden="true">⧉</span></small><b>${esc(value||'—')}</b><small>คลิกเพื่อคัดลอก</small></button>`;
      card.innerHTML=`<header class="cc-identity"><div class="cc-name"><strong>${esc([r.title,r.first,r.last].filter(Boolean).join(' '))}</strong></div><div class="cc-company"><b>${esc(co?.name||'-')}</b><small>ปีบริษัท <strong>${esc(co?.year||'-')}</strong></small></div>${copyBox('ID / Passport',can('customerSensitiveView')?r.id:visibleCustomerId(r.id),can('customerSensitiveView'))}${copyBox('HN',r.hn)}${copyBox('VN',r.hisLastVisitUID||r.vn)}<span class="cc-arrival ${confirmed?'arrived':''}"><b>${confirmed?'✓ มาตรวจแล้ว':'ยังไม่ยืนยัน'}</b>${confirmed?`<small>${esc(arrivalDate(r))}</small>`:''}</span></header>
      <div class="cc-columns"><div class="cc-patient-column"><section class="cc-patient-panel"><h3>ข้อมูลผู้รับบริการ</h3><table class="cc-data"><tbody>${field('ชื่อ English',[r.prefixEN,r.firstNameEN,r.lastNameEN].filter(Boolean).join(' '))}${field('วันเกิด / อายุ / เพศ',[r.birth,customerTemplateAge(r)?customerTemplateAge(r)+' ปี':'',r.sex==='M'?'ชาย':r.sex==='F'?'หญิง':r.sex].filter(Boolean).join(' / '))}${field('เบอร์โทร',r.phone)}${field('อีเมล',r.email)}${field('ที่อยู่',r.address)}${field('สัญชาติ / สถานภาพ',[r.nationality,r.maritalStatus].filter(Boolean).join(' / '))}${field('ตำแหน่ง / รหัสพนักงาน',[r.positionName,r.employeeCode].filter(Boolean).join(' / '))}${field('แผนก',r.departmentName)}</tbody></table><h3>สิทธิและหน่วยงาน</h3><table class="cc-data"><tbody><tr><th>Payor</th><td data-cc-payor>${esc(r.payor||'—')}</td></tr><tr><th>Agreement</th><td data-cc-agreement>${esc(r.payorAgreement||'—')}</td></tr><tr><th>Location</th><td data-cc-location>กำลังโหลดชื่อ…</td></tr></tbody></table></section>${companyServiceInfoHtml(co)}<section class="cc-personal-note-summary${HealthCheckPersonalNote.value(r).trim()?'':' is-empty'}" data-record-key="${esc(r.key)}"><h3>หมายเหตุเฉพาะบุคคล</h3><p data-cc-note-text>${esc(HealthCheckPersonalNote.value(r).trim()?HealthCheckPersonalNote.value(r):'ยังไม่มีหมายเหตุ')}</p></section></div>
      <section class="cc-package-panel"><h3>แพ็กเกจและรายการตรวจ <button class="button secondary pdf-button" type="button" data-clinical-circular="${esc(r.key)}" ${can('companyPdfView')?'':'disabled'}>เอกสารเวียน</button></h3><table class="cc-packages"><thead><tr><th>ประเภท</th><th>รหัส</th><th>รายการตรวจ</th><th>ราคา</th><th>สถานะ</th></tr></thead><tbody>${packageRows(r,co)||'<tr><td colspan="5">ไม่มีรายการ</td></tr>'}</tbody></table><p class="cc-note">รายการเพิ่มเติมแสดงตามสิทธิ ยังไม่ใช่การเลือกหรือสั่ง Order · เลือกจริงใน Worklist</p><div class="cc-info">${companyCheckupPeriodHtml(co)}<section><small>Booking / โครงการ</small><div data-booking-membership="${esc(r.key)}">${bookingMembershipHtml(r.key)}</div></section></div><section class="cc-contract${(r.selectedPackages||[]).length?'':' is-empty'}"><header><strong>แพ็กเกจคู่สัญญาที่เลือก</strong><span>${(r.selectedPackages||[]).length} รายการ</span></header><div class="cc-contract-list" tabindex="0" aria-label="รายการแพ็กเกจคู่สัญญาที่เลือก">${(r.selectedPackages||[]).map(p=>`<div class="cc-contract-item"><span aria-hidden="true">✓</span><div><strong>${esc(p.name||p.code||'—')}</strong>${p.name&&p.code?`<small>${esc(p.code)}</small>`:''}</div></div>`).join('')||'<p class="cc-contract-empty">ยังไม่ได้เลือกแพ็กเกจ</p>'}</div></section></section></div><footer class="cc-actions"></footer>`;
      if(typeof HealthCheckCoverageNames!=='undefined'){
        const signature=JSON.stringify([r.payor,r.payorAgreement,r.locationCode]);
        Promise.all([HealthCheckCoverageNames.resolve({...r,payorOffice:''}),HealthCheckCoverageNames.resolveLocation(r.locationCode)]).then(([names,location])=>{if(!card.isConnected||signature!==JSON.stringify([r.payor,r.payorAgreement,r.locationCode]))return;card.querySelector('[data-cc-payor]').textContent=HealthCheckCoverageNames.format(r.payor,names.payor)||'—';card.querySelector('[data-cc-agreement]').textContent=HealthCheckCoverageNames.format(r.payorAgreement,names.payorAgreement)||'—';card.querySelector('[data-cc-location]').textContent=location||'—'});
      }
      const footer=card.querySelector('.cc-actions');
      if(!confirmed){footer.innerHTML=`<button class="button primary cc-confirm" data-card-confirm-checkup="${esc(r.key)}" ${can('receiveCreate')?'':'disabled'} type="button">ยืนยันการตรวจ</button><span>ยืนยันก่อนเปิด Visit และสั่ง Order</span>`}
      else if(tools){
        footer.append(tools);
        const cancelVisit=document.createElement('button'),openVisit=tools.querySelector('[data-card-open-visit]');cancelVisit.type='button';cancelVisit.className='card-cancel-visit';cancelVisit.dataset.cardCancelVisit=r.key;cancelVisit.textContent='CancelVisit';cancelVisit.disabled=!(r.hisLastVisitUID||r.vn);
        if(cancelVisit&&openVisit)openVisit.insertAdjacentElement('afterend',cancelVisit);
      }
      // Before confirmation there is no HIS action toolbar.
      card.querySelector('.cc-hn [data-card-cancel-visit]')?.remove();
      if(log){log.querySelector('.card-status')?.remove();log.classList.add('cc-log');footer.append(log)}
    });
  }
  window.HealthCheckPersonalNoteOverview={refresh(record){if(!record)return;for(const box of document.querySelectorAll('.cc-personal-note-summary')){if(box.dataset.recordKey!==String(record.key))continue;const value=HealthCheckPersonalNote.value(record);box.classList.toggle('is-empty',!value.trim());box.querySelector('[data-cc-note-text]').textContent=value.trim()?value:'ยังไม่มีหมายเหตุ'}}};
  const rows=document.getElementById('resultRows');if(rows){new MutationObserver(renderCompact).observe(rows,{childList:true});renderCompact();}
  const supplementButton=document.getElementById('saveCustomerSupplements');
  const maySaveSupplements=()=>can('receiveEdit')||can('customerEdit');
  const orderIsActive=r=>Boolean(r?.orderHisAt&&(!r.cancelOrderAt||Date.parse(r.orderHisAt)>Date.parse(r.cancelOrderAt)));
  let supplementSaving=false;
  function syncSupplementButton(){
    if(!supplementButton)return;
    const r=state.records.find(r=>String(r.key)===String(activeRecordKey));
    supplementButton.hidden=!maySaveSupplements();
    supplementButton.disabled=supplementSaving||!r||orderIsActive(r);
    supplementButton.title=orderIsActive(r)?'กรุณา Cancel Order ก่อนแก้ไขแพ็กเกจเสริม':'บันทึกรายการวางบิล ชำระเอง และแพ็กเกจคู่สัญญาที่เลือก';
  }
  const priorDetail=detail;
  detail=function(key){const result=priorDetail(key);syncSupplementButton();return result};
  if(supplementButton)supplementButton.onclick=async function(){
    if(supplementSaving||!maySaveSupplements())return;
    const r=state.records.find(r=>String(r.key)===String(activeRecordKey));if(!r)return;
    if(orderIsActive(r))return alert('กรุณา Cancel Order ก่อนแก้ไขแพ็กเกจเสริม');
    if(r.visitedAt&&!can('receiveEdit'))return alert('ไม่มีสิทธิ์แก้ไขรายการตรวจที่ยืนยันแล้ว');
    const draft=getDraftCheckup();if(!draft)return;
    // This button saves extras only; do not save unsaved primary-package edits.
    draft.primaryPackages=(r.primaryPackages||[]).map(p=>({...p}));
    supplementSaving=true;supplementButton.disabled=true;supplementButton.textContent='กำลังบันทึก…';
    try{
      let warning='';
      if(r.visitedAt){const result=await saveConfirmedCheckupV76416(r,draft,{initial:false});warning=result.auditWarning||''}
      else{
        const payload={...r,acceptedBillingItems:draft.acceptedBillingItems,acceptedCashItems:draft.acceptedCashItems,selectedPackages:draft.selectedPackages,cashAccepted:Boolean(draft.acceptedCashItems.length)};
        await persistRecordNow(payload);Object.assign(r,payload);
      }
      pendingCheckup=savedCheckupDraft(r);updateSelectedTotal();search();
      if(document.getElementById('worklistView')?.classList.contains('active'))loadWorklist().catch(console.warn);
      const status=document.getElementById('receiveStatus');if(status)status.textContent='บันทึกแพ็กเกจเสริมแล้ว';
      packageSaveNotify('success','บันทึกแพ็กเกจเสริมสำเร็จ',warning?'บันทึกรายการแล้ว แต่บันทึกประวัติไม่สำเร็จ: '+warning:'บันทึกรายการวางบิล ชำระเอง และแพ็กเกจคู่สัญญาที่เลือกแล้ว');
    }catch(error){packageSaveNotify('error','บันทึกแพ็กเกจเสริมไม่สำเร็จ',error.message||String(error))}
    finally{supplementSaving=false;supplementButton.textContent='บันทึกแพ็กเกจเสริม';syncSupplementButton()}
  };
  const busy=new Set();
  rows?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-card-confirm-checkup]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!guard('receiveCreate'))return;
    const key=button.dataset.cardConfirmCheckup,r=state.records.find(r=>String(r.key)===key);if(!r||r.visitedAt||busy.has(key))return;
    busy.add(key);button.disabled=true;button.textContent='กำลังยืนยัน…';
    try{
      const draft={recordKey:r.key,primaryPackages:(r.primaryPackages?.length?r.primaryPackages:[{code:r.code,name:r.packageName,price:r.packagePrice}]).map(p=>({...p})),acceptedBillingItems:[],acceptedCashItems:[],selectedPackages:[],createdAt:new Date().toISOString()};
      const result=await saveConfirmedCheckupV76416(r,draft,{initial:true});
      renderTodayRegistrations();search();
      if(result.auditWarning)alert('ยืนยันแล้ว แต่บันทึกประวัติไม่สำเร็จ: '+result.auditWarning);
    }catch(error){if(!error.cancelled)alert(error.message||String(error));button.disabled=false;button.textContent='ยืนยันการตรวจ'}finally{busy.delete(key)}
  },true);
  // A4 lists eligibility separately. Never pass these items as accepted selections.
  const originalSummary=showA4Summary;
  showA4Summary=async function(draft){
    const result=await originalSummary(draft),r=state.records.find(r=>String(r.key)===String(draft?.recordKey)),co=r&&company(r.companyId),target=document.querySelector('#a4Summary .a4-content');
    if(target){
      target.querySelectorAll('.cc-a4-entitlements,.cc-a4-selected-extras').forEach(el=>el.remove());
      const groups=[['acceptedBillingItems','รายการตรวจเพิ่มเติม (วางบิล) ที่เลือก'],['acceptedCashItems','รายการตรวจเพิ่มเติม (เงินสด) ที่เลือก'],['selectedPackages','แพ็กเกจตรวจเพิ่มคู่สัญญาที่เลือก']];
      // Remove legacy empty placeholders before adding only actual chosen groups.
      for(const section of [...target.children])if(section.classList.contains('a4-section')&&groups.some(([,title])=>section.querySelector('h3')?.textContent.trim()===title))section.remove();
      const selected=groups.map(([key,title])=>({title,items:Array.isArray(draft?.[key])?draft[key]:Array.isArray(r?.[key])?r[key]:[]}));
      const hasSelected=selected.some(group=>group.items.length>0),box=document.createElement('section');
      if(hasSelected){
        box.className='cc-a4-selected-extras';
        box.innerHTML=selected.filter(group=>group.items.length).map(group=>summaryList(group.title,group.title.includes('คู่สัญญา')?group.items.map(p=>({...p,name:(p.name||'')+' · '+'ชำระเอง'})):group.items,'',true)).join('');
      }else{
        box.className='cc-a4-entitlements';
        box.innerHTML='<h3>สิทธิรายการตรวจเพิ่มเติม</h3><p>ข้อมูลสิทธิเท่านั้น ไม่ใช่รายการที่ยืนยัน ไม่รวมในยอดชำระหรือ Order</p>'+summaryList('สิทธิวางบิล',co?.billingPackages||[],'ไม่มีรายการตามสิทธิ',true)+summaryList('สิทธิชำระเอง',co?.cashPackages||[],'ไม่มีรายการตามสิทธิ',true);
      }
      for(const section of box.querySelectorAll('.a4-section')){const title=section.querySelector('h3');if(title){section.dataset.pdfKind=/คู่สัญญา/.test(title.textContent)?'contract':/วางบิล/.test(title.textContent)?'billing':'cash';title.textContent=title.textContent.replace('เงินสด','ชำระเอง')}}
      target.insertBefore(box,target.querySelector('.a4-final-block'));
    }
    return result;
  };
})();
