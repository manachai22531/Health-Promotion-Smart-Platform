const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
test('A4 uses effective saved package item type and station',()=>{
  assert.match(app,/function effectivePackageItemType\(item\)/);
  assert.match(app,/function effectivePackageItemStation\(item\)/);
  assert.match(app,/const station=effectivePackageItemStation\(item\)/);
  assert.match(app,/type=effectivePackageItemType\(item\)/);
});
test('A4 sort uses effective package station and type',()=>{
  assert.match(app,/const as=effectivePackageItemStation\(a\),bs=effectivePackageItemStation\(b\)/);
  assert.match(app,/at=effectivePackageItemType\(a\),bt=effectivePackageItemType\(b\)/);
});
test('customer list rows are denser',()=>{
  assert.match(css,/v7\.62\.98: denser customer list rows/);
  assert.match(css,/height:25px!important/);
});
