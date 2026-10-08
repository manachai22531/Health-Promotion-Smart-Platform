const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

assert.strictEqual((html.match(/data-close="customerListOverlay"/g)||[]).length,1,'keep only the customer-list header back button');
assert(html.includes('← กลับหน้าบริษัท'),'keep the customer-list header back button');
assert(!html.includes('class="modal-footer customer-list-page-footer"'),'remove the duplicate customer-list footer');
assert.strictEqual((html.match(/data-close="bookingOverlay"/g)||[]).length,1,'keep only the booking top-right close button');
assert(html.includes('<button class="modal-close" data-close="bookingOverlay" type="button">×</button>'),'keep the booking top-right close button');
assert(!html.includes('<footer><button class="button secondary" data-close="bookingOverlay"'),'remove the duplicate booking footer close button');
assert(/v=7\.63\.\d+-(?:remove-duplicate-fullpage-buttons|login-100-layout|workspace-width|workspace-edge-alignment|top5-first-screen)/.test(html));
assert(/const RELEASE_NAME = 'v7\.63\.\d+-production'/.test(server));
console.log('v7.63.29 duplicate full-page button removal regression: PASS');
