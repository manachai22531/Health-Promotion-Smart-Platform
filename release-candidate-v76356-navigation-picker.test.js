const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const html = fs.readFileSync(path.join(root,'app.html'),'utf8');
const js = fs.readFileSync(path.join(root,'assets','app.js'),'utf8');
const css = fs.readFileSync(path.join(root,'assets','style.css'),'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

test('v7.63.56 version and cache busting',()=>{
  assert.equal(pkg.version,'7.63.56');
  assert.match(html,/style\.css\?v=7\.63\.56-navigation-picker/);
  assert.match(html,/app\.js\?v=7\.63\.56-navigation-picker/);
});

test('A4 summary has navigation and other document print buttons',()=>{
  assert.match(html,/id="printSummaryNavigation"[^>]*>[\s\S]*?พิมพ์ใบนำทาง/);
  assert.match(html,/id="printSummaryOtherDocuments"[^>]*>[\s\S]*?พิมพ์เอกสาร/);
});

test('navigation picker is available for multiple templates',()=>{
  assert.match(html,/id="navigationTemplateOverlay"/);
  assert.match(js,/function navigationDocumentForms\(\)/);
  assert.match(js,/navigation\.length>1/);
  assert.match(js,/openNavigationTemplatePicker\(recordKey\)/);
  assert.match(js,/name="navigationTemplateChoice"/);
});

test('default template is preselected but not forced',()=>{
  assert.match(js,/items\.find\(item=>item\.isDefault\)\?\.id/);
  assert.match(css,/\.navigation-template-option:has\(input:checked\)/);
});
