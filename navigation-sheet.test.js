'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const T=require('./assets/navigation-sheet-template');
test('navigation sheet retains seven stations, validates every field and escapes rendered values',()=>{assert.equal(T.sections.length,7);assert.throws(()=>T.normalize({unknown:'x'}));assert.throws(()=>T.normalize({blood:'yes'}));assert.throws(()=>T.normalize({height:'a'.repeat(501)}));assert.throws(()=>T.normalize({medication:'invalid'}));assert.deepEqual(T.normalize({blood:true,height:' 170 '}),{blood:true,height:'170'});const html=T.document({patient:{name:'<script>bad</script>'},data:{consultFor:'<img src=x onerror=bad()>'}},true);assert(!html.includes('<script>'));assert(!html.includes('<img src=x'));assert.match(html,/data-nav-field="blood"/);assert(!T.document({data:{blood:true}}).includes('data-nav-field'));assert.match(T.document({data:{blood:true}}),/☑/)});
test('screen workspace is independent of the printable document and preserves station fields and values',()=>{const model={patient:{name:'Test <safe>',hn:'TEST-HN'},data:{height:'170',blood:true},autoSelections:{blood:['CBC']},mappingWarnings:['Unknown <item>']};const html=T.workspaceDocument(model,true);assert(!html.includes('<header class="patient"'));assert.match(html,/role="tablist"/);assert(!html.includes('FM-CHU-004'));assert(!html.includes('CHECK UP CHECK LIST'));assert.match(html,/data-nav-jump="lab"/);assert.match(html,/value="170"/);assert(!html.includes('Test &lt;safe&gt;'));assert(!html.includes('Unknown <item>'));assert.match(T.document(model),/CHECK UP CHECK LIST/);assert.match(T.document(model),/FM-CHU-004/);assert.equal(model.data.blood,true)});

test('station dependencies and mapped order names apply to PDF without exposing inactive entries',()=>{const model={data:{urineSelected:true,urine:'เพิ่มเติม',preInsurance:false,chestIn:'90',bookReport:'No',bookReportDetails:'hidden',consult:false,consultFor:'hidden'},orderDetails:{urineSelected:['D111 · Urine Examination']},checkupFormat:'ตรวจประจำปี',companyReporting:{delivery:['EMAIL','COMPANY'],conditions:'ส่งภายใน 15 วัน'}};const html=T.workspaceDocument(model,true),pdf=T.document(model);assert.match(html,/D111 · Urine Examination/);assert.match(html,/ส่งภายใน 15 วัน/);assert.match(html,/☑ Email/);assert.match(html,/ตรวจประจำปี/);assert.match(pdf,/D111 · Urine Examination/);assert(!pdf.includes('hidden'));assert.equal(T.effectiveData(model).chestIn,'');assert.equal(T.enabled({bookReport:'Yes'},'bookReportDetails'),true);assert.equal(T.enabled({doctorEnabled:false,doctor:'legacy'},'doctor'),false);assert.match(T.workspaceDocument({data:{doctor:'legacy'}},true),/value="legacy"/);});
test('PDF cache coalesces identical requests, invalidates changed content, respects TTL and evicts bounded entries',async()=>{const {makePdfCache}=require('./navigation-sheet');let calls=0,time=0;const cache=makePdfCache(async model=>{calls++;return Buffer.from(JSON.stringify(model))},{now:()=>time,ttlMs:10,maxEntries:2,maxBytes:1000});const a={recordKey:'A',revision:1,data:{height:'170'}};const [first,second]=await Promise.all([cache(a),cache(a)]);assert.equal(calls,1);assert.equal(first,second);await cache({...a,data:{height:'171'}});assert.equal(calls,2);await cache({...a,recordKey:'B'});assert.equal(calls,3);await cache(a);assert.equal(calls,4);time=11;await cache(a);assert.equal(calls,5);let release;const gate=new Promise(r=>release=r),limited=makePdfCache(async()=>{await gate;return Buffer.from('pdf')});const x=limited({recordKey:'X'}),y=limited({recordKey:'Y'});await assert.rejects(limited({recordKey:'Z'}),e=>e.status===429);release();await Promise.all([x,y]);});
test('printed Register groups format and certificate rows; doctor certificates have full width',()=>{
 const html=T.document({checkupFormat:'ประจำปี',data:{certificateEnabled:true,certificateIds:['TH','EN']},certificateCatalog:[{id:'TH',name:'ภาษาไทย'},{id:'EN',name:'English'}]});
 const register=html.match(/<section class="station register">([\s\S]*?)<\/section>/)[1];
 assert.equal((html.match(/รูปแบบการตรวจสุขภาพ:/g)||[]).length,1);assert(register.includes('ประจำปี'));
 for(const label of ['ตรวจตาม Package','ตรวจตามบริษัทคู่สัญญา','ตรวจสุขภาพก่อนทำประกันชีวิต'])assert(!register.includes(label));
 assert.match(register,/certificate-other-row[^>]*repeat\(3[^]*ใบรับรองแพทย์อื่น ๆ[^]*รายละเอียด[^]*register-row[^]*วัคซีน/);
 assert.match(html,/class="entry paper-wide"><span>ต้องการใบรับรองแพทย์<\/span><span class="answer">ภาษาไทย\nEnglish/);
});
test('PDF registration room, physician and allergies appear once inside patient header',()=>{
 const html=T.document({data:{room:'R123',attendingPhysician:'Doctor Test',headerAllergies:'Allergy Test'}});
 const header=html.match(/<header class="patient">([\s\S]*?)<\/header>/)[1];
 const register=html.match(/<section class="station register">([\s\S]*?)<\/section>/)[1];
 for(const value of ['R123','Doctor Test','Allergy Test']){assert(header.includes(value));assert(!register.includes(value));assert.equal(html.split(value).length-1,1)}
 assert.match(header,/identity-registration/);
});
test('PDF shows company reporting delivery and conditions together above stations',()=>{
 const html=T.document({companyReporting:{delivery:['COMPANY','EMAIL','POSTAL'],conditions:'ส่งภายใน 15 วัน'}});
 const reporting=html.match(/<div class="paper-reporting">([\s\S]*?)<\/div><\/div>/)[1];
 for(const label of ['ส่ง Company','Email','ไปรษณีย์','ส่งภายใน 15 วัน'])assert(reporting.includes(label));
 assert(html.indexOf('paper-reporting\"><b>')<html.indexOf('<main class="grid">'));
 assert.match(T.document({companyReporting:{delivery:['EMAIL'],conditions:''}}),/ช่องทางรับผล: <span class="paper-value">Email/);
});
test('Assessment groups retain every field once; medication and vaccine stay editable and printable',()=>{
 const data={medication:'มียา',receiveVaccine:'Yes',doctorFee:'legacy hidden'};
 const html=T.document({data}),workspace=T.workspaceDocument({data},true);
 assert.equal((html.match(/<fieldset class="assessment-box">/g)||[]).length,3);
 assert.equal((workspace.match(/workspace-group assessment-workspace-group/g)||[]).length,3);
 for(const f of T.sections[1].fields)assert.equal((workspace.match(new RegExp('data-nav-field="'+f.key+'"','g'))||[]).length,1,f.key);
 assert.match(workspace,/data-nav-field="receiveVaccine"/);assert.match(workspace,/data-nav-field="medication"/);
 assert(!workspace.includes('ค่าแพทย์'));assert(!html.includes('legacy hidden'));assert.match(html,/discharge-billing/);
 assert.match(html,/มียา/);assert.match(html,/Yes/);assert(!html.includes('อิง FM-CHU'));
 assert.deepEqual(T.normalize({medication:'ไม่มียา',receiveVaccine:'No'}),{medication:'ไม่มียา',receiveVaccine:'No'});
});
test('HN QR uses only embedded PNG images, with no image when HN is empty',async()=>{
 const qr=await require('qrcode').toDataURL('01-26-000001',{margin:4,width:240});
 assert.match(T.document({patient:{hn:'01-26-000001'},hnQrDataUrl:qr}),/alt="QR Code HN 01-26-000001"/);
 assert(!T.document({patient:{hn:''},hnQrDataUrl:qr}).includes('<img'));
 assert(!T.document({patient:{hn:'HN'},hnQrDataUrl:'https://example.com/image.png'}).includes('<img'));
});
test('X-ray and Cardio Other map order names into gated editable and printed detail fields, preserving legacy notes',()=>{
 const model={data:{xrayOtherSelected:true,cardioOtherSelected:true,cardioOther:'เพิ่มเติม'},orderDetails:{xrayOtherSelected:['CT · Other imaging'],cardioOtherSelected:['ABI · Vascular study']}};
 for(const html of [T.document(model),T.workspaceDocument(model,true)]){assert(html.includes('CT · Other imaging'));assert(html.includes('ABI · Vascular study'))}
 assert.deepEqual(T.normalize({xrayOtherSelected:false,cardioOtherSelected:true}),{xrayOtherSelected:false,cardioOtherSelected:true});
 assert(!T.document({...model,data:{...model.data,xrayOtherSelected:false}}).includes('CT · Other imaging'));
 assert(T.document({data:{xrayOther:'legacy note'}}).includes('legacy note'));
});
