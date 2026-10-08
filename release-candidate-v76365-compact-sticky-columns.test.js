const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const server=fs.readFileSync('server.js','utf8');
const html=fs.readFileSync('app.html','utf8');
const pkg=require('./package.json');

test('version is v7.63.65 in release entry points',()=>{
  assert.match(server,/v7\.63\.65-production/);
  assert.equal(pkg.version,'7.63.65');
  assert.match(html,/7\.63\.65-sticky-columns/);
});

test('left sticky block is only select rowNo HN VN',()=>{
  for(const key of ['select','rowNo','hn','vn']) assert.match(js,new RegExp(`key:'${key}'[^\\n]*sticky:'left'`));
  for(const key of ['displayOrder','checkupDate','checkupEndDate']) assert.doesNotMatch(js,new RegExp(`key:'${key}'[^\\n]*sticky:'left'`));
});

test('right sticky block is only EMR summary and actions',()=>{
  for(const key of ['emrSummary','actions']) assert.match(js,new RegExp(`key:'${key}'[^\\n]*sticky:'right'`));
  for(const key of ['status','emr','book','send','log']) assert.doesNotMatch(js,new RegExp(`key:'${key}'[^\\n]*sticky:'right'`));
});

test('sticky offsets use schema widths instead of live DOM measurement',()=>{
  const start=js.indexOf('function refreshUnifiedStickyOffsets');
  const end=js.indexOf('function applyUnifiedColumnsEverywhere',start);
  const fn=js.slice(start,end);
  assert.match(fn,/left\+=Number\(col\.width\)/);
  assert.match(fn,/right\+=Number\(col\.width\)/);
  assert.doesNotMatch(fn,/getBoundingClientRect/);
});

test('both pages still use unified table schema and visual edge dividers',()=>{
  assert.match(html,/data-unified-table="booking"/);
  assert.match(html,/data-unified-table="company"/);
  assert.match(css,/unified-col-vn\.unified-sticky-left/);
  assert.match(css,/unified-col-emrSummary\.unified-sticky-right/);
});
