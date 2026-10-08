const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'assets/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'assets/style.css'),'utf8');

test('left sticky identity columns are grouped under ข้อมูลหลัก / HIS',()=>{
  assert.match(app,/\{key:'basic',label:'ข้อมูลหลัก \/ HIS',className:'basic',sticky:'left'\}/);
  for(const key of ['select','rowNo','hn','vn']) assert.match(app,new RegExp(`key:'${key}'[^\\n]+group:'basic'[^\\n]+sticky:'left'`));
});

test('DisplayOrder and checkup dates belong to ข้อมูลผู้เข้าตรวจ and scroll in center',()=>{
  assert.match(app,/\{key:'visit',label:'ข้อมูลผู้เข้าตรวจ',className:'visit'\}/);
  for(const key of ['displayOrder','checkupDate','checkupEndDate']) {
    const line=app.split('\n').find(x=>x.includes(`{key:'${key}'`));
    assert.ok(line && line.includes("group:'visit'") && !line.includes("sticky:'"),`${key} must be in visit group and non-sticky`);
  }
});

test('EMR summary and actions are both fixed under จัดการ group',()=>{
  assert.match(app,/\{key:'actions',label:'จัดการ',className:'actions',sticky:'right'\}/);
  for(const key of ['emrSummary','actions']) assert.match(app,new RegExp(`key:'${key}'[^\\n]+group:'actions'[^\\n]+sticky:'right'`));
});

test('group headers and second-level headers use independent sticky rows',()=>{
  assert.match(css,/v7\.63\.67 — grouped sticky headers/);
  assert.match(css,/unified-column-groups > th\{[\s\S]*?position:sticky!important;[\s\S]*?top:0!important/);
  assert.match(css,/unified-column-headings > th\[data-col\]\{[\s\S]*?top:25px!important/);
  assert.match(css,/unified-group-sticky-left[\s\S]*?left:var\(--unified-group-left,0px\)!important/);
  assert.match(css,/unified-group-sticky-right[\s\S]*?right:var\(--unified-group-right,0px\)!important/);
});

test('runtime writes direct sticky left/right offsets to header and body cells',()=>{
  assert.match(app,/setProperty\('left',`\$\{left\}px`,'important'\)/);
  assert.match(app,/setProperty\('right',`\$\{right\}px`,'important'\)/);
  assert.match(app,/setProperty\('position','sticky','important'\)/);
});
