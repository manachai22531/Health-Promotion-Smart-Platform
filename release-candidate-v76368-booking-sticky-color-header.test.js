const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const pkg=require('./package.json');

function columnLine(key){return app.split('\n').find(line=>line.includes(`{key:'${key}'`))||''}

test('release metadata and cache-busting are v7.63.68',()=>{
  assert.equal(pkg.version,'7.63.68');
  assert.equal(fs.readFileSync('VERSION.txt','utf8').trim(),'v7.63.68');
  assert.match(html,/assets\/style\.css\?v=7\.63\.68-booking-sticky-color-fix/);
  assert.match(html,/assets\/app\.js\?v=7\.63\.68-booking-sticky-color-fix/);
});

test('action subheader text is blank while the shared action group remains',()=>{
  assert.match(app,/\{key:'actions',label:'จัดการ',headerLabel:'',group:'actions',width:330,sticky:'right',locked:true\}/);
  assert.match(app,/\{key:'actions',label:'จัดการ',className:'actions',sticky:'right'\}/);
  assert.match(app,/col\.headerLabel\?\?col\.label/);
});

test('Project Booking hard-pins EMR summary and action cells on the right',()=>{
  assert.match(css,/v7\.63\.68 — Project Booking sticky-right hardening/);
  assert.match(css,/data-col="actions"[\s\S]*?position:sticky!important;[\s\S]*?right:0!important/);
  assert.match(css,/data-col="emrSummary"[\s\S]*?position:sticky!important;[\s\S]*?right:330px!important/);
  assert.ok(columnLine('emrSummary').includes("sticky:'right'"));
  assert.ok(columnLine('actions').includes("sticky:'right'"));
});

test('Project Booking uses the same visual palette as the company customer list',()=>{
  for(const color of ['#eaf5ff','#f2f7ff','#eaf8ec','#fff6dc','#f3eefc','#fdebf4','#fff9d9','#edf9ef']){
    assert.ok(css.includes(color),`missing shared color ${color}`);
  }
  assert.match(css,/#bookingOverlay \.unified-column-group-actions\{background:#fdebf4!important\}/);
  assert.match(css,/#bookingOverlay \.booking-customer-table\.unified-customer-table tbody td\[data-col="hn"\]\{background:#fff9d9!important\}/);
  assert.match(css,/#bookingOverlay \.booking-customer-table\.unified-customer-table tbody td\[data-col="vn"\]\{background:#edf9ef!important/);
});
