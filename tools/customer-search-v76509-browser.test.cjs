'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const path=require('node:path');
const {chromium}=require('playwright-core');
const {PDFDocument}=require('pdf-lib');

for(const width of [1920,1280,1024,768]) test(`search counts, row navigation and A4 actions at ${width}px`,async t=>{
  const app=express();app.use(express.static(path.resolve(__dirname,'..')));
  app.get('/customer',(req,res)=>res.send('<html><body>Customer preview navigation test</body></html>'));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
  const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width,height:1000}});
  page.on('dialog',dialog=>dialog.accept());
  let results=[],total=0,pdfRequests=[];
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=Buffer.from(await pdf.save());
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/customer-search')return route.fulfill({json:{items:results,total,limit:120}});
    if(url.pathname==='/api/checkup-summary/pdf'){pdfRequests.push(route.request().postDataJSON());return route.fulfill({contentType:'application/pdf',body:bytes})}
    return route.fulfill({json:{authenticated:false,items:[],data:{},ok:true}});
  });
  await page.route('**/customer-api/**',route=>route.fulfill({json:{}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/app.html`,{waitUntil:'networkidle'});
  const records=await page.evaluate(()=>{
    document.getElementById('loginScreen')?.remove();
    currentUser={roleId:'admin',username:'admin',displayName:'Admin'};
    state.roles=[{id:'admin',permissions:PERMISSIONS.map(p=>p[0])}];
    state.companies=[{id:'co',name:'Test company',year:'2569',billingPackages:[],cashPackages:[]}];
    state.records=Array.from({length:125},(_,i)=>({key:`record-${i}`,companyId:'co',first:`TEST ${i}`,last:'Customer',id:`ID-${i}`,hn:`HN-${i}`,hisLastVisitUID:`VN-${i}`,primaryPackages:[],acceptedBillingItems:[],acceptedCashItems:[],selectedPackages:[]}));
    setCustomerSearchView('card');return state.records;
  });
  await page.locator('#searchName').fill('TEST');
  for(const count of [0,1,4,125]){
    total=count;results=records.slice(0,Math.min(count,120));
    await page.evaluate(()=>search());
    const meta=await page.locator('#resultMeta').innerText();
    assert.match(meta,new RegExp(`พบ ${count} รายการ`));
    assert.match(meta,count>120?/แสดง 1–120 จาก 125 รายการ/:new RegExp(`แสดงทั้งหมด ${count} รายการ`));
    assert.equal(await page.locator('#customerSearchTableRows tr').count(),Math.min(count,120));
  }
  assert.equal(await page.locator('#customerSearchViewToggle').innerText(),'ตาราง');
  await page.locator('#customerSearchViewToggle').click();
  assert.equal(await page.locator('#customerSearchViewToggle').innerText(),'การ์ด');
  assert.equal(await page.locator('#customerSearchTablePane').isVisible(),true);
  assert.equal(await page.locator('#customerSearchTablePane button:not(.customer-copy)').count(),0);
  assert.equal(await page.locator('#customerSearchTablePane input[type=checkbox]').count(),0);
  // All controls remain present and inside the viewport on tablets.
  for(const id of ['searchName','searchIdentity','searchHn','searchBooking','companyFilter','searchSubmit','clearSearch','searchAddCustomer','companyQuickLookupToggle','searchTodayToggle','customerSearchViewToggle','customerSearchSave','customerSearchSort','customerSearchDirection']){
    const el=page.locator('#'+id);assert.equal(await el.isVisible(),true,id);
    const rect=await el.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1,`${id} outside viewport at ${width}`);
  }
  if(width>=1280){const rects=await Promise.all(['searchSubmit','clearSearch','searchAddCustomer','customerSearchViewToggle','searchTodayToggle'].map(id=>page.locator('#'+id).boundingBox()));assert(Math.max(...rects.map(r=>r.y))-Math.min(...rects.map(r=>r.y))<5,'desktop action buttons must share a row')}
  await page.locator('#customerSearchTableRows tr').nth(0).click();
  await page.waitForFunction(()=>document.querySelector('.cf-preview-pane').getAttribute('aria-busy')==='false');
  assert.match(await page.locator('#cfPreviewState').innerText(),/ข้อมูลที่บันทึกแล้ว/);
  assert.equal(await page.locator('#detailOverlay').evaluate(el=>el.classList.contains('open')),true);
  assert.equal(await page.locator('#detailOverlay #saveCustomerAll').isVisible(),true);
  assert.equal(await page.locator('#detailOverlay #printSummary').isVisible(),true);
  assert.equal(await page.locator('#detailOverlay #openHisVisit').isVisible(),true);
  assert.equal(await page.locator('#detailOverlay #customerSearchExport').count(),0);
  assert.equal(await page.locator('#cfRefreshPreview').innerText(),'รีเฟรช');
  const actionRects=await Promise.all(['cfRefreshPreview','cfOpenPdf','cfOpenCustomer'].map(id=>page.locator('#'+id).boundingBox()));
  assert(Math.max(...actionRects.map(r=>r.y))-Math.min(...actionRects.map(r=>r.y))<2,'preview actions share one row');
  const headerRect=await page.locator('.cf-preview-pane>header').boundingBox();assert(headerRect.x+headerRect.width-actionRects[2].x-actionRects[2].width<16,'preview actions align right');
  assert.equal(await page.locator('#cfOpenCustomer').evaluate(e=>getComputedStyle(e).textDecorationLine),'none');
  await page.evaluate(()=>{state.companies[0].name='REFRESHED COMPANY'});
  await page.locator('#cfRefreshPreview').click();
  await page.waitForFunction(()=>document.querySelector('.cf-preview-pane').getAttribute('aria-busy')==='false');
  assert.match(await page.locator('#cfPreviewState').innerText(),/ข้อมูลที่บันทึกแล้ว/);
  assert.match(await page.frameLocator('.cf-html-frame').locator('body').innerText(),/REFRESHED COMPANY/);
  await page.locator('#cfOpenPdf').click();
  await page.locator('.cf-document-dialog iframe').waitFor();
  assert.equal(pdfRequests.at(-1).recordKey,'record-0');assert.equal(pdfRequests.at(-1).vn,'VN-0');
  await page.locator('.cf-document-dialog button').click();
  let popupPromise=page.waitForEvent('popup');
  await page.locator('#cfOpenCustomer').click();
  let popup=await popupPromise;await popup.waitForURL('**/customer?staffPreview=record-0');
  assert.equal(new URL(popup.url()).searchParams.get('staffPreview'),'record-0');await popup.close();
  await page.evaluate(()=>close('detailOverlay'));
  await page.locator('#customerSearchTableRows tr').nth(1).click();
  assert.equal(await page.locator('#customerSearchTableRows input[type=radio]').count(),0);
  assert.equal(await page.locator('#customerSearchTableRows tr.selected').getAttribute('data-customer-search-key'),'record-1');
  await page.waitForFunction(()=>document.querySelector('.cf-preview-pane').getAttribute('aria-busy')==='false');
  popupPromise=page.waitForEvent('popup');await page.locator('#cfOpenCustomer').click();
  popup=await popupPromise;await popup.waitForURL('**/customer?staffPreview=record-1');
  assert.equal(new URL(popup.url()).searchParams.get('staffPreview'),'record-1');await popup.close();
  await page.locator('#cfOpenPdf').click();await page.locator('.cf-document-dialog iframe').waitFor();
  assert.equal(pdfRequests.at(-1).recordKey,'record-1');assert.equal(pdfRequests.at(-1).vn,'VN-1');
  await page.locator('.cf-document-dialog button').click();
  await page.evaluate(()=>showA4Summary(savedCheckupDraft(state.records[0])));
  assert.match(await page.locator('#cfOpenCustomer').getAttribute('href'),/staffPreview=record-0$/);
  await page.evaluate(()=>close('detailOverlay'));
  await page.locator('#customerSearchViewToggle').click();
  assert.equal(await page.locator('#resultRows').isVisible(),true);assert.equal(await page.locator('#customerSearchTablePane').isVisible(),false);
  await page.locator('#clearSearch').click();assert.equal(await page.locator('#resultMeta').innerText(),'');
});
