
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

test('release identity is v7.63.18 production',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.18-production'/);
  assert.match(html,/app\.js\?v=7\.63\.18-document-print-preview/);
  assert.match(html,/style\.css\?v=7\.63\.18-document-print-preview/);
});

test('patient print buttons are not red and match secondary actions',()=>{
  assert.doesNotMatch(css,/patient-route-print,.post-checkup-tools \.patient-other-doc-print\{border-color:#ef5b5b/);
  assert.match(css,/patient-route-print,[\s\S]*border-color:#bdd8e7!important/);
});

test('printing has in-app PDF preview with print and download actions',()=>{
  assert.match(html,/id="patientPdfPreviewOverlay"/);
  assert.match(html,/id="patientPdfPreviewFrame"/);
  assert.match(html,/id="printPatientPdfPreview"/);
  assert.match(html,/id="downloadPatientPdfPreview"/);
  assert.match(js,/function showPatientPdfPreview\(blob/);
  assert.doesNotMatch(js,/const preview=window\.open\('about:blank'/);
});

test('document chooser has selection UX controls',()=>{
  assert.match(html,/id="singlePatientDocumentSelectedCount"/);
  assert.match(html,/id="selectAllSinglePatientDocuments"/);
  assert.match(html,/id="clearSinglePatientDocuments"/);
  assert.match(js,/function updateSinglePatientDocumentSelectedCount\(\)/);
});

test('FM-CHU-004 action still points to built-in checklist',()=>{
  assert.match(js,/openGeneratedPatientPdf\(\['checkup-check-list'\],recordKey,'checkup-check-list\.pdf','ใบนำทางตรวจสุขภาพ FM-CHU-004'\)/);
  assert.match(server,/'checkup-check-list':\{name:'ใบนำทางตรวจสุขภาพ \(FM-CHU-004 Check Up Check List\)'/);
});

test('PDF generator has Windows Thai font fallback',()=>{
  assert.match(server,/async function patientDocumentFont\(pdf\)/);
  assert.match(server,/tahoma\.ttf/);
  assert.match(server,/LeelawUI\.ttf/);
  assert.match(server,/THSarabunNew\.ttf/);
});
