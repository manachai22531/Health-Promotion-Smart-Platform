'use strict';
// Layout-only check with the real app HTML/CSS. No API data is changed.
// PROJECT_MODAL_TEST_URL=http://127.0.0.1:3000 CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tools/project-modal-viewport.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict');
test('project dialog keeps its header/footer visible and scrolls only the form',{skip:!process.env.PROJECT_MODAL_TEST_URL},async t=>{
  const {chromium}=require('playwright-core');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.goto(process.env.PROJECT_MODAL_TEST_URL,{waitUntil:'networkidle'});
  // Remove login presentation only to isolate the viewport contract. This does
  // not log in, grant permissions, or invoke any save/create API.
  await page.evaluate(()=>{document.getElementById('loginScreen').classList.add('hidden');document.body.classList.remove('login-unscaled');document.body.classList.add('modal-open');const overlay=document.getElementById('projectOverlay');overlay.hidden=false;overlay.classList.add('open')});
  for(const [width,height,density] of [[1920,911,'normal'],[1366,768,'normal'],[1280,600,'compact'],[1024,640,'dense'],[390,844,'normal']]){
    await t.test(`${width}x${height}, ${density}`,async()=>{
      await page.setViewportSize({width,height});await page.evaluate(d=>document.documentElement.dataset.hcDensity=d,density);
      const before=await page.evaluate(()=>{const overlay=document.getElementById('projectOverlay'),modal=overlay.querySelector('.modal'),form=modal.querySelector('.project-create-form');form.scrollTop=0;return {modal:modal.getBoundingClientRect().toJSON(),header:modal.querySelector('header').getBoundingClientRect().toJSON(),footer:modal.querySelector('footer').getBoundingClientRect().toJSON(),zoom:getComputedStyle(document.body).zoom,overflow:getComputedStyle(document.body).overflow,formOverflow:getComputedStyle(form).overflowY,scrollable:form.scrollHeight>form.clientHeight,columns:getComputedStyle(form).gridTemplateColumns}});
      for(const [name,rect] of Object.entries({modal:before.modal,header:before.header,footer:before.footer})){
        assert.ok(rect.y>=0&&rect.bottom<=height+1,`${name} clipped vertically: ${JSON.stringify(rect)}`);
        assert.ok(rect.x>=0&&rect.right<=width+1,`${name} clipped horizontally`);
      }
      assert.equal(before.zoom,'1');assert.equal(before.overflow,'hidden');assert.equal(before.formOverflow,'auto');assert.equal(before.scrollable,true);
      if(width<=760)assert.equal(before.columns.trim().split(/\s+/).length,1);
      await page.locator('#projectOverlay .project-create-form').evaluate(form=>{form.scrollTop=form.scrollHeight});
      const after=await page.evaluate(()=>{const overlay=document.getElementById('projectOverlay');return{top:overlay.querySelector('.project-create-form').scrollTop,footer:overlay.querySelector('footer').getBoundingClientRect().toJSON(),remark:document.getElementById('projectRemarkInput').getBoundingClientRect().toJSON()}});
      assert.ok(after.top>0);assert.ok(Math.abs(after.footer.y-before.footer.y)<1);assert.ok(after.remark.bottom<=after.footer.y+1,'last field must be reachable above footer');
      await page.screenshot({path:`/tmp/project-modal-v76489-${width}x${height}.png`});
    });
  }
  await page.setViewportSize({width:1920,height:911});
  await page.evaluate(()=>{document.documentElement.dataset.hcDensity='normal';const overlay=document.getElementById('projectOverlay');overlay.classList.remove('open');overlay.hidden=true;document.body.classList.remove('modal-open')});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).zoom),'1.1','closing restores the original main-page scale');
});
