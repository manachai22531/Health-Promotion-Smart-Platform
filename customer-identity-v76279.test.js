'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeIdentity, mergeCustomerImport } = require('./customer-identity');

test('canonical identity removes formatting and normalizes case', () => {
  assert.equal(normalizeIdentity(' 123-4567-89012-3 '), '1234567890123');
  assert.equal(normalizeIdentity(' AB-12 34 '), 'ab1234');
});

test('same-file duplicate strong identities collapse to one customer record', () => {
  const result = mergeCustomerImport([], [
    { id: '123-4567-89012-3', first: 'A' },
    { id: '1234567890123', first: 'A2' }
  ], 'CY1');
  assert.equal(result.companyRecords.length, 1);
  assert.equal(result.added, 1);
  assert.equal(result.duplicateIncoming, 1);
  assert.equal(result.companyRecords[0].first, 'A2');
});

test('formatted strong identity matches an existing record', () => {
  const existing = [{ key: 'old1', id: '123-4567-89012-3', first: 'Old' }];
  const result = mergeCustomerImport(existing, [{ id: '1234567890123', first: 'New' }], 'CY1');
  assert.equal(result.companyRecords.length, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.companyRecords[0].key, 'old1');
  assert.equal(result.companyRecords[0].first, 'New');
});

test('different strong IDs never merge through the same employee code', () => {
  const existing = [{ key: 'old1', id: '1111111111111', employeeCode: 'E01', first: 'A' }];
  const result = mergeCustomerImport(existing, [{ id: '2222222222222', employeeCode: 'E01', first: 'B' }], 'CY1');
  assert.equal(result.companyRecords.length, 2);
  assert.equal(result.updated, 0);
  assert.equal(result.added, 1);
  assert.equal(result.conflicts.some(x => x.type === 'STRONG_ID_MISMATCH'), true);
});

test('HN can fill a legacy record that has no strong identity', () => {
  const existing = [{ key: 'old1', hn: 'HN-001', first: 'Old' }];
  const result = mergeCustomerImport(existing, [{ id: '3333333333333', hn: 'HN001', first: 'New' }], 'CY1');
  assert.equal(result.companyRecords.length, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.companyRecords[0].id, '3333333333333');
});

test('name plus DOB is review-only and does not auto-merge', () => {
  const existing = [{ key: 'old1', first: 'Somchai', last: 'Jaidee', birth: '1980-01-01' }];
  const result = mergeCustomerImport(existing, [{ first: 'Somchai', last: 'Jaidee', birth: '1980-01-01' }], 'CY1');
  assert.equal(result.companyRecords.length, 2);
  assert.equal(result.conflicts.some(x => x.type === 'NAME_DOB_REVIEW_REQUIRED'), true);
});
