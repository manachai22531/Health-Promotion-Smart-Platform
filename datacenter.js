'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function registerDataCenter(app,{localOnly,rootDir=__dirname,settingsPool=null,encryptPassword=(v)=>String(v||''),decryptPassword=(v)=>String(v||''),configSessionRequired=(_req,_res,next)=>next()}={}){
  const radiologyConfigPath=path.join(rootDir,'datacenter-radiology-config.json');
  const patientPackageConfigPath=path.join(rootDir,'datacenter-patient-package-config.json');
  const readJson=p=>{try{return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null}catch(_){return null}};
  const RADIOLOGY_SETTING_KEY='datacenter_radiology_db_config';
  const PATIENT_PACKAGE_SETTING_KEY='datacenter_patient_package_db_config';
  async function readStoredConfig(key,legacyPath){
    if(settingsPool){
      try{const r=await settingsPool.query('SELECT value FROM system_settings WHERE key=$1 LIMIT 1',[key]);if(r.rows[0]?.value){const raw=typeof r.rows[0].value==='string'?JSON.parse(r.rows[0].value):r.rows[0].value;return {...raw,password:raw.passwordEncrypted?decryptPassword(raw.passwordEncrypted):''}}}catch(error){console.error('DataCenter config read failed',key,error.message)}
    }
    const legacy=readJson(legacyPath);if(legacy&&settingsPool){try{await saveStoredConfig(key,legacy)}catch(_){}}return legacy;
  }
  async function saveStoredConfig(key,cfg){
    if(!settingsPool)throw new Error('System settings database is unavailable');
    const stored={host:cfg.host,port:Number(cfg.port||5432),database:cfg.database,user:cfg.user,passwordEncrypted:encryptPassword(cfg.password||''),ssl:!!cfg.ssl};
    await settingsPool.query(`INSERT INTO system_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[key,JSON.stringify(stored)]);
    return cfg;
  }
  async function mergedConfig(key,legacyPath,body={}){const current=await readStoredConfig(key,legacyPath);const next=normalizeCfg(body);if(!next.password&&current?.password)next.password=current.password;return next}

  const safeCfg=c=>c?{host:String(c.host||''),port:Number(c.port||5432),database:String(c.database||''),user:String(c.user||''),ssl:!!c.ssl,hasPassword:!!c.password}:null;
  const normalizeCfg=(b={})=>({host:String(b.host||'').trim(),port:Number(b.port||5432),database:String(b.database||'').trim(),user:String(b.user||'').trim(),password:String(b.password||''),ssl:!!b.ssl});
  const poolFrom=c=>new Pool({host:c.host,port:Number(c.port||5432),database:c.database,user:c.user,password:String(c.password||''),ssl:c.ssl?{rejectUnauthorized:false}:false,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
  const errorPayload=e=>({error:e.message,code:e.code||null,detail:e.detail||null,hint:e.hint||null});
  const validateBase=c=>{if(!c.host||!c.database||!c.user||!c.password)throw new Error('Database connection is incomplete')};

  app.get('/datacenter/radiology',localOnly,(_req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(rootDir,'datacenter','radiology.html'))});
  app.get('/datacenter/patient-package',localOnly,(_req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(rootDir,'datacenter','patient-package.html'))});

  // Radiology / LAB Checker v1.16, embedded in the main Production server.
  app.get('/api/datacenter/radiology/status',localOnly,async(_req,res)=>{const c=await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath);res.json({ok:true,configured:!!c,version:'1.16.0-embedded'})});
  app.get('/api/datacenter/radiology/config',localOnly,async(_req,res)=>res.json({ok:true,config:safeCfg(await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath))}));
  app.post('/api/datacenter/radiology/config/test-live',localOnly,async(req,res)=>{
    const cfg=await mergedConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath,req.body);let p;try{validateBase(cfg);p=poolFrom(cfg);const q=await p.query(`SELECT current_database() AS database,current_user AS username,inet_server_addr()::text AS server_address,inet_server_port() AS server_port,NOW() AS server_time,version() AS version`);res.json({ok:true,target:safeCfg(cfg),info:q.rows[0]})}catch(e){res.status(400).json({ok:false,target:safeCfg(cfg),...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}
  });
  app.post('/api/datacenter/radiology/config/test-xray-live',localOnly,async(req,res)=>{
    const cfg=await mergedConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath,req.body);let p;try{validateBase(cfg);p=poolFrom(cfg);const q=await p.query(`SELECT COUNT(*)::bigint AS row_count,MIN(id) AS min_id,MAX(id) AS max_id FROM xrayresult`);res.json({ok:true,target:safeCfg(cfg),xrayresult:q.rows[0]})}catch(e){res.status(400).json({ok:false,target:safeCfg(cfg),...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}
  });
  app.post('/api/datacenter/radiology/config/save',localOnly,configSessionRequired,async(req,res)=>{try{const cfg=await mergedConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath,req.body);validateBase(cfg);await saveStoredConfig(RADIOLOGY_SETTING_KEY,cfg);res.json({ok:true,config:safeCfg(cfg)})}catch(e){res.status(400).json({ok:false,error:e.message})}});
  app.get('/api/datacenter/radiology/patient/test',localOnly,async(_req,res)=>{const cfg=await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath);if(!cfg)return res.status(400).json({ok:false,error:'Database Configuration has not been saved'});let p;try{p=poolFrom(cfg);const q=await p.query(`SELECT COUNT(*)::bigint AS row_count,MIN(id) AS min_id,MAX(id) AS max_id FROM patient WHERE isdeleted IS NOT TRUE`);res.json({ok:true,patient:q.rows[0]})}catch(e){res.status(500).json({ok:false,...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}});
  app.get('/api/datacenter/radiology/health',localOnly,(_req,res)=>res.json({ok:true,version:'1.16.0-embedded'}));

  const REQUEST_GROUP_SQL=`
WITH seed_requests AS (
  SELECT DISTINCT xrd.xrayrequestid FROM xrayresult xr JOIN xrayrequestdetail xrd ON xrd.id=xr.xrayrequestdetailid
  WHERE TRIM(xr.hn)=TRIM($1) AND TRIM(xr.vn)=TRIM($2) AND xr.isdeleted IS NOT TRUE AND xrd.isdeleted IS NOT TRUE
), latest_result AS (
  SELECT DISTINCT ON (xr.xrayrequestdetailid) xr.id,xr.xrayrequestdetailid,xr.hn,xr.vn,xr.patientid,xr.resultentereddatetime,xr.textualnotag,xr.lovxrayresultstatusid,xr.lovxrayseverityid
  FROM xrayresult xr WHERE xr.isdeleted IS NOT TRUE ORDER BY xr.xrayrequestdetailid,xr.id DESC
)
SELECT xrd.id AS xrayrequestdetail_id,xrd.xrayrequestid,xrd.itemname,oim.code AS itemcode,xrd.accessionno,xrd.startdate,xrd.registereddate,xrd.executeddate,xrd.completeddate,xrd.revieweddate,
 lr.id AS xrayresult_id,COALESCE(lr.hn,$1) AS hn,COALESCE(lr.vn,$2) AS vn,lr.resultentereddatetime,lr.textualnotag,
 p.id AS patient_id,p.hn AS patient_hn,p.title,p.firstname,p.middlename,p.lastname,p.birthdate,p.preferredname,
 CONCAT_WS(' ',NULLIF(TRIM(p.title),''),NULLIF(TRIM(p.firstname),''),NULLIF(TRIM(p.middlename),''),NULLIF(TRIM(p.lastname),'')) AS patient_name,
 CASE WHEN p.birthdate IS NULL THEN NULL ELSE DATE_PART('year',AGE(CURRENT_DATE,p.birthdate))::int END AS age_years,
 l3.code AS gender_code,l3.name AS gender,l1.code AS result_status_code,l1.name AS result_status,l2.code AS severity_code,l2.name AS severity
FROM xrayrequestdetail xrd JOIN seed_requests sr ON sr.xrayrequestid=xrd.xrayrequestid LEFT JOIN orderitemmaster oim ON oim.id=xrd.orderitemmasterid
LEFT JOIN latest_result lr ON lr.xrayrequestdetailid=xrd.id LEFT JOIN patient p ON p.id=lr.patientid LEFT JOIN lov l1 ON l1.id=lr.lovxrayresultstatusid LEFT JOIN lov l2 ON l2.id=lr.lovxrayseverityid LEFT JOIN lov l3 ON l3.id=p.lovsexid
WHERE xrd.isdeleted IS NOT TRUE AND TRIM(oim.code)=TRIM($3) ORDER BY xrd.xrayrequestid,xrd.id`;

  app.post('/api/datacenter/radiology/radiology/check',localOnly,async(req,res)=>{
    const cfg=await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath);if(!cfg)return res.status(400).json({ok:false,error:'Database Configuration has not been saved'});const pairs=Array.isArray(req.body?.pairs)?req.body.pairs:[],itemcode=String(req.body?.itemcode||'').trim();if(!pairs.length)return res.status(400).json({ok:false,error:'HN/VN not found'});if(!itemcode)return res.status(400).json({ok:false,error:'Item Code is required'});let p;try{p=poolFrom(cfg);const results=[];let exactCount=0,noResultCount=0,errorCount=0,itemCount=0;for(const pair of pairs){const hn=String(pair.hn||'').trim(),vn=String(pair.vn||'').trim();try{const q=await p.query(REQUEST_GROUP_SQL,[hn,vn,itemcode]);if(q.rows.length){exactCount++;itemCount+=q.rows.length;results.push({input:{hn,vn},match_type:'REQUEST_GROUP_EXACT',rows:q.rows})}else{noResultCount++;results.push({input:{hn,vn},match_type:'NO_RESULT',rows:[]})}}catch(e){errorCount++;results.push({input:{hn,vn},match_type:'ERROR',rows:[],...errorPayload(e)})}}res.json({ok:true,itemcode,diagnostics:{inputRows:pairs.length,exactCount,noResultCount,errorCount,itemCount},results})}catch(e){res.status(500).json({ok:false,...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}
  });

  const LAB_SQL=`
WITH lab_head AS (
 SELECT l.id AS labresult_id,l.labrequestdetailid,l.patientid,l.hn,l.vn,l.resultentereddatetime,l.resultsummary,lrd.id AS labrequestdetail_id,lrd.labrequestid,lrd.orderitemmasterid,lrd.itemname,lrd.labitemmasterid,lrd.labspecimenmasterid,lrd.startdate,lrd.collecteddate,lrd.accepteddate,lrd.revieweddate,
 p.id AS patient_id,p.title,p.firstname,p.middlename,p.lastname,p.birthdate,CONCAT_WS(' ',NULLIF(TRIM(p.title),''),NULLIF(TRIM(p.firstname),''),NULLIF(TRIM(p.middlename),''),NULLIF(TRIM(p.lastname),'')) AS patient_name,
 CASE WHEN p.birthdate IS NULL THEN NULL ELSE DATE_PART('year',AGE(CURRENT_DATE,p.birthdate))::int END AS age_years,l3.code AS gender_code,l3.name AS gender
 FROM labresult l LEFT JOIN labrequestdetail lrd ON lrd.id=l.labrequestdetailid LEFT JOIN patient p ON p.id=l.patientid LEFT JOIN lov l3 ON l3.id=p.lovsexid
 WHERE TRIM(l.hn)=TRIM($1) AND TRIM(l.vn)=TRIM($2) AND l.isdeleted IS NOT TRUE AND (lrd.isdeleted IS NOT TRUE OR lrd.isdeleted IS NULL)
)
SELECT h.*,ldt.id AS labresultdetail_id,ldt.labresultitemmasterid,ldt.labitemmasterid AS detail_labitemmasterid,lim.code AS detail_code,lim.description AS detail_name,ldt.resultvalue AS detail_resultvalue,
 COALESCE(NULLIF(TRIM(ldt.referencerange),''),NULLIF(TRIM(lim.normalrange),'')) AS detail_reference_range,lim.unit AS detail_unit,ldt.isabnormal AS detail_isabnormal,ldt.comments AS detail_comments
FROM lab_head h LEFT JOIN labresultdetail ldt ON ldt.labresultid=h.labresult_id AND ldt.isdeleted IS NOT TRUE LEFT JOIN labresultitemmaster lim ON lim.id=ldt.labresultitemmasterid
ORDER BY h.resultentereddatetime DESC,h.labresult_id DESC,ldt.id ASC NULLS LAST`;

  app.post('/api/datacenter/radiology/lab/bulk',localOnly,async(req,res)=>{
    const cfg=await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath);if(!cfg)return res.status(400).json({ok:false,error:'Database Configuration has not been saved'});const pairs=Array.isArray(req.body?.pairs)?req.body.pairs:[];if(!pairs.length)return res.status(400).json({ok:false,error:'HN/VN not found'});let p;const results=[];let exactCount=0,noResultCount=0,errorCount=0,itemCount=0,detailCount=0;try{p=poolFrom(cfg);for(const pair of pairs){const hn=String(pair?.hn||'').trim(),vn=String(pair?.vn||'').trim();if(!hn||!vn){errorCount++;results.push({hn,vn,status:'ERROR',error:'HN/VN is incomplete'});continue}try{const q=await p.query(LAB_SQL,[hn,vn]);if(!q.rows.length){noResultCount++;results.push({hn,vn,status:'NO_RESULT'});continue}const grouped=new Map();for(const row of q.rows){const key=String(row.labresult_id);if(!grouped.has(key))grouped.set(key,{status:'MATCH',labresult_id:row.labresult_id,labrequestdetailid:row.labrequestdetailid,patientid:row.patientid,hn:row.hn,vn:row.vn,resultentereddatetime:row.resultentereddatetime,resultsummary:row.resultsummary,labrequestdetail_id:row.labrequestdetail_id,labrequestid:row.labrequestid,orderitemmasterid:row.orderitemmasterid,itemname:row.itemname,labitemmasterid:row.labitemmasterid,labspecimenmasterid:row.labspecimenmasterid,startdate:row.startdate,collecteddate:row.collecteddate,accepteddate:row.accepteddate,revieweddate:row.revieweddate,patient_id:row.patient_id,title:row.title,firstname:row.firstname,middlename:row.middlename,lastname:row.lastname,birthdate:row.birthdate,patient_name:row.patient_name,age_years:row.age_years,gender_code:row.gender_code,gender:row.gender,details:[]});if(row.labresultdetail_id){grouped.get(key).details.push({id:row.labresultdetail_id,labresultitemmasterid:row.labresultitemmasterid,labitemmasterid:row.detail_labitemmasterid,code:row.detail_code,name:row.detail_name,resultvalue:row.detail_resultvalue,reference_range:row.detail_reference_range,unit:row.detail_unit,isabnormal:row.detail_isabnormal,comments:row.detail_comments});detailCount++}}const groupedRows=[...grouped.values()];exactCount++;itemCount+=groupedRows.length;results.push(...groupedRows)}catch(e){errorCount++;results.push({hn,vn,status:'ERROR',error:e.message,code:e.code})}}res.json({ok:true,diagnostics:{inputRows:pairs.length,exactCount,noResultCount,errorCount,itemCount,detailCount},results})}catch(e){res.status(500).json({ok:false,...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}
  });

  // Patient Package: relational lookup from HIS patientvisitpackage + patient + package.
  const readPatientPackageConfig=async()=>await readStoredConfig(PATIENT_PACKAGE_SETTING_KEY,patientPackageConfigPath)||await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath);
  const quoted=name=>`"${String(name).replace(/"/g,'""')}"`;
  async function detectPatientPackageDateColumn(p){
    const q=await p.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='patientvisitpackage' AND LOWER(column_name)='insdate' LIMIT 1`);
    if(!q.rowCount)throw new Error('Required date column patientvisitpackage.insdate was not found');
    const row=q.rows[0];
    if(!['date','timestamp without time zone','timestamp with time zone'].includes(String(row.data_type||'')))throw new Error('patientvisitpackage.insdate must be a date/timestamp column');
    return {column_name:'insdate',data_type:String(row.data_type||'')};
  }
  async function validatePatientPackageConfig(cfg,p){
    validateBase(cfg);return detectPatientPackageDateColumn(p);
  }
  const patientPackageDate=value=>{const s=String(value||'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';const d=new Date(`${s}T00:00:00Z`);return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s?'':s};
  app.get('/api/datacenter/patient-package/status',localOnly,async(_req,res)=>{const own=await readStoredConfig(PATIENT_PACKAGE_SETTING_KEY,patientPackageConfigPath),cfg=own||await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath);res.json({ok:true,configured:!!cfg,ownConfig:!!own})});
  app.get('/api/datacenter/patient-package/config',localOnly,async(_req,res)=>{const own=await readStoredConfig(PATIENT_PACKAGE_SETTING_KEY,patientPackageConfigPath),shared=await readStoredConfig(RADIOLOGY_SETTING_KEY,radiologyConfigPath);res.json({ok:true,config:safeCfg(own||shared),inherited:!own&&!!shared})});
  app.post('/api/datacenter/patient-package/config/test-live',localOnly,async(req,res)=>{const cfg=await mergedConfig(PATIENT_PACKAGE_SETTING_KEY,patientPackageConfigPath,req.body);let p;try{p=poolFrom(cfg);const info=await validatePatientPackageConfig(cfg,p);const q=await p.query(`SELECT current_database() AS database,current_user AS username,(SELECT COUNT(*)::bigint FROM patientvisitpackage) AS patientvisitpackage_count,(SELECT COUNT(*)::bigint FROM patient) AS patient_count,(SELECT COUNT(*)::bigint FROM package) AS package_count`);res.json({ok:true,target:safeCfg(cfg),dateColumn:info,...q.rows[0]})}catch(e){res.status(400).json({ok:false,...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}});
  app.post('/api/datacenter/patient-package/config/save',localOnly,configSessionRequired,async(req,res)=>{const cfg=await mergedConfig(PATIENT_PACKAGE_SETTING_KEY,patientPackageConfigPath,req.body);let p;try{p=poolFrom(cfg);const info=await validatePatientPackageConfig(cfg,p);await saveStoredConfig(PATIENT_PACKAGE_SETTING_KEY,cfg);res.json({ok:true,config:safeCfg(cfg),dateColumn:info})}catch(e){res.status(400).json({ok:false,...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}});
  app.get('/api/datacenter/patient-package/options',localOnly,async(req,res)=>{const cfg=await readPatientPackageConfig();if(!cfg)return res.status(400).json({ok:false,error:'Database Configuration has not been saved'});let p;try{p=poolFrom(cfg);const info=await validatePatientPackageConfig(cfg,p),col=quoted(info.column_name),dateFrom=patientPackageDate(req.query.dateFrom),dateTo=patientPackageDate(req.query.dateTo);const latestDate=(await p.query(`SELECT MAX(pvp.${col}::date)::text AS value FROM patientvisitpackage pvp`)).rows[0]?.value||null;let packages=[];if(dateFrom&&dateTo){if(dateFrom>dateTo)return res.status(400).json({ok:false,error:'dateFrom must not be after dateTo'});packages=(await p.query(`SELECT DISTINCT BTRIM(pkg.code) AS code,pkg.name FROM patientvisitpackage pvp JOIN package pkg ON pvp.packageid=pkg.id WHERE pvp.${col}::date BETWEEN $1::date AND $2::date AND COALESCE(BTRIM(pkg.code),'')<>'' ORDER BY BTRIM(pkg.code),pkg.name`,[dateFrom,dateTo])).rows}res.set('Cache-Control','no-store');res.json({ok:true,latestDate,packages,selection:{dateFrom,dateTo},dateColumn:info.column_name})}catch(e){res.status(500).json({ok:false,...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}});
  app.get('/api/datacenter/patient-package/search',localOnly,async(req,res)=>{const cfg=await readPatientPackageConfig();if(!cfg)return res.status(400).json({ok:false,error:'Database Configuration has not been saved'});let p;try{p=poolFrom(cfg);const info=await validatePatientPackageConfig(cfg,p),col=quoted(info.column_name),dateFrom=patientPackageDate(req.query.dateFrom),dateTo=patientPackageDate(req.query.dateTo),packageSearch=String(req.query.packageSearch||'').trim(),allPackages=String(req.query.allPackages||'').toLowerCase()==='true',page=Math.max(1,Number(req.query.page)||1),pageSize=Math.min(100,Math.max(1,Number(req.query.pageSize)||50));if(!dateFrom||!dateTo)return res.status(400).json({ok:false,error:'Valid dateFrom and dateTo are required'});if(dateFrom>dateTo)return res.status(400).json({ok:false,error:'dateFrom must not be after dateTo'});if(!allPackages&&!packageSearch)return res.status(400).json({ok:false,error:'Enter a package code/name or select all packages'});const params=[dateFrom,dateTo],packageWhere=allPackages?'':` AND (BTRIM(pkg.code) ILIKE $3 OR COALESCE(pkg.name,'') ILIKE $3)`;if(!allPackages)params.push(`%${packageSearch}%`);const where=`pvp.${col}::date BETWEEN $1::date AND $2::date${packageWhere}`;const count=Number((await p.query(`SELECT COUNT(*)::int AS n FROM patientvisitpackage pvp JOIN package pkg ON pvp.packageid=pkg.id WHERE ${where}`,params)).rows[0]?.n||0),limitIndex=params.length+1,offsetIndex=params.length+2;params.push(pageSize,(page-1)*pageSize);const q=await p.query(`SELECT to_jsonb(pvp) AS visit_package,to_jsonb(pt) AS patient,to_jsonb(pkg) AS package FROM patientvisitpackage pvp LEFT JOIN patient pt ON pvp.hn=pt.hn LEFT JOIN package pkg ON pvp.packageid=pkg.id WHERE ${where} ORDER BY pvp.${col} DESC NULLS LAST,pvp.hn LIMIT $${limitIndex} OFFSET $${offsetIndex}`,params);res.set('Cache-Control','no-store');res.json({ok:true,total:count,page,pageSize,items:q.rows,selection:{dateFrom,dateTo,packageSearch,allPackages}})}catch(e){res.status(500).json({ok:false,...errorPayload(e)})}finally{if(p)await p.end().catch(()=>{})}});
}

module.exports={registerDataCenter};
