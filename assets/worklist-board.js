(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.HealthCheckWorklistBoard=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function stage(item){
  if(!item||item.workflow_stage==='NOT_CONFIRMED'||!['ORDERED','PENDING_ORDER'].includes(item.workflow_stage))return 'NOT_CONFIRMED';
  if(item.workflow_stage==='ORDERED')return item.visit_status==='COMPLETE'||Number(item.station_progress)>=100?'COMPLETE':'ORDERED';
  return item.vn?'WAITING_ORDER':'WAITING_VISIT';
 }
 function bulkEligible(item){return item?.workflow_stage==='ORDERED'&&Boolean(item.record_key&&item.hn&&item.vn)}
 return {stage,bulkEligible};
});
