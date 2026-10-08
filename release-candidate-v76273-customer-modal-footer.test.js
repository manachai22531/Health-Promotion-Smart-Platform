const fs=require('fs');
const path=require('path');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'app.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets','style.css'),'utf8');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(html.includes('id="customerOverlay"'),'customer overlay missing');
ok(!html.includes('&gt;<label>Package Code'),'stray > before Package Code still present');
ok(css.includes('#customerOverlay .modal-header [data-close="customerOverlay"]'),'header close selector not scoped');
ok(!css.includes('#customerOverlay [data-close="customerOverlay"],'),'broad close selector still present');
ok(css.includes('#customerOverlay .customer-form-modal>.modal-footer [data-close="customerOverlay"]{position:static!important'),'footer cancel reset missing');
ok(css.includes('#customerOverlay .customer-form-modal{display:flex;flex-direction:column'),'customer modal flex containment missing');
console.log('v7.62.75 customer modal footer regression: PASS (6/6)');
