'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('node:path');
const { chromium } = require('playwright-core');

test('customer search controls stay on one row and table rows open customer content without an action bar', async t => {
  const app = express();
  app.use(express.static(path.resolve(__dirname, '..')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1920, height: 900 } });
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
    updateCustomerSearchMeta(records.length,records.length);
  });

  assert.equal(await page.locator('#resultMeta').isVisible(), true);
  const searchGridRows = await page.locator('#searchView .hc-one-line-search-row').evaluate(element => getComputedStyle(element).gridTemplateRows.trim().split(/\s+/).length);
  assert.equal(searchGridRows, 1, 'desktop search controls and display switch must stay on one row');
  await page.locator('[data-customer-search-mode="table"]').click();
  assert.equal(await page.locator('#resultRows').isVisible(), false);
  assert.equal(await page.locator('#customerSearchTablePane').isVisible(), true);
  assert.equal(await page.locator('#customerSearchTableRows tr').count(), 2);
  assert.equal(await page.locator('#customerSearchTableRows input[type="radio"]').count(), 2);
  assert.equal(await page.locator('#customerSearchTableRows input[type="checkbox"]').count(), 0);
  assert.equal(await page.locator('#customerSearchTableRows button').count(), 0);
  assert.equal(await page.locator('[data-customer-search-action]').count(), 0, 'table action bar must be removed');

  const radios = page.locator('#customerSearchTableRows input[type="radio"]');
  await radios.nth(0).check();
  assert.equal(await radios.evaluateAll(inputs => inputs.filter(input => input.checked).length), 1);
  assert.equal(await page.locator('#customerSearchTableRows tr.selected').count(), 1);
  assert.equal(await page.locator('#detailOverlay').evaluate(el => el.classList.contains('open')), true);
  assert.match(await page.locator('#detailBody').innerText(), /ข้อมูลลูกค้าในโปรแกรม/);

  await page.waitForFunction(()=>document.querySelector('.cf-preview-pane').getAttribute('aria-busy')==='false');
  page.on('dialog',dialog=>dialog.accept());
  await page.evaluate(() => close('detailOverlay'));
  await page.locator('#customerSearchViewToggle').click();
  assert.equal(await page.locator('#resultRows').isVisible(), true);
  assert.equal(await page.locator('#customerSearchTablePane').isVisible(), false);
});
