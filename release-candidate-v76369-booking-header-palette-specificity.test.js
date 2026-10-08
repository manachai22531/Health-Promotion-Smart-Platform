const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pkg=require('./package.json');

const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');

test('release metadata and cache busting are v7.63.69',()=>{
  assert.equal(pkg.version,'7.63.69');
  assert.equal(fs.readFileSync('VERSION.txt','utf8').trim(),'v7.63.69');
  assert.match(html,/style\.css\?v=7\.63\.69-booking-header-palette-specificity-fix/);
  assert.match(html,/app\.js\?v=7\.63\.69-booking-header-palette-specificity-fix/);
});

test('booking grouped headers override the legacy first-nine cyan rule with scoped palette selectors',()=>{
  const legacy=css.indexOf('#bookingOverlay .booking-customer-table th:nth-child(-n+9)');
  const fix=css.indexOf('v7.63.69 — Project Booking grouped-header palette specificity fix');
  assert.ok(legacy>=0,'legacy selector should still be present for old non-unified contexts');
  assert.ok(fix>legacy,'v7.63.69 override must come after legacy selector');
  const expected={
    basic:'#eaf5ff', visit:'#f2f7ff', name:'#eaf8ec', personal:'#fff6dc',
    contact:'#eaf5ff', workflow:'#f3eefc', actions:'#fdebf4'
  };
  for(const [group,color] of Object.entries(expected)){
    const re=new RegExp(`#bookingOverlay \\.booking-customer-table\\.unified-customer-table thead tr\\.unified-column-groups > th\\.unified-column-group-${group}\\{background:${color.replace('#','\\#')}!important`);
    assert.match(css,re,`missing high-specificity palette for ${group}`);
  }
});

test('booking unified table neutralizes legacy center sticky offsets and restores intended sticky edges',()=>{
  assert.match(css,/#bookingOverlay \.booking-customer-table\.unified-customer-table thead tr\.unified-column-headings > th\[data-col\]:not\(\.unified-sticky-left\):not\(\.unified-sticky-right\)\{[\s\S]*left:auto!important;right:auto!important/);
  assert.match(css,/#bookingOverlay \.booking-customer-table\.unified-customer-table tbody td\[data-col\]:not\(\.unified-sticky-left\):not\(\.unified-sticky-right\)\{[\s\S]*position:static!important;left:auto!important;right:auto!important/);
  assert.match(css,/th\.unified-group-sticky-right\{[\s\S]*right:0!important;[\s\S]*background:#fdebf4!important/);
});
