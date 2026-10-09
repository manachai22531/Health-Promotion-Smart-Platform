'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('app.html','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const server=fs.readFileSync('server.js','utf8');

test('Edit Year has exactly 00-08 in source document order',()=>{
 const modal=html.slice(html.indexOf('id="companyOverlay"'),html.indexOf('id="importOverlay"'));
 assert.deepEqual([...modal.matchAll(/data-circular-number="([0-9]{2})"/g)].map(x=>x[1]),['00','01','02','03','04','05','06','07','08','09','10']);
 for(const [id,title] of [['00','ข้อมูลหัวหนังสือ'],['01','ข้อมูลบริษัท'],['02','ระยะเวลาในการตรวจ'],['03','แพทย์ + พยาบาล'],['04','โปรแกรมพนักงาน / โปรแกรมครอบครัว'],['05','ต้อนรับและการเงิน'],['06','การรายงานผล'],['07','บัญชีลูกหนี้'],['08','เจ้าหน้าที่ขาย']])assert.match(modal,new RegExp('data-circular-number="'+id+'"[\\s\\S]{0,300}'+title.replace(/[+]/g,'\\+')));
});
test('one editable control per annual canonical data field',()=>{
 for(const id of ['companyName','companyYear','companyCode','companyCheckupStartDate','companyCheckupEndDate','companyReportConditions','companySalesName','companySalesPhone'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 for(const id of ['letter_reportDetails','letter_signatory'])assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
 assert.ok(js.includes("reporting:($('#companyReportConditions')?.value||'').trim()"));
 assert.match(js,/company-year-program-target/);
 assert.match(js,/hospitalPrograms:joinPrograms\(raw.hospitalPrograms\)/);
 assert.match(js,/familyPrograms:joinPrograms\(raw.familyPrograms\)/);
});
test('original production and Update Center interfaces remain',()=>{
 assert.match(server,/RUNTIME_ENVIRONMENT = 'production'/);
 assert.match(server,/RELEASE_NAME = 'v7\.(?:63|64)\.\d+-production'/);
 assert.match(html,/id="companyPdfEditor"|id="companyNote"/);
 assert.match(html,/id="companyCircularPdfFrame"/);
 assert.match(html,/id="previewCircularPdf"/);
 assert.doesNotMatch(html,/id="downloadCircularPdf"/);
 assert.match(css,/company-year-v76394-workspace/);
 assert.ok(fs.existsSync('tools/app-update-helper.js'));
 assert.ok(fs.existsSync('templates/corporate-circular-template.pdf'));
});
