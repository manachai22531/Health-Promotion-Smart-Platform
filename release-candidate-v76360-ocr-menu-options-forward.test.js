const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync('assets/app.js','utf8');
assert.match(app,/showView=function\(id,options=\{\}\)\{const result=showViewWithResponsiveScale\(id,options\);syncFullPageScale\(\);return result\};/,'responsive showView wrapper must forward options');
assert.match(app,/const showViewV76219=showView;showView=function\(id,options=\{\}\)\{showViewV76219\(id,options\);/,'organization book showView wrapper must forward options');
assert.match(app,/showView\('ocrView',\{ocrSessionVerified:true\}\);/,'OCR opener must pass verified option');
console.log('v7.63.60 OCR menu option forwarding: PASS');
