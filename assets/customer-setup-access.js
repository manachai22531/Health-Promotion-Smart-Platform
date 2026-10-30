(()=>{'use strict';
 window.CustomerSetupStandalone=true;let permitted=false,challenge='',generation=0;
 window.can=permission=>permission==='customerPageManage'&&permitted;
 const $=id=>document.getElementById(id),login=$('customerSetupLogin'),view=$('customerDisplaySetupView'),denied=$('customerSetupDenied'),change=$('customerSetupPasswordChange'),status=$('customerSetupLoginStatus'),logout=$('customerSetupLogout');
 function showLogin(message=''){
  generation++;permitted=false;window.HealthCheckAuth?.stop();view.classList.remove('active');view.hidden=true;denied.hidden=true;change.hidden=true;login.hidden=false;logout.hidden=true;$('customerSetupActor').textContent='';status.textContent=message;
 }
 window.expireStaffSessionForOcr=message=>showLogin(message);
 async function request(url,options={}){const response=await fetch(url,{cache:'no-store',...options}),data=await response.json();return {response,data}}
 async function check(){
  const ticket=++generation;
  try{
   const session=await request('/api/auth/session');if(ticket!==generation)return;
   if(!session.response.ok){showLogin();return}
   const access=await request('/api/customer-display-settings');if(ticket!==generation)return;
   if(access.response.status===401){showLogin(access.data.error);return}
   login.hidden=true;change.hidden=true;logout.hidden=false;$('customerSetupActor').textContent=session.data.user.displayName||session.data.user.username;
   if(!access.response.ok){view.hidden=true;view.classList.remove('active');denied.hidden=false;permitted=false;return}
   denied.hidden=true;permitted=true;view.hidden=false;view.classList.add('active');window.HealthCheckAuth.start(session.data.user);document.dispatchEvent(new CustomEvent('customer-setup-session-ready'));
  }catch(error){showLogin('ติดต่อระบบไม่ได้ กรุณาลองเข้าสู่ระบบอีกครั้ง')}
 }
 login.onsubmit=async event=>{
  event.preventDefault();const button=$('customerSetupLoginSubmit');button.disabled=true;status.textContent='กำลังเข้าสู่ระบบ…';
  try{
   const {response,data}=await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('customerSetupUsername').value,password:$('customerSetupPassword').value})});
   $('customerSetupPassword').value='';if(!response.ok)throw Error(data.error||'เข้าสู่ระบบไม่สำเร็จ');
   if(data.mustChangePassword){challenge=data.changeToken;login.hidden=true;change.hidden=false;$('customerSetupChangeTitle').textContent=data.passwordExpired?'รหัสผ่านหมดอายุ':'ตั้งรหัสผ่านส่วนตัว';$('customerSetupNewPassword').focus();return}
   await check();
  }catch(error){status.textContent=error.message}finally{button.disabled=false}
 };
 change.onsubmit=async event=>{
  event.preventDefault();const note=$('customerSetupChangeStatus'),button=$('customerSetupChangeSubmit');
  if($('customerSetupNewPassword').value!==$('customerSetupConfirmPassword').value){note.textContent='รหัสผ่านไม่ตรงกัน';return}
  button.disabled=true;note.textContent='กำลังบันทึก…';
  try{const {response,data}=await request('/api/auth/change-first-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:challenge,password:$('customerSetupNewPassword').value})});if(!response.ok)throw Error(data.error||'เปลี่ยนรหัสผ่านไม่สำเร็จ');challenge='';change.reset();showLogin('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสใหม่')}catch(error){note.textContent=error.message}finally{button.disabled=false}
 };
 $('customerSetupChangeCancel').onclick=()=>{challenge='';change.reset();showLogin()};
 logout.onclick=async()=>{window.HealthCheckAuth.stop();try{await request('/api/auth/logout',{method:'POST'})}finally{showLogin('ออกจากระบบแล้ว')}};
 check();
})();
