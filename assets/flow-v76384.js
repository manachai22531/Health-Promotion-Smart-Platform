/* v7.63.84: automatic checkup confirmation, safe Thai search, split Worklist. */
(()=>{
  const baseDetail=detail;
  detail=function(key){
    const result=baseDetail(key),record=state.records.find(item=>item.key===key);
    if(record&&!record.visitedAt&&!record.checkupConfirmedAt){
      document.querySelectorAll('#billingPicker input[type="checkbox"],#cashPicker input[type="checkbox"]').forEach(box=>{box.checked=true});
      updateSelectedTotal();
    }
    const button=$('#receiveCheckup');
    if(button)button.textContent=record?.checkupConfirmedAt||record?.visitedAt?'เปิดสรุปรายการตรวจ':'ยืนยันการตรวจ';
    return result;
  };

  $('#receiveCheckup').onclick=async function(){
    const record=state.records.find(item=>item.key===activeRecordKey);if(!record)return;
    if(record.checkupConfirmedAt||record.visitedAt){
      if(!canOpenCheckupSummary(record))return;pendingCheckup=savedCheckupDraft(record);await showA4Summary(pendingCheckup);const finalize=$('#confirmCheckup');if(finalize)finalize.hidden=true;return;
    }
    if(!guard('receiveCreate'))return;
    pendingCheckup=getDraftCheckup();if(!pendingCheckup)return;
    const before=auditSnapshot(record),createdAt=pendingCheckup.createdAt||new Date().toISOString(),button=this;
    record.acceptedBillingItems=pendingCheckup.acceptedBillingItems;record.acceptedCashItems=pendingCheckup.acceptedCashItems;record.cashAccepted=record.acceptedCashItems.length>0;record.selectedPackages=pendingCheckup.selectedPackages;record.checkupConfirmedAt=createdAt;record.visitedAt=createdAt;record.customerPendingSelection=null;
    button.disabled=true;button.textContent='กำลังยืนยัน…';
    try{
      await persistRecordNow(record);const after=auditSnapshot(record),auditResponse=await fetch('/api/checkup-logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordKey:record.key,userId:currentUser.id,action:'CREATE',details:{before,after,changes:auditChanges(before,after),acceptedBillingItems:record.acceptedBillingItems,acceptedCashItems:record.acceptedCashItems,selectedPackages:record.selectedPackages,visitedAt:record.visitedAt,confirmedFromDetail:true}})}),audit=await auditResponse.json().catch(()=>({}));if(!auditResponse.ok)throw new Error(audit.error||'บันทึก Log ไม่สำเร็จ');pendingCheckup=savedCheckupDraft(record);detail(record.key);alert('ยืนยันการตรวจเรียบร้อยแล้ว · สามารถกด “เปิดสรุปรายการตรวจ” ได้');
    }catch(error){Object.assign(record,before);alert(error.message||String(error))}finally{button.disabled=false;button.textContent=record.checkupConfirmedAt||record.visitedAt?'เปิดสรุปรายการตรวจ':'ยืนยันการตรวจ'}
  };

  const pendingConfirmationCard=(x,index)=>{
    const record=state.records.find(item=>String(item.key)===String(x.record_key))||{};
    return `<article class="worklist-pending-card"><strong>${index+1}. ${esc(x.patient_name||'-')}</strong><span>HN ${esc(x.hn||'-')}</span><small>${esc(x.company_name||'-')} · ${esc(x.project_name||x.project_code||'-')}</small><button class="button primary mini" type="button" data-worklist-confirm-record="${esc(record.key||x.record_key||'')}">ยืนยันรายการตรวจ</button></article>`;
  };
  const todayWorklistRow=(x,index)=>{
    const record=state.records.find(item=>String(item.key)===String(x.record_key))||{},summary=worklistEmrGroupSummary(record),checked=worklistSelectedKeys.has(String(x.record_key||'')),queueStatus=x.visit_status==='COMPLETE'||Number(x.station_progress||0)>=100?'COMPLETE':x.visit_status==='IN_SERVICE'?'IN_SERVICE':'WAITING',packages=[x.main_package||x.package_code,x.billing_packages,x.cash_packages].filter(Boolean).join(' · ')||'-',station=String(x.current_station||'').trim()||'ยังไม่เข้าสถานี',time=x.checkin_at?new Date(x.checkin_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):'-';
    return `<tr><td><input type="checkbox" data-worklist-select="${esc(x.record_key||'')}" ${checked?'checked':''}></td><td>${index+1}</td><td>${esc(x.hn||'-')}</td><td>${esc(x.vn||'-')}</td><td><strong>${esc(x.patient_name||'-')}</strong><small>${v76257RecordHasEmr(record)?'รับ EMR แล้ว':'ยังไม่ได้รับ EMR'}</small></td><td>${esc(x.company_name||'-')}</td><td>${esc(x.project_name||x.project_code||'-')}</td><td>${esc(packages)}</td><td>${summary.done}/${summary.total}</td><td>${esc(station)}</td><td><span class="workflow-status ${queueStatus.toLowerCase()}">${esc(operationStatusLabel(queueStatus))}</span></td><td>${esc(time)}</td><td>${esc(x.registered_by||'-')}</td></tr>`;
  };

  loadWorklist=async function(){
    const pendingBody=$('#worklistPendingRows'),todayBody=$('#worklistRows');
    try{
      const params=new URLSearchParams({date:$('#worklistDate').value||workflowDateValue(),q:$('#worklistQuery').value||'',companyId:$('#worklistCompany').value||'',projectId:$('#worklistProject').value||'',status:$('#worklistStatus').value||''}),result=await workflowFetch('/api/checkup-worklist?'+params.toString()),items=result.items||[];
      worklistLatestItems=items;worklistSelectedKeys=new Set([...worklistSelectedKeys].filter(key=>items.some(x=>String(x.record_key||'')===key)));
      const isConfirmed=x=>{const r=state.records.find(item=>String(item.key)===String(x.record_key));return Boolean(r?.checkupConfirmedAt||r?.visitedAt)},pending=items.filter(x=>!isConfirmed(x)),confirmed=items.filter(isConfirmed);
      const sentEmr=items.filter(x=>v76257RecordHasEmr(state.records.find(item=>String(item.key)===String(x.record_key))||{}));
      $('#worklistTotal').textContent=items.length.toLocaleString('th-TH');$('#worklistNotArrived').textContent=confirmed.length.toLocaleString('th-TH');$('#worklistCheckedIn').textContent=sentEmr.length.toLocaleString('th-TH');$('#worklistComplete').textContent=items.filter(x=>x.visit_status==='COMPLETE').length.toLocaleString('th-TH');
      $('#worklistPendingCount').textContent=pending.length.toLocaleString('th-TH');$('#worklistConfirmedCount').textContent=items.length.toLocaleString('th-TH');
      pendingBody.innerHTML=pending.map(pendingConfirmationCard).join('')||'<div class="workflow-empty-row">ไม่มีรายการรอยืนยันการตรวจ</div>';
      todayBody.innerHTML=items.map(todayWorklistRow).join('')||'<tr><td colspan="13" class="workflow-empty-row">ไม่พบรายการใน Worklist วันที่เลือก</td></tr>';
      v76257UpdateWorklistSelection();
    }catch(error){pendingBody.innerHTML=`<div class="workflow-empty-row">${esc(error.message)}</div>`;todayBody.innerHTML='<tr><td colspan="13" class="workflow-empty-row">โหลดข้อมูลไม่สำเร็จ</td></tr>'}
  };
  $('#worklistPendingRows')?.addEventListener('click',event=>{const button=event.target.closest('[data-worklist-confirm-record]');if(button?.dataset.worklistConfirmRecord)detail(button.dataset.worklistConfirmRecord)});
  let preparedMultiCustomerImport=null;
  const multiCustomerCompanyYear=value=>{
    const text=String(value||'').trim(),match=text.match(/^(.*)\s*\/\s*([^/]+)$/);
    if(!match)return null;
    const name=match[1].trim(),year=match[2].trim(),companyRow=(state.companies||[]).find(item=>norm(item.name)===norm(name)&&String(item.year||'').trim()===year);
    return companyRow?{company:companyRow,label:text}:null;
  };
  async function prepareMultiCustomerFile(file){
    const status=$('#multiCustomerImportStatus'),button=$('#doMultiCustomerImport'),wrap=$('#multiCustomerImportPreviewWrap'),preview=$('#multiCustomerImportPreview');
    button.disabled=true;preparedMultiCustomerImport=null;status.style.color='#087f86';status.textContent='กำลังอ่านไฟล์และจับคู่ Company/Year…';
    const records=await parse(file,''),groups=new Map(),unmatched=[];
    records.forEach(record=>{const match=multiCustomerCompanyYear(record.sourceCompany);if(!match){unmatched.push(record);return}record.companyId=match.company.id;if(!groups.has(match.company.id))groups.set(match.company.id,{company:match.company,records:[]});groups.get(match.company.id).records.push(record)});
    const grouped=[...groups.values()],matched=grouped.reduce((sum,item)=>sum+item.records.length,0);
    preparedMultiCustomerImport={signature:importFileSignature(file),groups:grouped,unmatched,total:records.length};
    status.style.color=unmatched.length?'#9a5b00':'#237a45';status.textContent=`อ่านได้ ${records.length.toLocaleString('th-TH')} รายชื่อ · จับคู่สำเร็จ ${matched.toLocaleString('th-TH')} รายชื่อ ใน ${grouped.length.toLocaleString('th-TH')} บริษัท/ปี · จับคู่ไม่ได้ ${unmatched.length.toLocaleString('th-TH')} รายชื่อ`;
    wrap.hidden=false;preview.innerHTML=`<div class="table-wrap"><table class="import-preview-table"><thead><tr><th>บริษัท / ปี</th><th>จำนวนรายชื่อ</th><th>สถานะ</th></tr></thead><tbody>${grouped.map(item=>`<tr><td>${esc(item.company.name)} / ${esc(item.company.year)}</td><td>${item.records.length.toLocaleString('th-TH')}</td><td>พร้อมนำเข้า</td></tr>`).join('')}${unmatched.length?`<tr><td>${esc([...new Set(unmatched.map(item=>item.sourceCompany||'ไม่ระบุ'))].slice(0,8).join(', '))}</td><td>${unmatched.length.toLocaleString('th-TH')}</td><td>ไม่พบบริษัท/ปีในระบบ</td></tr>`:''}</tbody></table></div>`;
    button.disabled=!matched;return preparedMultiCustomerImport;
  }
  const openMultiCustomer=$('#openMultiCustomerImport');
  if(openMultiCustomer)openMultiCustomer.onclick=()=>{if(!guard('customerImport'))return;preparedMultiCustomerImport=null;$('#multiCustomerExcelFile').value='';$('#doMultiCustomerImport').disabled=true;$('#multiCustomerImportPreviewWrap').hidden=true;$('#multiCustomerImportPreview').innerHTML='';$('#multiCustomerImportStatus').style.color='#087f86';$('#multiCustomerImportStatus').textContent='เลือกไฟล์ตามเทมเพลตสถิติการมาตรวจ';open('multiCustomerImportOverlay')};
  $('#multiCustomerExcelFile')?.addEventListener('change',async event=>{const file=event.target.files?.[0],status=$('#multiCustomerImportStatus');if(!file)return;if(!/\.(xlsx|xls)$/i.test(file.name)){status.style.color='#a53737';status.textContent='รองรับเฉพาะไฟล์ .xlsx หรือ .xls';return}try{await prepareMultiCustomerFile(file)}catch(error){status.style.color='#a53737';status.textContent='อ่านไฟล์ไม่สำเร็จ: '+(error.message||String(error))}});
  $('#doMultiCustomerImport')?.addEventListener('click',async()=>{
    if(!guard('customerImport')||!preparedMultiCustomerImport)return;
    const file=$('#multiCustomerExcelFile').files?.[0],prepared=preparedMultiCustomerImport,status=$('#multiCustomerImportStatus'),button=$('#doMultiCustomerImport'),matched=prepared.groups.reduce((sum,item)=>sum+item.records.length,0);
    if(!file||prepared.signature!==importFileSignature(file))return status.textContent='ไฟล์มีการเปลี่ยนแปลง กรุณาเลือกไฟล์ใหม่';
    if(!confirm(`ยืนยันนำเข้า ${matched.toLocaleString('th-TH')} รายชื่อ ไปยัง ${prepared.groups.length.toLocaleString('th-TH')} บริษัท/ปี?`))return;
    button.disabled=true;beginProcessing('กำลังนำเข้าหลายรายชื่อ',prepared.groups.length);
    let imported=0,added=0,updated=0;
    try{
      const backup=await fetch('/api/state/import-backups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:Number(state._revision),reason:'MULTI_CUSTOMER_IMPORT',performedBy:currentUser?.displayName||currentUser?.username||'ผู้ดูแลระบบ',companies:prepared.groups.map(item=>({name:item.company.name,year:item.company.year,code:item.company.code,customerCount:item.records.length}))})});
      if(!backup.ok){const result=await backup.json().catch(()=>({}));throw new Error(result.error||'สำรองข้อมูลก่อนนำเข้าไม่สำเร็จ')}
      for(let index=0;index<prepared.groups.length;index++){
        const item=prepared.groups[index],merge=mergeCustomerImport(item.company.id,item.records);setProcessingProgress(index,prepared.groups.length,`กำลังนำเข้า ${item.company.name} / ${item.company.year}`);
        const response=await fetch('/api/customer-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId:item.company.id,records:item.records,_revision:Number(state._revision||0),updatedBy:currentUser?.displayName||currentUser?.username||'system'})}),result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(`${item.company.name} / ${item.company.year}: ${result.error||'นำเข้าไม่สำเร็จ'}`);
        state.records=merge.records;state._revision=Number(result.revision||state._revision||0);item.company.updatedAt=result.updatedAt||new Date().toISOString();imported+=item.records.length;added+=Number(result.added||0);updated+=Number(result.updated||0);setProcessingProgress(index+1,prepared.groups.length,`นำเข้าแล้ว ${(index+1).toLocaleString('th-TH')} / ${prepared.groups.length.toLocaleString('th-TH')} บริษัท/ปี`);
      }
      renderAll();status.style.color='#237a45';status.textContent=`นำเข้าสำเร็จ ${imported.toLocaleString('th-TH')} รายชื่อ · เพิ่มใหม่ ${added.toLocaleString('th-TH')} · อัปเดตเดิม ${updated.toLocaleString('th-TH')}${prepared.unmatched.length?` · ข้ามรายการจับคู่ไม่ได้ ${prepared.unmatched.length.toLocaleString('th-TH')}`:''}`;preparedMultiCustomerImport=null;setTimeout(()=>close('multiCustomerImportOverlay'),1200);
    }catch(error){status.style.color='#a53737';status.textContent=`นำเข้าแล้ว ${imported.toLocaleString('th-TH')} รายชื่อ ก่อนหยุด: ${error.message||String(error)}`}
    finally{endProcessing();button.disabled=false}
  });
  /* v7.63.89: the automatic checkup flow has no separate save/finalize action in A4. */
  const syncCheckupWorkflowButtonsWithoutFinalize=syncCheckupWorkflowButtons;
  syncCheckupWorkflowButtons=function(record){const result=syncCheckupWorkflowButtonsWithoutFinalize(record),finalize=$('#confirmCheckup');if(finalize){finalize.hidden=true;finalize.disabled=true}return result};

  /* v7.63.88: calculate Age immediately from BirthDate, independent of HIS master-data loading. */
  const ageFromBirthDate=value=>{
    const iso=patientBirthIsoValue(value);if(!iso)return '';
    const [year,month,day]=iso.split('-').map(Number),today=new Date();let age=today.getFullYear()-year;
    if(today.getMonth()+1<month||(today.getMonth()+1===month&&today.getDate()<day))age--;
    return age>=0&&age<150?String(age):'';
  };
  const syncDetailAge=()=>{const birth=$('#detailBirth'),age=$('#detailAge');if(!birth||!age)return;age.value=ageFromBirthDate(birth.value);age.readOnly=true;age.title='ระบบคำนวณจากวันเกิดอัตโนมัติ'};
  const detailWithAutomaticAge=detail;
  detail=function(key){const result=detailWithAutomaticAge(key);syncDetailAge();const birth=$('#detailBirth');if(birth&&!birth.dataset.ageCalculatorBound){birth.addEventListener('input',syncDetailAge);birth.addEventListener('change',syncDetailAge);birth.dataset.ageCalculatorBound='1'}return result};
  const applyPatientDataWithAutomaticAge=applyPatientData;
  applyPatientData=function(){const result=applyPatientDataWithAutomaticAge.apply(this,arguments);syncDetailAge();return result};

  /* v7.63.87: separate customer search fields without changing legacy deep-links. */
  const splitSearchInputIds=['searchName','searchIdentity','searchHn'];
  const splitSearchLegacy=$('#search');
  search=async function(){
    clearTimeout(customerSearchTimer);customerSearchTimer=null;
    const nameRaw=String($('#searchName')?.value||'').trim(),identityRaw=String($('#searchIdentity')?.value||'').trim(),hnRaw=String($('#searchHn')?.value||'').trim(),packageRaw=String($('#packageFilter').value||'').trim(),legacyRaw=String(splitSearchLegacy?.value||'').trim();
    const activeRaw=[nameRaw,identityRaw,hnRaw,packageRaw,legacyRaw].filter(Boolean),companyId=companyFilterId();
    if(!activeRaw.some(value=>norm(value).length>=2)){if(splitSearchLegacy)splitSearchLegacy.value='';return searchV76225()}
    const sequence=++serverSearchSequence;$('#resultMeta').textContent='กำลังค้นหาจากฐานข้อมูล…';
    try{
      const query=new URLSearchParams({name:nameRaw,identity:identityRaw,hn:hnRaw,person:(!nameRaw&&!identityRaw&&!hnRaw)?legacyRaw:'',package:packageRaw,companyId,limit:'120'}),response=await fetch(`/api/customer-search?${query}`,{cache:'no-store'}),result=await response.json().catch(()=>({}));
      if(sequence!==serverSearchSequence)return;if(!response.ok)throw new Error(result.error||'ค้นหาข้อมูลไม่สำเร็จ');
      const rows=Array.isArray(result.items)?result.items:[];
      if(splitSearchLegacy)splitSearchLegacy.value=activeRaw.join(' ');
      searchV76225(rows);
      const shown=rows.length,total=Number(result.total||shown);$('#resultMeta').textContent=total?`พบ ${total.toLocaleString('th-TH')} รายการ${total>shown?` · แสดง ${shown.toLocaleString('th-TH')} รายการแรก`:''} · ค้นหาจาก PostgreSQL`:'ไม่พบข้อมูล';
    }catch(error){if(sequence===serverSearchSequence)$('#resultMeta').textContent=error.message||String(error)}
  };
  splitSearchInputIds.forEach(id=>{$('#'+id)?.addEventListener('input',scheduleCustomerSearch)});
  $('#searchSubmit').onclick=search;
  $('#clearSearch').onclick=()=>{['companyFilter','searchName','searchIdentity','searchHn','packageFilter','search'].forEach(id=>{const input=$('#'+id);if(input)input.value=''});$('#companyFilter').dataset.companyId='';$('#searchView').classList.remove('search-query-active');$('#resultMeta').textContent='';renderSummary();search();$('#searchName')?.focus()};
})();
