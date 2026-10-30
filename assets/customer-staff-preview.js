/* Staff-only, read-only projection using the real customer renderer and catalog. */
(async()=>{'use strict';const key=new URLSearchParams(location.search).get('staffPreview');if(!IS_CUSTOMER_PORTAL||!key)return;
 const banner=document.createElement('div');banner.className='csr-staff-preview-banner';banner.textContent='มุมมองลูกค้า · เจ้าหน้าที่กำลังดู · อ่านอย่างเดียว ไม่บันทึกหรือส่งรายการ';document.body.prepend(banner);document.body.classList.add('csr-staff-preview');
 const loading=document.createElement('div');loading.className='csr-preview-loading';loading.setAttribute('role','status');loading.textContent='กำลังโหลดข้อมูลลูกค้า…';document.body.append(loading);
 // Never reuse or create a customer session, including one already open in another tab.
 customerPortalToken='';
 const responseJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 let profile;
 customerApi=async(path,options={})=>{if(options.method&&options.method!=='GET')return responseJson({error:'มุมมองเจ้าหน้าที่เป็นแบบอ่านอย่างเดียว'},403);if(path==='/me')return responseJson(profile);if(path==='/me/contexts')return responseJson({activeKey:key,contexts:[{key,companyName:profile?.company?.name||'',year:profile?.company?.year||''}]});if(path==='/me/books')return responseJson({books:[]});if(path==='/me/appointments')return responseJson({appointments:[],projects:[]});return responseJson({error:'ข้อมูลนี้ไม่แสดงในมุมมองแพ็กเกจ'},403)};
 try {const response=await fetch('/api/customer-staff-preview/'+encodeURIComponent(key),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'ไม่สามารถเปิดข้อมูลลูกค้าได้');profile=data;renderCustomerProfile(profile);for(const form of document.querySelectorAll('#customerProfilePanel form')){form.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation()},true)}document.getElementById('customerProfileForm')?.setAttribute('inert','');loading.remove();}
 catch(error){loading.textContent=error.message+' · ปิดหน้านี้แล้วเข้าสู่ระบบเจ้าหน้าที่ใหม่หรือตรวจสอบสิทธิ์';}
})();
