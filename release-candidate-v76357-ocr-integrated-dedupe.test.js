const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const html = fs.readFileSync(path.join(root,'app.html'),'utf8');
const ocr = fs.readFileSync(path.join(root,'ocr-review-mockup.html'),'utf8');
const server = fs.readFileSync(path.join(root,'server.js'),'utf8');
const css = fs.readFileSync(path.join(root,'assets','style.css'),'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

test('v7.63.57 integrates OCR in the main app shell',()=>{
  assert.equal(pkg.version,'7.63.57');
  assert.match(fs.readFileSync(path.join(root,'server.js'),'utf8'), /RELEASE_NAME\s*=\s*['"]v7\.63\.57-production['"]/);
  assert.match(html,/data-view="ocrView"/);
  assert.match(html,/id="ocrIntegratedFrame"[\s\S]*?src="\/ocr\?embedded=1"/);
  assert.doesNotMatch(html,/href="\/ocr-review-mockup\.html"/);
  assert.match(server,/app\.get\('\/ocr'/);
  assert.match(server,/res\.redirect\(302,'\/ocr'\)/);
  assert.match(css,/#ocrView \.ocr-integrated-frame/);
});

test('OCR toolbar removes duplicate commands and clarifies scopes',()=>{
  assert.match(ocr,/id="openSetupTab">⚙ ตั้งค่า OCR/);
  assert.doesNotMatch(ocr,/id="openZoneEditor"/);
  assert.doesNotMatch(ocr,/id="uploadBtn"/);
  assert.doesNotMatch(ocr,/id="exportExcelBtn"/);
  assert.match(ocr,/id="batchAddFiles"[^>]*>\+ เพิ่มเอกสาร/);
  assert.match(ocr,/id="batchRunSelected"[^>]*>▶ OCR ที่เลือก/);
  assert.match(ocr,/id="batchRunAll"[^>]*>▶ OCR ทั้งหมด/);
  assert.match(ocr,/id="runOcr"[^>]*>▶ OCR เอกสารนี้/);
  assert.match(ocr,/id="allVerified"[^>]*>✓ ยืนยันข้อมูล/);
  assert.match(ocr,/data-tab="setup">ตั้งค่า OCR \/ Export/);
  assert.match(ocr,/ติดตั้ง Scan Agent/);
});

test('OCR setup keeps mode/document in one visible control location',()=>{
  assert.match(ocr,/id="setupModeSelect" hidden/);
  assert.match(ocr,/id="setupDocumentTypeSelect" hidden/);
  assert.match(ocr,/id="setupModeSummary"/);
  assert.match(ocr,/id="setupDocumentSummary"/);
});

test('A4 summary footer is a single horizontal row',()=>{
  assert.match(css,/#summaryOverlay \.summary-modal>\.modal-footer\.summary-screen-only\{[\s\S]*?flex-wrap:nowrap!important/);
  assert.match(css,/#confirmCheckup\{margin-left:auto!important/);
});
