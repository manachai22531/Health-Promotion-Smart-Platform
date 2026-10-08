const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const server=fs.readFileSync('server.js','utf8');
const pkg=require('./package.json');

test('version is v7.63.64 everywhere important',()=>{
  assert.match(server,/v7\.63\.64-production/);
  assert.equal(pkg.version,'7.63.64');
  assert.match(html,/7\.63\.64-unified-columns/);
});

test('company and booking use the same unified table schema',()=>{
  assert.match(html,/data-unified-table="booking"/);
  assert.match(html,/data-unified-table="company"/);
  assert.match(js,/const UNIFIED_CUSTOMER_COLUMNS=/);
  for(const key of ['rowNo','displayOrder','checkupDate','checkupEndDate','hn','vn','title','firstName','lastName','titleEN','firstNameEN','lastNameEN','identificationType','idCard','password','gender','maritalStatus','birthDate','age','address','phoneNumber','email','packageCode','packageName','doctorName','doctorNumber','payor','payorAgreement','payorOffice','locationCode','employeeCode','departmentName','positionName','nationality','companyYear','booking','status','emr','book','send','log','emrSummary','actions']) assert.match(js,new RegExp(`key:'${key}'`));
});

test('both pages have shared column settings',()=>{
  assert.match(html,/id="bookingColumnSettingsButton"/);
  assert.match(html,/id="customerColumnSettingsButton"/);
  assert.match(js,/health-check-unified-customer-columns-v76364/);
  assert.match(js,/data-column-preset="ALL"/);
  assert.match(js,/data-column-preset="HIS"/);
  assert.match(js,/localStorage\.setItem\(UNIFIED_CUSTOMER_COLUMN_PREF_KEY/);
});

test('sticky layout keeps left identity and right workflow/actions',()=>{
  assert.match(js,/key:'hn'.*sticky:'left'/);
  assert.match(js,/key:'vn'.*sticky:'left'/);
  assert.match(js,/key:'status'.*sticky:'right'/);
  assert.match(js,/key:'emrSummary'.*sticky:'right'/);
  assert.match(js,/key:'actions'.*sticky:'right'/);
  assert.match(css,/--unified-sticky-left/);
  assert.match(css,/--unified-sticky-right/);
});

test('booking row no longer shifts VN into the wrong column',()=>{
  assert.match(js,/vn=r\.vn\|\|r\.hisLastVisitUID\|\|b\.vn/);
  assert.match(js,/vn:unifiedCell\('vn'/);
  assert.doesNotMatch(js,/moveBookingVnNextToHn\(\);updateWorkflowBookingSelection/);
});

test('company actions follow booking style and preserve edit person',()=>{
  assert.match(js,/data-company-view-emr/);
  assert.match(js,/data-company-edit-person/);
  assert.match(js,/ตรวจสอบ HN/);
  assert.match(js,/ตรวจ VN ก่อน/);
  assert.match(js,/แก้ข้อมูลบุคคล/);
});
