const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=__dirname,html=fs.readFileSync(path.join(root,'app.html'),'utf8'),app=fs.readFileSync(path.join(root,'assets','app.js'),'utf8'),css=fs.readFileSync(path.join(root,'assets','style.css'),'utf8');
test('customer list uses 100 rows per page',()=>assert.match(app,/CUSTOMER_LIST_PAGE_SIZE=100/));
test('select all filtered checkbox exists',()=>assert.match(html,/id="selectAllFilteredCustomers"[^>]*\/?> เลือกทั้งหมดที่กรอง/));
test('select all filtered uses current filtered rows',()=>assert.match(app,/selectAllFilteredCustomers[\s\S]*customerListVisibleRows\(\)\.rows/));
test('compact three-column customer tools layout exists',()=>assert.match(css,/v7\.62\.97:[\s\S]*grid-template-columns:minmax\(300px/));
test('render passes all filtered rows to bulk-control state',()=>assert.match(app,/const filteredRows=rows;rows=pageRows;[\s\S]*updateCustomerBulkControls\(filteredRows\)/));
