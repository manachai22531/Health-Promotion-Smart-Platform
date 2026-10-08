const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('assets/app.js','utf8');
const html=fs.readFileSync('app.html','utf8');

test('customer import maps VN and preserves it as current visit UID',()=>{
  assert.match(app,/'vn':\['vn','visituid','visit uid'\]/);
  assert.match(app,/vn:g\('vn'\),hisLastVisitUID:g\('vn'\)/);
});

test('customer preview, export and individual form include VN',()=>{
  assert.match(app,/'HN','VN','Title'/);
  assert.match(app,/<th>HN<\/th><th>VN<\/th>/);
  assert.match(html,/id="customerVN"/);
  assert.match(html,/DisplayOrder, CheckupDate, CheckupEndDate, HN, VN, Title/);
});

test('individual form exposes current upload fields and does not store password',()=>{
  for(const id of ['customerDisplayOrder','customerCheckupDate','customerCheckupEndDate','customerIdentificationType','customerMaritalStatus','customerAddress','customerAge','customerEmail','customerPhone','customerDoctorName','customerDoctorNumber','customerPayor','customerPayorAgreement','customerPayorOffice','customerLocationCode','customerEmployeeCode','customerDepartmentName','customerPositionName','customerNationality','customerAppointmentDate','customerAppointmentSlotId','customerSlots','customerScheduleAppointment','customerStartLab']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/value="ไม่จัดเก็บรหัสผ่าน" disabled/);
  assert.doesNotMatch(app,/customerPassword/);
});

test('booking modal includes readiness and VN status filters',()=>{
  assert.match(html,/id="bookingRecordFilter"/);
  assert.match(html,/id="bookingVnStatusFilter"/);
  assert.match(app,/function applyWorkflowBookingFilters\(\)/);
});
