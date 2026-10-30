const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('company lookup and customer search actions share one aligned row',()=>{
  const app=fs.readFileSync('assets/app.js','utf8'),css=fs.readFileSync('assets/style.css','utf8');
  assert.match(app,/search-secondary-row-v76405/);
  for(const selector of ['quickLabel','quickButton','customerSearchButtonV76401','clearButton','addCustomer'])assert.match(app,new RegExp(`row\\.append\\(${selector}\\)`));
  assert.match(css,/\.search-secondary-row-v76405\{display:grid/);
  assert.match(css,/height:46px!important/);
  assert.match(css,/align-items:end/);
});
