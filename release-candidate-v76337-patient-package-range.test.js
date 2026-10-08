'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const page=fs.readFileSync('datacenter/patient-package.html','utf8');
const dc=fs.readFileSync('datacenter.js','utf8');
const server=fs.readFileSync('server.js','utf8');

test('release identity retains the v7.63.37 Patient Package change',()=>assert.match(server,/RELEASE_NAME = 'v7\.63\.(?:37|38|39|40|41|42|43|44)-production'/));
test('Patient Package uses dd/mm/yyyy range and validates real calendar dates',()=>{
  assert.match(page,/id="dateFrom"[^>]+placeholder="dd\/mm\/yyyy"/);
  assert.match(page,/id="dateTo"[^>]+placeholder="dd\/mm\/yyyy"/);
  assert.match(page,/function parseDisplayDate\(value\)/);
  assert.match(page,/วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด/);
});
test('package field supports typing, suggestions and all-package mode',()=>{
  assert.match(page,/id="packageCode" type="text" list="packageOptions"/);
  assert.match(page,/id="allPackages" type="checkbox"/);
  assert.match(page,/allPackages:String\(all\)/);
  assert.match(page,/packageSearch/);
});
test('backend date range and package search are parameterized',()=>{
  assert.match(dc,/pvp\.\$\{col\}::date BETWEEN \$1::date AND \$2::date/);
  assert.match(dc,/BTRIM\(pkg\.code\) ILIKE \$3/);
  assert.match(dc,/COALESCE\(pkg\.name,''\) ILIKE \$3/);
  assert.match(dc,/if\(!allPackages&&!packageSearch\)/);
  assert.match(dc,/LIMIT \$\$\{limitIndex\} OFFSET \$\$\{offsetIndex\}/);
});
test('Excel filename records the selected date range and scope',()=>{
  assert.match(page,/Patient_Package_\$\{parseDisplayDate\(\$\('dateFrom'\)\.value\)\}_to_/);
  assert.match(page,/\?\s*'ALL'/);
});
