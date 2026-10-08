'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('assets/app.js','utf8');
const html=fs.readFileSync('app.html','utf8');
const server=fs.readFileSync('server.js','utf8');

function logicContext(initialState){
  const start=app.indexOf('function resolveMultiCompanyCodes');
  const end=app.indexOf('function companyFolderPackageExportCell',start);
  assert.ok(start>0&&end>start);
  const context={
    state:JSON.parse(JSON.stringify(initialState)),
    norm:value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' '),
    uid:(prefix='id')=>`${prefix}-generated`,
    console
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start,end),context);
  return context;
}

test('release is v7.63.44 production-only',()=>{
  assert.match(server,/RELEASE_NAME = 'v7\.63\.44-production'/);
  assert.match(server,/const RUNTIME_ENVIRONMENT = 'production'/);
});

test('new template separates current/new company code and legacy CompanyCode remains an alias',()=>{
  assert.match(html,/CurrentCompanyCode, NewCompanyCode/);
  const aliases=app.slice(app.indexOf('const COMPANY_FOLDER_HEADER_ALIASES'),app.indexOf('function companyFolderHeaderKey'));
  assert.match(aliases,/currentCompanyCode:\['currentcompanycode','current company code','companycode','company code'/);
  assert.match(aliases,/newCompanyCode:\['newcompanycode','new company code'/);
});

test('blank code for a new company is auto-generated and reused across years',()=>{
  const ctx=logicContext({companies:[{id:'y1',name:'เดิม',year:'2569',code:'005'}],records:[],packages:[]});
  const groups=[
    {name:'บริษัทใหม่',year:2569,currentCode:'',newCode:''},
    {name:'บริษัทใหม่',year:2570,currentCode:'',newCode:''}
  ];
  ctx.resolveMultiCompanyCodes(groups,ctx.state.companies);
  assert.equal(groups[0].currentCode,'006');
  assert.equal(groups[1].currentCode,'006');
  assert.equal(groups[0].code,'006');
  assert.equal(groups[0].codeGenerated,true);
});

test('changing company code updates all years while preserving company-year ids and customer records',()=>{
  const initial={
    companies:[
      {id:'year-2568',name:'ABC',year:'2568',code:'001',note:'old'},
      {id:'year-2569',name:'ABC',year:'2569',code:'001',note:'old'}
    ],
    records:[{key:'r1',companyId:'year-2568',first:'A'},{key:'r2',companyId:'year-2569',first:'B'}],
    packages:[]
  };
  const ctx=logicContext(initial);
  const groups=[{name:'ABC',year:2569,currentCode:'001',newCode:'009',code:'009',checkupStartDate:'',checkupEndDate:'',pdfPath:'',note:'updated',reportConditions:'',salesName:'',salesPhone:'',billingPackages:[],cashPackages:[]}];
  assert.equal(ctx.validateMultiCompanyGroups(groups,ctx.state.companies),true);
  const next=ctx.buildMultiCompanyState(groups);
  assert.equal(JSON.stringify(Array.from(next.companies,x=>x.id).sort()),JSON.stringify(['year-2568','year-2569']));
  assert.equal(JSON.stringify(Array.from(new Set(Array.from(next.companies,x=>x.code)))),JSON.stringify(['009']));
  assert.equal(next.companies.find(x=>x.id==='year-2569').note,'updated');
  assert.equal(JSON.stringify(next.records),JSON.stringify(initial.records));
  assert.equal(groups[0].companyId,'year-2569');
});

test('NewCompanyCode cannot overwrite another existing company code',()=>{
  const ctx=logicContext({companies:[{id:'a',name:'ABC',year:'2569',code:'001'},{id:'b',name:'XYZ',year:'2569',code:'002'}],records:[],packages:[]});
  const groups=[{name:'ABC',year:2569,currentCode:'001',newCode:'002',code:'002'}];
  assert.throws(()=>ctx.validateMultiCompanyGroups(groups,ctx.state.companies),/ถูกใช้โดย/);
});

test('export leaves NewCompanyCode blank and preserves CurrentCompanyCode',()=>{
  const flow=app.slice(app.indexOf('async function exportCompanyFolders'),app.indexOf('async function backupStateBeforeMultiCompanyImport'));
  assert.match(flow,/\['CompanyName','CurrentCompanyCode','NewCompanyCode','Year'/);
  assert.match(flow,/c\.name\|\|'',c\.code\|\|'','',c\.year/);
});
