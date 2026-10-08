const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');

const js=fs.readFileSync('assets/app.js','utf8');
const server=fs.readFileSync('server.js','utf8');
const html=fs.readFileSync('app.html','utf8');
const template=fs.readFileSync('templates/pdf-forms/checkup-check-list.pdf');

test('release identity is v7.63.17 production',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.17-production'/);
  assert.match(html,/app\.js\?v=7\.63\.17-patient-documents/);
});

test('FM-CHU-004 checklist is bundled as a built-in patient PDF form',()=>{
  assert.match(server,/'checkup-check-list':\{name:'ใบนำทางตรวจสุขภาพ \(FM-CHU-004 Check Up Check List\)'/);
  assert.match(server,/checkupChecklistFields=\[\['fullName'/);
  assert.equal(template.subarray(0,5).toString(),'%PDF-');
  assert.ok(template.length>50000);
});

test('checklist maps patient and booking context onto the provided form',()=>{
  for(const token of ["['fullName'","['hn'","['birthDate'","['age'","['genderText'","['departmentName'","['doctorName'","['packageCode'","['companyName'"]){
    assert.ok(server.includes(token),`missing ${token}`);
  }
  assert.match(server,/genderText:String\(record\.sex\|\|''\)/);
  assert.match(server,/packageMark:\(record\.code\|\|record\.packageName\)\?'X':''/);
  assert.match(server,/companyContractMark:\(record\.payor\|\|String\(/);
});

test('patient card exposes both checklist and other-document actions',()=>{
  assert.match(js,/data-print-checkup-guide=/);
  assert.match(js,/data-print-other-docs=/);
  assert.match(js,/>พิมพ์ใบนำทาง<\/button>/);
  assert.match(js,/>พิมพ์เอกสาร<\/button>/);
  assert.match(js,/printCheckupGuide\(recordKey\)/);
});

test('other documents use the same pdfFormSetupItems catalog as Project Booking',()=>{
  assert.match(js,/function singlePatientOtherDocumentForms\(\)\{return pdfFormSetupItems\.filter/);
  assert.match(js,/await ensureDocumentForms\(\)/);
  assert.match(js,/\/api\/patient-documents\/bundle/);
  assert.match(html,/id="singlePatientDocumentOptions"/);
  assert.match(html,/เลือกเอกสารจากรายการเดียวกับ Project Booking/);
});

test('new print buttons are intercepted before opening the patient detail card',()=>{
  assert.match(js,/data-print-checkup-guide[\s\S]*stopImmediatePropagation\(\)/);
  assert.match(js,/data-print-other-docs[\s\S]*stopImmediatePropagation\(\)/);
  assert.match(js,/\},true\);/);
});
