(function(){
'use strict';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields={id:['ID','IDCard','IdentificationNumber','CitizenID','เลขประจำตัวประชาชน','เลขบัตรประชาชน','เลขที่บัตรประชาชน'],passport:['Passport','PassportNo','PassportNumber','เลขหนังสือเดินทาง','พาสปอร์ต'],firstName:['FirstName','ชื่อ','ชื่อจริง','ชื่อภาษาไทย'],lastName:['LastName','Surname','นามสกุล'],dob:['DOB','BirthDate','DateOfBirth','วันเกิด','วันเดือนปีเกิด'],gender:['Gender','Sex','เพศ']};
const labels={id:'ID',passport:'Passport',firstName:'ชื่อ',lastName:'นามสกุล',dob:'วันเกิด',gender:'Gender'},statuses={SELECTED:'ตรวจเลือกแล้ว',MATCH:'พบตรงกัน',REVIEW:'พบแต่ข้อมูลต่างกัน',MULTIPLE:'พบหลายคน',NOT_FOUND:'ไม่พบ',INCOMPLETE_SEARCH:'ยังค้นไม่ครบ',INSUFFICIENT_DATA:'ข้อมูลไม่พอ',ERROR:'เกิดข้อผิดพลาด',PENDING:'ยังไม่ค้นหา'};
// Use the same HIS value in results, review, confirmation and Excel; never infer it from input.
const hisGender=patient=>[patient.gender_label,patient.gender].map(value=>String(value??'').trim()).find(Boolean)||'';
const canonical=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9ก-๙]/g,'');
let workbook=null,matrix=[],headers=[],headerIndex=0,rowOffset=0,columnOffset=0,mapping={},inputs=[],results=[],page=1,configured=false,busy=false,controller=null,generation=0,readGeneration=0;
function message(value){$('error').textContent=value||''}
function lock(value){busy=value;$('excelFile').disabled=value;$('sheet').disabled=value||!workbook;document.querySelectorAll('#mapping select').forEach(select=>select.disabled=value);$('search').disabled=value||!configured||!inputs.length;$('cancel').disabled=!value;$('export').disabled=value||!results.some(result=>result.status!=='PENDING')}
function pending(input){return{input,status:input._inputError?'ERROR':'PENDING',candidates:[],message:input._inputError||''}}
function clear(){generation++;readGeneration++;controller?.abort();controller=null;workbook=null;matrix=[];headers=[];inputs=[];results=[];page=1;$('excelFile').value='';$('sheet').innerHTML='<option>เลือกไฟล์ก่อน</option>';$('mapping').hidden=true;$('mapping').replaceChildren();$('fileSummary').textContent='ยังไม่ได้เลือกไฟล์';$('progress').textContent='';if($('candidates').open)$('candidates').close();$('candidateRows').replaceChildren();message('');lock(false);render()}
window.expireStaffSessionForOcr=reason=>{clear();configured=false;lock(false);message(reason||'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');try{if(parent!==window)parent.expireStaffSessionForOcr?.(reason)}catch(_){}};
function cellValue(key,row,index){
 const column=mapping[key];if(column<0)return '';
 const value=row[column]??'';
 if(key==='dob'&&typeof value==='number'){
  const parsed=XLSX.SSF.parse_date_code(value,{date1904:!!workbook.Workbook?.WBProps?.date1904});return parsed?`${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`:String(value);
 }
 if((key==='id'||key==='passport')&&typeof value==='number'){
  if(!Number.isSafeInteger(value)||value<0)throw new Error(`${labels[key]} เป็นตัวเลขทศนิยมหรือยาวเกินความแม่นยำของ Excel กรุณาจัดเป็น Text`);
  const sheet=workbook.Sheets[$('sheet').value],cell=sheet[XLSX.utils.encode_cell({r:rowOffset+index,c:columnOffset+column})];
  const formatted=cell?XLSX.utils.format_cell(cell):'';
  return /^0\d+$/.test(formatted)?formatted:String(value);
 }
 return String(value).trim();
}
function rebuild(){
 generation++;controller?.abort();inputs=[];results=[];message('');
 const used=Object.values(mapping).filter(index=>index>=0);
 if(!used.length){message('กรุณาจับคู่คอลัมน์อย่างน้อยหนึ่งช่อง');lock(false);render();return}
 if(new Set(used).size!==used.length){message('กรุณาจับคู่แต่ละช่องกับคอลัมน์ที่ไม่ซ้ำกัน');lock(false);render();return}
 let numericIDs=false;
 for(let index=headerIndex+1;index<matrix.length;index++){
  const row=matrix[index];if(!row.some(value=>String(value??'').trim()))continue;
  const input={rowNumber:rowOffset+index+1};
  try{for(const key of Object.keys(fields)){if((key==='id'||key==='passport')&&typeof row[mapping[key]]==='number')numericIDs=true;input[key]=cellValue(key,row,index)}}catch(error){input._inputError=error.message;for(const key of Object.keys(fields))input[key]=String(row[mapping[key]]??'')}
  inputs.push(input);
 }
 if(inputs.length>5000){inputs=[];message('รองรับครั้งละไม่เกิน 5,000 รายชื่อ กรุณาแบ่งไฟล์')}
 results=inputs.map(pending);page=1;$('fileSummary').textContent=`${$('sheet').value} · อ่าน ${inputs.length.toLocaleString('th-TH')} แถว · หัวตารางแถว ${rowOffset+headerIndex+1}${numericIDs?' · มี ID/Passport เป็นตัวเลข กรุณาตรวจเลข 0 ด้านหน้า':''}`;$('progress').textContent='';lock(false);render();
}
function readSheet(){
 const sheet=workbook.Sheets[$('sheet').value],range=XLSX.utils.decode_range(sheet['!ref']||'A1');rowOffset=range.s.r;columnOffset=range.s.c;
 if(range.e.r-range.s.r>10000||range.e.c-range.s.c>300)throw new Error('ขอบเขตแผ่นงานใหญ่เกินไป กรุณาลบแถว/คอลัมน์ว่างที่จัดรูปแบบเกินข้อมูล');
 matrix=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:true});
 let best=-1;headerIndex=0;for(let index=0;index<Math.min(20,matrix.length);index++){const score=Object.values(fields).filter(aliases=>matrix[index].some(value=>aliases.map(canonical).includes(canonical(value)))).length;if(score>best){best=score;headerIndex=index}}
 headers=(matrix[headerIndex]||[]).map((value,index)=>String(value||`คอลัมน์ ${XLSX.utils.encode_col(columnOffset+index)}`));mapping={};
 $('mapping').innerHTML=Object.entries(fields).map(([key,aliases])=>{const found=headers.findIndex(value=>aliases.map(canonical).includes(canonical(value)));mapping[key]=found;return `<label>${labels[key]}<select data-map="${key}"><option value="-1">ไม่ใช้คอลัมน์นี้</option>${headers.map((value,index)=>`<option value="${index}" ${found===index?'selected':''}>${esc(value)}</option>`).join('')}</select></label>`}).join('');
 $('mapping').hidden=false;document.querySelectorAll('[data-map]').forEach(select=>select.onchange=()=>{mapping[select.dataset.map]=Number(select.value);rebuild()});rebuild();
}
$('excelFile').onchange=async()=>{
 const file=$('excelFile').files[0];if(!file)return;
 const ticket=++readGeneration;generation++;controller?.abort();workbook=null;inputs=[];results=[];lock(true);message('');$('fileSummary').textContent='กำลังอ่านไฟล์…';
 try{if(!/\.(xlsx|xls)$/i.test(file.name))throw new Error('รองรับเฉพาะ .xlsx หรือ .xls');if(file.size>25*1024*1024)throw new Error('ขนาดไฟล์ต้องไม่เกิน 25 MB');const bytes=await file.arrayBuffer();if(ticket!==readGeneration)return;workbook=XLSX.read(bytes,{type:'array',cellDates:false});if(!workbook.SheetNames.length)throw new Error('ไม่พบแผ่นงาน');$('sheet').innerHTML=workbook.SheetNames.map(sheet=>`<option>${esc(sheet)}</option>`).join('');readSheet()}catch(error){if(ticket!==readGeneration)return;workbook=null;inputs=[];results=[];$('fileSummary').textContent='อ่านไฟล์ไม่สำเร็จ';message(error.message);lock(false);render()}
};
$('sheet').onchange=()=>{try{readSheet()}catch(error){inputs=[];results=[];message(error.message);lock(false);render()}};
$('template').onclick=()=>{
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['ID','Passport','FirstName','LastName','DOB','Gender']]);sheet['!cols']=[{wch:20},{wch:20},{wch:25},{wch:25},{wch:18},{wch:12}];
 XLSX.utils.book_append_sheet(book,sheet,'Patient Demographic');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['คำอธิบาย'],['หนึ่งแถวต่อหนึ่งผู้ป่วย เลือกแผ่นงานรายชื่อก่อนค้นหา'],['ID / Passport: เก็บเป็น Text เพื่อไม่ให้เลข 0 ด้านหน้าหาย'],['DOB: DD/MM/YYYY หรือ YYYY-MM-DD รองรับ พ.ศ. และ ค.ศ.'],['Gender: M/F, Male/Female, ชาย/หญิง หรือ O/U'],['ค้นหา ID ก่อน หากไม่พบใช้ Passport แล้วค้นจากชื่อ+นามสกุล วันเกิด/Gender ถ้ามีจะช่วยกรองผล'],['ผลค้นจากชื่ออย่างเดียวต้องตรวจเลือกผู้ป่วยก่อนนำ HN ไปใช้ ไม่เขียนข้อมูลกลับ HIS']]),'คำอธิบาย');XLSX.writeFile(book,'Patient_Demographic_Template.xlsx');
};
function filtered(){const query=$('filter').value.trim().toLowerCase(),status=$('statusFilter').value;return results.map((result,index)=>({result,index})).filter(({result})=>(!status||result.status===status)&&(!query||JSON.stringify(result).toLowerCase().includes(query)))}
function render(){
 const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,pages);
 const counts={};results.forEach(result=>counts[result.status]=(counts[result.status]||0)+1);$('counts').textContent=Object.entries(counts).map(([key,count])=>`${statuses[key]||key} ${count.toLocaleString('th-TH')}`).join(' · ');
 $('results').innerHTML=rows.slice((page-1)*50,page*50).map(({result,index})=>{const input=result.input,candidate=result.selectedPatient||(result.candidates?.length===1?result.candidates[0]:null);const detail=[result.message,...(result.warnings||[]),result.mismatches?.length?'ข้อมูลต่างกัน: '+result.mismatches.join(', '):''].filter(Boolean).join('\n');return `<tr><td>${Number(input.rowNumber)||index+1}</td><td>${esc([input.firstName,input.lastName].filter(Boolean).join(' '))}\n<small>${esc(['ID: '+(input.id||'-'),'Passport: '+(input.passport||'-'),input.rawDob||input.dob,input.rawGender||input.gender].filter(Boolean).join(' · '))}</small></td><td><span class="tag ${esc(result.status)}">${esc(statuses[result.status]||result.status)}</span></td><td>${esc(result.matchMethod||'-')}\n<small>${esc((result.attempts||[]).join(' → '))}</small></td><td>${candidate?`${esc(candidate.hn||'-')}\n${esc([candidate.first_name,candidate.last_name].filter(Boolean).join(' '))}\n<small>${esc(candidate.birth_date||'-')} · ${esc(hisGender(candidate)||'-')}</small>`:result.status==='MULTIPLE'?`พบ${result.hasMore?'อย่างน้อย ':''}${Number(result.matchCount)} รายการ`: '-'}</td><td>${esc(detail)}${result.candidates?.length?`<br><button type="button" class="secondary" data-candidate="${index}" ${busy?'disabled':''}>ดูข้อมูล HIS${result.hasMore?' (10 คนแรก)':result.status==='MULTIPLE'?' ทุกคนที่พบ':''}</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="6">ไม่มีรายการ</td></tr>';
 $('page').textContent=`หน้า ${page}/${pages} · ${rows.length.toLocaleString('th-TH')} แถว`;$('prev').disabled=page<=1;$('next').disabled=page>=pages;
 document.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>{const resultIndex=Number(button.dataset.candidate),result=results[resultIndex],ticket=generation;$('candidateRows').innerHTML=`<p>แถว Excel ${Number(result.input.rowNumber)} · ${esc(result.matchMethod)}${result.hasMore?' · แสดง 10 คนแรกจากอย่างน้อย 11 คน กรุณาตรวจสอบกับ HIS':''}</p><div class="table-wrap"><table><thead><tr><th>HN</th><th>ชื่อ / นามสกุล</th><th>วันเกิด / Gender</th><th>ID ใน HIS</th><th>Passport ใน HIS</th><th>ตรวจเลือก</th></tr></thead><tbody>${result.candidates.map((person,candidateIndex)=>`<tr><td>${esc(person.hn)}</td><td>${esc([person.first_name,person.last_name].filter(Boolean).join(' '))}\n${esc([person.first_name_en,person.last_name_en].filter(Boolean).join(' '))}</td><td>${esc(person.birth_date)}\n${esc(hisGender(person))}</td><td>${esc(person.identification_number)}</td><td>${esc(person.passport_number)}</td><td><button type="button" data-select-patient="${candidateIndex}">เลือกผู้ป่วยรายนี้</button></td></tr>`).join('')}</tbody></table></div>`;$('candidates').showModal();$('candidateRows').querySelectorAll('[data-select-patient]').forEach(choice=>choice.onclick=()=>{if(ticket!==generation||results[resultIndex]!==result){$('candidates').close();return message('ผลการค้นหาเปลี่ยนแล้ว กรุณาเปิดตรวจใหม่')}const person=result.candidates[Number(choice.dataset.selectPatient)];if(!person)return;if(!confirm(`ยืนยันเลือก HN ${person.hn} · ${[person.first_name,person.last_name].filter(Boolean).join(' ')} · วันเกิด ${person.birth_date||'-'} · Gender ${hisGender(person)||'-'} สำหรับแถว Excel ${result.input.rowNumber}?`))return;result.originalStatus=result.originalStatus||result.status;result.selectedPatient=person;result.requiresSelection=false;result.status='SELECTED';result.message='ผู้ใช้ตรวจและเลือกผู้ป่วยแล้ว';$('candidates').close();render()})});
}
$('closeCandidates').onclick=()=>$('candidates').close();$('filter').oninput=$('statusFilter').onchange=()=>{page=1;render()};$('prev').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};$('clear').onclick=clear;$('cancel').onclick=()=>controller?.abort();
$('search').onclick=async()=>{
 if(busy||!configured||!inputs.length)return;
 const ticket=++generation;controller=new AbortController();results=inputs.map(pending);message('');lock(true);render();let checked=0,timedOut=false;
 try{
  const eligible=inputs.map((input,index)=>({input,index})).filter(({input})=>!input._inputError);
  for(let offset=0;offset<eligible.length;offset+=10){
   if(controller.signal.aborted)throw new DOMException('Stopped','AbortError');
   const batch=eligible.slice(offset,offset+10);$('progress').textContent=`กำลังค้นหา ${checked+1}–${checked+batch.length} จาก ${eligible.length} รายชื่อ`;
   const timer=setTimeout(()=>{timedOut=true;controller?.abort()},120000);
   let response,data;try{response=await fetch('/api/datacenter/patient-demographic/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:batch.map(({input})=>input)}),signal:controller.signal});data=await response.json()}finally{clearTimeout(timer)}
   if(ticket!==generation)return;if(!response.ok)throw new Error(data.error||'ค้นหา HIS ไม่สำเร็จ');if(!Array.isArray(data.results)||data.results.length!==batch.length||data.results.some(result=>!result))throw new Error('ผลลัพธ์จาก HIS ไม่ครบ กรุณาตรวจสอบก่อนค้นใหม่');
   batch.forEach(({index},position)=>results[index]=data.results[position]);checked+=batch.length;render();
  }
  $('progress').textContent=`ค้นหาครบ ${checked.toLocaleString('th-TH')} รายชื่อ${inputs.length>checked?' · แถวที่ข้อมูลผิดพลาดไม่ได้ส่งไป HIS':''}`;
 }catch(error){if(ticket!==generation)return;if(error.name==='AbortError')$('progress').textContent=`${timedOut?'เกินเวลารอ จึงหยุดค้นหา':'หยุดค้นหาแล้ว'} · ได้ผล ${checked.toLocaleString('th-TH')} รายชื่อ ที่เหลือยังไม่ยืนยันผล`;else{message(error.message);$('progress').textContent=`ค้นหาได้ ${checked.toLocaleString('th-TH')} รายชื่อก่อนหยุด · รายการที่เหลือยังไม่ยืนยันผล`}}
 finally{if(ticket===generation){controller=null;lock(false);render()}}
};
$('export').onclick=()=>{
 const rows=results.flatMap(result=>(result.selectedPatient?[result.selectedPatient]:result.candidates?.length?result.candidates:[{}]).map(patient=>({ExcelRow:result.input.rowNumber,Status:statuses[result.status]||result.status,MatchMethod:result.matchMethod||'',AttemptedMethods:(result.attempts||[]).join(' -> '),MatchCount:result.hasMore?'>=11':result.matchCount||0,Comment:[result.message,...(result.warnings||[]),result.mismatches?.length?'ข้อมูลต่างกัน: '+result.mismatches.join(', '):''].filter(Boolean).join(' · '),InputID:result.input.id||'',InputPassport:result.input.passport||'',InputFirstName:result.input.firstName||'',InputLastName:result.input.lastName||'',InputDOB:result.input.rawDob||result.input.dob||'',InputGender:result.input.rawGender||result.input.gender||'',ManualSelection:!!result.selectedPatient,HN:result.requiresSelection?'':patient.hn||'',CandidateHN:patient.hn||'',HISFirstName:patient.first_name||'',HISLastName:patient.last_name||'',HISFirstNameEN:patient.first_name_en||'',HISLastNameEN:patient.last_name_en||'',HISBirthDate:patient.birth_date||'',HISGender:hisGender(patient),HISID:patient.identification_number||'',HISPassport:patient.passport_number||''})));
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'Patient Demographic');XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows.filter(row=>row.Status===statuses.MATCH||row.Status===statuses.SELECTED)),'ตรวจเลือกแล้ว');XLSX.writeFile(book,`Patient_Demographic_${new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}.xlsx`);
};
(async()=>{try{const session=await fetch('/api/auth/session',{cache:'no-store'}),identity=await session.json();if(!session.ok||!identity.authenticated)throw new Error('กรุณาเข้าสู่ระบบก่อนใช้ Patient Demographic');window.HealthCheckAuth?.start(identity.user);const response=await fetch('/api/datacenter/patient-demographic/status',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error||'ไม่สามารถอ่านการเชื่อมต่อ');configured=data.configured;$('connection').textContent=configured?'ใช้การเชื่อมต่อ HIS เดิมใน System & API':'ยังไม่ได้ตั้งค่าการเชื่อมต่อ HIS';if(!configured)message('กรุณาตั้งค่า Patient Package หรือ Radiology ใน System & API ก่อนค้นหา');lock(false)}catch(error){configured=false;$('connection').textContent='ยังไม่พร้อม';message(error.message);lock(false)}})();
})();
