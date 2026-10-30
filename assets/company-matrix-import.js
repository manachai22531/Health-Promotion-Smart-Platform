(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CompanyMatrixImport=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const programHeaders=['ชื่อโปรแกรม','ราคา/คน (บาท)'];
  const testHeaders=['ลำดับ','รายการตรวจ (English)','รายละเอียดภาษาไทย'];
  function workbook(XLSX,matrix){
    const book=XLSX.utils.book_new(),programs=matrix.programs||[];
    const add=(name,rows,widths)=>{const sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=widths.map(wch=>({wch}));XLSX.utils.book_append_sheet(book,sheet,name)};
    add('Programs',[programHeaders,...programs.map(p=>[p.name,p.price])],[45,22]);
    add('Tests',[[...testHeaders,...programs.map((_,i)=>`โปรแกรม ${i+1}`)],...(matrix.rows||[]).map(r=>[r.no,r.en,r.th,...r.checks.map(v=>v==='yes'?'✓':v==='na'?'ไม่รวม':'')])],[10,45,60,...programs.map(()=>18)]);
    add('Notes',[['หมายเหตุ'],[matrix.note||'']],[100]);
    add('Instructions',[
      ['วิธีใช้งาน'],['Programs: กรอกชื่อโปรแกรมและราคาต่อคน ตามลำดับ สูงสุด 10 โปรแกรม'],
      ['Tests: คอลัมน์โปรแกรม 1, 2, ... ตรงกับลำดับโปรแกรมใน Programs สูงสุด 200 รายการตรวจ'],
      ['สถานะ: ✓ หรือ ตรวจ = รวมการตรวจ, ไม่รวม = ไม่รวม, เว้นว่าง หรือ - = ช่องว่าง'],
      ['แก้ไขข้อมูลตัวอย่างได้ แต่ห้ามเปลี่ยนชื่อชีตและหัวคอลัมน์'],
      ['Notes: กรอกหมายเหตุใต้ตารางได้ไม่เกิน 1,000 ตัวอักษร'],
      ['นำเข้าแล้วกดบันทึกหัวข้อ 12 เพื่อบันทึกและอัปเดต PDF']
    ],[110]);
    return book;
  }
  function parse(XLSX,book){
    const text=v=>String(v??'').trim();
    function rows(name,max){
      const sheet=book.Sheets[name];if(!sheet)throw new Error(`ไม่พบชีต ${name} กรุณาใช้เทมเพลตตารางโปรแกรม`);
      const ref=sheet['!fullref']||sheet['!ref'];
      if(ref&&XLSX.utils.decode_range(ref).e.r>max)throw new Error(`ชีต ${name} เกิน ${max} แถวข้อมูล`);
      return XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:false});
    }
    const programRows=rows('Programs',10),testRows=rows('Tests',200);
    function headers(row,expected,name){if(!row||expected.some((v,i)=>text(row[i])!==v))throw new Error(`หัวคอลัมน์ชีต ${name} ไม่ตรงเทมเพลต`)}
    headers(programRows.shift(),programHeaders,'Programs');headers(testRows.shift(),testHeaders,'Tests');
    const programs=programRows.filter(r=>r.some(v=>text(v))).map((r,i)=>{
      const name=text(r[0]),raw=text(r[1]).replace(/,/g,''),price=raw===''?0:Number(raw);
      if(!name||name.length>90)throw new Error(`Programs แถว ${i+2}: ชื่อโปรแกรมต้องมี 1–90 ตัวอักษร`);
      if(!Number.isFinite(price)||price<0||price>999999999)throw new Error(`Programs แถว ${i+2}: ราคาไม่ถูกต้อง`);
      return {name,price};
    });
    if(!programs.length)throw new Error('กรุณากรอกโปรแกรมอย่างน้อย 1 โปรแกรม');
    // Re-read only the header; each status column is tied to program order.
    const header=XLSX.utils.sheet_to_json(book.Sheets.Tests,{header:1,defval:'',blankrows:false})[0];
    programs.forEach((_,i)=>{if(text(header[i+3])!==`โปรแกรม ${i+1}`)throw new Error(`ไม่พบคอลัมน์ โปรแกรม ${i+1} ในชีต Tests`)});
    const rowsOut=testRows.filter(r=>r.some(v=>text(v))).map((r,i)=>{
      const no=text(r[0])||String(i+1),en=text(r[1]),th=text(r[2]);
      if(!en&&!th)throw new Error(`Tests แถว ${i+2}: กรุณาระบุชื่อรายการตรวจ`);
      if(no.length>12||en.length>230||th.length>400)throw new Error(`Tests แถว ${i+2}: ข้อความยาวเกินกำหนด`);
      if(r.slice(3+programs.length).some(v=>text(v)))throw new Error(`Tests แถว ${i+2}: มีสถานะในคอลัมน์ที่ไม่มีโปรแกรม`);
      const checks=programs.map((_,j)=>{
        const value=text(r[j+3]).toLowerCase();
        if(['✓','✔','yes','ตรวจ','true','1'].includes(value))return 'yes';
        if(['na','n/a','ไม่รวม','■','false','0'].includes(value))return 'na';
        if(['','-','–','—','blank','เว้นว่าง'].includes(value))return 'blank';
        throw new Error(`Tests แถว ${i+2}, โปรแกรม ${j+1}: สถานะ “${text(r[j+3])}” ไม่ถูกต้อง`);
      });return {no,en,th,checks};
    });
    if(!rowsOut.length)throw new Error('กรุณากรอกรายการตรวจอย่างน้อย 1 รายการ');
    let note='';
    if(book.Sheets.Notes){const notes=rows('Notes',1);headers(notes.shift(),['หมายเหตุ'],'Notes');note=text(notes[0]?.[0]);if(note.length>1000)throw new Error('หมายเหตุเกิน 1,000 ตัวอักษร')}
    return {programs,rows:rowsOut,note};
  }
  return {workbook,parse};
});
