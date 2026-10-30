/* One explicit save action; never triggers confirmation, OpenVisit or HIS Order. */
(()=>{'use strict';
 const ids=['saveCustomerDetail','saveCustomerPackages','saveCustomerSupplements','saveCustomerPackageSettings'];
 const originals=ids.map(id=>document.getElementById(id)).filter(Boolean),parent=originals[0]?.parentElement;if(!parent)return;
 originals.forEach(b=>b.setAttribute('data-save-all-source',''));
 const button=document.createElement('button');button.id='saveCustomerAll';button.type='button';button.className='button primary';button.textContent='บันทึกข้อมูล';button.title='บันทึกข้อมูลส่วนบุคคล แพ็กเกจหลัก แพ็กเกจเสริม และประเภท / สถานี ตามสิทธิ์ที่มี';parent.insertBefore(button,originals[0]);
 let busy=false;
 function sync(){const allowed=can('customerEdit')||can('receiveEdit')||can('packageStationEdit')||can('orderItemManage')||can('orderTypeManage');button.hidden=!allowed;button.disabled=busy}
 const oldDetail=detail;detail=function(key){const result=oldDetail(key);sync();return result};sync();
 button.onclick=async()=>{
  if(busy||globalThis.HealthCheckCustomerBusy?.active)return;const record=state.records.find(r=>String(r.key)===String(activeRecordKey));if(!record)return;
  const release=globalThis.HealthCheckCustomerBusy?.begin();busy=true;sync();button.textContent='กำลังบันทึก…';
  let patientSaved=false,settingsSaved=false,noteSaved=false,auditWarning='';
  const acknowledgedControls=[...document.querySelectorAll('#detailBody input,#detailBody select,#detailBody textarea')].map(el=>({el,value:el.type==='checkbox'?el.checked:el.value}));
  try{
   const noteForm=document.querySelector('#detailBody .detail-personal-note');if(noteForm&&(can('customerEdit')||can('receiveEdit'))&&noteForm.querySelector('textarea').value!==decodeURIComponent(noteForm.dataset.expectedNote)){await HealthCheckPersonalNotes.save(noteForm);noteSaved=true;}
   const payload=JSON.parse(JSON.stringify(record)),before=customerDetailSnapshot(record),extrasBefore=auditSnapshot(record);
   if(can('customerEdit')){
    const fields={"detailDisplayOrder": "displayOrder", "detailCheckupDate": "checkupDate", "detailCheckupEndDate": "checkupEndDate", "detailTitle": "title", "detailLast": "last", "detailIdentificationType": "identificationType", "detailBirth": "birth", "detailSex": "sex", "detailMaritalStatus": "maritalStatus", "detailAddress": "address", "detailAge": "ageValue", "detailPhone": "phone", "detailHN": "hn", "detailVN": "vn", "detailPrefixEN": "prefixEN", "detailFirstNameEN": "firstNameEN", "detailLastNameEN": "lastNameEN", "detailDoctorName": "doctorName", "detailDoctorNumber": "doctorNumber", "detailPayor": "payor", "detailPayorAgreement": "payorAgreement", "detailPayorOffice": "payorOffice", "detailLocationCode": "locationCode", "detailEmployeeCode": "employeeCode", "detailDepartmentName": "departmentName", "detailPositionName": "positionName", "detailNationality": "nationality", "detailAppointmentDate": "appointmentDate", "detailAppointmentSlotId": "appointmentSlotId", "detailSlots": "slots", "detailScheduleAppointment": "scheduleAppointment", "detailStartLab": "startLab", "detailFirst": "first", "detailEmail": "email", "detailId": "id"};
    for(const [id,key] of Object.entries(fields)){const el=document.getElementById(id);if(el&&!(id==='detailId'&&!can('customerSensitiveView')))payload[key]=['payor','payorAgreement','payorOffice','locationCode'].includes(key)&&typeof HealthCheckCoverageNames!=='undefined'?HealthCheckCoverageNames.code(el.value):String(el.value??'').trim()}
    if(!payload.first)throw Error('กรุณากรอกชื่อ');if(payload.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))throw Error('รูปแบบอีเมลไม่ถูกต้อง');
    // Preserve a known HIS VN when a stale or empty detail field has not been edited.
    if(!payload.vn&&(record.hisLastVisitUID||record.vn)){payload.vn=record.hisLastVisitUID||record.vn}
    payload.hisLastVisitUID=payload.vn||'';
    const packages=readPrimaryPackages(),unknown=packages.map(p=>p.code).filter(code=>code&&!hisPackageByCode(code)),allowed=primaryPackageBookingCodes(record);
    if(unknown.length)throw Error('ไม่พบ Package Code ในฐานข้อมูล HIS: '+unknown.join(', '));
    if(allowed&&packages.some(p=>p.code&&!allowed.has(norm(p.code))))throw Error('แพ็กเกจหลักไม่ตรงกับ Booking');
    Object.assign(payload,{primaryPackages:packages,code:packages[0]?.code||'',packageName:packages[0]?.name||''});
   }
   const draft=getDraftCheckup();
   if(draft&&(can('receiveEdit')||(!record.visitedAt&&can('customerEdit'))))Object.assign(payload,{acceptedBillingItems:draft.acceptedBillingItems||[],acceptedCashItems:draft.acceptedCashItems||[],selectedPackages:draft.selectedPackages||[],cashAccepted:Boolean(draft.acceptedCashItems?.length)});
   const selectionChanged=checkupChoicesChangedV76416(payload,record);
   if(selectionChanged&&record.visitedAt&&!can('receiveEdit'))throw Error('ไม่มีสิทธิ์แก้ไขรายการตรวจที่ยืนยันแล้ว');
   if(selectionChanged&&record.orderHisAt&&(!record.cancelOrderAt||Date.parse(record.orderHisAt)>Date.parse(record.cancelOrderAt)))throw Error('กรุณา Cancel Order ก่อนแก้ไขแพ็กเกจ');
   collectPackageSettingsDraftsFromDomV76282();const types=[...packageTypeDrafts.values()],stations=[...packageStationDrafts.values()];
   if(types.length&&!(can('orderItemManage')||can('orderTypeManage')))throw Error('ไม่มีสิทธิ์บันทึกประเภท');
   if(stations.length&&!can('packageStationEdit'))throw Error('ไม่มีสิทธิ์บันทึกสถานี');
   const merged=new Map();for(const c of types){const key=c.packageId+'|'+c.itemKey;merged.set(key,{packageId:Number(c.packageId),itemKey:c.itemKey,hasType:true,itemType:c.type||'',hasStation:false})}
   for(const c of stations){const key=c.packageId+'|'+c.itemKey,item=merged.get(key)||{packageId:Number(c.packageId),itemKey:c.itemKey,hasType:false};Object.assign(item,{hasStation:true,stationId:c.stationId===''?null:Number(c.stationId)});merged.set(key,item)}
   const changes=customerDetailChanges(before,customerDetailSnapshot(payload)),patientChanged=JSON.stringify(record)!==JSON.stringify(payload);
   if(!patientChanged&&!merged.size){
    busy=true;sync();button.textContent='กำลังตรวจข้อมูล…';
    document.dispatchEvent(new CustomEvent('hc-customer-save-all',{detail:{record:payload,controls:acknowledgedControls}}));
    await showA4Summary(savedCheckupDraft(record));
    return packageSaveNotify('success',noteSaved?'บันทึกหมายเหตุแล้ว':'ข้อมูลเป็นปัจจุบัน',noteSaved?'บันทึกหมายเหตุเฉพาะบุคคลแล้ว':'ข้อมูลที่แก้ไขตรงกับข้อมูลที่บันทึกแล้ว');
   }
   busy=true;sync();button.textContent='กำลังบันทึก…';
   if(patientChanged){
    if(record.visitedAt&&selectionChanged){const result=await saveConfirmedCheckupV76416(payload,{...draft,recordKey:record.key,primaryPackages:payload.primaryPackages},{initial:false});auditWarning=result.auditWarning||''}
    else await persistRecordNow(payload);
    Object.assign(record,payload);patientSaved=true;
    try{await writeCustomerSectionAudit(record,'CUSTOMER_SAVE_ALL',before,customerDetailSnapshot(record),changes,extrasBefore,auditSnapshot(record))}catch(e){auditWarning=e.message}
   }
   if(merged.size){const result=await workflowFetch('/api/package-item-settings/batch',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[...merged.values()]})});if(Number(result.updated)!==merged.size)throw Error('Server ยืนยันรายการประเภท / สถานีไม่ครบ');for(const c of types){const key=c.packageId+'|'+c.itemKey;if(packageTypeDrafts.get(key)?.type===c.type)packageTypeDrafts.delete(key)}for(const c of stations){const key=c.packageId+'|'+c.itemKey;if(packageStationDrafts.get(key)?.stationId===c.stationId)packageStationDrafts.delete(key)}settingsSaved=true;
    document.querySelectorAll('#customerHisPackage [data-package-type-item]').forEach(el=>{const c=types.find(c=>String(c.packageId)===String(el.dataset.packageId)&&c.itemKey===el.dataset.packageTypeItem);if(c)el.dataset.currentType=c.type||''});
    document.querySelectorAll('#customerHisPackage [data-package-station-item]').forEach(el=>{const c=stations.find(c=>String(c.packageId)===String(el.dataset.packageId)&&c.itemKey===el.dataset.packageStationItem);if(c)el.dataset.currentStationId=c.stationId||''});
   }
   pendingCheckup=savedCheckupDraft(record);updateSelectedTotal();updateCustomerPackageSaveButton();search();
   // Both writes have completed before refreshing the shared HTML summary.
   document.dispatchEvent(new CustomEvent('hc-customer-save-all',{detail:{record:payload,controls:acknowledgedControls}}));
   await showA4Summary(pendingCheckup);
   packageSaveNotify('success','บันทึกข้อมูลสำเร็จ',auditWarning?'บันทึกข้อมูลแล้ว แต่ประวัติบางส่วนไม่สำเร็จ: '+auditWarning:'บันทึกส่วนที่เปลี่ยนแปลงแล้ว ไม่ได้ส่ง Order ไป HIS');
  }catch(error){if(error.cancelled)return;packageSaveNotify('error',patientSaved||settingsSaved||noteSaved?'บันทึกได้บางส่วน':'บันทึกไม่สำเร็จ',(noteSaved?'หมายเหตุบันทึกแล้ว · ':'')+(patientSaved?'ข้อมูลผู้ป่วยและแพ็กเกจบันทึกแล้ว · ':'')+(settingsSaved?'ประเภท / สถานีบันทึกแล้ว · ':'')+(error.message||String(error)))}
  finally{release?.();busy=false;button.textContent='บันทึกข้อมูล';sync()}
 };
})();
