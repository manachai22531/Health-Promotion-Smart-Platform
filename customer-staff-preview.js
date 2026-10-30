'use strict';
function registerCustomerStaffPreview({app,localOnly,staffPermissionRequired,profileFor}){
 app.get('/api/customer-staff-preview/:key',localOnly,staffPermissionRequired('search'),staffPermissionRequired('customerSensitiveView'),async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {const profile=await profileFor(String(req.params.key),false);res.json({...profile,staffPreview:true});}
  catch(error){res.status(error.status===404?404:500).json({error:error.status===404?'ไม่พบข้อมูลลูกค้า':'อ่านข้อมูลลูกค้าไม่สำเร็จ'});}
 });
}
module.exports={registerCustomerStaffPreview};
