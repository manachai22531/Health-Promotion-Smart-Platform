'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const root=__dirname;const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),server=fs.readFileSync(path.join(root,'server.js'),'utf8'),html=fs.readFileSync(path.join(root,'app.html'),'utf8');
const start=app.indexOf('async function circularPdfV76393(preview=false)');
const end=app.indexOf('let circularSummaryTimerV76402=0;',start);
assert(start>0&&end>start,'preview function not found');
const fn=app.slice(start,end);

function contextFactory({header='word-table-v1',id='companyA',responsePromise,fail=false}={}){
 const elements={
  '#companyCircularStatus':{textContent:'',style:{}},
  '#companyCircularPdfFrame':{src:''},
  '#companyCircularInlinePreview':{hidden:true},
 };
 let count=0;const urls=[];
 const ctx={
  circularPreviewRequestV76420:0,circularPreviewUrlV76393:null,
  editingCompanyId:id,guard:()=>true,$:selector=>elements[selector],
  company:(key)=>key==='companyA'||key==='companyB'?{id:key,code:'TEST',year:'2569'}:null,
  circularToApiV76393:()=>({companyNameEn:'Test'}),
  fetch:()=>responsePromise||Promise.resolve({ok:!fail,status:200,headers:{get:()=>header},blob:()=>Promise.resolve(Buffer.from('fake PDF'))}),
  URL:{createObjectURL(){const url='blob:mock-'+(++count);urls.push(url);return url},revokeObjectURL(){}},
  document:{createElement:()=>({}),body:{append(){}}},setTimeout:()=>{},
  console,
 };
 vm.createContext(ctx);vm.runInContext(fn,ctx);return{ctx,elements,urls};
}
test('live Word preview replaces iframe with freshly generated PDF',async()=>{
 const {ctx,elements,urls}=contextFactory();await ctx.circularPdfV76393(true);
 assert.equal(elements['#companyCircularPdfFrame'].src,'blob:mock-1');
 assert.equal(elements['#companyCircularInlinePreview'].hidden,false);
 assert.match(elements['#companyCircularStatus'].textContent,/Word ล่าสุด/);
 assert.equal(urls.length,1);
});
test('old server renderer is refused instead of showing a legacy PDF',async()=>{
 const {ctx,elements,urls}=contextFactory({header:null});await ctx.circularPdfV76393(true);
 assert.match(elements['#companyCircularStatus'].textContent,/word-table-v1/);
 assert.equal(elements['#companyCircularPdfFrame'].src,'');
 assert.equal(elements['#companyCircularInlinePreview'].hidden,true);
 assert.equal(urls.length,0);
});
test('stale preview for a previous company never replaces the newer one',async()=>{
 let resolveResponse;
 const pending=new Promise(resolve=>{resolveResponse=resolve});
 const {ctx,elements,urls}=contextFactory({responsePromise:pending});
 const task=ctx.circularPdfV76393(true);
 ctx.editingCompanyId='companyB';ctx.circularPreviewRequestV76420++;
 resolveResponse({ok:true,status:200,headers:{get:()=> 'word-table-v1'},blob:()=>Promise.resolve(Buffer.from('fake PDF'))});
 await task;
 assert.equal(elements['#companyCircularPdfFrame'].src,'');assert.equal(urls.length,0);
});
test('preview endpoint identifies Word renderer',()=>assert.match(server,/X-HealthCheck-Circular-Layout':'word-table-v1'/));
test('old saved primary PDF is no longer assigned to live preview',()=>{
 const load=app.slice(app.indexOf('async function loadCompanyPdfDocumentsV76395'),app.indexOf('async function saveCompanyForPrimaryV76395'));
 assert.doesNotMatch(load,/frame\.src\s*=\s*companyPdfDocUrlV76395\(/);
 assert.match(load,/Archived primary PDFs remain accessible/);
});
test('a stored circular record triggers a fresh preview after data hydration',()=>{
 const load=app.slice(app.indexOf('async function loadCircularBackendV76393'),app.indexOf('function renderCircularSummaryV76393'));
 assert.match(load,/circularPdfV76393\(true\)/);
 assert(load.indexOf('setCircularFieldsV76393')<load.indexOf('circularPdfV76393(true)'));
});
test('opening a new company invalidates in-flight preview',()=>{
 const load=app.slice(app.indexOf('function loadCircularFormV76393'),app.indexOf('async function loadCircularBackendV76393'));
 assert.match(load,/circularPreviewRequestV76420\+\+/);
});
test('app.js cache-busted so users do not keep old browser behavior',()=>assert.match(html,/assets\/app\.js\?v=7\.64\.21-production-pdf-bw/));
test('PDF implementation actually contains Word-style continuous tables',()=>{
 const sections=fs.readFileSync(path.join(root,'corporate-circular-sections.js'),'utf8');
 assert.match(sections,/continuous compact A4 Word-table layout/);
 assert.match(sections,/pair\('ชื่อบริษัท \(ภาษาไทย\)'/);
 assert.match(sections,/pair\('ชื่อบริษัท \(ภาษาอังกฤษ\)'/);
});
