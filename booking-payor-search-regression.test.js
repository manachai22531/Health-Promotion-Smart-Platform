const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('Booking Payor search consumes /api/his-payors code/name response', () => {
 const js=fs.readFileSync('assets/app.js','utf8');
 assert.match(js,/x\.code\|\|x\.payor_code/);
 assert.match(js,/x\.name\|\|x\.payor_name/);
});
