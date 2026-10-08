'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v7.63.85 adds multi-customer import beside multi-company import',()=>{
  const html=fs.readFileSync('app.html','utf8'),flow=fs.readFileSync('assets/flow-v76384.js','utf8'),app=fs.readFileSync('assets/app.js','utf8');
  assert.match(html,/openMultiCompanyImport[\s\S]{0,180}openMultiCustomerImport/);
  assert.match(html,/id="multiCustomerImportOverlay"/);
  assert.match(flow,/multiCustomerCompanyYear/);
  assert.match(flow,/reason:'MULTI_CUSTOMER_IMPORT'/);
  assert.match(flow,/\/api\/customer-import/);
  assert.match(app,/ALIASES\['บริษัท'\]\.push\('company\/year'\)/);
});
