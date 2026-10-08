const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
test('v7.62.99 compact three-zone customer toolbar exists',()=>{
  assert.match(css,/v7\.62\.99: reorganized customer-list control deck/);
  assert.match(css,/grid-template-columns:minmax\(350px,.95fr\) minmax\(620px,1.72fr\) minmax\(230px,.62fr\)/);
  assert.match(css,/grid-template-columns:1fr 1fr!important/);
});
test('selection and booking controls remain present',()=>{
  for(const id of ['selectAllCustomers','selectAllFilteredCustomers','addSelectedToBooking','moveSelectedBooking','removeSelectedBooking','customerBookingProject','customerBookingSummary']) assert.match(html,new RegExp(`id=\"${id}\"`));
});
test('100 rows and filtered-select behavior remain',()=>{
  assert.match(js,/CUSTOMER_LIST_PAGE_SIZE=100/);
  assert.match(js,/selectAllFilteredCustomers/);
});
test('A4 saved type and station sync remains',()=>{
  assert.match(js,/_package_item_type/);
  assert.match(js,/_station_assignment/);
});
