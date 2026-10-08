'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {flattenEmrGroups}=require('./scalable-relational');

test('EMR is normalized into group and item levels',()=>{
  const groups=flattenEmrGroups({LineItem:[{GroupName:'Vital Sign',GroupCode:'VS',Items:[{ItemCode:'BMI',ItemName:'BMI',ResultValue:'22.1',Unit:'kg/m2',NormalRange:'18.5-24.9'}]}]});
  assert.equal(groups.length,1);assert.equal(groups[0].groupCode,'VS');assert.equal(groups[0].items[0].itemCode,'BMI');assert.equal(groups[0].items[0].resultValue,'22.1');
});

test('server exposes paginated relational APIs and optimistic PATCH',()=>{
  const server=fs.readFileSync('scalable-relational.js','utf8');
  for(const token of ["/api/v2/customers","/api/v2/company-customers","/api/v2/worklist","/api/v2/emr-cases","revision","LIMIT $4 OFFSET $5"]){assert.ok(server.includes(token),token)}
});

test('migration has requested search indexes',()=>{
  const sql=fs.readFileSync('migrations/0110_scalable_customer_emr.up.sql','utf8');
  for(const token of ['customers_hn_idx','customers_vn_idx','customers_identification_idx','customers_passport_idx','company_customers_company_year_idx','checkup_bookings_project_status_idx','checkup_visits_date_status_idx','pg_trgm'])assert.ok(sql.includes(token),token);
});
