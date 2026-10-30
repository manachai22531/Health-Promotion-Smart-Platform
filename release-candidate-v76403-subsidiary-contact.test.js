const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('subsidiary cards use the shared company coordinator without duplicate visible fields',()=>{
  const app=fs.readFileSync('assets/app.js','utf8');
  const row=app.slice(app.indexOf('function circularSubsidiaryRowV76397'),app.indexOf('function renderCircularSubsidiariesV76397'));
  assert.doesNotMatch(row,/<label>ผู้ประสานงาน/);
  assert.doesNotMatch(row,/<label>เบอร์โทร/);
  assert.match(row,/data-subsidiary-field="contact" type="hidden"/);
  assert.match(row,/data-subsidiary-field="phone" type="hidden"/);
});

test('subsidiary PDF details do not repeat coordinator and phone',()=>{
  const pdf=fs.readFileSync('corporate-circular-pdf.js','utf8');
  const block=pdf.slice(pdf.indexOf('if(d.additionalCompanies.length)'),pdf.indexOf('const accent='));
  assert.doesNotMatch(block,/co\.contact/);
  assert.doesNotMatch(block,/co\.phone/);
});
