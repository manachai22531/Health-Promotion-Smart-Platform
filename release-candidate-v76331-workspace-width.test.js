const fs=require('fs');
const assert=require('assert');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

assert(css.includes('body.fullpage-unscaled .page:has(#worklistView.active,#emrView.active)'));
assert(/max-width:(?:1694|1752)px!important/.test(css),'Worklist and EMR must match the Search workspace visual width');
assert(css.includes('#worklistView.workspace-fullpage.active'));
assert(css.includes('#emrView.workspace-fullpage.active'));
assert(/v=7\.63\.\d+-(?:workspace-width|workspace-edge-alignment|top5-first-screen)/.test(html));
assert(/const RELEASE_NAME = 'v7\.63\.\d+-production'/.test(server));
console.log('v7.63.31 Worklist/EMR width regression: PASS');
