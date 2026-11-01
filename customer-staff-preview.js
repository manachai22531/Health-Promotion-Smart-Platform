'use strict';
function registerCustomerStaffPreview({app,localOnly,staffPermissionRequired,profileFor,submitSelection}){
 app.get('/api/customer-staff-preview/:key',localOnly,staffPermissionRequired('search'),staffPermissionRequired('customerSensitiveView'),async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {const profile=await profileFor(String(req.params.key),false);res.json({...profile,staffPreview:true});}
  catch(error){res.status(error.status===404?404:500).json({error:error.status===404?'ไม่พบข้อมูลลูกค้า':'อ่านข้อมูลลูกค้าไม่สำเร็จ'});}
 });
 if(submitSelection)app.post('/api/customer-staff-preview/:key/selection',localOnly,staffPermissionRequired('search'),staffPermissionRequired('customerSensitiveView'),staffPermissionRequired('customerEdit'),async(req,res)=>{try{res.set('Cache-Control','no-store').json(await submitSelection(req,String(req.params.key)))}catch(error){res.status(error.status||500).json({error:error.status?error.message:'บันทึกแทนลูกค้าไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุด'})}});
}
module.exports={registerCustomerStaffPreview};
