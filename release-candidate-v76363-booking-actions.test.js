const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
test('booking action cell keeps table-cell and inner flex wrapper',()=>{
  assert.match(app,/booking-row-actions-inner/);
  assert.match(css,/td\.booking-row-actions\{display:table-cell!important/);
  assert.match(css,/\.booking-row-actions-inner\{display:flex!important/);
});
test('booking row has edit person action and handler',()=>{
  assert.match(app,/data-edit-booking-person/);
  assert.match(app,/แก้ข้อมูลบุคคล/);
  assert.match(app,/openCustomerForm\(editPerson\.dataset\.editBookingPerson\)/);
});
test('version and cache bust are 7.63.63',()=>{
  assert.match(html,/7\.63\.63-booking-row-actions/);
  assert.equal(fs.readFileSync('VERSION.txt','utf8').trim(),'v7.63.63');
});
