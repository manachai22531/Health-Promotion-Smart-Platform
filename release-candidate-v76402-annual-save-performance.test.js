const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('annual section save rehydrates a normalized company missing from app_state',()=>{
  const server=fs.readFileSync('server.js','utf8');
  assert.match(server,/if\(index<0\).*FROM company_years cy JOIN companies c/s);
  assert.match(server,/companies\.push\(\{\.\.\.relational\.source_data/);
});

test('annual typing defers summary work and payor network lookup',()=>{
  const app=fs.readFileSync('assets/app.js','utf8');
  assert.match(app,/scheduleCircularSummaryV76402\(\).*setTimeout/s);
  assert.match(app,/annualPayorSearchTimerV76402.*setTimeout/s);
  assert.doesNotMatch(app,/addEventListener\('input',renderCircularSummaryV76393\)/);
});
