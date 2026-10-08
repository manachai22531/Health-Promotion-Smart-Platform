const fs=require('fs');
function assert(x,m){if(!x){throw new Error(m)}}
const html=fs.readFileSync('app.html','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
assert(html.includes('class="customer-selection-head"'),'selection head wrapper missing');
assert(html.indexOf('id="deleteSelectedCustomers"') < html.indexOf('id="customerBulkToolbar"'),'delete button must be in summary row before bulk toolbar');
assert(css.includes('v7.63.01: separate summary/actions from selection controls'),'v7.63.01 CSS patch missing');
assert(css.includes('grid-template-rows:22px 20px 29px 28px'),'selection row sizing missing');
assert(html.includes('7.63.01-selection-head-layout'),'cache buster missing');
console.log('v7.63.01 customer overlap static regression: PASS');
