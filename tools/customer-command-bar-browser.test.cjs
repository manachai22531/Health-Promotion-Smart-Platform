'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),path=require('node:path'),{chromium}=require('playwright-core');
test('customer commands wrap independently while the customer table scrolls horizontally',async t=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'..')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('**/api/**',r=>r.fulfill({json:{authenticated:false,items:[]}}));await page.route('**/customer-api/**',r=>r.fulfill({json:{}}));await page.goto('http://127.0.0.1:'+server.address().port+'/app.html',{waitUntil:'networkidle'});
 await page.evaluate(()=>{document.getElementById('loginScreen').remove();open('customerListOverlay');document.getElementById('customerBulkToolbar').hidden=false;document.getElementById('customerListMeta').textContent='ข้อมูลที่นำเข้าทั้งหมด 97 รายชื่อ · แสดง 1–97';const table=document.querySelector('#customerListOverlay .unified-customer-table');table.style.setProperty('min-width','5000px','important');});
 for(const width of [1920,1366,768,430]){
  await page.setViewportSize({width,height:1000});
  const bar=page.locator('.hc-release-command-bar');
  const bounds=await bar.evaluate(el=>{const b=el.getBoundingClientRect();return {overflow:el.scrollWidth-el.clientWidth,left:b.left,right:b.right,controls:[...el.querySelectorAll('button,label')].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,text:n.textContent}})}});
  assert.ok(bounds.overflow<=2,'no command bar overflow at '+width);
  for(const b of bounds.controls){assert.ok(b.left>=bounds.left-2&&b.right<=bounds.right+2,'command stays within bar at '+width+' '+JSON.stringify({b,bounds}))}
  const table=page.locator('#customerListOverlay .unified-customer-table-wrap');const before=await bar.boundingBox();
  assert.ok(await table.evaluate(el=>el.scrollWidth>el.clientWidth),'table remains independently scrollable');await table.evaluate(el=>{el.scrollLeft=300});
  assert.equal((await bar.boundingBox()).x,before.x,'table scroll does not shift commands');assert.ok(await table.evaluate(el=>el.scrollLeft>0));
 }
});
