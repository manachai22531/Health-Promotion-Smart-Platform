const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'assets/style.css'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'assets/app.js'),'utf8');

test('only intended unified columns are marked sticky in schema',()=>{
  for(const key of ['select','rowNo','hn','vn']) assert.match(app,new RegExp(`key:'${key}'[^\\n]+sticky:'left'`));
  for(const key of ['emrSummary','actions']) assert.match(app,new RegExp(`key:'${key}'[^\\n]+sticky:'right'`));
  for(const key of ['displayOrder','checkupDate','checkupEndDate','status','emr','book','send']) {
    const line=app.split('\n').find(x=>x.includes(`{key:'${key}'`));
    assert.ok(line && !line.includes("sticky:'"),`${key} must scroll in center`);
  }
});

test('v7.63.66 hard-resets legacy nth-child sticky rules',()=>{
  assert.match(css,/v7\.63\.66 — hard reset legacy nth-child sticky rules/);
  assert.match(css,/tbody td\[data-col\]:not\(\.unified-sticky-left\):not\(\.unified-sticky-right\)[\s\S]*?position:static!important/);
  assert.match(css,/unified-column-headings > th\[data-col\]:not\(\.unified-sticky-left\):not\(\.unified-sticky-right\)[\s\S]*?left:auto!important[\s\S]*?right:auto!important/);
  assert.match(css,/unified-column-groups > th[\s\S]*?left:auto!important[\s\S]*?right:auto!important/);
  assert.match(css,/\.unified-sticky-left[\s\S]*?right:auto!important/);
  assert.match(css,/\.unified-sticky-right[\s\S]*?left:auto!important/);
});
