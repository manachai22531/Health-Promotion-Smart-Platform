'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),X=require('./assets/vendor/xlsx.full.min'),M=require('./assets/customer-template-model'),R=require('./assets/customer-return-model'),H=require('./assets/customer-offline-export');
const headers=M.HEADERS,defaults=M.settings({companyName:'บริษัทที่กำหนด',year:'2569',packageCode:'PK001'}).values;
const person={Title:'นาย',FirstName:'สมมติ',LastName:'ทดสอบ',IdentificationType:'idnumber',IDCard:'0012345678901',Gender:'ชาย','BirthDate(DD/MM/YYYY)':'1982-05-25'};
test('returned data normalizes dates and gender, preserves leading zero and fixes configured company/package',()=>{
 const r=R.normalize({...person,CompanyName:'changed',PackageCode:'changed'},defaults,headers);assert.equal(r.Gender,'M');assert.equal(r.IDCard,'0012345678901');assert.equal(r['BirthDate(DD/MM/YYYY)'],'25/05/1982');assert.equal(r.CompanyName,'บริษัทที่กำหนด');assert.equal(r.PackageCode,'PK001');assert.deepEqual(R.validate([r]),[[]]);
 assert.equal(R.birth('29/02/2023'),'');assert.equal(R.birth('25/05/2525'),'25/05/1982');assert(R.validate([r,r])[1].some(x=>x.includes('ซ้ำ')));assert(R.validate([{...r,Email:'bad',IDCard:'123'}])[0].length>=2);
});
test('upload mapping skips description and reference sheets without creating false patients',()=>{
 const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([['FirstName','LastName','IDCard','Gender','BirthDate'],['ชื่อหลัก','นามสกุลหลัก','คำอธิบาย','เพศ','วันเกิด'],['สมมติ','ทดสอบ','0012345678901','หญิง','25/05/1982']]),'Customer Import');X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([['Code','Name'],['THA','ไทย']]),'Nationality');const rows=R.importWorkbook(w,X,headers,defaults);assert.equal(rows.length,1);assert.equal(rows[0].IDCard,'0012345678901');assert.equal(rows[0].Gender,'F');
});
test('completed workbook preserves styles and includes only supplied records',()=>{
 const r=R.normalize(person,defaults,headers),bytes=M.build(fs.readFileSync('templates/customer-share-base.xlsx'),{rows:100},{},X,[r]);const w=X.read(bytes,{type:'array',cellNF:true}),s=w.Sheets['Customer Import'];assert.equal(s['!ref'],'A1:AI2');assert.equal(s.P2.v,'0012345678901');assert.equal(s.J2.v,'สมมติ');assert.equal(s.P2.z,'@');
});
test('HTML payload escapes script endings and contains no remote dependencies',()=>{
 const template=fs.readFileSync('assets/customer-offline-form.html','utf8');const html=H.build({base:new Uint8Array([1]),options:{companyName:'</script><script>alert(1)</script>'},vendor:'var test="</script>"; var literal="$&";',model:'',returnModel:'',client:'',template,templateId:'test'});assert(!html.includes('<script>alert(1)</script>'));assert(html.includes('\\u003c/script>'));assert(html.includes('var literal="$&";'));assert(!html.includes('<script src='));assert(html.includes("connect-src 'none'"));
});
