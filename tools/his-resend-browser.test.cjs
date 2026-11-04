'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),path=require('node:path'),{chromium}=require('playwright-core');
test('Resend requires fresh server eligibility and opens confirmation without dispatching HIS',async t=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'..')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage();let safe=false,fail=false;const requests=[];
 await page.route('**/api/**',route=>{requests.push(route.request().url());if(fail)return route.fulfill({status:500,json:{error:'Unavailable'}});return route.fulfill({json:{operation:{id:'OP',name:'open-visit',label:'เปิด Visit',status:safe?'FAILED':'UNKNOWN',stage:safe?'REJECTED':'DISPATCHED',canRetry:safe,canCheck:!safe,startedAt:new Date().toISOString(),elapsedSeconds:2},history:[],record:{}}})});
 await page.goto(`http://127.0.0.1:${server.address().port}/assets/his-operation-monitor.css`);await page.setContent('<div id="resultRows"></div><div id="detailOverlay"></div>');
 await page.evaluate(()=>{window.state={records:[{key:'R',first:'Test'}]};window.pendingCheckup=null;window.activeRecordKey='R';window.confirmations=0;window.HealthCheckClinicalRefresh=async()=>{};window.showOpenVisitDialog=()=>confirmations++;window.detail=()=>{};});
 await page.addScriptTag({url:`http://127.0.0.1:${server.address().port}/assets/his-operation-monitor.js`});await page.evaluate(()=>HealthCheckHisOperations.open('R'));await page.waitForFunction(()=>document.querySelector('[data-check]').disabled===false);
 assert.equal(await page.locator('[data-retry]').isVisible(),true);assert.equal(await page.locator('[data-retry]').isDisabled(),true);
 safe=true;await page.locator('[data-check]').click();await page.waitForFunction(()=>document.querySelector('[data-retry]').disabled===false);
 fail=true;await page.locator('[data-retry]').click();assert.equal(await page.evaluate(()=>confirmations),0,'failed revalidation cannot use stale eligibility');
 fail=false;await page.locator('[data-retry]').click();await page.waitForFunction(()=>confirmations===1);assert(requests.every(url=>!url.includes('/api/his/')),'retry must not directly dispatch a clinical command');assert.equal(await page.evaluate(()=>pendingCheckup.recordKey),'R');
});
