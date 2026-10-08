const fs=require('fs'),assert=require('assert'),test=require('node:test');
const read=f=>fs.readFileSync(f,'utf8');
test('OCR menu opens immediately and validates session in parallel',()=>{
  const app=read('assets/app.js');
  assert.match(app,/showView\('ocrView',\{ocrSessionVerified:true\}\);\s*window\.HealthCheckOCR\?\.ensure\(\)/);
  assert.match(app,/if\(viewId==='ocrView'\)openOcrViewSecure\(\)/);
  assert.match(app,/if\(b\.dataset\.view==='ocrView'\)openOcrViewSecure\(\)/);
});
test('native OCR workspace contains real behavior, not only markup',()=>{
  const native=read('assets/ocr-native.js');
  assert.match(native,/const OCR_EMBEDDED=true/);
  assert.match(native,/\$\('#batchRunAll'\)\.onclick=runBatchAll/);
  assert.match(native,/\$\('#scanScannerBtn'\)\.onclick=startScanner/);
  assert.match(native,/loadOcrSetup\(\);syncSetupUi\(\);renderOcrQueue\(\);resetData\(\);renderZoneList\(\);renderBatch\(\)/);
  assert.doesNotMatch(native,/\(function\(document,location,window\)\{\s*\}\)\(ocrDoc/);
});
test('release versions are aligned',()=>{
  const server=read('server.js'),pkg=require('./package.json'),version=read('VERSION.txt').trim();
  assert.match(server,/v7\.63\.59-production/);
  assert.equal(pkg.version,'7.63.59');
  assert.equal(version,'v7.63.59');
});
