const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const pkg=require('./package.json');

const html=fs.readFileSync('app.html','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');

test('release metadata and cache busting are v7.63.70',()=>{
  assert.equal(pkg.version,'7.63.70');
  assert.equal(fs.readFileSync('VERSION.txt','utf8').trim(),'v7.63.70');
  assert.match(html,/style\.css\?v=7\.63\.70-project-bulk-emr-compact/);
  assert.match(html,/app\.js\?v=7\.63\.70-project-bulk-emr-compact/);
});

test('project page exposes multi-project selection and batch EMR controls',()=>{
  assert.match(html,/id="projectBulkSelectionSummary"/);
  assert.match(html,/id="projectBulkSelectBooking"/);
  assert.match(html,/id="projectBulkReceiveEmr"[^>]*disabled/);
  assert.match(html,/id="projectSelectAll"/);
  assert.match(html,/id="projectBulkSelectionMeta"/);
  assert.match(js,/selectedWorkflowProjectIds=new Set\(\)/);
  assert.match(js,/async function receiveSelectedProjectEmr\(\)/);
  assert.match(js,/\/api\/checkup-bookings\?projectId=/);
  assert.match(js,/workflowFetch\('\/api\/his\/emr'/);
});

test('compact project rows keep note inline with package and show EMR progress',()=>{
  assert.match(js,/workflow-project-card-compact/);
  assert.match(js,/workflow-project-package-inline/);
  assert.match(js,/workflow-project-note-inline/);
  assert.match(js,/companyProjectEmrHtml\(p\)/);
  assert.doesNotMatch(js,/workflow-project-card-compact[\s\S]{0,1600}workflow-project-note \$\{note/);
  assert.match(css,/v7\.63\.70 — Compact multi-project Booking selection \+ batch EMR/);
  assert.match(css,/workflow-project-card-compact\{[^}]*min-height:70px/);
  assert.match(css,/workflow-project-meta-compact\{[^}]*flex-wrap:nowrap/);
  assert.match(css,/workflow-project-note-inline\{[^}]*text-overflow:ellipsis/);
});
