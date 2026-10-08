const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=__dirname;
const app=fs.readFileSync(path.join(root,'assets','app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'app.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets','style.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const start=app.indexOf('function labStickerItems(record)');
const end=app.indexOf('async function printLabStickers(record)',start);
const labStickerItems=Function(`${app.slice(start,end)}; return labStickerItems;`)();

test('extracts LAB labels from nested HIS registration responses',()=>{
  const record={hn:'01-26-005681',hisLastVisitUID:'H01-26-002936',orderHisResponse:{Result:{Sticker:[
    {SID:'V26018016',SpecimenName:'Clot Tube (Routine)',SectionName:'Biochem / Immuno'},
    {Barcode:'V26018017',TubeName:'EDTA',Department:'Haematology'},
    {AccessionNo:'V26018018',ContainerName:'Urine Jar (Routine)',Quantity:1}
  ]}}};
  assert.deepEqual(labStickerItems(record),[
    {sid:'V26018016',specimen:'Clot Tube (Routine)',section:'Biochem / Immuno',itemCodes:[]},
    {sid:'V26018017',specimen:'EDTA',section:'Haematology',itemCodes:[]},
    {sid:'V26018018',specimen:'Urine Jar (Routine)',section:'',itemCodes:[]}
  ]);
});

test('keeps separate stickers when one SID has different specimen groups and ItemCodes',()=>{
  const labels=labStickerItems({registrationResponse:{Specimen:[
    {SID:'V26018031',Specimen:'Clot Tube (Routine)',SpecimenGroup:'Biochemistry',ItemCode:['C040','C061','C062','C521','C600','C640','C650'],Amount:1},
    {SID:'V26018031',Specimen:'Clot Tube (Routine)',SpecimenGroup:'Immunology',ItemCode:['N620'],Amount:1}
  ]}});
  assert.equal(labels.length,2);
  assert.deepEqual(labels.map(x=>x.itemCodes),[['C040','C061','C062','C521','C600','C640','C650'],['N620']]);
});

test('prints the requested 50 x 25 mm layout and exposes the customer-search button',()=>{
  assert.match(app,/@page\{size:50mm 25mm;margin:0\}/);
  assert.match(app,/data-print-lab-stickers=/);
  assert.match(app,/พิมพ์ Sticker LAB/);
  assert.match(app,/record\.orderHisResponse=result\.response\|\|null/);
  assert.match(app,/r\.openVisitResponse=result\.response\|\|null/);
});

test('LAB barcode fills the label width without clipping Age',()=>{
  assert.match(app,/preserveAspectRatio="none"/);
  assert.match(app,/width:47mm!important;height:9\.3mm!important/);
  assert.match(app,/ItemCode: /);
  assert.match(app,/grid-template-columns:minmax\(0,1\.45fr\) 3\.5mm minmax\(0,1fr\) auto/);
  assert.match(app,/demographic-info span:last-child\{overflow:visible/);
});

test('existing station tables are upgraded before station scanning',()=>{
  assert.match(server,/ALTER TABLE checkup_station_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  assert.match(server,/updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  assert.match(server,/app\.post\('\/api\/station-scan\/:id'/);
});

test('release metadata and browser cache use v7.62.25',()=>{
  assert.match(server,/v7\.62\.25-organization-book-tabs-and-columns/);
  assert.match(html,/style\.css\?v=7\.62\.25/);
  assert.match(html,/app\.js\?v=7\.62\.25/);
});

test('company-folder import skips patient verification and preserves customer records',()=>{
  assert.match(server,/express\.json\(\{ limit: '100mb' \}\)/);
  const start=app.indexOf('async function prepareMultiCompanyImport');
  const end=app.indexOf('function parsePackages',start);
  const companyFolderFlow=app.slice(start,end);
  assert.doesNotMatch(companyFolderFlow,/verifyCustomerImport/);
  const buildStart=app.indexOf('function buildMultiCompanyState');
  const buildEnd=app.indexOf('async function backupStateBeforeMultiCompanyImport',buildStart);
  assert.doesNotMatch(app.slice(buildStart,buildEnd),/next\.records\s*=/);
});

test('booking exposes an HN history check without opening a visit',()=>{
  assert.match(app,/data-check-booking-hn=/);
  assert.match(app,/async function checkBookingHn/);
  assert.match(app,/ยังไม่ได้เปิด Visit ใหม่/);
});

test('large-data refresh checks revision before downloading state',()=>{
  assert.match(server,/app\.get\('\/api\/state\/revision'/);
  assert.match(server,/Content-Encoding','gzip/);
  assert.match(app,/fetch\('\/api\/state\/revision'/);
  assert.match(app,/Number\(meta\.revision\|\|0\)===Number\(state\._revision\|\|0\)/);
});

test('Get Visit retries transient HIS gateway errors without retrying write commands',()=>{
  assert.match(server,/systemCode==='GET_VISIT'/);
  assert.match(server,/HTTP 50\[234\]/);
  assert.match(server,/retryAttempt<2/);
});

test('worklist receives EMR directly when HN and VisitUID are already available',()=>{
  const functions=[...app.matchAll(/async function receiveWorklistEmrOnly[\s\S]*?return worklistEmrGroupSummary\(record\);\s*}/g)].map(match=>match[0]);
  assert.ok(functions.length>=1);
  for(const source of functions){assert.match(source,/direct\?'\/api\/his\/emr':'\/api\/his\/checkup-result'/);assert.match(source,/VisitUID:directVisitUID/)}
});

test('customer detail merges year into the company field',()=>{
  assert.match(app,/บริษัท \/ Company · ปี/);
  assert.match(app,/companyYearFields\[1\]\.remove\(\)/);
});

test('menu order settings are collapsed and moved to the bottom',()=>{
  assert.match(html,/<details class="api-card nav-order-settings"/);
  assert.match(html,/การตั้งค่าลำดับเมนู/);
  assert.match(app,/\$\('#apiView'\)\.append\(navOrderSettings\)/);
});

test('health book keeps One Page structure and uses the consolidated footer workflow',()=>{
  assert.match(app,/healthBookOnePageProgress/);
  assert.match(app,/สรุปผลการตรวจสุขภาพรายบุคคล ประจำปี/);
  assert.match(app,/ประวัติสุขภาพ \(Past History\)/);
  assert.match(app,/รายการตรวจ<\/th><th>ผล<\/th><th>ค่าปกติ<\/th><th>สรุปผล<\/th><th>แปลผล/);
  assert.match(html,/healthBookFooterReceiveEmr/);
  assert.match(html,/healthBookFooterPreview/);
  assert.match(html,/clearAllHisInterpret/);
  assert.doesNotMatch(html,/healthBookOnePageTranslate/);
  assert.doesNotMatch(html,/healthBookOnePageApprove/);
});

test('LAB scanner navigation follows Station Dashboard and uses the transparent icon asset',()=>{
  assert.ok(html.indexOf('data-view="stationDashboardView"')<html.indexOf('data-view="labScannerView"'));
  assert.ok(html.indexOf('data-view="labScannerView"')<html.indexOf('data-view="stationCheckinView"'));
  assert.match(html,/assets\/nav\/lab-scanner-tube\.png/);
});

test('station status cards are interactive and operations enrich missing booking HN',()=>{
  for(const status of ['WAITING','IN_SERVICE','COMPLETE'])assert.match(html,new RegExp(`data-station-scan-filter="${status}"`));
  assert.match(app,/stationScanListFilter/);
  assert.match(server,/recordMap\.get\(String\(item\.record_key/);
  assert.match(server,/UPDATE checkup_bookings SET hn=\$2/);
});

test('custom cursor wins over component pointer declarations',()=>{
  assert.match(css,/button:not\(:disabled\).*cursor-hand-pointer-v2\.png[^}]+!important/);
});

test('LAB scanner sends Collect as Success, supports Cancel, and rejects successful duplicates before HIS',()=>{
  assert.match(html,/id="labScannerCollect"[^>]*>Collect</);
  assert.match(html,/id="labScannerCancel"[^>]*>Cancel</);
  assert.match(app,/labScannerLookup\('Success'\)/);
  assert.match(app,/labScannerLookup\('Cancel'\)/);
  assert.match(server,/scanStatus=requestedStatus\.toLowerCase\(\)==='cancel'\?'Cancel':'Success'/);
  assert.match(server,/AND success=TRUE ORDER BY scanned_at DESC/);
  assert.match(server,/duplicate:true/);
});

test('LAB Scanner menu is ordered after Station Dashboard and cursor assets are reduced',()=>{
  assert.match(css,/labScannerView"\]\{order:6\}/);
  assert.match(css,/cursor-hand-pointer-v2\.png"\) 5 4/);
  assert.match(css,/cursor-hand-disabled\.png"\) 24 24/);
});

test('Station Dashboard manages named display sets without navigating to Order and Station',()=>{
  assert.match(html,/id="stationDashboardSetSelect"/);
  assert.match(html,/id="stationDisplaySetOverlay"/);
  assert.match(html,/id="stationDisplaySetStations"/);
  assert.match(app,/data\.stationDisplaySets=Array\.isArray/);
  assert.match(app,/function saveStationDisplaySet\(/);
  const setup=app.slice(app.indexOf('function openStationSetupFromDashboard'),app.indexOf('async function openStationLargeDisplay'));
  assert.match(setup,/stationDisplaySetOverlay/);
  assert.doesNotMatch(setup,/showView\('orderSetupView'\)|orderStationChips/);
});

test('LAB SID scanner uses the protected server-side HIS connection',()=>{
  assert.match(html,/id="labScannerView"/);
  assert.match(html,/id="labScannerSid"/);
  assert.match(app,/fetch\('\/api\/his\/lab-lookup'/);
  assert.match(server,/system_code.*LAB_SID_LOOKUP/);
  assert.match(server,/requestBody=\{ContextKey:.*DateTime:bangkokHisDateTime\(\),SID:sid,Status:scanStatus,VisitUID:meta\.visitUID\}/);
  assert.match(server,/CREATE TABLE IF NOT EXISTS lab_scan_logs/);
  assert.match(server,/\/api\/his\/lab-scan-report\.csv/);
  const scannerClient=app.slice(app.indexOf('// LAB SID scanner'));
  assert.doesNotMatch(scannerClient,/HIS_LAB_API_KEY|x-api-key/i);
});

test('OpenVisit requires a real Booking and never exposes the technical fallback',()=>{
  assert.match(server,/ไม่พบ Booking ของโครงการ กรุณาเพิ่มบุคคลเข้า Booking ก่อน OpenVisit/);
  assert.match(server,/p\.project_code<>'HIS-OPEN-VISIT'/);
  assert.match(server,/INSERT INTO checkup_visits\(id,booking_id,visit_date,checkin_at,vn,location,visit_status,updated_by\)/);
  assert.doesNotMatch(server,/await ensureLegacyStationVisitsV76176\(date\)/);
  assert.match(app,/ไม่พบ Booking ของโครงการ กรุณาเพิ่มบุคคลเข้า Booking ก่อน OpenVisit/);
});

test('selected 3D cursor states and stable batch processing dialog are active',()=>{
  assert.match(css,/cursor-hand-pointer-v2\.png/);
  assert.match(css,/cursor-hand-disabled\.png/);
  assert.match(css,/cursor-hourglass-loading\.png/);
  assert.match(html,/processingDetail/);
  assert.match(css,/@keyframes processing-spin/);
});

test('worklist is keyed by successful OpenVisit time and refreshes existing visit dates',()=>{
  assert.match(server,/record=>record\.openVisitAt&&String\(record\.hisLastVisitUID/);
  assert.match(server,/bangkokDate\(record\.openVisitAt\)===date/);
  assert.match(server,/checkin_at=EXCLUDED\.checkin_at/);
  assert.match(server,/await ensureLegacyStationVisits\(date\)/);
  assert.match(server,/bangkokDateKey\(r\.openVisitAt\)!==date/);
});

test('successful HIS commands are persisted in the customer audit log',()=>{
  for(const action of ['OPEN_VISIT','CANCEL_VISIT','ORDER_HIS','CANCEL_ORDER','CHARGE_CLOSE']){
    assert.match(server,new RegExp(`hisActionAudit\\(req,state,record,'${action}'`));
  }
  assert.match(server,/INSERT INTO checkup_audit_log/);
});

test('worklist uses queue status without legacy status, progress, or employee columns',()=>{
  assert.match(html,/สถานะการตรวจ/);
  assert.doesNotMatch(html,/Station \/ Progress/);
  assert.match(app,/operationStatusLabel\(queueStatus\)/);
  assert.doesNotMatch(app,/<strong>\$\{esc\(x\.current_station\|\|'-'\)\}<\/strong><small>\$\{Number\(x\.station_progress/);
});

test('technical HIS OpenVisit bookings are removed and remain hidden from project lists',()=>{
  assert.match(server,/DELETE FROM checkup_projects WHERE project_code='HIS-OPEN-VISIT'/);
  assert.match(app,/project_code\|\|''\)!=='HIS-OPEN-VISIT'/);
});

test('unused HIS package type and company controls are removed',()=>{
  assert.doesNotMatch(html,/id="hisPackageTypeFilter"/);
  assert.doesNotMatch(html,/id="hisPackageCompanyFilter"/);
  assert.doesNotMatch(html,/id="saveSelectedHisPackageType"/);
  assert.doesNotMatch(html,/id="saveSelectedHisPackageCompany"/);
});

test('customer action buttons render initially without a price summary',()=>{
  assert.match(app,/function ensureInitialCardActionButtons/);
  assert.match(app,/ensureInitialCardActionButtons\(matches\)/);
  assert.doesNotMatch(app,/<span class="card-price-summary">/);
  assert.match(css,/\.post-checkup-tools>button\{flex:1 1 88px/);
});


test('worklist EMR receive is silent and result status is numeric total/done',()=>{
  assert.match(app,/function receiveWorklistEmrOnly/);
  assert.match(app,/worklist-result-count/);
  assert.match(app,/summary\.total\.toLocaleString\('th-TH'\).*summary\.done\.toLocaleString\('th-TH'\)/s);
  assert.match(app,/function worklistEmrGroupSummary/);
  assert.match(app,/รอผลตรวจ\|pending\|waiting/);
  assert.match(app,/seen\.size/);
  assert.doesNotMatch(app,/Group \/ มีผลแล้ว/);
});

test('health history is editable and EMR uses the inline health book workspace',()=>{
  assert.match(app,/data-save-health-history/);
  assert.match(app,/data-health-history-field/);
  assert.match(html,/id="emrQueueRows"/);
  assert.match(html,/class="emr-workbench emr-book-workbench"/);
  assert.match(html,/id="emrSentDateFrom"/);
  assert.match(html,/id="emrSentDateTo"/);
  assert.match(app,/function emrSentTime/);
  assert.match(app,/emrSentTime\(b\)-emrSentTime\(a\)/);
  assert.match(app,/data-emr-case/);
  assert.match(html,/id="saveEmrDraft"[^>]*>แบบร่าง</);
  assert.match(html,/id="approveEmrBook"[^>]*>อนุมัติเล่ม</);
  assert.match(app,/saveActiveEmrCase\('APPROVED'\)/);
  assert.match(html,/id="emrInlineBookContent"/);
  assert.match(app,/host\.innerHTML=hisHealthBookHtml/);
  assert.match(app,/emrInlineBookContent'\)\.onclick=\$\('#hisEmrContent'\)\.onclick/);
  assert.doesNotMatch(html,/id="removeEmrCase"/);
  assert.doesNotMatch(app,/function removeActiveEmrCase/);
  assert.doesNotMatch(app,/data-emr-healthbook/);
});

test('functional login uses the new square mockup asset',()=>{
  assert.match(html,/class="login-v76209-brand"/);
  assert.match(css,/login-v76209-square\.png/);
  assert.match(css,/grid-template-columns:50% 50%/);
});

test('interpret setup uses category and GroupName levels without item interpretation',()=>{
  assert.match(html,/id="interpretCategoryList"/);
  assert.match(html,/id="interpretCategoryText"/);
  assert.match(html,/id="interpretTemplateCategory"/);
  assert.match(html,/ไม่มีการแปลผลย่อยรายรายการ/);
  assert.doesNotMatch(html,/id="interpretTemplateItemRows"/);
  assert.match(app,/const INTERPRET_CATEGORIES=/);
  for(const category of ['MEDICAL_INFORMATION','PHYSICAL_EXAMINATION','HEMATOLOGY','GASTROINTESTINAL_SYSTEM','METABOLIC_ELECTROLYTES','INFECTIOUS_DISEASE','IMMUNOLOGY'])assert.match(app,new RegExp(category));
  assert.match(app,/interpretCategoryTemplates/);
  assert.match(app,/Category Interpret/);
  assert.match(app,/CategoryName:categoryName/);
  assert.match(app,/row\.Category\?\?row\.CategoryName/);
  assert.match(app,/availableTemplateId=template\?\.id\|\|''/);
  assert.doesNotMatch(app,/edit\.notes=applicable\.map/);
  assert.doesNotMatch(app,/data-open-item-interpret/);
  assert.doesNotMatch(app,/แปลผลรายการ \(/);
});

test('Health Book offers safe automatic GroupName interpretation',()=>{
  assert.match(html,/id="autoInterpretEmrBook"/);
  assert.match(html,/id="autoInterpretHisResult"/);
  assert.match(app,/function autoInterpretGroupStatus/);
  assert.match(app,/function automaticInterpretFallback/);
  assert.match(app,/source:matched\.length\?'AUTO_TEMPLATE':'AUTO_FALLBACK'/);
  assert.match(app,/ไม่ทับข้อความแพทย์/);
  assert.match(app,/interpretNoteMatchesRecord\(note,record\)/);
  assert.match(app,/note\.ageMin===0&&note\.ageMax===0/);
  assert.match(app,/note\.autoImproved=true/);
  assert.match(html,/id="translateSelectedResultsButton"[^>]*>แปลผลอัตโนมัติทั้งหมด</);
  assert.match(html,/id="translateGroupResultsButton"[^>]*>ผลรายกลุ่ม</);
  assert.match(app,/beginProcessing\('กำลังแปลผลอัตโนมัติทั้งหมด'/);
  assert.match(app,/beginProcessing\('กำลังแปลผลอัตโนมัติ',1\)/);
  assert.match(app,/setProcessingProgress\(records\.length,records\.length,'กำลังบันทึกผลทั้งหมดลง PostgreSQL…'\)/);
  assert.match(app,/translateGroupResultsButton'\)\)\$\('#translateGroupResultsButton'\)\.onclick=openSelectedGroupResults/);
});

test('compact operations UI exposes dense reusable layout and fast clinical saves',()=>{
  assert.match(css,/v7\.62\.11 — compact operations UI/);
  assert.match(css,/--ui-control-h:36px/);
  assert.match(css,/\.table-wrap thead th/);
  assert.match(css,/\.modal-footer\{position:sticky/);
  assert.match(app,/function compactSaveTarget/);
  assert.match(app,/event\.ctrlKey\|\|event\.metaKey/);
  assert.match(app,/async function persistRecordNow/);
  assert.match(server,/app\.patch\('\/api\/state\/records\/:recordKey'/);
  assert.match(server,/jsonb_array_elements/);
  assert.match(app,/persistHealthBookClinicalEdits\(record\).*persistRecordNow\(record\)/);
  assert.match(app,/persistHealthBookInterpret\(record\).*persistRecordNow\(record\)/);
});

test('doctor workflow requires explicit assignment and exposes only the shared structured EMR editor',()=>{
  assert.match(app,/id:'doctor',name:'Doctor',permissions:\['emrView','emrEdit'\]/);
  assert.match(app,/function doctorUsers/);
  assert.match(app,/function emrCaseBelongsToCurrentDoctor/);
  assert.match(app,/assignmentAudit\.push/);
  assert.match(html,/id="emrAssignmentDoctor"/);
  assert.match(html,/id="emrInlineBookContent"/);
  for(const label of ['Head','Eyes','Ears','Nose','Throat','Neck','Oral Cavity','Heart','Lungs','Abdomen','Extremities','Skin'])assert.match(app,new RegExp(`'${label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));
  assert.doesNotMatch(html,/id="emrCaseStatus"/);
  assert.doesNotMatch(html,/id="emrAssignedTo"/);
});

test('draft and approval update EMR status without generating an approval PDF',()=>{
  assert.match(app,/syncEmrCaseStatusFromRecord/);
  assert.match(app,/บันทึกสถานะโดยไม่สร้าง PDF/);
  const approvalHandler=app.match(/if\(\$\('#approveHisResult'\)\).*?if\(\$\('#sendHisResult'\)\)/s)?.[0]||'';
  assert.doesNotMatch(approvalHandler,/rebuildApprovedHealthBookPdf/);
  assert.match(html,/id="emrStatusFilter"/);
  assert.match(html,/id="emrDoctorFilter"/);
});

test('EMR actions show live progress and persist only the active case',()=>{
  assert.match(html,/id="emrActionStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(app,/function setEmrActionStatus/);
  assert.match(app,/กำลังรอข้อมูลจาก HIS/);
  assert.match(app,/deferPersist:true/);
  assert.match(app,/persistRecordNow\(record,\{emrCase:item\}\)/);
  assert.match(app,/function updateEmrStatusUi/);
  assert.match(app,/host\.dataset\.emrRenderKey===renderKey/);
  assert.match(app,/prepareEmrView\(refreshFromWorklist=false\).*if\(!refreshFromWorklist\)return/s);
  assert.match(server,/data->'emrQueue'/);
});

test('Booking exposes eight bulk HIS controls and multi-case doctor assignment',()=>{
  const toolbar=html.match(/id="bookingBulkHisActions"[\s\S]*?<\/div>/)?.[0]||'';
  assert.equal((toolbar.match(/<button/g)||[]).length,8);
  assert.match(toolbar,/data-booking-hn-action="lookup"/);
  assert.match(toolbar,/data-booking-hn-action="create"/);
  assert.match(html,/id="assignSelectedDoctorButton"/);
  assert.match(html,/booking-project-meta-top/);
  assert.match(app,/function runBookingBulkHn/);
  assert.match(app,/\/api\/patient-lookup\/batch/);
  assert.match(app,/function forwardSelectedBookingCasesToEmr/);
  assert.match(app,/เลือกแพทย์ครั้งเดียวสำหรับทุกเคส/);
  assert.match(css,/v7\.62\.13 — Project Booking workspace/);
});

test('main search exposes company lookup and contract package print supports one A4 page',()=>{
  assert.match(html,/id="companyQuickLookup"/);
  assert.match(html,/id="openCompanyQuickLookup"/);
  assert.match(app,/function openCompanyQuickLookup/);
  assert.match(html,/id="printSelectedPackagesOnePage"/);
  assert.match(html,/id="summaryPrintSelectedOnePage"/);
  assert.match(app,/function printSelectedContractPackagesOnePage/);
  assert.match(app,/@page\{size:A4 landscape;margin:5mm\}/);
  assert.doesNotMatch(app,/renderProjectBookings\(\)/);
  assert.match(app,/await persistStateNow\(\);applyWorkflowBookingFilters\(\)/);
});

test('customer detail saves personal information and packages separately through the single-record path',()=>{
  assert.match(html,/id="saveCustomerDetail"[\s\S]*?บันทึกข้อมูลส่วนบุคคล/);
  assert.match(html,/id="saveCustomerPackages"[\s\S]*?บันทึกแพ็กเกจ/);
  const splitSave=app.slice(app.indexOf('async function saveCustomerPersonalSection'),app.indexOf('const renderAllV76197'));
  assert.match(splitSave,/async function saveCustomerPackageSection/);
  assert.match(splitSave,/persistRecordNow\(r\)/);
  assert.match(splitSave,/CUSTOMER_PERSONAL/);
  assert.match(splitSave,/CUSTOMER_PACKAGES/);
  assert.doesNotMatch(splitSave,/fetch\('\/api\/state'/);
  assert.doesNotMatch(splitSave,/beginProcessing\([^\n]*,4\)/);
});

test('organization book uses top navigation, Booking GroupName readiness and combined PDF',()=>{
  assert.match(html,/data-view="organizationBookView"/);
  assert.match(html,/id="organizationBookBooking"/);
  assert.match(html,/id="organizationBookGroupTree"/);
  assert.match(html,/id="organizationBookCoverSetup"/);
  assert.match(app,/function renderOrganizationBook\(/);
  assert.match(server,/app\.post\('\/api\/organization-health-book-pdf'/);
  assert.match(server,/_reportGroupKeys/);
});

test('Interpret master supports ControlID conditions multilingual CRUD and spreadsheet exchange',()=>{
  for(const id of ['interpretTemplateType','interpretTemplateResultCategory','interpretTemplateControlId','interpretTemplateHead','interpretTemplateCondition','interpretTemplateSuggest1','interpretTemplateLang2','interpretTemplateSuggest2','interpretTemplateLang3','interpretTemplateLang4','interpretTemplateLang5','interpretTemplateLang6'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/data-edit-interpret-note/);
  assert.match(app,/ControlID:note\.controlId/);
  assert.match(app,/SuggestLang1:note\.suggest1/);
});

test('large customer search and common saves use fast bounded paths',()=>{
  assert.match(app,/const customerSearchIndex=new WeakMap\(\)/);
  assert.match(app,/allMatches\.slice\(0,120\)/);
  assert.match(app,/setTimeout\(search,120\)/);
  assert.match(app,/\/api\/customer-search/);
  assert.match(app,/ค้นหาจาก PostgreSQL/);
  assert.match(server,/app\.get\('\/api\/customer-search'/);
  assert.match(server,/company_customers cc JOIN customers c/);
  assert.doesNotMatch(app,/importSource:source/);
  const confirmStart=app.indexOf("$('#confirmCheckup').onclick");
  const confirm=app.slice(confirmStart,app.indexOf("$('#resultRows').addEventListener",confirmStart));
  assert.match(confirm,/persistRecordNow\(r\)/);
  assert.doesNotMatch(confirm,/fetch\('\/api\/state'/);
  assert.match(server,/compressedStateCache\.body[\s\S]*?SELECT revision FROM app_state/);
  assert.match(server,/current\.relational_changed/);
});

test('OpenVisit selects an exact project Booking and package-detail print is removed',()=>{
  assert.doesNotMatch(html,/id="printCustomerPackage"/);
  assert.match(html,/id="openVisitBooking"/);
  assert.match(app,/bookingId=\$\('#openVisitBooking'\)\?\.value/);
  assert.match(app,/JSON\.stringify\(\{recordKey:r\.key,bookingId,payor/);
  assert.match(server,/Booking ที่เลือกไม่ตรงกับผู้รับบริการหรือถูกยกเลิกแล้ว/);
  assert.match(server,/record\.openVisitBookingId=selectedBooking\.booking_id/);
  assert.match(server,/hasBooking:bookings\.length>0,bookings,items/);
});
