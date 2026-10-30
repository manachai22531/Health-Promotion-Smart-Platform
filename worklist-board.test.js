const {test}=require('node:test');const assert=require('node:assert/strict');
const {stage,bulkEligible}=require('./assets/worklist-board');
const {buildUnconfirmedRows,buildConfirmedRows}=require('./worklist-confirmed-fallback');
test('board stages and bulk selection require completed Order and HN/VN',()=>{
 assert.equal(stage({workflow_stage:'NOT_CONFIRMED',vn:'OLD'}),'NOT_CONFIRMED');
 assert.equal(stage({workflow_stage:'PENDING_ORDER'}),'WAITING_VISIT');
 assert.equal(stage({workflow_stage:'PENDING_ORDER',vn:'VN'}),'WAITING_ORDER');
 assert.equal(stage({workflow_stage:'ORDERED'}),'ORDERED');
 assert.equal(stage({workflow_stage:'ORDERED',station_progress:100}),'COMPLETE');
 for(const workflow_stage of ['NOT_CONFIRMED','PENDING_ORDER'])assert.equal(bulkEligible({workflow_stage,record_key:'r',hn:'h',vn:'v'}),false);
 assert.equal(bulkEligible({workflow_stage:'ORDERED',record_key:'r',hn:'h'}),false);
 assert.equal(bulkEligible({workflow_stage:'ORDERED',record_key:'r',hn:'h',vn:'v'}),true);
});
test('scheduled pending projection deduplicates and never invents confirmation or Visit',()=>{
 const records=[{key:'a',first:'Pending',hisLastVisitUID:'OLD'},{key:'b',checkupConfirmedAt:'2026-10-22T03:00:00Z'},{key:'c'},{key:'d'}];
 const bookings=[{record_key:'a',scheduled_date:'2026-10-22',vn:'OLD',checkin_at:'OLD'},{record_key:'a',scheduled_date:'2026-10-22'},{record_key:'b',scheduled_date:'2026-10-22'},{record_key:'c',scheduled_date:'2026-10-22',booking_status:'CANCELLED'},{record_key:'d',scheduled_date:'2026-10-23'}];
 const before=JSON.stringify({records,bookings});const rows=buildUnconfirmedRows({records,bookings,date:'2026-10-22'});
 assert.equal(rows.length,1);assert.equal(rows[0].record_key,'a');assert.equal(rows[0].vn,'');assert.equal(rows[0].visit_id,'');assert.equal(rows[0].checkin_at,null);assert.equal(rows[0].confirmed_at,null);assert.equal(JSON.stringify({records,bookings}),before);
 assert.equal(buildUnconfirmedRows({records,bookings,date:'2026-10-22',existingKeys:new Set(['a'])}).length,0);
 const confirmed=buildConfirmedRows({records,date:'2026-10-22'});assert.equal(confirmed.length,1);assert.equal(confirmed[0].record_key,'b');
});
