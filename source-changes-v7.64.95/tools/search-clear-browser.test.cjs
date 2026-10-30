'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
test('all app custom-clear search fields have one clear control; clearing and focus work; plain search keeps native control',async t=>{
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'app.html'),'utf8'),script=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage();
 await page.setContent('<main></main><input type="search" id="nativeSearch" aria-label="Native search">');
 // Audit the actual complete app template, including controls in normally hidden overlays.
 const ids=await page.evaluate(source=>{const doc=new DOMParser().parseFromString(source,'text/html'),main=document.querySelector('main'),ids=[];for(const input of doc.querySelectorAll('input[type="search"]')){const next=input.nextElementSibling;if(next?.matches('button[aria-label="ล้างคำค้น"]')){main.append(document.importNode(input.parentElement,true));ids.push(input.id)}}return ids},html);
 assert.deepEqual(ids.sort(),['companySearch','customerListSearch']);
 const css=process.env.CLEAR_BASELINE_CSS||path.join(root,'assets/style.css');await page.addStyleTag({content:fs.readFileSync(css,'utf8')});
 await page.evaluate(()=>{window.$=selector=>document.querySelector(selector);window.calls={company:0,customers:0};window.renderCompanies=()=>calls.company++;window.renderCustomerList=()=>calls.customers++;window.customerListPage=7});
 const handlers=script.split('\n').filter(line=>line.startsWith("$('#clearCompanySearch').onclick=")||line.startsWith("$('#clearCustomerListSearch').onclick="));assert.equal(handlers.length,2);await page.addScriptTag({content:handlers.join('\n')});
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');async function nativeDisplay(id){const {nodes}=await cdp.send('DOM.getFlattenedDocument',{depth:-1,pierce:true});const input=nodes.find(n=>n.nodeName==='INPUT'&&n.attributes?.includes(id));const shadow=input.shadowRoots?.[0];const descendants=new Set([shadow?.nodeId]);let changed=true;while(changed){changed=false;for(const n of nodes)if(descendants.has(n.parentId)&&!descendants.has(n.nodeId)){descendants.add(n.nodeId);changed=true}}const cancel=nodes.find(n=>descendants.has(n.nodeId)&&n.attributes?.includes('-webkit-search-cancel-button'));assert.ok(cancel,'Native clear node exists for '+id);const data=await cdp.send('CSS.getComputedStyleForNode',{nodeId:cancel.nodeId});return data.computedStyle.find(x=>x.name==='display').value}
 for(const id of ids){const input=page.locator('#'+id);await input.fill('test');await input.focus();assert.equal(await nativeDisplay(id),'none',id+' must suppress the duplicate native clear');assert.equal(await input.locator('..').locator('button[aria-label="ล้างคำค้น"]').count(),1);await input.locator('..').locator('button').click();assert.equal(await input.inputValue(),'');assert.equal(await input.evaluate(el=>document.activeElement===el),true)}
 assert.deepEqual(await page.evaluate(()=>calls),{company:1,customers:1});assert.equal(await page.evaluate(()=>customerListPage),1);
 await page.locator('#nativeSearch').fill('test');assert.notEqual(await nativeDisplay('nativeSearch'),'none');
 await page.setViewportSize({width:430,height:900});await page.locator('#companySearch').fill('mobile');await page.locator('#clearCompanySearch').click();assert.equal(await page.locator('#companySearch').inputValue(),'');
});
