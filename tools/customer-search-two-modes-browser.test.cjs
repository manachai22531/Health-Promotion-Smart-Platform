'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium } = require('playwright-core');

test('customer search keeps the existing cards and adds a single-select table action bar', async t => {
  const app = express();
  app.use(express.static(path.resolve(__dirname, '..')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1660, height: 900 } });
  await page.route('**/api/**', route => route.fulfill({ json: { authenticated: false, items: [] } }));
  await page.route('**/customer-api/**', route => route.fulfill({ json: {} }));
  await page.goto(`http://127.0.0.1:${server.address().port}/app.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.getElementById('loginScreen')?.remove();
    currentUser = { roleId: 'admin', username: 'admin', displayName: 'ผู้ดูแลระบบ' };
    state.roles = [{ id: 'admin', name: 'Administrator', permissions: PERMISSIONS.map(item => item[0]) }];
    const companyRow = { id: 'co-1', name: 'TEST.SYSTEM', year: '2569' };
    const records = [
      { key: 'r1', companyId: 'co-1', title: 'นางสาว', first: 'ทดสอบ', last: 'หนึ่ง', prefixEN: 'MISS', firstNameEN: 'TEST', lastNameEN: 'ONE', id: '1234567890123', hn: '0126037210', hisLastVisitUID: 'VN-1', visitedAt: '2026-11-02T04:00:00Z', primaryPackages: [{ code: 'PKG-1', name: 'Package 1' }], acceptedBillingItems: [{}], acceptedCashItems: [], selectedPackages: [{}], appointmentDate: '2026-11-05' },
      { key: 'r2', companyId: 'co-1', title: 'นาย', first: 'ทดสอบ', last: 'สอง', prefixEN: 'MR', firstNameEN: 'TEST', lastNameEN: 'TWO', id: '9876543210123', hn: '0126037211', hisLastVisitUID: '', visitedAt: null, code: 'PKG-2', packageName: 'Package 2', acceptedBillingItems: [], acceptedCashItems: [{}], selectedPackages: [], scheduleAppointment: 'ยังไม่ได้นัด' }
    ];
    state.companies = [companyRow];
    state.records = records;
    document.getElementById('resultRows').innerHTML = records.map(record => `<article class="person-card" data-key="${record.key}">${record.first}</article>`).join('');
    customerSearchMatches = records;
    renderCustomerSearchTable(records);
    applyCustomerSearchView();
  });

  assert.equal(await page.locator('#resultMeta').isVisible(), false);
  await page.locator('[data-customer-search-mode="table"]').click();
  assert.equal(await page.locator('#resultRows').isVisible(), false);
  assert.equal(await page.locator('#customerSearchTablePane').isVisible(), true);
  assert.equal(await page.locator('#customerSearchTableRows tr').count(), 2);
  assert.equal(await page.locator('#customerSearchTableRows input[type="radio"]').count(), 2);
  assert.equal(await page.locator('#customerSearchTableRows input[type="checkbox"]').count(), 0);
  assert.equal(await page.locator('#customerSearchTableRows button').count(), 0);
  const actions = page.locator('[data-customer-search-action]');
  assert.equal(await actions.count(), 7);
  assert.equal(await actions.evaluateAll(buttons => buttons.every(button => button.disabled)), true);

  const radios = page.locator('#customerSearchTableRows input[type="radio"]');
  await radios.nth(0).check();
  const disabledAfterSelection = await actions.evaluateAll(buttons => buttons.filter(button => button.disabled).map(button => ({ action: button.dataset.customerSearchAction, title: button.title })));
  assert.deepEqual(disabledAfterSelection, []);
  await radios.nth(1).check();
  assert.equal(await radios.evaluateAll(inputs => inputs.filter(input => input.checked).length), 1);
  assert.equal(await page.locator('#customerSearchTableRows tr.selected').count(), 1);
  await page.locator('[data-customer-search-action="detail"]').click();
  assert.equal(await page.locator('#detailOverlay').evaluate(el => el.classList.contains('open')), true);

  await page.evaluate(() => setCustomerSearchView('card'));
  assert.equal(await page.locator('#resultRows').isVisible(), true);
  assert.equal(await page.locator('#customerSearchTablePane').isVisible(), false);
});
