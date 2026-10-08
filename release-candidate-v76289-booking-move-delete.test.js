const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const app=fs.readFileSync('assets/app.js','utf8'),html=fs.readFileSync('app.html','utf8'),server=fs.readFileSync('server.js','utf8');
test('customer list shows move and remove Booking controls',()=>{assert.match(html,/id="moveSelectedBooking"/);assert.match(html,/id="removeSelectedBooking"/)});
test('move endpoint preserves booking row by updating project id',()=>{assert.match(server,/\/api\/checkup-bookings\/bulk-move/);assert.match(server,/UPDATE checkup_bookings SET project_id=\$2/);assert.doesNotMatch(server,/bulk-move[\s\S]{0,1800}DELETE FROM checkup_bookings/)});
test('move rejects cross company year',()=>assert.match(server,/ย้าย Booking ข้ามบริษัท\/ปีไม่ได้/));
test('frontend uses filtered project as move source',()=>assert.match(app,/customerProjectFilterId/));
test('remove Booking calls safe bulk delete endpoint',()=>assert.match(app,/\/api\/checkup-bookings\/bulk-delete/));
test('release is current v7.63.01 production',()=>assert.match(server,/RELEASE_NAME = 'v7\.63\.01-production'/));
