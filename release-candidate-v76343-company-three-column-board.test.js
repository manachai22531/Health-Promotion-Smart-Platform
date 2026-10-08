'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8');
const app=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const server=fs.readFileSync('server.js','utf8');

test('release is v7.63.44 production-only',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.44-production'/);
  assert.match(server,/const RUNTIME_ENVIRONMENT = 'production'/);
});

test('company page exposes 3-column board and operational filters',()=>{
  assert.match(html,/company-board-head/);
  assert.match(html,/>บริษัท<\/strong>/);
  assert.match(html,/>ปี<\/strong>/);
  assert.match(html,/>Booking<\/strong>/);
  assert.match(html,/id="companyStatusFilter"/);
  assert.match(html,/id="companyYearFilter"/);
  assert.match(html,/id="companySort"/);
  assert.match(css,/grid-template-columns:340px 290px minmax\(560px,1fr\)/);
});

test('company-year status is calculated from project and EMR progress',()=>{
  const start=app.indexOf('function companyYearStatus(c)');
  const end=app.indexOf('function companyGroupStatus',start);
  assert.ok(start>0&&end>start);
  const flow=app.slice(start,end);
  assert.match(flow,/CANCELLED/);
  assert.match(flow,/CLOSED/);
  assert.match(flow,/emr_received_count/);
  assert.match(flow,/booking_count/);
  assert.match(flow,/IN_PROGRESS/);
  assert.match(flow,/COMPLETE/);
  assert.match(flow,/NOT_STARTED/);
});

test('company row keeps code, year and booking actions in their own columns',()=>{
  assert.match(app,/function companyGroupCellHtml/);
  assert.match(app,/data-change-company-code=/);
  assert.match(app,/function companyBoardYearCellHtml/);
  assert.match(app,/data-edit=/);
  assert.match(app,/data-delete=/);
  assert.match(app,/function companyBoardBookingCellHtml/);
  assert.match(app,/data-import=/);
  assert.match(app,/data-add-booking-company=/);
  assert.match(app,/companyPdfButton\(c\.id\)/);
  assert.match(app,/companyImportFileButton\(c\.id\)/);
});
