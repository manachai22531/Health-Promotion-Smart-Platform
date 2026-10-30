/* v7.63.84: automatic checkup confirmation, safe Thai search, split Worklist. */
(()=>{
  const baseDetail=detail;
  detail=function(key){
    const result=baseDetail(key),record=state.records.find(item=>item.key===key);
    if(record&&!record.visitedAt&&!record.checkupConfirmedAt){
      // Extra services are not selected automatically; Worklist records actual choices.
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
      await persistRecordNow(record);renderTodayRegistrations();const after=auditSnapshot(record),auditResponse=await fetch('/api/checkup-logs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordKey:record.key,userId:currentUser.id,action:'CREATE',details:{before,after,changes:auditChanges(before,after),acceptedBillingItems:record.acceptedBillingItems,acceptedCashItems:record.acceptedCashItems,selectedPackages:record.selectedPackages,visitedAt:record.visitedAt,confirmedFromDetail:true}})}),audit=await auditResponse.json().catch(()=>({}));if(!auditResponse.ok)throw new Error(audit.error||'บันทึก Log ไม่สำเร็จ');pendingCheckup=savedCheckupDraft(record);detail(record.key);await loadWorklist();alert('ยืนยันการตรวจแล้ว · สถานะอัปเดตในตาราง Worklist เดิม พร้อมเปิด Visit และสั่ง OrderHIS');
    }catch(error){Object.assign(record,before);alert(error.message||String(error))}finally{button.disabled=false;button.textContent=record.checkupConfirmedAt||record.visitedAt?'เปิดสรุปรายการตรวจ':'ยืนยันการตรวจ'}
  };

  let worklistRecordIndex=new Map();
  const worklistVisitErrors=new Map();let worklistVisitBusy=false;
  function worklistVisitStatusHtml(x){const error=worklistVisitErrors.get(String(x.record_key||'')),his=x.his_visit_status;const text=his?.rawStatus?his.rawStatus:error?'รับสถานะไม่สำเร็จ':his?'ไม่พบ Visit ที่ตรงกัน':'ยังไม่ได้รับ';const checked=his?.checkedAt&&Number.isFinite(Date.parse(his.checkedAt))?new Date(his.checkedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'';return `<span class="worklist-his-visit-status" title="${esc([his?.source,error||his?.lastAttemptError||his?.message||'สถานะ Visit จาก HIS แยกจากสถานะการตรวจภายในระบบ'].filter(Boolean).join(' · '))}">${esc(text)}</span>${checked?`<small>รับล่าสุด ${esc(checked)}</small>`:''}`}
  const arrivalTime=x=>{const r=worklistRecordIndex.get(String(x.record_key))||{},time=Date.parse(x.confirmed_at||r.checkupConfirmedAt||r.visitedAt||x.checkin_at||'');return Number.isFinite(time)?time:Infinity};
  const stageLabels={NOT_CONFIRMED:'รอยืนยัน',WAITING_VISIT:'ยืนยันแล้ว / รอเปิด Visit',WAITING_ORDER:'รอสั่ง Order',ORDERED:'ส่งตรวจแล้ว',COMPLETE:'เสร็จสิ้น'};
  let boardItems=[],boardStage='ALL',worklistLoadSequence=0;
  const todayWorklistRow=(x,index)=>{
    const record=worklistRecordIndex.get(String(x.record_key))||{},stage=HealthCheckWorklistBoard.stage(x),eligible=HealthCheckWorklistBoard.bulkEligible(x),summary=worklistEmrGroupSummary(record),checked=eligible&&worklistSelectedKeys.has(String(x.record_key)),packages=Array.isArray(x.ordered_packages)?x.ordered_packages:[],hasEmr=v76257RecordHasEmr(record);
    const timeValue=x.checkin_at||x.confirmed_at,time=timeValue?new Date(timeValue).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}):'—';
    const actionLabel=stage==='NOT_CONFIRMED'?'ยืนยันการตรวจ':stage==='WAITING_VISIT'?'เปิด Visit':stage==='WAITING_ORDER'?'สั่ง Order':'ดูรายละเอียด';
    const actionAllowed=stage==='NOT_CONFIRMED'||stage==='WAITING_VISIT'?can('receiveCreate'):stage==='WAITING_ORDER'?can('receiveFinalize'):true;
    const emr=eligible?(hasEmr?`<span>รับ EMR แล้ว · ${summary.done}/${summary.total}</span><button class="button secondary mini" type="button" data-worklist-forward-emr="${esc(x.record_key)}" data-worklist-payload="${esc(v76257WorklistPayload(x))}" ${can('emrAssign')?'':'disabled'}>ส่ง EMR</button>`:`<span>รอผล / ยังไม่รับ EMR</span><button class="button secondary mini" type="button" data-worklist-emr="${esc(x.record_key)}" data-worklist-vn="${esc(x.vn||'')}">รับ EMR</button>`):'—';
    return `<tr data-worklist-record="${esc(x.record_key)}" data-worklist-row-stage="${stage}"><td><input type="checkbox" ${eligible?`data-worklist-select="${esc(x.record_key)}" ${checked?'checked':''}`:'disabled'} aria-label="เลือก ${esc(x.patient_name||'รายการ')}"/></td><td><strong>${index+1}. ${esc(x.patient_name||'-')}</strong><small>HN ${esc(x.hn||'—')}</small></td><td><strong>${esc(x.company_name||'—')}</strong><small>${esc(x.project_name||x.project_code||'—')}</small></td><td><span class="worklist-stage-badge ${stage.toLowerCase()}">${stageLabels[stage]}</span></td><td><strong>${esc(stage==='NOT_CONFIRMED'?'—':x.vn||'ยังไม่เปิด Visit')}</strong>${eligible?`<div data-worklist-visit-status="${esc(x.record_key)}">${worklistVisitStatusHtml(x)}</div>`:''}</td><td class="worklist-ordered-packages">${x.workflow_stage==='ORDERED'?(packages.map(value=>`<div>${worklistPackageHtml(value)}</div>`).join('')||'ส่ง Order แล้ว · ไม่พบรายละเอียดรายการเดิม'):'ยังไม่ส่ง Order'}</td><td><div class="worklist-action-stack">${emr}</div><small>${eligible?esc(x.current_station||'ยังไม่เข้าสถานี'):''}</small></td><td>${esc(time)}<small>${esc(x.registered_by||'')}</small></td><td><button class="button ${stage==='NOT_CONFIRMED'?'primary':'secondary'} mini" type="button" data-worklist-confirm-record="${esc(x.record_key)}" ${actionAllowed?'':'disabled'} title="เปิดข้อมูลเพื่อตรวจสอบและดำเนินการ">${actionLabel}</button></td></tr>`;
  };
  function renderUnifiedWorklist(){
    const counts={ALL:boardItems.length,NOT_CONFIRMED:0,WAITING_VISIT:0,WAITING_ORDER:0,ORDERED:0,COMPLETE:0};
    boardItems.forEach(x=>counts[HealthCheckWorklistBoard.stage(x)]++);
    document.querySelectorAll('[data-worklist-count]').forEach(el=>el.textContent=counts[el.dataset.worklistCount].toLocaleString('th-TH'));
    document.querySelectorAll('[data-worklist-stage]').forEach(el=>{const active=el.dataset.worklistStage===boardStage;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))});
    const visible=boardItems.filter(x=>boardStage==='ALL'||HealthCheckWorklistBoard.stage(x)===boardStage);
    worklistLatestItems=visible.filter(HealthCheckWorklistBoard.bulkEligible);
    const eligible=new Set(worklistLatestItems.map(x=>String(x.record_key)));
    worklistSelectedKeys=new Set([...worklistSelectedKeys].filter(key=>eligible.has(key)));
    $('#worklistConfirmedCount').textContent=visible.length.toLocaleString('th-TH');
    $('#worklistRows').innerHTML=visible.map(todayWorklistRow).join('')||'<tr><td colspan="9" class="workflow-empty-row">ไม่พบรายการตามวันที่และสถานะที่เลือก</td></tr>';
    v76257UpdateWorklistSelection();
  }
  $('#worklistStageTabs')?.addEventListener('click',event=>{const button=event.target.closest('[data-worklist-stage]');if(!button)return;boardStage=button.dataset.worklistStage;renderUnifiedWorklist()});
  loadWorklist=async function(){
    const sequence=++worklistLoadSequence;
    try{
      const params=new URLSearchParams({date:$('#worklistDate').value||workflowDateValue(),q:$('#worklistQuery').value||'',companyId:$('#worklistCompany').value||'',projectId:$('#worklistProject').value||'',status:$('#worklistStatus').value||''}),result=await workflowFetch('/api/checkup-worklist?'+params.toString());
      if(sequence!==worklistLoadSequence)return;
      worklistRecordIndex=new Map(state.records.map(r=>[String(r.key||r.id||''),r]));
      boardItems=(result.items||[]).sort((a,b)=>arrivalTime(a)-arrivalTime(b)||String(a.record_key||'').localeCompare(String(b.record_key||'')));
      renderUnifiedWorklist();
    }catch(error){if(sequence!==worklistLoadSequence)return;boardItems=[];worklistLatestItems=[];worklistSelectedKeys.clear();renderUnifiedWorklist();$('#worklistRows').innerHTML=`<tr><td colspan="9" class="workflow-empty-row">${esc(error.message||'โหลดข้อมูลไม่สำเร็จ')}</td></tr>`;}
  };
  for(const id of ['refreshWorklist','runWorklist'])if($('#'+id))$('#'+id).onclick=()=>loadWorklist();
  for(const id of ['worklistDate','worklistCompany','worklistProject','worklistStatus'])if($('#'+id))$('#'+id).onchange=()=>loadWorklist();
  if($('#worklistQuery'))$('#worklistQuery').onkeydown=event=>{if(event.key==='Enter')loadWorklist()};
  const visitStatusButton=$('#worklistBulkVisitStatus');
  if(visitStatusButton)visitStatusButton.onclick=async()=>{
    if(worklistVisitBusy||!guard('worklistView'))return;
    const targets=[...new Map(worklistLatestItems.filter(x=>worklistSelectedKeys.has(String(x.record_key||''))).map(x=>[String(x.record_key),{...x}])).values()];
    if(!targets.length)return alert('กรุณาเลือกรายการที่ต้องการรับ VisitStatus');
    worklistVisitBusy=true;visitStatusButton.disabled=true;const label=visitStatusButton.textContent;let ok=0,failed=0,skipped=0;beginProcessing('กำลังรับ VisitStatus จาก HIS',targets.length);
    try{for(let i=0;i<targets.length;i++){const x=targets[i],key=String(x.record_key);setProcessingProgress(i,targets.length,`รับ VisitStatus · HN ${x.hn||'-'} · VN ${x.vn||'-'}`);
      if(!x.hn||!x.vn){skipped++;worklistVisitErrors.set(key,'ต้องมี HN และ VN ก่อนรับ VisitStatus');setProcessingProgress(i+1,targets.length);continue}
      try{const data=await workflowFetch('/api/clinical/cases/'+encodeURIComponent(key)+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(data.revision!=null)state._revision=Number(data.revision);if(!data.his?.matched||data.his.hn!==x.hn||data.his.vn!==x.vn)throw Error(data.his?.message||'HN/VN จาก HIS ไม่ตรงกับรายการที่เลือก');worklistVisitErrors.delete(key);ok++}catch(error){failed++;worklistVisitErrors.set(key,error.message||String(error))}finally{setProcessingProgress(i+1,targets.length)}
    }await loadWorklist();alert(`รับ VisitStatus สำเร็จ ${ok} · ไม่สำเร็จ ${failed} · ข้าม ${skipped}`)}finally{worklistVisitBusy=false;visitStatusButton.textContent=label;endProcessing();v76257UpdateWorklistSelection()}
  };
  // The summary must not silently do nothing when the user clicks a confirmed record.
  const previousOpenSummary=$('#receiveCheckup')?.onclick;
  if($('#receiveCheckup'))$('#receiveCheckup').onclick=async function(event){
    const record=state.records.find(item=>String(item.key)===String(activeRecordKey));
    if(!record)return alert('ไม่พบผู้รับบริการ กรุณาเปิดรายการใหม่');
    if(!(record.checkupConfirmedAt||record.visitedAt))return previousOpenSummary?.call(this,event);
    if(!canOpenCheckupSummary(record))return alert('ไม่มีสิทธิ์เปิดสรุปรายการตรวจ กรุณาตรวจสอบ Role ของบัญชี');
    if(this.disabled)return;
    this.disabled=true;
    try{
      pendingCheckup=savedCheckupDraft(record);
      // The A4 overlay opens before fetching slow HIS package details.
      await showA4Summary(pendingCheckup);
      if(!$('#summaryOverlay')?.classList.contains('open'))open('summaryOverlay');
      syncCheckupWorkflowButtons(record);
    }catch(error){
      console.error('เปิดสรุปรายการตรวจไม่สำเร็จ',error);
      alert(`เปิดสรุปรายการตรวจไม่สำเร็จ: ${error.message||String(error)}`);
    }finally{this.disabled=false}
  };
  $('#worklistRows')?.addEventListener('click',event=>{const button=event.target.closest('[data-worklist-confirm-record]');if(button&&!button.disabled&&button.dataset.worklistConfirmRecord)detail(button.dataset.worklistConfirmRecord)});
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
    let imported=0,added=0,updated=0;const sourceFileWarnings=[];
    try{
      const backup=await fetch('/api/state/import-backups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:Number(state._revision),reason:'MULTI_CUSTOMER_IMPORT',performedBy:currentUser?.displayName||currentUser?.username||'ผู้ดูแลระบบ',companies:prepared.groups.map(item=>({name:item.company.name,year:item.company.year,code:item.company.code,customerCount:item.records.length}))})});
      if(!backup.ok){const result=await backup.json().catch(()=>({}));throw new Error(result.error||'สำรองข้อมูลก่อนนำเข้าไม่สำเร็จ')}
      for(let index=0;index<prepared.groups.length;index++){
        const item=prepared.groups[index],merge=mergeCustomerImport(item.company.id,item.records);setProcessingProgress(index,prepared.groups.length,`กำลังนำเข้า ${item.company.name} / ${item.company.year}`);
        const response=await fetch('/api/customer-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId:item.company.id,records:item.records,_revision:Number(state._revision||0),updatedBy:currentUser?.displayName||currentUser?.username||'system'})}),result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(`${item.company.name} / ${item.company.year}: ${result.error||'นำเข้าไม่สำเร็จ'}`);
        state.records=merge.records;state._revision=Number(result.revision||state._revision||0);try{await storeCompanyImportFile(item.company.id,file,item.records.length)}catch(error){sourceFileWarnings.push(`${item.company.name}: ${error.message}`)}item.company.updatedAt=result.updatedAt||new Date().toISOString();imported+=item.records.length;added+=Number(result.added||0);updated+=Number(result.updated||0);setProcessingProgress(index+1,prepared.groups.length,`นำเข้าแล้ว ${(index+1).toLocaleString('th-TH')} / ${prepared.groups.length.toLocaleString('th-TH')} บริษัท/ปี`);
      }
      renderAll();status.style.color='#237a45';status.textContent=`นำเข้าสำเร็จ ${imported.toLocaleString('th-TH')} รายชื่อ · เพิ่มใหม่ ${added.toLocaleString('th-TH')} · อัปเดตเดิม ${updated.toLocaleString('th-TH')}${prepared.unmatched.length?` · ข้ามรายการจับคู่ไม่ได้ ${prepared.unmatched.length.toLocaleString('th-TH')}`:''}`;preparedMultiCustomerImport=null;if(sourceFileWarnings.length){status.style.color='#9a5b00';status.textContent+=' · ข้อมูลนำเข้าแล้ว แต่เก็บไฟล์ต้นฉบับไม่สำเร็จ: '+sourceFileWarnings.join(' / ')}else setTimeout(()=>close('multiCustomerImportOverlay'),1200);
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
      const shown=rows.length,total=Number(result.total||shown);$('#resultMeta').textContent=total?`พบ ${total.toLocaleString('th-TH')} รายการ${total>shown?` · แสดง ${shown.toLocaleString('th-TH')} รายการแรก`:''}`:'ไม่พบข้อมูล';
    }catch(error){if(sequence===serverSearchSequence)$('#resultMeta').textContent=error.message||String(error)}
  };
  splitSearchInputIds.forEach(id=>{$('#'+id)?.addEventListener('input',scheduleCustomerSearch)});
  $('#searchSubmit').onclick=search;
  $('#clearSearch').onclick=()=>{['companyFilter','searchName','searchIdentity','searchHn','packageFilter','search'].forEach(id=>{const input=$('#'+id);if(input)input.value=''});$('#companyFilter').dataset.companyId='';$('#searchView').classList.remove('search-query-active');$('#resultMeta').textContent='';renderSummary();search();$('#searchName')?.focus()};
})();
