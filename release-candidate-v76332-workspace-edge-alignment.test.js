const fs=require('fs');
const assert=require('assert');
const css=fs.readFileSync('assets/style.css','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

assert(css.includes('body.fullpage-unscaled .page:has(#worklistView.active,#emrView.active)'));
assert(css.includes('max-width:1752px!important'),'Worklist and EMR outer edges must align with Search at the standard desktop viewport');
assert(css.includes('margin-left:auto!important'));
assert(css.includes('margin-right:auto!important'));
assert(/v=7\.63\.\d+-(?:workspace-edge-alignment|top5-first-screen)/.test(html));
assert(/const RELEASE_NAME = 'v7\.63\.\d+-production'/.test(server));
console.log('v7.63.32 Worklist/EMR edge alignment regression: PASS');
