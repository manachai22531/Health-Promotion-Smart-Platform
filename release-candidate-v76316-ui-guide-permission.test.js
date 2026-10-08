const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('app.html','utf8');
const js=fs.readFileSync('assets/app.js','utf8');
const css=fs.readFileSync('assets/style.css','utf8');
const server=fs.readFileSync('server.js','utf8');

test('release identity and cache bust are v7.63.16',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.16-production'/);
  assert.match(html,/style\.css\?v=7\.63\.16-guide-fullpage-permission/);
  assert.match(html,/app\.js\?v=7\.63\.16-guide-fullpage-permission/);
});

test('capybara is removed from rendered app and Guide is a topbar menu',()=>{
  assert.doesNotMatch(html,/app-capybara|mascot-doctor-tip|menu-guide-mascot/i);
  assert.doesNotMatch(js,/menuGuideMascot|guideMascotWave/);
  assert.match(html,/href="assets\/vimut-logo\.png" id="appFavicon"/);
  assert.match(html,/class="nav-button guide-nav-button" id="menuGuideToggle"/);
  assert.equal((html.match(/id="menuGuideToggle"/g)||[]).length,1);
});

test('program name is removed from header while database status remains',()=>{
  assert.doesNotMatch(html,/<span class="header-product">Health Check Up · Smart Search<\/span>/);
  assert.match(html,/id="databaseTitle"/);
  assert.match(html,/id="importInfo"/);
});

test('Worklist and EMR are full-page workspaces',()=>{
  assert.match(html,/class="app-view workspace-fullpage" id="worklistView"/);
  assert.match(html,/class="app-view workspace-fullpage" id="emrView"/);
  assert.match(css,/#worklistView\.workspace-fullpage,#emrView\.workspace-fullpage/);
  assert.match(css,/#emrView\.workspace-fullpage \.emr-book-workbench/);
  assert.match(css,/#worklistView\.workspace-fullpage \.workflow-table-card/);
});

test('top navigation and permission tree cover the same 21 menus including OCR',()=>{
  const nav=[...html.matchAll(/<(?:button|a)[^>]+class="nav-button[^>]+data-permission="([^"]+)"/g)].map(m=>m[1]);
  const treeBlock=js.split('const MENU_PERMISSION_TREE=[',2)[1].split('];',1)[0];
  const masters=[...treeBlock.matchAll(/master:'([^']+)'/g)].map(m=>m[1]);
  assert.equal(nav.length,21);
  assert.equal(masters.length,21);
  assert.deepEqual(new Set(nav),new Set(masters));
  assert.ok(nav.includes('ocrDocumentView'));
  assert.match(treeBlock,/id:'ocrDocument'.*master:'ocrDocumentView'.*ocrDocumentManage/);
});

test('every declarative data-permission key exists in permission catalog',()=>{
  const dataPermissions=[...new Set([...html.matchAll(/data-permission="([^"]+)"/g)].map(m=>m[1]))];
  const groupBlock=js.split('const PERMISSION_GROUPS=[',2)[1].split('];\nconst PERMISSIONS=',1)[0];
  const catalog=new Set([...groupBlock.matchAll(/\['([^']+)','[^']*'\]/g)].map(m=>m[1]));
  const missing=dataPermissions.filter(key=>!catalog.has(key));
  assert.deepEqual(missing,[]);
});

test('OCR direct page and mutating APIs require staff permissions server-side',()=>{
  const pageGuard=server.indexOf("app.get('/ocr-review-mockup.html',staffPagePermissionRequired('ocrDocumentView')");
  const staticServe=server.indexOf('app.use(express.static(__dirname');
  assert.ok(pageGuard>=0 && pageGuard<staticServe,'OCR page guard must run before express.static');
  assert.match(server,/app\.post\('\/api\/ocr\/scan\/session',localOnly,staffPermissionRequired\('ocrDocumentManage'\)/);
  assert.match(server,/app\.get\('\/api\/ocr\/setup',localOnly,staffPermissionRequired\('ocrDocumentView'\)/);
  assert.match(server,/app\.put\('\/api\/ocr\/setup',localOnly,staffPermissionRequired\('ocrDocumentManage'\)/);
  assert.match(server,/app\.get\('\/api\/ocr\/export-records',localOnly,staffPermissionRequired\('ocrDocumentView'\)/);
  assert.match(server,/app\.post\('\/api\/ocr\/export-records',localOnly,staffPermissionRequired\('ocrDocumentManage'\)/);
  assert.match(server,/app\.delete\('\/api\/ocr\/export-records',localOnly,staffPermissionRequired\('ocrDocumentManage'\)/);
});


test('Doctor is an explicit locked System Role in permission UI',()=>{
  assert.match(js,/const locked=role\.id==='admin'\|\|isDoctorRole\(role\)\|\|!can\('permissionManage'\)/);
  assert.match(js,/role\.id!=='admin'&&!isDoctorRole\(role\)/);
  assert.match(js,/Role Doctor เป็น System Role และถูกล็อกให้ใช้เฉพาะ EMR/);
  assert.match(js,/if\(!role\|\|role\.id==='admin'\|\|isDoctorRole\(role\)\)return true/);
  assert.match(js,/ชื่อ Doctor \/ แพทย์ เป็นชื่อ System Role ที่สงวนไว้/);
});

test('Guide mutations require authenticated staff guideManage permission',()=>{
  assert.match(server,/const guideManageRequired=staffPermissionRequired\('guideManage'\)/);
  assert.match(server,/app\.patch\('\/api\/guide-documents\/:viewId\/text',localOnly,guideManageRequired/);
  assert.match(server,/app\.put\('\/api\/guide-documents\/:viewId',localOnly,guideManageRequired/);
  assert.match(server,/app\.delete\('\/api\/guide-documents\/:viewId',localOnly,guideManageRequired/);
  assert.match(server,/req\.staffUser\?\.displayName\|\|req\.staffUser\?\.username/);
  assert.doesNotMatch(server,/const guideManageRequired=async\(req,res,next\).*x-guide-user/s);
});

test('v7.63.15 Booking Payor add fix remains in place',()=>{
  assert.match(js,/payorCode=masterSelectedCode\(input\?\.value\)/);
  assert.match(js,/planCode=masterSelectedCode\(\$\('#projectPayorPlanInput'\)\?\.value\)/);
  assert.match(js,/officeCode=masterSelectedCode\(\$\('#projectPayorOfficeInput'\)\?\.value\)/);
  assert.match(js,/\/api\/his-payors\/selection\?payorCode=/);
});
