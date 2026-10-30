'use strict';
// Real Chromium + XLSX round trip with synthetic HIS responses; no hospital access.
// CHROMIUM_EXECUTABLE=/usr/bin/chromium node --test tools/patient-demographic-export.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const express=require('express'),{chromium}=require('playwright-core');
const XLSX=require('../assets/vendor/xlsx.full.min.js');
test('HIS gender labels survive Excel export and manual selection in both worksheets',async t=>{
 const root=path.resolve(__dirname,'..'),app=express();
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 app.use(express.static(root));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage({acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const genders=[{gender:'',gender_label:'FEMALE'},{gender:null,gender_label:'MALE'},{gender:'F',gender_label:'FEMALE'},{gender:'M',gender_label:'  '},{gender_label:' หญิง '},{gender:'O'},{gender:'U',gender_label:null},{}];
 const expected=['FEMALE','MALE','FEMALE','M','หญิง','O','U',''];
 const patient=(index,extra={})=>({hn:'HN'+index,first_name:'Patient',last_name:String(index),...genders[index],...extra});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let data;
  if(url.pathname==='/api/auth/session')data={authenticated:true,user:{id:'test',permissions:['dataCenterView','customerSensitiveView']}};
  else if(url.pathname.endsWith('/status'))data={configured:true};
  else if(url.pathname.endsWith('/search'))data={results:route.request().postDataJSON().rows.map((input,index)=>({input,status:index===0?'REVIEW':index===1?'MULTIPLE':'MATCH',matchMethod:'ID',requiresSelection:index<2,matchCount:index===1?2:1,candidates:index===1?[patient(index),patient(index,{hn:'HN1-B'})]:[patient(index)]}))};
  else return route.fulfill({status:404,json:{error:'Unexpected fixture API'}});
  await route.fulfill({json:data});
 });
 // Allows verifying that this regression fails against the untouched release script.
 if(process.env.PATIENT_DEMO_BASELINE_SCRIPT)await page.route('**/assets/patient-demographic.js?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(process.env.PATIENT_DEMO_BASELINE_SCRIPT,'utf8')}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/datacenter/patient-demographic.html');
 await page.locator('#connection').filter({hasText:'ใช้การเชื่อมต่อ HIS เดิม'}).waitFor();
 const input=XLSX.utils.book_new();XLSX.utils.book_append_sheet(input,XLSX.utils.aoa_to_sheet([['ID','Gender'],...genders.map((_,index)=>['ID'+index,'F'])]),'Input');
 await page.locator('#excelFile').setInputFiles({name:'gender.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(input,{type:'buffer',bookType:'xlsx'}))});
 await page.locator('#search').click();await page.locator('#progress').filter({hasText:'ค้นหาครบ'}).waitFor();
 await page.locator('[data-candidate="0"]').click();assert.match(await page.locator('#candidateRows').innerText(),/FEMALE/);await page.locator('#closeCandidates').click();
 async function exported(){const event=page.waitForEvent('download');await page.locator('#export').click();const download=await event;return XLSX.read(fs.readFileSync(await download.path()),{type:'buffer'});}
 const rows=(book,sheet)=>XLSX.utils.sheet_to_json(book.Sheets[sheet],{defval:''});
 let book=await exported(),all=rows(book,'Patient Demographic');
 assert.deepEqual(all.map(row=>row.HISGender),[expected[0],expected[1],expected[1],...expected.slice(2)]);
 assert.equal(all[0].HN,'');assert.equal(all[0].CandidateHN,'HN0');
 assert.equal(all.filter(row=>row.ExcelRow===3).length,2);
 assert.equal(all.at(-1).HISGender,'','Missing HIS gender must not inherit the input F');
 assert.deepEqual(rows(book,'ตรวจเลือกแล้ว').map(row=>row.HISGender),expected.slice(2));
 let confirmation='';page.on('dialog',dialog=>{confirmation=dialog.message();return dialog.accept()});
 await page.locator('[data-candidate="0"]').click();await page.locator('[data-select-patient="0"]').click();assert.match(confirmation,/Gender FEMALE/);
 assert.match(await page.locator('#results tr').first().innerText(),/FEMALE/);
 book=await exported();const selected=rows(book,'ตรวจเลือกแล้ว').find(row=>row.CandidateHN==='HN0');
 assert.equal(selected.HISGender,'FEMALE');assert.equal(selected.HN,'HN0');assert.equal(selected.ManualSelection,true);
 assert.deepEqual(errors,[]);
});
