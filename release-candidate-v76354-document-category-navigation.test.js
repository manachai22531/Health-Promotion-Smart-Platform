const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const app=fs.readFileSync(path.join(root,'assets','app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'app.html'),'utf8');

test('document forms expose categories and navigation default metadata',()=>{
  assert.match(server,/PDF_FORM_CATEGORIES=\{NAVIGATION:/);
  assert.match(server,/'checkup-check-list':\{[^\n]+category:'NAVIGATION'[^\n]+isDefault:true/);
  assert.match(server,/categoryLabel:PDF_FORM_CATEGORIES/);
  assert.match(server,/templateCode:/);
});

test('document designer separates categories and supports metadata editing',()=>{
  assert.match(html,/id="documentCategoryFilter"/);
  assert.match(html,/value="NAVIGATION">ใบนำทาง/);
  assert.match(html,/id="documentMetaCategory"/);
  assert.match(html,/id="documentMetaTemplateCode"/);
  assert.match(html,/id="documentMetaDefault"/);
  assert.match(app,/documentFormOptionHtml/);
  assert.match(app,/pdfFormCategoryOrder=\['NAVIGATION','MEDICAL_CERTIFICATE','CLAIM_FORM','GENERAL'\]/);
});

test('patient navigation print resolves navigation category default instead of hardcoded form id',()=>{
  assert.match(app,/navigation\.find\(item=>item\.isDefault\)\|\|navigation\[0\]/);
  assert.doesNotMatch(app,/openGeneratedPatientPdf\(\['checkup-check-list'\]/);
  assert.match(app,/singlePatientOtherDocumentForms\(\).*documentCategory\(item\)!=='NAVIGATION'/s);
});

test('update center preserves runtime data directory including custom document templates',()=>{
  const helper=fs.readFileSync(path.join(root,'tools','app-update-helper.js'),'utf8');
  assert.match(helper,/['"]data['"]/);
  assert.match(helper,/\/XD[^\n]+data/);
});
