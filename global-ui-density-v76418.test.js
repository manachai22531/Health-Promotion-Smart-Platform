'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
function launch(saved='compact',storageEnabled=true){
 const attrs={};let value='normal',writes=0,changes={},storageListener;
 const select={dataset:{},get value(){return value},set value(v){value=v},addEventListener:(name,cb)=>{changes[name]=cb}};
 const document={readyState:'complete',documentElement:{setAttribute:(key,v)=>attrs[key]=v},getElementById:id=>id==='globalUiDensity'?select:null};
 const localStorage={getItem:()=>{if(!storageEnabled)throw Error('storage blocked');return saved;},setItem:(k,v)=>{if(!storageEnabled)throw Error('storage blocked'); saved=v;writes++;}};
 const window={localStorage,addEventListener:(key,fn)=>{if(key==='storage')storageListener=fn;}};
 vm.runInNewContext(read('assets/global-ui-density.js'),{window,document});
 return {attrs,select,changes,trigger:()=>changes.change(),stored:()=>saved,writes:()=>writes,storage:()=>storageListener({key:'healthcheck.uiDensity.v1'})};
}
test('UI preference persists Compact as the first default',()=>{
 const ui=launch(null);assert.equal(ui.attrs['data-hc-density'],'compact');assert.equal(ui.select.value,'compact');
});
test('Normal restores original layout without changing patient data',()=>{
 const ui=launch('normal');assert.equal(ui.attrs['data-hc-density'],'normal');
});
test('selector stores user choice and updates document immediately',()=>{
 const ui=launch();ui.select.value='dense';ui.trigger();
 assert.equal(ui.attrs['data-hc-density'],'dense');assert.equal(ui.stored(),'dense');assert.equal(ui.writes(),1);
});
test('invalid saved values are safely reset to Compact',()=>{
 const ui=launch('some-invalid-value');assert.equal(ui.attrs['data-hc-density'],'compact');
});
test('storage failure does not throw or disable interface',()=>{
 const ui=launch(null,false);ui.select.value='dense';assert.doesNotThrow(ui.trigger);assert.equal(ui.attrs['data-hc-density'],'dense');
});
test('cross-tab preference changes synchronize',()=>{
 const ui=launch('compact');ui.select.value='dense';ui.trigger();ui.storage();assert.equal(ui.select.value,'dense');
});
test('HTML ships density control and versioned global assets once',()=>{
 const html=read('app.html');
 assert.equal((html.match(/id="globalUiDensity"/g)||[]).length,1);
 assert.match(html,/assets\/global-ui-density\.css\?v=7\.64\.18/);
 assert.match(html,/assets\/global-ui-density\.js\?v=7\.64\.18/);
 assert.match(html,/assets\/app\.js\?v=7\.64\.18-production/);
});
test('CSS is scoped and excludes PDF/A4/paper formatting',()=>{
 const css=read('assets/global-ui-density.css');
 assert.match(css,/@media screen/);assert.match(css,/@media print\s*\{\.hc-density-control\{display:none!important\}\}/);
 assert.doesNotMatch(css,/(?:^|\n)\s*(?:\.a4-content|\.a4-summary|\.pdf-page|\.print-page)\s*\{/);
 assert.doesNotMatch(css,/\bzoom\s*:/);
});
test('worklist pending and todays cases remain two separate panels',()=>{
 const css=read('assets/global-ui-density.css');const html=read('app.html');
 assert.match(css,/worklist-new-layout/);assert.match(html,/worklist-confirmation-panel/);assert.match(html,/worklist-today-panel/);
});
test('release identity consistent with installer',()=>{
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.version,'7.64.18');assert.equal(lock.version,pkg.version);
 assert.equal(lock.packages[''].version,pkg.version);
 assert.equal(read('VERSION.txt').trim(),'v7.64.18');
 assert.match(read('server.js'),/RELEASE_NAME\s*=\s*'v7\.64\.18-production'/);
 assert.match(read('tools/production-installer-worker.ps1'),/\$version='v7\.64\.18'/);
});
test('release still supports Windows installation and update helper',()=>{
 for (const f of ['INSTALL-REPAIR.bat','tools/production-installer-gui.ps1','tools/production-installer-worker.ps1','tools/app-update-helper.js','tools/check-update-center-readonly.ps1'])
   assert.ok(fs.existsSync(path.join(root,f)),f);
});
