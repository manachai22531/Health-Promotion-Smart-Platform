const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const app=fs.readFileSync('assets/app.js','utf8'),html=fs.readFileSync('app.html','utf8'),css=fs.readFileSync('assets/style.css','utf8');
test('old project filter button is removed',()=>assert.doesNotMatch(html,/id="filterCustomerBookingProject"/));
test('booking action buttons are placed before target selector',()=>{const block=html.match(/<section class="customer-tools-booking">[\s\S]*?<\/section>/)?.[0]||'';assert.ok(block.indexOf('id="addSelectedToBooking"')<block.indexOf('id="customerBookingProject"'))});
test('direct booking filter chips include all and no-booking groups',()=>{assert.match(app,/customer-booking-filter-chip/);assert.match(app,/ยังไม่มี Booking/);assert.match(app,/CUSTOMER_BOOKING_FILTER_NONE/)});
test('no-booking filter selects records without memberships',()=>assert.match(app,/customerProjectFilterId===CUSTOMER_BOOKING_FILTER_NONE\)\{if\(memberships\.length\)return false/));
test('booking filter chip CSS is compact and horizontally scrollable',()=>{assert.match(css,/customer-booking-summary\{display:flex!important;flex-wrap:nowrap!important/);assert.match(css,/customer-booking-action-top/)});
