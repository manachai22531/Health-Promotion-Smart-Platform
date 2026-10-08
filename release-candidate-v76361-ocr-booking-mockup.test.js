const fs=require('fs'),assert=require('assert');
const html=fs.readFileSync('app.html','utf8'),app=fs.readFileSync('assets/app.js','utf8'),css=fs.readFileSync('assets/style.css','utf8'),ocr=fs.readFileSync('assets/ocr-native.js','utf8');
assert.match(html,/id="refreshBookingDataButton"/);assert.match(html,/id="moveSelectedWorkflowBooking"/);assert.match(html,/สถานะ EMR/);assert.match(html,/id="bookingMoveOverlay"/);
assert.match(app,/worklistEmrGroupSummary\(r\)\.total/);assert.match(app,/refreshWorkflowBookingData/);assert.match(app,/confirmMoveSelectedWorkflowBooking/);assert.match(app,/bulk-move/);
assert.match(css,/booking-selection-panel-v76361/);assert.match(css,/booking-emr-summary/);assert.match(ocr,/batch-overview-row/);assert.match(ocr,/batch-list-search/);assert.match(ocr,/PRODUCTION OCR · HUMAN REVIEW/);
console.log('v7.63.61 OCR + Booking mockup regression: PASS');
