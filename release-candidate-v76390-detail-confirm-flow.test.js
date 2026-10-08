'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('checkup requires detail confirmation before A4 summary can open',()=>{
  const flow=fs.readFileSync('assets/flow-v76384.js','utf8');
  assert.match(flow,/\?'เปิดสรุปรายการตรวจ':'ยืนยันการตรวจ'/);
  assert.match(flow,/if\(record\.checkupConfirmedAt\|\|record\.visitedAt\)\{/);
  assert.match(flow,/alert\('ยืนยันการตรวจเรียบร้อยแล้ว/);
  assert.match(flow,/showA4Summary\(pendingCheckup\)/);
});
