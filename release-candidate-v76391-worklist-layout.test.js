'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Worklist has a pending-confirmation panel and an all-column daily EMR grid',()=>{
  const html=fs.readFileSync('app.html','utf8');
  const flow=fs.readFileSync('assets/flow-v76384.js','utf8');
  const css=fs.readFileSync('assets/style.css','utf8');
  assert.match(html,/รอยืนยันการตรวจ/);
  assert.match(html,/ยืนยันรายการตรวจแล้ว/);
  assert.match(html,/ส่ง EMR แล้ว/);
  assert.match(html,/id="worklistPendingRows"/);
  assert.match(html,/ชื่อ-นามสกุล \/ EMR/);
  assert.match(flow,/data-worklist-confirm-record/);
  assert.match(flow,/todayWorklistRow/);
  assert.match(css,/\.worklist-new-layout/);
  assert.match(css,/\.worklist-today-table/);
});
