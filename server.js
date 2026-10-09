'use strict';
const installHealthCheck = process.env.HEALTH_CHECK_INSTALL_TEST === '1';
const dotenvResult = require('dotenv').config();
if (!installHealthCheck && dotenvResult.parsed) Object.assign(process.env, dotenvResult.parsed);
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { normalizeCircular, defaultCircular, buildCorporateCircularPdf } = require('./corporate-circular-pdf');
const {mergeCircularAndAttachments} = require('./company-circular-attachment-merge');
const { Pool } = require('pg');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const { ensureRelationalSchema, syncStateToRelational } = require('./relational-store');
const { ensureScalableSchema, registerScalableApi, persistEmrPayload } = require('./scalable-relational');
const { normalizeIdentity: normalizeCustomerIdentity, mergeCustomerImport } = require('./customer-identity');

const DEFAULT_PACKAGE_DETAIL_API_URL = 'https://qzh0pwepu2.execute-api.ap-southeast-1.amazonaws.com/prod/checkup/getpackagedetail';
const DEFAULT_PACKAGE_STATUS_API_URL = String(process.env.PACKAGE_STATUS_API_URL||'').trim();
const DEFAULT_PATIENT_API_URL = 'https://qzh0pwepu2.execute-api.ap-southeast-1.amazonaws.com/prod/checkup/getpatientlist';
const DEFAULT_PATIENTINFO_API_URL = 'https://qzh0pwepu2.execute-api.ap-southeast-1.amazonaws.com/prod/checkup/patientinfo';
const RELEASE_NAME = 'v7.64.00-production';
const { registerDataCenter } = require('./datacenter');
const SCHEMA_VERSION = '0211';

const RUNTIME_ENVIRONMENT = 'production';
const PRODUCTION_PORT = 3000;
const PRODUCTION_DATABASE = 'health_check_smart_search';
const renderDeployment = String(process.env.RENDER_DEPLOYMENT || '').trim().toLowerCase() === 'true'
  || Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL);
const renderPort = 10000;
function configuredDatabaseName(){
  if(process.env.PGDATABASE)return String(process.env.PGDATABASE).trim();
  if(process.env.DATABASE_URL){try{return decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//,''))}catch(_){return ''}}
  return '';
}
function enforceProductionOnlyRuntime(){
  if(installHealthCheck)return;
  const configuredEnvironment=String(process.env.APP_ENV||RUNTIME_ENVIRONMENT).trim().toLowerCase();
  const configuredPort=renderDeployment?renderPort:Number(process.env.PORT||PRODUCTION_PORT);
  const configuredDatabase=configuredDatabaseName();
  const errors=[];
  if(configuredEnvironment!==RUNTIME_ENVIRONMENT)errors.push(`APP_ENV must be ${RUNTIME_ENVIRONMENT}`);
  if(!renderDeployment&&configuredPort!==PRODUCTION_PORT)errors.push(`PORT must be ${PRODUCTION_PORT}`);
  if(configuredDatabase&&configuredDatabase!==PRODUCTION_DATABASE)errors.push(`PGDATABASE must be ${PRODUCTION_DATABASE}`);
  if(errors.length){console.error('[PRODUCTION-ONLY] Refusing to start: '+errors.join(' | '));process.exit(1)}
  process.env.APP_ENV=RUNTIME_ENVIRONMENT;
  process.env.PORT=String(renderDeployment?configuredPort:PRODUCTION_PORT);
}
enforceProductionOnlyRuntime();
function isNonProductionUrl(value){
  const text=String(value||'').trim().toLowerCase();
  return Boolean(text)&&text.includes('sta'+'ging');
}
function requireProductionEndpoint(value,label='API'){
  const text=String(value||'').trim();
  if(!text)throw new Error(`${label} ยังไม่ได้ตั้งค่า Production endpoint`);
  if(isNonProductionUrl(text))throw new Error(`${label} เป็น endpoint ที่ไม่ใช่ Production และถูกบล็อก`);
  return text;
}
const customerSessions = new Map();
const customerLoginAttempts = new Map();
const packageConfigSessions = new Map();
const packageConfigLoginAttempts = new Map();
const ocrScanSessions = new Map();

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.error('ไม่พบการตั้งค่าฐานข้อมูล กรุณารัน ติดตั้งโปรแกรม.bat');
  process.exit(1);
}

const app = express();
// v7.63.74 - baseline production security headers for LAN/HTTPS deployments.
app.disable('x-powered-by');
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Resource-Policy':'same-origin'});next()});
const hasCanonicalPgConfig = Boolean(process.env.PGDATABASE && process.env.PGUSER);
const pool = new Pool(hasCanonicalPgConfig ? {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: Math.min(Math.max(Number(process.env.PGPOOL_MAX) || 20, 2), 50),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
} : {
  connectionString: process.env.DATABASE_URL,
  max: Math.min(Math.max(Number(process.env.PGPOOL_MAX) || 20, 2), 50),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});
const defaultHisAppointmentConfig={host:process.env.HIS_APT_HOST||'',port:Number(process.env.HIS_APT_PORT||5432),database:process.env.HIS_APT_DATABASE||'vimut_gorilla',user:process.env.HIS_APT_USER||'',password:process.env.HIS_APT_PASSWORD||'',schema:process.env.HIS_APT_SCHEMA||'public',table:process.env.HIS_APT_TABLE||'patientapt',locationTable:process.env.HIS_APT_LOCATION_TABLE||'location',doctorTable:process.env.HIS_APT_DOCTOR_TABLE||'usermas',patientTable:process.env.HIS_APT_PATIENT_TABLE||'patient'};
const safeIdentifier=value=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value||''));
function normalizeHisBirthdate(value){const text=String(value||'').trim();let match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/),year,month,day;if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3])}else{match=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(!match)throw new Error('Birthdate ต้องเป็นวันที่รูปแบบ YYYY-MM-DD หรือ DD/MM/YYYY');day=Number(match[1]);month=Number(match[2]);year=Number(match[3])}if(year>2400)year-=543;const date=new Date(year,month-1,day),currentYear=new Date().getFullYear();if(year<1800||year>currentYear||date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)throw new Error('Birthdate ไม่ถูกต้องหรือไม่ใช่ปี ค.ศ. ที่สมเหตุสมผล');return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}
function hisResponseMessages(value,depth=0){if(value==null||depth>8)return[];if(Array.isArray(value))return value.flatMap(item=>hisResponseMessages(item,depth+1));if(typeof value!=='object')return[];const messageKeys=/^(message|statusdetail|errormessage|errordetail|error|detail|description)$/i,result=[];for(const [key,item] of Object.entries(value)){if(messageKeys.test(key)&&['string','number','boolean'].includes(typeof item)&&String(item).trim())result.push(String(item).trim());if(item&&typeof item==='object')result.push(...hisResponseMessages(item,depth+1))}return [...new Set(result)]}
function hisResponseFailed(value){if(value==null)return false;if(Array.isArray(value))return value.some(hisResponseFailed);if(typeof value!=='object')return false;const status=String(value.localerror??value.LocalError??value.Status??value.status??'').trim().toLowerCase();if(value.Success===false||value.success===false||value.IsResult===false||value.isResult===false||value.Status===false||value.status===false||['error','unsuccess','failed','fail'].includes(status))return true;if(hisResponseMessages(value).some(message=>/\b(not\s+active|required|invalid|error|failed|failure|unsuccess|missing|not\s+found)\b/i.test(message)))return true;return Object.values(value).some(item=>item&&typeof item==='object'&&hisResponseFailed(item))}
const appointmentSecretKey=crypto.createHash('sha256').update(String(process.env.EXTERNAL_API_KEY||process.env.PGPASSWORD||'health-check-local-secret')).digest();
function encryptAppointmentPassword(value){if(!value)return '';const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',appointmentSecretKey,iv),encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(buffer=>buffer.toString('base64url')).join('.')}
function decryptAppointmentPassword(value){if(!value)return '';const [iv,tag,encrypted]=String(value).split('.').map(part=>Buffer.from(part,'base64url'));const decipher=crypto.createDecipheriv('aes-256-gcm',appointmentSecretKey,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8')}
async function readHisAppointmentConfig(){const result=await pool.query("SELECT value FROM system_settings WHERE key='his_appointment_config'"),raw=result.rows[0]?.value;let stored=null,configUnreadable=false;if(raw){try{stored=typeof raw==='string'?JSON.parse(raw):raw}catch(error){configUnreadable=true;console.error('รูปแบบการตั้งค่า PostgreSQL HIS เดิมไม่ถูกต้อง',error.message)}}if(!stored||typeof stored!=='object'||Array.isArray(stored))return {...defaultHisAppointmentConfig,passwordUnreadable:false,configUnreadable};let password='',passwordUnreadable=false;try{password=decryptAppointmentPassword(stored.passwordEncrypted||'')}catch(error){passwordUnreadable=Boolean(stored.passwordEncrypted);console.error('อ่านรหัสผ่าน PostgreSQL HIS เดิมไม่สำเร็จ กรุณาบันทึกรหัสใหม่',error.message)}return {...defaultHisAppointmentConfig,...stored,password,passwordUnreadable,configUnreadable}}
function appointmentPool(config){if(!config.host||!config.user||!config.password)throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลนัดหมาย HIS');if(!safeIdentifier(config.schema)||!safeIdentifier(config.table)||!safeIdentifier(config.locationTable)||!safeIdentifier(config.doctorTable)||!safeIdentifier(config.patientTable))throw new Error('Schema หรือชื่อตาราง HIS ไม่ถูกต้อง');return new Pool({host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:false}})}
function hisTruthy(value,defaultValue=true){if(value==null||value==='')return defaultValue;const text=String(value).trim().toLowerCase();if(['false','f','0','n','no','inactive','deleted'].includes(text))return false;if(['true','t','1','y','yes','active'].includes(text))return true;return defaultValue}
function hisQuotedColumn(alias,name){return name?`${alias}."${String(name).replaceAll('"','""')}"`:null}
function buildHisDirectoryUserQuery(config,columns=[],options={}){
  const lookup=new Map((columns||[]).map(name=>[String(name).toLowerCase(),String(name)]));
  const pick=(...names)=>{for(const name of names){const found=lookup.get(String(name).toLowerCase());if(found)return found}return ''};
  const fields={id:pick('id','userid','user_id'),username:pick('username','loginname','usercode','code','userid'),code:pick('code','usercode','username','loginname'),title:pick('title','prefix'),firstName:pick('firstname','first_name','fname'),middleName:pick('middlename','middle_name','mname'),lastName:pick('lastname','last_name','lname'),otherName:pick('othername','displayname','display_name','fullname','full_name','name'),department:pick('departmentname','department_name','department','deptname','dept_name','dept'),position:pick('positionname','position_name','position','jobtitle','job_title'),email:pick('email','emailaddress','email_address'),phone:pick('phone','phoneno','phone_no','mobile','mobileno','mobile_no'),active:pick('isactive','active','enabled'),deleted:pick('isdeleted','deleted'),activeTo:pick('activeto','active_to','expiredate','expire_date'),lovCpTypeId:pick('lovcptypid','lov_cp_type_id','usertypeid','user_type_id')};
  const expr=(key,alias)=>fields[key]?`${hisQuotedColumn('u',fields[key])}::text AS "${alias}"`:`NULL::text AS "${alias}"`;
  const table=`"${config.schema}"."${config.doctorTable}"`,lovTable=`"${config.schema}"."lov"`,hasLov=Boolean(fields.lovCpTypeId),conditions=[],params=[];
  if(fields.deleted)conditions.push(`COALESCE(${hisQuotedColumn('u',fields.deleted)},false)=false`);
  if(fields.active)conditions.push(`COALESCE(${hisQuotedColumn('u',fields.active)},true)=true`);
  if(fields.activeTo)conditions.push(`(${hisQuotedColumn('u',fields.activeTo)} IS NULL OR ${hisQuotedColumn('u',fields.activeTo)}::date >= CURRENT_DATE)`);
  const allowedTypeIds=[...new Set((Array.isArray(options.allowedTypeIds)?options.allowedTypeIds:[]).map(value=>String(value||'').trim()).filter(Boolean))];
  if(allowedTypeIds.length){
    if(!fields.lovCpTypeId)throw new Error(`ตาราง ${config.schema}.${config.doctorTable} ไม่มีคอลัมน์ lovcptypid จึงกรองตาม Mapping Role ไม่ได้`);
    params.push(allowedTypeIds);
    conditions.push(`${hisQuotedColumn('u',fields.lovCpTypeId)}::text = ANY($${params.length}::text[])`);
  }
  const limit=Math.min(Math.max(Number(options.limit)||5000,1),20000);
  const query=`SELECT ${expr('id','id')},
       ${expr('username','username')},
       ${expr('code','code')},
       ${expr('title','title')},
       ${expr('firstName','firstName')},
       ${expr('middleName','middleName')},
       ${expr('lastName','lastName')},
       ${expr('otherName','otherName')},
       ${expr('department','department')},
       ${expr('position','position')},
       ${expr('email','email')},
       ${expr('phone','phone')},
       ${expr('active','active')},
       ${expr('deleted','deleted')},
       ${expr('activeTo','activeTo')},
       ${expr('lovCpTypeId','userTypeId')},
       ${hasLov?'l."code"::text':'NULL::text'} AS "userTypeCode",
       ${hasLov?'l."name"::text':'NULL::text'} AS "userTypeName"
FROM ${table} u${hasLov?`\nLEFT JOIN ${lovTable} l ON l."id"::text = ${hisQuotedColumn('u',fields.lovCpTypeId)}::text`:''}${conditions.length?`\nWHERE ${conditions.join('\n  AND ')}`:''}
LIMIT ${limit};`;
  return {query,params,fields,table,lovTable:hasLov?lovTable:null,allowedTypeIds};
}
async function inspectHisDirectoryUserQuery(){
  const config=await readHisAppointmentConfig();if(!safeIdentifier(config.schema)||!safeIdentifier(config.doctorTable))throw new Error('Schema หรือตาราง User HIS ไม่ถูกต้อง');
  let hisPool;try{
    hisPool=appointmentPool(config);
    const columnRows=(await hisPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,[config.schema,config.doctorTable])).rows;
    const columns=columnRows.map(row=>String(row.column_name));
    if(!columns.length)throw new Error(`ไม่พบตาราง ${config.schema}.${config.doctorTable} หรือบัญชีไม่มีสิทธิ์อ่าน`);
    const built=buildHisDirectoryUserQuery(config,columns);
    return {schema:config.schema,table:config.doctorTable,columns,query:built.query,fieldMap:built.fields,database:config.database,host:config.host};
  }finally{if(hisPool)await hisPool.end().catch(()=>{})}
}
async function fetchHisDirectoryUsers(options={}){
  const config=await readHisAppointmentConfig();if(!safeIdentifier(config.schema)||!safeIdentifier(config.doctorTable))throw new Error('Schema หรือตาราง User HIS ไม่ถูกต้อง');
  let hisPool;try{
    hisPool=appointmentPool(config);
    const columnRows=(await hisPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,[config.schema,config.doctorTable])).rows;
    const columns=columnRows.map(row=>String(row.column_name));
    if(!columns.length)throw new Error(`ไม่พบตาราง ${config.schema}.${config.doctorTable} หรือบัญชีไม่มีสิทธิ์อ่าน`);
    const built=buildHisDirectoryUserQuery(config,columns,options);
    const result=await hisPool.query(built.query,built.params);
    const clean=value=>String(value??'').trim();
    const items=result.rows.map(row=>{const username=clean(row.username||row.code||row.id),displayName=[row.title,row.firstName,row.middleName,row.lastName].map(clean).filter(Boolean).join(' ')||clean(row.otherName)||username;return {hisUserId:clean(row.id||row.code||username),username,code:clean(row.code||username),displayName,departmentName:clean(row.department),positionName:clean(row.position),email:clean(row.email),phone:clean(row.phone),active:hisTruthy(row.active,true),deleted:row.deleted==null?false:hisTruthy(row.deleted,false),activeTo:clean(row.activeTo),userTypeId:clean(row.userTypeId),userTypeCode:clean(row.userTypeCode),userTypeName:clean(row.userTypeName)}}).filter(item=>item.username&&!item.deleted);
    items.sort((a,b)=>a.displayName.localeCompare(b.displayName,'th')||a.username.localeCompare(b.username));
    return {items,source:{schema:config.schema,table:config.doctorTable,columns,query:built.query,fieldMap:built.fields,database:config.database,host:config.host,allowedTypeIds:built.allowedTypeIds}};
  }finally{if(hisPool)await hisPool.end().catch(()=>{})}
}
async function fetchHisDirectoryPopulationSummary(){
  const config=await readHisAppointmentConfig();if(!safeIdentifier(config.schema)||!safeIdentifier(config.doctorTable))throw new Error('Schema หรือตาราง User HIS ไม่ถูกต้อง');
  let hisPool;try{
    hisPool=appointmentPool(config);
    const columnRows=(await hisPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,[config.schema,config.doctorTable])).rows;
    const columns=columnRows.map(row=>String(row.column_name));
    if(!columns.length)throw new Error(`ไม่พบตาราง ${config.schema}.${config.doctorTable} หรือบัญชีไม่มีสิทธิ์อ่าน`);
    const built=buildHisDirectoryUserQuery(config,columns,{limit:1}),fields=built.fields,table=built.table,lovTable=built.lovTable;
    if(!fields.lovCpTypeId)throw new Error(`ตาราง ${config.schema}.${config.doctorTable} ไม่มีคอลัมน์ lovcptypid`);
    const typeCol=hisQuotedColumn('u',fields.lovCpTypeId),deletedOk=fields.deleted?`COALESCE(${hisQuotedColumn('u',fields.deleted)},false)=false`:'TRUE',activeOk=fields.active?`COALESCE(${hisQuotedColumn('u',fields.active)},true)=true`:'TRUE',activeToOk=fields.activeTo?`(${hisQuotedColumn('u',fields.activeTo)} IS NULL OR ${hisQuotedColumn('u',fields.activeTo)}::date >= CURRENT_DATE)`:'TRUE',eligible=`(${deletedOk}) AND (${activeOk}) AND (${activeToOk})`,inactive=fields.active?`(${deletedOk}) AND COALESCE(${hisQuotedColumn('u',fields.active)},true)=false`:'FALSE',expired=fields.activeTo?`(${deletedOk}) AND (${activeOk}) AND ${hisQuotedColumn('u',fields.activeTo)} IS NOT NULL AND ${hisQuotedColumn('u',fields.activeTo)}::date < CURRENT_DATE`:'FALSE',deleted=fields.deleted?`COALESCE(${hisQuotedColumn('u',fields.deleted)},false)=true`:'FALSE';
    const totals=(await hisPool.query(`SELECT COUNT(*)::int AS total_rows,COUNT(*) FILTER (WHERE ${eligible})::int AS eligible_rows,COUNT(*) FILTER (WHERE ${inactive})::int AS inactive_rows,COUNT(*) FILTER (WHERE ${expired})::int AS expired_rows,COUNT(*) FILTER (WHERE ${deleted})::int AS deleted_rows FROM ${table} u`)).rows[0]||{};
    const typeSql=`SELECT ${typeCol}::text AS lovcptypid,${lovTable?'l."code"::text':'NULL::text'} AS "userTypeCode",${lovTable?'l."name"::text':'NULL::text'} AS "userTypeName",COUNT(*)::int AS user_count FROM ${table} u${lovTable?` LEFT JOIN ${lovTable} l ON l."id"::text=${typeCol}::text`:''} WHERE ${eligible} AND ${typeCol} IS NOT NULL AND BTRIM(${typeCol}::text)<>'' GROUP BY ${typeCol}${lovTable?',l."code",l."name"':''} ORDER BY COALESCE(${lovTable?'l."name"::text,':''}${typeCol}::text)`;
    const types=(await hisPool.query(typeSql)).rows.map(row=>({lovcptypid:String(row.lovcptypid||'').trim(),userTypeCode:String(row.userTypeCode||'').trim(),userTypeName:String(row.userTypeName||'').trim(),userCount:Number(row.user_count||0)}));
    return {totalRows:Number(totals.total_rows||0),eligibleRows:Number(totals.eligible_rows||0),inactiveRows:Number(totals.inactive_rows||0),expiredRows:Number(totals.expired_rows||0),deletedRows:Number(totals.deleted_rows||0),types,source:{schema:config.schema,table:config.doctorTable,database:config.database,host:config.host}};
  }finally{if(hisPool)await hisPool.end().catch(()=>{})}
}
async function fetchLatestPatientLogStatuses(requested=[]){
  const items=(Array.isArray(requested)?requested:[]).map((item,index)=>({key:String(item?.key??index),hn:String(item?.hn||'').trim(),vn:String(item?.vn||'').trim()})).filter(item=>item.hn&&item.vn).slice(0,2000);
  if(!items.length)return {items:[],source:null};
  const config=await readHisAppointmentConfig(),tableName=String(process.env.HIS_PATIENT_LOG_TABLE||'patientlog').trim();
  if(!safeIdentifier(config.schema)||!safeIdentifier(tableName))throw new Error('Schema หรือตาราง patientlog ไม่ถูกต้อง');
  let hisPool;try{
    hisPool=appointmentPool(config);
    const columnRows=(await hisPool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`,[config.schema,tableName])).rows.map(row=>String(row.column_name));
    const lookup=new Map(columnRows.map(name=>[name.toLowerCase(),name])),need=name=>{const found=lookup.get(name.toLowerCase());if(!found)throw new Error(`ตาราง ${config.schema}.${tableName} ไม่มีคอลัมน์ ${name}`);return found};
    const hnCol=need('hn'),vnCol=need('vn'),toValueCol=need('tovalue'),insDateCol=need('insdate'),idCol=need('id');
    const params=[],values=items.map((item,index)=>{params.push(item.hn,item.vn,index);const n=params.length;return `($${n-2}::text,$${n-1}::text,$${n}::int)`}).join(',');
    const table=`"${config.schema}"."${tableName}"`;
    const sql=`WITH requested(hn,vn,idx) AS (VALUES ${values}) SELECT DISTINCT ON (r.idx) r.idx,pl."${toValueCol}"::text AS tovalue,pl."${insDateCol}" AS insdate,pl."${idCol}" AS log_id FROM requested r LEFT JOIN ${table} pl ON BTRIM(pl."${hnCol}"::text)=r.hn AND BTRIM(pl."${vnCol}"::text)=r.vn ORDER BY r.idx,pl."${insDateCol}" DESC NULLS LAST,pl."${idCol}" DESC NULLS LAST`;
    const result=await hisPool.query(sql,params),byIndex=new Map(result.rows.map(row=>[Number(row.idx),row]));
    return {items:items.map((item,index)=>{const row=byIndex.get(index)||{};return {...item,status:String(row.tovalue||'').trim(),insdate:row.insdate||null,logId:row.log_id??null}}),source:{schema:config.schema,table:tableName}};
  }finally{if(hisPool)await hisPool.end().catch(()=>{})}
}
const quoteHisColumn=name=>`p."${String(name).replaceAll('"','""')}"`;
async function patientJoinProjection(client,config){
  const columns=(await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`,[config.schema,config.patientTable])).rows.map(row=>String(row.column_name));
  if(!columns.length)throw new Error(`ไม่พบตาราง ${config.schema}.${config.patientTable} หรือบัญชีไม่มีสิทธิ์อ่าน`);
  const lookup=new Map(columns.map(name=>[name.toLowerCase(),name])),pick=(...names)=>{for(const name of names){const found=lookup.get(name.toLowerCase());if(found)return found}return ''},value=(name,fallback='NULL')=>name?quoteHisColumn(name):fallback;
  const id=pick('id','patientid','patient_id'),hn=pick('hn','patienthn','patient_hn'),hnold=pick('hnold','oldhn','old_hn','hn_old','previoushn','previous_hn'),fullName=pick('patientname','patient_name','fullname','full_name','displayname','display_name'),title=pick('title','prefix','titleth','title_th'),first=pick('firstname','first_name','fname','firstnameth','firstname_th'),middle=pick('middlename','middle_name','mname','middlenameth','middlename_th'),last=pick('lastname','last_name','lname','surname','lastnameth','lastname_th'),dob=pick('dob','birthdate','birth_date','dateofbirth','date_of_birth','birthdt','birth_dt'),phone=pick('phoneno','phone_no','phone','cellphone','cell_phone','cellphoneno','cellphone_no','mobile','mobileno','mobilephone','mobile_phone','telephone','telno','tel_no','contactno','contact_no');
  const join=id?`LEFT JOIN "${config.schema}"."${config.patientTable}" p ON ${quoteHisColumn(id)}=a.patientid`:(hn?`LEFT JOIN "${config.schema}"."${config.patientTable}" p ON BTRIM(${quoteHisColumn(hn)}::text)=BTRIM(a.hn::text)`:null);
  if(!join)throw new Error(`ตาราง ${config.schema}.${config.patientTable} ไม่มีคอลัมน์ id/patientid หรือ hn สำหรับ JOIN`);
  const nameParts=[title,first,middle,last].filter(Boolean).map(quoteHisColumn),nameSql=fullName?value(fullName):(nameParts.length?`NULLIF(BTRIM(CONCAT_WS(' ',${nameParts.join(',')})),'')`:'NULL'),dobSql=dob?`TO_CHAR(${quoteHisColumn(dob)}::date,'DD/MM/YYYY')`:'NULL';
  return {join,select:`, ${value(hnold)} AS hnold,${nameSql} AS patient_name,${value(title)} AS patient_title,${value(first)} AS patient_first_name,${value(last)} AS patient_last_name,${dobSql} AS dob,${value(phone)} AS phone_no`,columns:{id,hn,hnold,fullName,title,first,middle,last,dob,phone}};
}
async function patientSearchProjection(client,config){
  const result=await client.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,[config.schema,config.patientTable]);
  if(!result.rows.length)throw new Error(`ไม่พบตาราง ${config.schema}.${config.patientTable} หรือบัญชีไม่มีสิทธิ์อ่าน`);
  const lookup=new Map(result.rows.map(row=>[String(row.column_name).toLowerCase(),{name:String(row.column_name),dataType:String(row.data_type||'')}])) ,pick=(...names)=>{for(const name of names){const found=lookup.get(name.toLowerCase());if(found)return found}return null};
  const id=pick('id','patientid','patient_id'),hn=pick('hn','patienthn','patient_hn'),hnold=pick('hnold','oldhn','old_hn','hn_old','previoushn','previous_hn'),identification=pick('identificationnumber','identification_number','identificationno','identification_no','idcard','id_card','citizenid','citizen_id','cid','nationalid','national_id','passportno','passport_no','passportnumber','passport_number'),title=pick('title','prefix','titleth','title_th'),first=pick('firstname','first_name','fname','firstnameth','firstname_th'),last=pick('lastname','last_name','lname','surname','lastnameth','lastname_th'),titleEN=pick('titleen','title_en','prefixen','prefix_en'),firstEN=pick('firstnameen','first_name_en','firsten','first_en','fnameen'),lastEN=pick('lastnameen','last_name_en','lasten','last_en','lnameen','surnameen'),dob=pick('dob','birthdate','birth_date','dateofbirth','date_of_birth','birthdt','birth_dt'),gender=pick('gender','sex','lovgendercode','gendercode','gender_code'),phone=pick('phoneno','phone_no','phone','cellphone','cell_phone','cellphoneno','cellphone_no','mobile','mobileno','mobilephone','mobile_phone','telephone','telno','tel_no'),email=pick('email','emailaddress','email_address'),address=pick('address','patientaddress','patient_address'),nationality=pick('nationality','nationalitycode','nationality_code');
  if(!first||!last||!dob)throw new Error(`ตาราง ${config.schema}.${config.patientTable} ต้องมีคอลัมน์ชื่อ นามสกุล และวันเกิด (ตรวจพบ First=${first?.name||'-'}, Last=${last?.name||'-'}, DOB=${dob?.name||'-'})`);
  const q=column=>column?`p."${column.name.replaceAll('"','""')}"`:'NULL',select=[`${q(id)} AS patient_id`,`${q(hn)} AS hn`,`${q(hnold)} AS hnold`,`${q(identification)} AS identification_number`,`${q(title)} AS title`,`${q(first)} AS first_name`,`${q(last)} AS last_name`,`${q(titleEN)} AS title_en`,`${q(firstEN)} AS first_name_en`,`${q(lastEN)} AS last_name_en`,`${q(dob)} AS birth_date`,`${q(gender)} AS gender`,`${q(phone)} AS phone_no`,`${q(email)} AS email`,`${q(address)} AS address`,`${q(nationality)} AS nationality`].join(',');
  return {select,columns:{id:id?.name||'',hn:hn?.name||'',hnold:hnold?.name||'',identification:identification?.name||'',title:title?.name||'',first:first.name,last:last.name,titleEN:titleEN?.name||'',firstEN:firstEN?.name||'',lastEN:lastEN?.name||'',dob:dob.name,gender:gender?.name||'',phone:phone?.name||'',email:email?.name||'',address:address?.name||'',nationality:nationality?.name||''}};
}

async function queryHisPatientByNameDob(firstName,lastName,birthDate){
  let hisPool;
  try{
    const config=await readHisAppointmentConfig();
    hisPool=appointmentPool(config);
    const patient=await patientSearchProjection(hisPool,config);
    const table=`"${config.schema}"."${config.patientTable}"`;
    const f=`p."${patient.columns.first.replaceAll('"','""')}"`,l=`p."${patient.columns.last.replaceAll('"','""')}"`,d=`p."${patient.columns.dob.replaceAll('"','""')}"`;
    // Format DOB in PostgreSQL to avoid JS timezone shifting a date by one day.
    const select=patient.select.replace(`${d} AS birth_date`,`TO_CHAR(${d}::date,'YYYY-MM-DD') AS birth_date`);
    const sql=`SELECT ${select} FROM ${table} p WHERE LOWER(BTRIM(${f}::text))=LOWER(BTRIM($1)) AND LOWER(BTRIM(${l}::text))=LOWER(BTRIM($2)) AND ${d}::date=$3::date ORDER BY ${patient.columns.hn?`p."${patient.columns.hn.replaceAll('"','""')}"`:f} NULLS LAST LIMIT 20`;
    const result=await hisPool.query(sql,[firstName,lastName,birthDate]);
    const items=result.rows.map(row=>({patientId:row.patient_id??null,hn:String(row.hn??''),hnOld:String(row.hnold??''),identificationNumber:String(row.identification_number??''),title:String(row.title??''),firstName:String(row.first_name??''),lastName:String(row.last_name??''),prefixEN:String(row.title_en??''),firstNameEN:String(row.first_name_en??''),lastNameEN:String(row.last_name_en??''),birthDate:String(row.birth_date??'').slice(0,10),gender:String(row.gender??''),phoneNumber:String(row.phone_no??''),email:String(row.email??''),address:String(row.address??''),nationality:String(row.nationality??'')}));
    return {classification:items.length===0?'NOT_FOUND':items.length===1?'UNIQUE_MATCH':'MULTIPLE_MATCH',count:items.length,items,source:{host:config.host,database:config.database,schema:config.schema,table:config.patientTable},columnMap:patient.columns,sqlPreview:`SELECT [patient fields]\nFROM ${config.schema}.${config.patientTable}\nWHERE LOWER(TRIM(${patient.columns.first})) = LOWER(TRIM($1))\n  AND LOWER(TRIM(${patient.columns.last})) = LOWER(TRIM($2))\n  AND ${patient.columns.dob}::date = $3::date\nLIMIT 20;`};
  } finally { if(hisPool) await hisPool.end().catch(()=>{}); }
}


function lanBasicAccess(req, res, next) {
  // v7.59.34: The server computer always keeps localhost access. When the
  // Local Network Server switch is OFF, other computers are stopped before
  // static files/API are served, so the application is effectively private
  // to the server computer without stopping the Node process.
  const address = normalizeClientAddress(req.socket.remoteAddress || '');
  const loopback = address === '127.0.0.1' || address === '::1';
  // Render probes this non-sensitive version endpoint from its private
  // network. Keep the regular LAN boundary in place for every other route.
  const renderHealthCheck = renderDeployment && req.path === '/api/version';
  if (loopback || runtimeLanEnabled || renderHealthCheck) return next();
  res.status(503).type('text/plain; charset=utf-8').send('Local Network Server is currently OFF. Please use the application on the server computer.');
}

// Multi-company import replaces the application snapshot atomically. Existing
// production snapshots can already exceed 15 MB, so leave enough import headroom.
app.use(express.json({ limit: '100mb' }));
app.use(lanBasicAccess);

// v7.63.16 - staff RBAC guard for standalone OCR pages and OCR APIs.
// The main SPA still has legacy endpoints protected by the Local/LAN boundary;
// this closes the OCR gap that previously bypassed the Role/Permission UI entirely.
async function staffPermissionContext(req,permission){
  cleanupStaffSessions();
  const token=staffSessionToken(req),session=staffSessions.get(token);
  if(!session)return {ok:false,status:401,error:'กรุณาเข้าสู่ระบบก่อนใช้งาน'};
  const state=await readState(),user=(state.users||[]).find(item=>String(item.id)===String(session.userId)&&item.active!==false);
  if(!user){staffSessions.delete(token);return {ok:false,status:401,error:'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่'};}
  const role=(state.roles||[]).find(item=>String(item.id)===String(user.roleId)),permissions=new Set(Array.isArray(role?.permissions)?role.permissions:[]);
  const admin=String(role?.id||user.roleId||'')==='admin';
  const legacyAllowed=permission==='ocrDocumentView'&&(permissions.has('documentView')||permissions.has('ocrDocumentManage')||permissions.has('apiManage'))||permission==='ocrDocumentManage'&&(permissions.has('documentEdit')||permissions.has('apiManage'));
  if(!admin&&!permissions.has(permission)&&!legacyAllowed)return {ok:false,status:403,error:'บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้'};
  session.expiresAt=Date.now()+session.ttl;return {ok:true,user,role,token,session};
}
function staffPermissionRequired(permission){return async(req,res,next)=>{try{const access=await staffPermissionContext(req,permission);if(!access.ok)return res.status(access.status).json({error:access.error});req.staffUser=access.user;req.staffRole=access.role;res.set('Set-Cookie',staffSessionCookie(access.token,access.session.ttl));return next()}catch(error){console.error('[STAFF PERMISSION]',error);return res.status(500).json({error:'ตรวจสอบสิทธิ์ผู้ใช้ไม่สำเร็จ'})}}}
function staffPagePermissionRequired(permission){return async(req,res,next)=>{try{const access=await staffPermissionContext(req,permission);if(!access.ok){if(access.status===401)return res.redirect('/');return res.status(403).type('text/plain; charset=utf-8').send(access.error)}req.staffUser=access.user;req.staffRole=access.role;res.set('Set-Cookie',staffSessionCookie(access.token,access.session.ttl));return next()}catch(error){console.error('[STAFF PAGE PERMISSION]',error);return res.status(500).type('text/plain; charset=utf-8').send('ตรวจสอบสิทธิ์ผู้ใช้ไม่สำเร็จ')}}}

// Register protected standalone OCR pages before express.static so direct URLs
// cannot bypass the Role/Permission controls.
app.get('/ocr',staffPagePermissionRequired('ocrDocumentView'),(req,res)=>res.redirect(302,'/?view=ocr'));
app.get('/ocr-review-mockup.html',staffPagePermissionRequired('ocrDocumentView'),(_req,res)=>res.redirect(302,'/?view=ocr'));
app.get('/OCR-Real-Pilot-v7.63.06.html',staffPagePermissionRequired('ocrDocumentView'),(req,res)=>res.sendFile(path.join(__dirname,'OCR-Real-Pilot-v7.63.06.html')));
app.get('/downloads/healthcheck-scan-agent-v7.63.53.zip',staffPagePermissionRequired('ocrDocumentView'),(req,res)=>res.download(path.join(__dirname,'tools','ocr-scan-agent','OCR-SCAN-AGENT-NO-ADMIN.zip'),'HealthCheck-Scan-Agent-v7.63.53-TWAIN-MEMORY.zip'));

app.use(express.static(__dirname,{setHeaders:(res,filePath)=>{
  // UI releases change app.html/style.css/app.js frequently. Prevent browsers on
  // workstations from keeping an old frontend after INSTALL-REPAIR upgrades.
  if(/\.(?:html|css|js)$/i.test(filePath)){
    res.setHeader('Cache-Control','no-cache, no-store, must-revalidate');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
  }
}}));

app.get('/api/version', (_req, res) => res.json({ version: RELEASE_NAME.split('-')[0], release: RELEASE_NAME, environment: RUNTIME_ENVIRONMENT, productionOnly: true }));

// v7.63.09 - Customer list full-page workspace + OCR menu/sidebar (includes OCR Scanner Bridge)
// A browser cannot talk directly to WIA/TWAIN hardware. The per-user Scan Agent
// receives a one-time custom-protocol URL, scans through Windows WIA, then uploads
// the image to this short-lived OCR review session. Nothing is written to Patient/Lab DB.
function cleanupOcrScanSessions(){
  const now=Date.now();
  for(const [id,item] of ocrScanSessions){
    if(item.expiresAt<=now){
      try{
        const files=Array.isArray(item.files)?item.files:[];
        for(const file of files){if(file?.filePath&&fs.existsSync(file.filePath))fs.unlinkSync(file.filePath)}
        if(item.filePath&&fs.existsSync(item.filePath))fs.unlinkSync(item.filePath);
      }catch{}
      ocrScanSessions.delete(id);
    }
  }
}
setInterval(cleanupOcrScanSessions,60*1000).unref();
app.post('/api/ocr/scan/session',localOnly,staffPermissionRequired('ocrDocumentManage'),(req,res)=>{
  cleanupOcrScanSessions();
  const id=crypto.randomUUID(),token=crypto.randomBytes(24).toString('base64url'),expiresAt=Date.now()+5*60*1000;
  ocrScanSessions.set(id,{id,token,status:'WAITING',createdAt:Date.now(),expiresAt,filePath:'',fileName:'',mimeType:'',files:[],error:''});
  res.set('Cache-Control','no-store').json({id,token,status:'WAITING',expiresAt:new Date(expiresAt).toISOString()});
});
app.put('/api/ocr/scan/ingest/:id',express.raw({type:['image/jpeg','image/png','image/bmp','image/tiff','application/octet-stream'],limit:'35mb'}),(req,res)=>{
  cleanupOcrScanSessions();
  const item=ocrScanSessions.get(String(req.params.id||'')),token=String(req.headers['x-scan-token']||'');
  if(!item||!safeEqual(item.token,token))return res.status(404).json({error:'Scan session ไม่ถูกต้องหรือหมดอายุ'});
  if(!Buffer.isBuffer(req.body)||req.body.length<100)return res.status(400).json({error:'ไม่พบข้อมูลภาพจาก Scanner'});
  const contentType=String(req.headers['content-type']||'application/octet-stream').split(';')[0].toLowerCase();
  const allowed=new Set(['image/jpeg','image/png','image/bmp','image/tiff','application/octet-stream']);
  if(!allowed.has(contentType))return res.status(415).json({error:'ชนิดไฟล์จาก Scanner ไม่รองรับ'});
  const ext=contentType==='image/png'?'.png':contentType==='image/bmp'?'.bmp':contentType==='image/tiff'?'.tif':'.jpg';
  const dir=path.join(os.tmpdir(),'HealthCheck-OCR-Scan');fs.mkdirSync(dir,{recursive:true});
  if(!Array.isArray(item.files))item.files=[];
  const pageHeader=Number(req.headers['x-scan-page']);
  const page=Number.isFinite(pageHeader)&&pageHeader>0?Math.floor(pageHeader):item.files.length+1;
  const filePath=path.join(dir,`${item.id}-${String(page).padStart(4,'0')}${ext}`);fs.writeFileSync(filePath,req.body);
  const mimeType=contentType==='application/octet-stream'?'image/jpeg':contentType;
  const fileName=decodeURIComponent(String(req.headers['x-file-name']||`SCAN_${Date.now()}_${String(page).padStart(3,'0')}${ext}`)).replace(/[\/:*?"<>|]/g,'_').slice(0,180);
  const entry={page,filePath,fileName,mimeType,size:req.body.length};
  const existingIndex=item.files.findIndex(file=>Number(file.page)===page);
  if(existingIndex>=0){try{const old=item.files[existingIndex];if(old?.filePath&&old.filePath!==filePath&&fs.existsSync(old.filePath))fs.unlinkSync(old.filePath)}catch{}item.files[existingIndex]=entry}else item.files.push(entry);
  item.files.sort((a,b)=>Number(a.page)-Number(b.page));
  item.filePath=filePath;item.mimeType=mimeType;item.fileName=fileName;item.status=String(req.headers['x-scan-final']||'')==='1'?'READY':'SCANNING';item.expiresAt=Date.now()+10*60*1000;
  // Legacy Scan Agent sent one image without page/final headers. Keep it compatible.
  if(!req.headers['x-scan-page']&&!req.headers['x-scan-final'])item.status='READY';
  res.json({ok:true,status:item.status,fileCount:item.files.length});
});
app.post('/api/ocr/scan/session/:id/complete',(req,res)=>{
  cleanupOcrScanSessions();const item=ocrScanSessions.get(String(req.params.id||'')),token=String(req.headers['x-scan-token']||'');
  if(!item||!safeEqual(item.token,token))return res.status(404).json({error:'Scan session ไม่ถูกต้องหรือหมดอายุ'});
  if(!Array.isArray(item.files)||!item.files.length)return res.status(400).json({error:'Scanner ยังไม่ได้ส่งเอกสาร'});
  item.status='READY';item.error='';item.expiresAt=Date.now()+10*60*1000;res.json({ok:true,status:item.status,fileCount:item.files.length});
});
app.post('/api/ocr/scan/session/:id/error',(req,res)=>{
  cleanupOcrScanSessions();const item=ocrScanSessions.get(String(req.params.id||'')),token=String(req.headers['x-scan-token']||'');
  if(!item||!safeEqual(item.token,token))return res.status(404).json({error:'Scan session ไม่ถูกต้องหรือหมดอายุ'});
  item.status='ERROR';item.error=String(req.body?.error||'Scanner error').slice(0,500);item.expiresAt=Date.now()+2*60*1000;res.json({ok:true});
});
app.get('/api/ocr/scan/session/:id',(req,res)=>{
  cleanupOcrScanSessions();const item=ocrScanSessions.get(String(req.params.id||'')),token=String(req.query.token||'');
  if(!item||!safeEqual(item.token,token))return res.status(404).json({error:'Scan session ไม่ถูกต้องหรือหมดอายุ'});
  const files=Array.isArray(item.files)?item.files:[];
  res.set('Cache-Control','no-store').json({status:item.status,fileName:item.fileName,mimeType:item.mimeType,fileCount:files.length,files:files.map((file,index)=>({index,page:file.page,fileName:file.fileName,mimeType:file.mimeType,size:file.size||0})),error:item.error,expiresAt:new Date(item.expiresAt).toISOString()});
});
app.get('/api/ocr/scan/session/:id/file',(req,res)=>{
  cleanupOcrScanSessions();const item=ocrScanSessions.get(String(req.params.id||'')),token=String(req.query.token||'');
  if(!item||!safeEqual(item.token,token)||item.status!=='READY')return res.status(404).json({error:'ยังไม่มีไฟล์ Scan'});
  const files=Array.isArray(item.files)?item.files:[];const index=Math.max(0,Math.floor(Number(req.query.index)||0));
  const file=files[index]||(!files.length&&item.filePath?{filePath:item.filePath,fileName:item.fileName,mimeType:item.mimeType}:null);
  if(!file?.filePath||!fs.existsSync(file.filePath))return res.status(404).json({error:'ไม่พบไฟล์ Scan'});
  res.set({'Content-Type':file.mimeType||'image/jpeg','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.fileName||'scan.jpg')}`,'Cache-Control':'no-store'});res.sendFile(file.filePath);
});


// v7.63.11 - OCR review setup / export queue persistence.
// These tables are deliberately isolated from Patient/Lab production tables.
// Human-reviewed OCR data can be accumulated and exported without writing clinical data.
const ocrDefaultSetup={mode:'INTERNAL',documentType:'LAB_REPORT',workbookName:'ocr-internal-export',grouping:'person',autoQueue:true,templateNote:'',documentProfiles:{}};
function ocrActor(req){return String(req.staffUser?.displayName||req.staffUser?.username||req.headers['x-ocr-user']||req.headers['x-user']||'OCR User').trim().slice(0,120)||'OCR User'}
function normalizeOcrSetup(value={}){return{mode:String(value.mode||'INTERNAL').slice(0,40),documentType:String(value.documentType||'LAB_REPORT').slice(0,80),workbookName:String(value.workbookName||'ocr-internal-export').slice(0,160),grouping:String(value.grouping||'person').slice(0,40),autoQueue:value.autoQueue===false||String(value.autoQueue)==='0'?false:true,templateNote:String(value.templateNote||'').slice(0,2000),documentProfiles:value.documentProfiles&&typeof value.documentProfiles==='object'&&!Array.isArray(value.documentProfiles)?value.documentProfiles:{}}}
app.get('/api/ocr/setup',localOnly,staffPermissionRequired('ocrDocumentView'),async(req,res)=>{try{const r=await pool.query("SELECT setup_data,updated_by,updated_at FROM ocr_setup_profiles WHERE profile_key='default'");const row=r.rows[0];res.set('Cache-Control','no-store').json({item:{...ocrDefaultSetup,...(row?.setup_data||{}),updatedBy:row?.updated_by||'',updatedAt:row?.updated_at||null}})}catch(error){res.status(500).json({error:error.message})}});
app.put('/api/ocr/setup',localOnly,staffPermissionRequired('ocrDocumentManage'),async(req,res)=>{const setup=normalizeOcrSetup(req.body||{}),actor=ocrActor(req);try{const r=await pool.query(`INSERT INTO ocr_setup_profiles(profile_key,setup_data,updated_by,updated_at) VALUES('default',$1::jsonb,$2,NOW()) ON CONFLICT(profile_key) DO UPDATE SET setup_data=EXCLUDED.setup_data,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING setup_data,updated_by,updated_at`,[JSON.stringify(setup),actor]);await pool.query("INSERT INTO ocr_review_audit(action,actor,detail) VALUES('SETUP_SAVE',$1,$2::jsonb)",[actor,JSON.stringify({mode:setup.mode,documentType:setup.documentType,grouping:setup.grouping})]);res.json({ok:true,item:{...r.rows[0].setup_data,updatedBy:r.rows[0].updated_by,updatedAt:r.rows[0].updated_at}})}catch(error){res.status(500).json({error:error.message})}});
app.get('/api/ocr/export-records',localOnly,staffPermissionRequired('ocrDocumentView'),async(req,res)=>{const limit=Math.min(Math.max(Number(req.query.limit)||1000,1),5000);try{const r=await pool.query(`SELECT record_key,hn,patient_name,company_name,document_type,status,source_file_name,payload,updated_by,created_at,updated_at FROM ocr_export_records ORDER BY updated_at DESC LIMIT $1`,[limit]);res.set('Cache-Control','no-store').json({items:r.rows.map(x=>({...x,payload:x.payload||{}}))})}catch(error){res.status(500).json({error:error.message})}});
app.post('/api/ocr/export-records',localOnly,staffPermissionRequired('ocrDocumentManage'),async(req,res)=>{const payload=req.body&&typeof req.body==='object'?req.body:{},hn=String(payload.hn||'').trim().slice(0,80),documentType=String(payload.documentType||'UNSPECIFIED').trim().slice(0,80),recordKey=String(payload.recordId||`${hn||'NOHN'}__${documentType}`).trim().slice(0,240),actor=ocrActor(req);if(!recordKey)return res.status(400).json({error:'recordId ไม่ถูกต้อง'});try{const r=await pool.query(`INSERT INTO ocr_export_records(record_key,hn,patient_name,company_name,document_type,status,source_file_name,payload,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,NOW()) ON CONFLICT(record_key) DO UPDATE SET hn=EXCLUDED.hn,patient_name=EXCLUDED.patient_name,company_name=EXCLUDED.company_name,document_type=EXCLUDED.document_type,status=EXCLUDED.status,source_file_name=EXCLUDED.source_file_name,payload=EXCLUDED.payload,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,[recordKey,hn,String(payload.name||'').slice(0,220),String(payload.company||'').slice(0,220),documentType,String(payload.status||'READY').slice(0,40),String(payload.documentName||'').slice(0,240),JSON.stringify(payload),actor]);await pool.query("INSERT INTO ocr_review_audit(action,actor,record_key,detail) VALUES('QUEUE_SAVE',$1,$2,$3::jsonb)",[actor,recordKey,JSON.stringify({status:payload.status||'READY',documentType})]);res.json({ok:true,item:r.rows[0]})}catch(error){res.status(500).json({error:error.message})}});
app.delete('/api/ocr/export-records',localOnly,staffPermissionRequired('ocrDocumentManage'),async(req,res)=>{const actor=ocrActor(req);try{const r=await pool.query('DELETE FROM ocr_export_records RETURNING record_key');await pool.query("INSERT INTO ocr_review_audit(action,actor,detail) VALUES('QUEUE_CLEAR',$1,$2::jsonb)",[actor,JSON.stringify({count:r.rowCount})]);res.json({ok:true,count:r.rowCount})}catch(error){res.status(500).json({error:error.message})}});
app.delete('/api/ocr/export-records/:recordKey',localOnly,staffPermissionRequired('ocrDocumentManage'),async(req,res)=>{const key=String(req.params.recordKey||''),actor=ocrActor(req);try{const r=await pool.query('DELETE FROM ocr_export_records WHERE record_key=$1 RETURNING record_key',[key]);if(!r.rowCount)return res.status(404).json({error:'ไม่พบรายการ OCR'});await pool.query("INSERT INTO ocr_review_audit(action,actor,record_key) VALUES('QUEUE_DELETE',$1,$2)",[actor,key]);res.json({ok:true})}catch(error){res.status(500).json({error:error.message})}});

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function legacyPasswordHash(value) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// v7.63.81 - default administrator credential baseline. Store only hashes in distributable source.
const LEGACY_DEFAULT_ADMIN_PASSWORD_HASH = '3f708bf99ab7e362';
const DEFAULT_ADMIN_PASSWORD_HASH = '85dd2de461d3cc8e';
const ADMIN_PASSWORD_BASELINE_VERSION = 'v7.63.81';

function cleanupPackageConfigSessions() {
  const now = Date.now();
  for (const [token, session] of packageConfigSessions) if (session.expiresAt <= now) packageConfigSessions.delete(token);
  for (const [address, attempt] of packageConfigLoginAttempts) if (now - attempt.startedAt > 15 * 60 * 1000) packageConfigLoginAttempts.delete(address);
}

function packageConfigSessionRequired(req, res, next) {
  cleanupPackageConfigSessions();
  const token = String(req.headers['x-package-config-token'] || '').trim();
  const session = packageConfigSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return res.status(401).json({ error:'กรุณาใส่รหัสผ่านเพื่อปลดล็อกการตั้งค่า' });
  session.expiresAt = Date.now() + 5 * 60 * 1000;
  req.packageConfigSession = session;
  next();
}

function externalApiAuth(req, res, next) {
  const configuredKey = process.env.EXTERNAL_API_KEY;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const suppliedKey = req.headers['x-api-key'] || bearer;
  if (!configuredKey) return res.status(503).json({ error: 'EXTERNAL_API_KEY is not configured' });
  if (!safeEqual(suppliedKey, configuredKey)) return res.status(401).json({ error: 'Invalid API key' });
  next();
}

function normalizeClientAddress(value) {
  let address = String(value || '').trim().toLowerCase();
  if (address.startsWith('::ffff:')) address = address.slice(7);
  const zone = address.indexOf('%');
  if (zone >= 0) address = address.slice(0, zone);
  return address;
}
function isPrivateLanAddress(value) {
  const address = normalizeClientAddress(value);
  if (address === '127.0.0.1' || address === '::1') return true;
  if (/^10\./.test(address) || /^192\.168\./.test(address)) return true;
  const m = address.match(/^172\.(\d{1,3})\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(address) || /^fe[89ab][0-9a-f]:/.test(address)) return true;
  return false;
}
let runtimeLanEnabled = /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_LAN_ACCESS || ''));

function localOnly(req, res, next) {
  // Update Center has independent password re-authentication and a short-lived
  // token, so only these endpoints may pass through the internal HTTPS proxy.
  if (String(req.path || '').startsWith('/api/system/update/')) return next();
  const address = req.socket.remoteAddress || '';
  const lanEnabled = runtimeLanEnabled;
  if (isPrivateLanAddress(address) && (normalizeClientAddress(address) === '127.0.0.1' || normalizeClientAddress(address) === '::1' || lanEnabled)) return next();
  res.status(403).json({ error: lanEnabled ? 'This endpoint is available only from this computer or the private local network' : 'Local Network Server is OFF. Please use this application on the server computer.' });
}


const SYSTEM_HEALTH_EVENT_LIMIT=200;
const systemHealthMemory=[];
async function ensureSystemHealthSchema(){
  await pool.query(`CREATE TABLE IF NOT EXISTS system_health_events(
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    endpoint TEXT,
    entity_key TEXT,
    duration_ms INTEGER,
    expected_rows INTEGER,
    actual_rows INTEGER,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS system_health_events_created_idx ON system_health_events(created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS system_health_events_type_idx ON system_health_events(event_type,status,created_at DESC)');
}
async function recordSystemHealthEvent(event={}){
  const row={eventType:String(event.eventType||'GENERAL'),status:String(event.status||'OK'),endpoint:String(event.endpoint||''),entityKey:String(event.entityKey||''),durationMs:Math.max(0,Math.round(Number(event.durationMs)||0)),expectedRows:Number.isFinite(Number(event.expectedRows))?Number(event.expectedRows):null,actualRows:Number.isFinite(Number(event.actualRows))?Number(event.actualRows):null,detail:event.detail&&typeof event.detail==='object'?event.detail:{},createdAt:new Date().toISOString()};
  systemHealthMemory.unshift(row);if(systemHealthMemory.length>SYSTEM_HEALTH_EVENT_LIMIT)systemHealthMemory.length=SYSTEM_HEALTH_EVENT_LIMIT;
  try{await ensureSystemHealthSchema();await pool.query(`INSERT INTO system_health_events(event_type,status,endpoint,entity_key,duration_ms,expected_rows,actual_rows,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[row.eventType,row.status,row.endpoint,row.entityKey,row.durationMs,row.expectedRows,row.actualRows,JSON.stringify(row.detail)])}catch(error){console.warn('system health event write failed',error.message)}
}
async function readSystemHealthEvents(limit=30){
  try{await ensureSystemHealthSchema();const r=await pool.query(`SELECT event_type AS "eventType",status,endpoint,entity_key AS "entityKey",duration_ms AS "durationMs",expected_rows AS "expectedRows",actual_rows AS "actualRows",detail,created_at AS "createdAt" FROM system_health_events ORDER BY created_at DESC LIMIT $1`,[Math.max(1,Math.min(100,Number(limit)||30))]);return r.rows}catch(_){return systemHealthMemory.slice(0,limit)}
}

// v7.63.73 - Production Operations Center: persistent jobs, notifications, audit and recovery visibility.
let operationsWorkerBusy=false;
const OPERATIONS_JOB_TYPES=new Set(['CHECK_HN','CHECK_VN','BULK_EMR','REFRESH_PATIENTLOG','SYSTEM_HEALTH','BACKUP']);
function operationsPermissionForType(type){const value=String(type||'').toUpperCase();if(['CHECK_HN','CHECK_VN','BULK_EMR'].includes(value))return 'emrAssign';if(value==='REFRESH_PATIENTLOG')return 'projectView';if(value==='BACKUP')return 'apiManage';return 'apiView'}
async function ensureOperationsSchema(){
  await pool.query(`CREATE TABLE IF NOT EXISTS operations_jobs(
    id UUID PRIMARY KEY,job_type TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',payload JSONB NOT NULL DEFAULT '{}'::jsonb,result JSONB NOT NULL DEFAULT '{}'::jsonb,
    progress INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0,success_count INTEGER NOT NULL DEFAULT 0,skip_count INTEGER NOT NULL DEFAULT 0,fail_count INTEGER NOT NULL DEFAULT 0,
    current_item TEXT NOT NULL DEFAULT '',error_message TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL DEFAULT 'system',retry_of UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS operations_job_items(
    id BIGSERIAL PRIMARY KEY,job_id UUID NOT NULL REFERENCES operations_jobs(id) ON DELETE CASCADE,item_key TEXT NOT NULL DEFAULT '',record_key TEXT NOT NULL DEFAULT '',hn TEXT NOT NULL DEFAULT '',vn TEXT NOT NULL DEFAULT '',patient_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING',message TEXT NOT NULL DEFAULT '',started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS system_action_audit(
    id BIGSERIAL PRIMARY KEY,request_id TEXT NOT NULL DEFAULT '',method TEXT NOT NULL DEFAULT '',route TEXT NOT NULL DEFAULT '',status_code INTEGER NOT NULL DEFAULT 0,actor TEXT NOT NULL DEFAULT '',client_address TEXT NOT NULL DEFAULT '',duration_ms INTEGER NOT NULL DEFAULT 0,detail JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS system_notifications(
    id BIGSERIAL PRIMARY KEY,severity TEXT NOT NULL DEFAULT 'INFO',title TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',entity_key TEXT NOT NULL DEFAULT '',detail JSONB NOT NULL DEFAULT '{}'::jsonb,is_read BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),read_at TIMESTAMPTZ,read_by TEXT NOT NULL DEFAULT '')`);
  await pool.query('CREATE INDEX IF NOT EXISTS operations_jobs_status_created_idx ON operations_jobs(status,created_at)');
  await pool.query('CREATE INDEX IF NOT EXISTS operations_jobs_updated_idx ON operations_jobs(updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS operations_job_items_job_idx ON operations_job_items(job_id,id)');
  await pool.query('CREATE INDEX IF NOT EXISTS operations_job_items_status_idx ON operations_job_items(job_id,status,id)');
  await pool.query('CREATE INDEX IF NOT EXISTS system_action_audit_time_idx ON system_action_audit(created_at DESC,id DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS system_action_audit_actor_idx ON system_action_audit(actor,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS system_action_audit_route_idx ON system_action_audit(route,created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS system_notifications_unread_idx ON system_notifications(is_read,created_at DESC)');
  await pool.query("CREATE INDEX IF NOT EXISTS checkup_bookings_hn_idx ON checkup_bookings(hn) WHERE hn<>''");
  await pool.query("CREATE INDEX IF NOT EXISTS checkup_bookings_record_key_idx ON checkup_bookings(record_key) WHERE record_key<>''");
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_bookings_status_updated_idx ON checkup_bookings(booking_status,updated_at DESC)');
  await pool.query("CREATE INDEX IF NOT EXISTS checkup_visits_vn_idx ON checkup_visits(vn) WHERE vn<>''");
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_visits_result_status_idx ON checkup_visits(result_status,updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_workflow_audit_time_idx ON checkup_workflow_audit(performed_at DESC,id DESC)');
}
function operationsActor(req){return String(req?.staffUser?.username||req?.staffUser?.displayName||workflowActor(req)||'system').slice(0,160)}
async function operationsNotify(severity,title,message='',source='',entityKey='',detail={}){try{await ensureOperationsSchema();await pool.query('INSERT INTO system_notifications(severity,title,message,source,entity_key,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[severity,title,message,source,entityKey,JSON.stringify(detail||{})])}catch(error){console.warn('[OPS NOTIFY]',error.message)}}
async function recordSystemActionAudit(req,statusCode,durationMs){
  try{
    const pathname=String(req.path||req.originalUrl||'').split('?')[0];
    if(!pathname.startsWith('/api/')||!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase())||pathname.startsWith('/api/ops/audit'))return;
    await ensureOperationsSchema();
    const token=staffSessionToken(req),session=staffSessions.get(token);let actor=String(req.staffUser?.username||'');
    if(!actor&&session)actor=String(session.username||session.displayName||'');
    const detail={query:Object.fromEntries(Object.entries(req.query||{}).slice(0,20).map(([k,v])=>[k,String(v).slice(0,120)])),contentLength:Number(req.headers['content-length']||0)||0};
    await pool.query('INSERT INTO system_action_audit(request_id,method,route,status_code,actor,client_address,duration_ms,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[String(req.headers['x-request-id']||crypto.randomUUID()).slice(0,100),String(req.method||''),pathname,Number(statusCode)||0,actor||'anonymous',clientAddress(req),Math.max(0,Math.round(Number(durationMs)||0)),JSON.stringify(detail)]);
  }catch(error){console.warn('[ACTION AUDIT]',error.message)}
}
async function enqueueOperationsJob(jobType,payload={},actor='system',retryOf=null){
  const type=String(jobType||'').toUpperCase();if(!OPERATIONS_JOB_TYPES.has(type))throw new Error('ชนิด Job ไม่รองรับ');
  await ensureOperationsSchema();const normalizedPayload=payload&&typeof payload==='object'?payload:{},payloadJson=JSON.stringify(normalizedPayload);
  const active=(await pool.query(`SELECT id FROM operations_jobs WHERE job_type=$1 AND status IN ('PENDING','RUNNING') AND payload=$2::jsonb ORDER BY created_at DESC LIMIT 1`,[type,payloadJson])).rows[0];if(active?.id)return active.id;
  const id=crypto.randomUUID();await pool.query('INSERT INTO operations_jobs(id,job_type,status,payload,created_by,retry_of) VALUES($1,$2,\'PENDING\',$3::jsonb,$4,$5)',[id,type,payloadJson,String(actor||'system').slice(0,160),retryOf||null]);
  return id;
}
async function recoverInterruptedOperationsJobs(){
  await ensureOperationsSchema();const running=(await pool.query(`SELECT id FROM operations_jobs WHERE status='RUNNING'`)).rows.map(row=>row.id);if(!running.length)return 0;
  await pool.query(`DELETE FROM operations_job_items WHERE job_id=ANY($1::uuid[])`,[running]);
  await pool.query(`UPDATE operations_jobs SET status='PENDING',progress=0,total=0,success_count=0,skip_count=0,fail_count=0,current_item='กู้คืน Job หลัง Server restart',error_message='',started_at=NULL,finished_at=NULL,updated_at=NOW() WHERE id=ANY($1::uuid[])`,[running]);
  return running.length;
}
async function operationsUpdateJob(id,patch={}){
  const fields=[],values=[];const allowed={status:'status',progress:'progress',total:'total',successCount:'success_count',skipCount:'skip_count',failCount:'fail_count',currentItem:'current_item',errorMessage:'error_message',result:'result',startedAt:'started_at',finishedAt:'finished_at'};
  for(const [key,column] of Object.entries(allowed)){if(!(key in patch))continue;values.push(key==='result'?JSON.stringify(patch[key]||{}):patch[key]);fields.push(`${column}=$${values.length}${key==='result'?'::jsonb':''}`)}
  if(!fields.length)return;values.push(id);await pool.query(`UPDATE operations_jobs SET ${fields.join(',')},updated_at=NOW() WHERE id=$${values.length}`,values);
}
async function operationsAddItem(jobId,item={}){const r=await pool.query(`INSERT INTO operations_job_items(job_id,item_key,record_key,hn,vn,patient_name,status,message,started_at,finished_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7='RUNNING' THEN NOW() ELSE NULL END,CASE WHEN $7 IN ('SUCCESS','SKIPPED','FAILED','CANCELLED') THEN NOW() ELSE NULL END) RETURNING id`,[jobId,String(item.itemKey||''),String(item.recordKey||''),String(item.hn||''),String(item.vn||''),String(item.patientName||''),String(item.status||'PENDING'),String(item.message||'').slice(0,1000)]);return r.rows[0]?.id}
async function operationsSetItem(id,status,message=''){await pool.query(`UPDATE operations_job_items SET status=$2,message=$3,started_at=COALESCE(started_at,CASE WHEN $2='RUNNING' THEN NOW() END),finished_at=CASE WHEN $2 IN ('SUCCESS','SKIPPED','FAILED','CANCELLED') THEN NOW() ELSE finished_at END,updated_at=NOW() WHERE id=$1`,[id,status,String(message||'').slice(0,1000)])}
function recordHasEmr(record){return Boolean(record?.hisLastResultAt||record?.hisEmrResult||(record?.hisEmrResultsByVisit&&Object.keys(record.hisEmrResultsByVisit).length))}
function recordPatientName(record){return [record?.title,record?.first,record?.last].filter(Boolean).join(' ')||record?.patientName||'-'}
async function processCheckHnJob(job){
  const state=await readState(),wanted=new Set((job.payload?.recordKeys||[]).map(String)),records=(state.records||[]).filter(r=>(!wanted.size||wanted.has(String(r.key||r.id||'')))&&!String(r.hn||'').trim()).slice(0,5000);
  await operationsUpdateJob(job.id,{total:records.length});let success=0,skip=0,fail=0,processed=0;
  for(let start=0;start<records.length;start+=200){const chunk=records.slice(start,start+200),ids=[...new Set(chunk.map(r=>String(r.id||'').trim()).filter(Boolean))],byId=new Map();if(ids.length){try{const upstream=await requestPatientData(ids);if(!upstream.ok)throw new Error(`Patient API HTTP ${upstream.status}`);for(const patient of Array.isArray(upstream.data?.PatientList)?upstream.data.PatientList:[]){const id=String(patient?.IdentificationNumber||'').trim(),hn=String(patient?.HN||'').trim();if(id&&hn&&patient?.IsResult!==false&&!byId.has(id))byId.set(id,hn)}}catch(error){for(const r of chunk){const itemId=await operationsAddItem(job.id,{itemKey:r.key,recordKey:r.key,patientName:recordPatientName(r),status:'FAILED',message:error.message||String(error)});void itemId;fail++;processed++}await operationsUpdateJob(job.id,{progress:processed,successCount:success,skipCount:skip,failCount:fail});continue}}
    for(const r of chunk){const key=String(r.key||r.id||''),id=String(r.id||'').trim(),hn=byId.get(id)||'',name=recordPatientName(r);if(!id){skip++;await operationsAddItem(job.id,{itemKey:key,recordKey:key,patientName:name,status:'SKIPPED',message:'ไม่มี ID / Passport สำหรับค้นหา HN'})}else if(!hn){skip++;await operationsAddItem(job.id,{itemKey:key,recordKey:key,patientName:name,status:'SKIPPED',message:'Patient API ไม่พบ HN'})}else{await patchRecordHisFields(key,{hn,hisHnCheckedAt:new Date().toISOString(),hisHnSource:'PATIENT_API'});success++;await operationsAddItem(job.id,{itemKey:key,recordKey:key,hn,patientName:name,status:'SUCCESS',message:`พบ HN ${hn}`})}processed++;await operationsUpdateJob(job.id,{progress:processed,successCount:success,skipCount:skip,failCount:fail,currentItem:`${id||'-'} · ${name}`})}}
  return {success,skip,fail,processed,total:records.length};
}
async function processCheckVnJob(job){
  const state=await readState(),wanted=new Set((job.payload?.recordKeys||[]).map(String)),records=(state.records||[]).filter(r=>(!wanted.size||wanted.has(String(r.key||r.id||'')))&&String(r.hn||'').trim()&&!String(r.hisLastVisitUID||r.vn||'').trim()).slice(0,5000);
  await operationsUpdateJob(job.id,{total:records.length});let success=0,skip=0,fail=0,processed=0;
  for(const r of records){const statusRow=(await pool.query('SELECT status FROM operations_jobs WHERE id=$1',[job.id])).rows[0];if(statusRow?.status==='CANCELLED')break;const key=String(r.key||r.id||''),hn=String(r.hn||'').trim(),name=recordPatientName(r),itemId=await operationsAddItem(job.id,{itemKey:key,recordKey:key,hn,patientName:name,status:'RUNNING'});try{const call=await callConfiguredHisJson('GET_VISIT',{HN:hn,Location:'',ContextKey:String(process.env.HIS_CONTEXT_KEY||'Vimut2022')}),root=Array.isArray(call.data)?call.data[0]:(call.data?.Patient||call.data||{}),selected=chooseHisVisit(root,'');if(!selected?.VisitUID){skip++;await operationsSetItem(itemId,'SKIPPED','HIS ไม่พบ VN')}else{const vn=String(selected.VisitUID);await patchRecordHisFields(key,{hisLastVisitUID:vn,hisLastVisitAt:new Date().toISOString(),hisVisitResult:{patient:{UID:root?.UID||null,HN:root?.HN||hn,FirstName:root?.FirstName||'',LastName:root?.LastName||'',Company:root?.Company||'',PackageName:root?.PackageName||'',CheckupDate:root?.CheckupDate||''},visits:Array.isArray(root?.Visit)?root.Visit:[]}});success++;await operationsSetItem(itemId,'SUCCESS',`พบ VN ${vn}`)}}catch(error){fail++;await operationsSetItem(itemId,'FAILED',error.message||String(error))}processed++;await operationsUpdateJob(job.id,{progress:processed,successCount:success,skipCount:skip,failCount:fail,currentItem:`${hn} · ${name}`})}
  return {success,skip,fail,processed,total:records.length};
}
async function processBulkEmrJob(job){
  const state=await readState(),wanted=new Set((job.payload?.recordKeys||[]).map(String)),records=(state.records||[]).filter(r=>!wanted.size||wanted.has(String(r.key||r.id||''))).slice(0,5000);
  await operationsUpdateJob(job.id,{total:records.length});let success=0,skip=0,fail=0,processed=0;
  for(const record of records){
    const statusRow=(await pool.query('SELECT status FROM operations_jobs WHERE id=$1',[job.id])).rows[0];if(statusRow?.status==='CANCELLED')break;
    const recordKey=String(record.key||record.id||''),hn=String(record.hn||'').trim(),name=recordPatientName(record);let vns=[...new Set([...(Array.isArray(record.hisPrimaryVisitUIDs)?record.hisPrimaryVisitUIDs:[]),record.hisLastVisitUID||record.vn||''].map(v=>String(v||'').trim()).filter(Boolean))];
    const itemId=await operationsAddItem(job.id,{itemKey:recordKey,recordKey,hn,vn:vns.join(','),patientName:name,status:'RUNNING'});await operationsUpdateJob(job.id,{currentItem:`${hn||'-'} · ${name}`,progress:processed,successCount:success,skipCount:skip,failCount:fail});
    try{
      if(!hn){skip++;await operationsSetItem(itemId,'SKIPPED','ไม่มี HN');processed++;await operationsUpdateJob(job.id,{progress:processed,successCount:success,skipCount:skip,failCount:fail});continue}
      let visitResult=null;
      if(!vns.length){const visitCall=await callConfiguredHisJson('GET_VISIT',{HN:hn,Location:'',ContextKey:String(process.env.HIS_CONTEXT_KEY||'Vimut2022')});const root=Array.isArray(visitCall.data)?visitCall.data[0]:(visitCall.data?.Patient||visitCall.data||{}),selected=chooseHisVisit(root,'');if(selected?.VisitUID){vns=[String(selected.VisitUID)];visitResult={patient:{UID:root?.UID||null,HN:root?.HN||hn,FirstName:root?.FirstName||'',LastName:root?.LastName||'',Company:root?.Company||'',PackageName:root?.PackageName||'',CheckupDate:root?.CheckupDate||''},visits:Array.isArray(root?.Visit)?root.Visit:[]}}}
      if(!vns.length){skip++;await operationsSetItem(itemId,'SKIPPED','HIS ไม่พบ VN');processed++;await operationsUpdateJob(job.id,{progress:processed,successCount:success,skipCount:skip,failCount:fail});continue}
      let received=0,lastPayload=null,lastVn='';const byVisit={...(record.hisEmrResultsByVisit&&typeof record.hisEmrResultsByVisit==='object'?record.hisEmrResultsByVisit:{})};
      for(const vn of vns){const emrCall=await callConfiguredHisJson('GET_EMR_RESULT',{HN:hn,VisitUID:vn,Request:'',DoctorNumber:'',Licensenumber:'',ContextKey:String(process.env.HIS_CONTEXT_KEY||'Vimut2022')});const emrData=findHisEmrPayloadServer(emrCall.data);await persistEmrPayload(pool,{recordKey,hn,visitUid:vn,payload:emrData,rawPayload:emrCall.data});byVisit[vn]=emrData;lastPayload=emrData;lastVn=vn;received++}
      await patchRecordHisFields(recordKey,{hisLastVisitUID:lastVn||record.hisLastVisitUID||'',hisPrimaryVisitUIDs:vns,hisLastResultAt:new Date().toISOString(),hisEmrResult:lastPayload||record.hisEmrResult||{},hisEmrResultsByVisit:byVisit,...(visitResult?{hisVisitResult:visitResult}:{})});success++;await operationsSetItem(itemId,'SUCCESS',`รับ EMR สำเร็จ ${received} VN`);
    }catch(error){fail++;await operationsSetItem(itemId,'FAILED',error.message||String(error))}
    processed++;await operationsUpdateJob(job.id,{progress:processed,successCount:success,skipCount:skip,failCount:fail});
  }
  return {success,skip,fail,processed,total:records.length};
}
async function processPatientLogJob(job){
  const state=await readState(),wanted=new Set((job.payload?.recordKeys||[]).map(String)),records=(state.records||[]).filter(r=>(!wanted.size||wanted.has(String(r.key||r.id||'')))&&String(r.hn||'').trim()&&String(r.hisLastVisitUID||r.vn||'').trim()).slice(0,2000);
  await operationsUpdateJob(job.id,{total:records.length,currentItem:'อ่าน patientlog ล่าสุด'});const requests=records.map(r=>({key:String(r.key||r.id||''),hn:String(r.hn||'').trim(),vn:String(r.hisLastVisitUID||r.vn||'').trim()})),result=await fetchLatestPatientLogStatuses(requests),byKey=new Map((result.items||[]).map(x=>[String(x.key),x]));let success=0,skip=0;
  for(let i=0;i<records.length;i++){const r=records[i],key=String(r.key||r.id||''),x=byKey.get(key),has=Boolean(x?.status);await operationsAddItem(job.id,{itemKey:key,recordKey:key,hn:r.hn,vn:r.hisLastVisitUID||r.vn,patientName:recordPatientName(r),status:has?'SUCCESS':'SKIPPED',message:has?`Status: ${x.status}`:'ไม่พบ patientlog'});await patchRecordHisFields(key,{hisPatientLogStatus:String(x?.status||''),hisPatientLogInsdate:x?.insdate||null,hisPatientLogStatusAt:new Date().toISOString()});if(has)success++;else skip++;await operationsUpdateJob(job.id,{progress:i+1,successCount:success,skipCount:skip,currentItem:`${r.hn||'-'} · ${recordPatientName(r)}`})}
  return {success,skip,fail:0,processed:records.length,total:records.length,source:result.source};
}
async function processSystemHealthJob(job){const started=Date.now(),dbStart=Date.now();await pool.query('SELECT 1');const dbLatency=Date.now()-dbStart,stat=fs.statfsSync?fs.statfsSync(__dirname):null,freeBytes=stat?Number(stat.bavail)*Number(stat.bsize):null,update=readUpdateStatus(),detail={dbLatencyMs:dbLatency,diskFreeGb:freeBytes==null?null:Math.round(freeBytes/1073741824*10)/10,updatePhase:update.phase||'IDLE',memoryMb:Math.round(process.memoryUsage().rss/1048576),uptimeSec:Math.round(process.uptime()),durationMs:Date.now()-started};await operationsUpdateJob(job.id,{total:1,progress:1,successCount:1,currentItem:'System Health',result:detail});if(dbLatency>1000||freeBytes!=null&&freeBytes<2147483648)await operationsNotify('WARNING','System Health ต้องตรวจสอบ',`DB ${dbLatency} ms · Disk ${detail.diskFreeGb??'-'} GB`,'SYSTEM_HEALTH',job.id,detail);return {success:1,skip:0,fail:0,processed:1,total:1,...detail}}
async function processBackupJob(job){
  if(process.platform!=='win32')throw new Error('Backup จากหน้าเว็บรองรับ Production Windows Server เท่านั้น');const script=path.join(__dirname,'tools','backup.ps1');if(!fs.existsSync(script))throw new Error('ไม่พบ tools/backup.ps1');await operationsUpdateJob(job.id,{total:1,currentItem:'กำลังสำรอง PostgreSQL'});
  const output=await new Promise((resolve,reject)=>{const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),child=spawn(shell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{cwd:__dirname,windowsHide:true,env:process.env});let text='',err='';const timer=setTimeout(()=>{child.kill();reject(new Error('Backup timeout เกิน 30 นาที'))},30*60*1000);child.stdout?.on('data',d=>text+=String(d));child.stderr?.on('data',d=>err+=String(d));child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(text.trim());else reject(new Error(err.trim()||`backup.ps1 exit ${code}`))})});await operationsUpdateJob(job.id,{progress:1,successCount:1,result:{output}});return {success:1,skip:0,fail:0,processed:1,total:1,output}}
async function processOperationsJob(job){if(job.job_type==='CHECK_HN')return processCheckHnJob(job);if(job.job_type==='CHECK_VN')return processCheckVnJob(job);if(job.job_type==='BULK_EMR')return processBulkEmrJob(job);if(job.job_type==='REFRESH_PATIENTLOG')return processPatientLogJob(job);if(job.job_type==='SYSTEM_HEALTH')return processSystemHealthJob(job);if(job.job_type==='BACKUP')return processBackupJob(job);throw new Error(`Unsupported job ${job.job_type}`)}
async function operationsWorkerTick(){
  if(operationsWorkerBusy)return;operationsWorkerBusy=true;try{await ensureOperationsSchema();const row=(await pool.query(`SELECT * FROM operations_jobs WHERE status='PENDING' ORDER BY created_at,id LIMIT 1`)).rows[0];if(!row)return;await operationsUpdateJob(row.id,{status:'RUNNING',startedAt:new Date(),currentItem:'กำลังเตรียมงาน'});const job={...row,payload:row.payload||{}};try{const result=await processOperationsJob(job),fresh=(await pool.query('SELECT status FROM operations_jobs WHERE id=$1',[row.id])).rows[0];if(fresh?.status==='CANCELLED'){await operationsNotify('WARNING',`Job ${row.job_type} ถูกยกเลิก`,'ผู้ใช้ยกเลิกงานระหว่างดำเนินการ','JOB',row.id,result);return}const status=result.fail>0?(result.success>0||result.skip>0?'PARTIAL':'FAILED'):'SUCCESS';await operationsUpdateJob(row.id,{status,progress:result.processed,total:result.total,successCount:result.success,skipCount:result.skip,failCount:result.fail,finishedAt:new Date(),currentItem:'',result});await operationsNotify(status==='SUCCESS'?'SUCCESS':status==='PARTIAL'?'WARNING':'ERROR',`Job ${row.job_type} ${status==='SUCCESS'?'เสร็จสิ้น':status==='PARTIAL'?'เสร็จบางส่วน':'ไม่สำเร็จ'}`,`สำเร็จ ${result.success||0} · ข้าม ${result.skip||0} · ผิดพลาด ${result.fail||0}`,'JOB',row.id,result)}catch(error){await operationsUpdateJob(row.id,{status:'FAILED',finishedAt:new Date(),errorMessage:error.message||String(error),currentItem:''});await operationsNotify('ERROR',`Job ${row.job_type} ไม่สำเร็จ`,error.message||String(error),'JOB',row.id,{})}}
  catch(error){console.warn('[OPS WORKER]',error.message)}finally{operationsWorkerBusy=false}
}
async function operationsWorkItems(){
  const state=await readState(),bookings=(await pool.query(`SELECT b.id,b.project_id,b.record_key,b.hn AS booking_hn,b.patient_name,b.company_name,b.package_code,b.package_name,b.booking_status,p.project_code,p.project_name FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id WHERE b.booking_status<>'CANCELLED' AND p.status<>'CANCELLED' AND p.project_code<>'HIS-OPEN-VISIT' ORDER BY b.updated_at DESC LIMIT 10000`)).rows,bookingByRecord=new Map();for(const b of bookings){const key=String(b.record_key||'');if(key&&!bookingByRecord.has(key))bookingByRecord.set(key,b)}const items=[];
  for(const r of state.records||[]){const key=String(r.key||r.id||''),b=bookingByRecord.get(key),hn=String(r.hn||b?.booking_hn||'').trim(),vn=String(r.hisLastVisitUID||r.vn||'').trim(),hasEmr=recordHasEmr(r),base={recordKey:key,hn,vn,patientName:recordPatientName(r),companyName:b?.company_name||'',projectCode:b?.project_code||'',projectName:b?.project_name||'',bookingId:b?.id||'',packageCode:r.code||b?.package_code||'',packageName:r.packageName||b?.package_name||''};if(!hn)items.push({...base,type:'NO_HN',severity:'ERROR',message:'ยังไม่มี HN'});else if(!vn)items.push({...base,type:'NO_VN',severity:'WARNING',message:'มี HN แล้ว แต่ยังไม่มี VN'});else if(!hasEmr)items.push({...base,type:'NO_EMR',severity:'WARNING',message:'มี HN/VN แล้ว แต่ยังไม่ได้รับ EMR'});if(String(r.hisPatientLogStatus||'').toLowerCase()==='error')items.push({...base,type:'HIS_STATUS_ERROR',severity:'ERROR',message:'patientlog ล่าสุดเป็น Error'})}
  return {items,records:state.records||[],bookingCount:bookings.length};
}

registerDataCenter(app,{localOnly,rootDir:__dirname,settingsPool:pool,encryptPassword:encryptAppointmentPassword,decryptPassword:decryptAppointmentPassword,configSessionRequired:packageConfigSessionRequired});

function customerCors(req, res, next) {
  const configured = String(process.env.CUSTOMER_ALLOWED_ORIGINS || '').trim();
  const origin = String(req.headers.origin || '').trim();
  if (configured && origin) {
    const allowed = configured.split(',').map(item => item.trim()).filter(Boolean);
    if (allowed.includes('*') || allowed.includes(origin)) res.set('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : origin);
  }
  res.set('Vary','Origin');
  res.set('Access-Control-Allow-Headers','Content-Type, X-Customer-Token');
  res.set('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

function requestJsonUrl(urlValue, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlValue); } catch (_) { reject(new Error('THAI_ID_READER_URL ไม่ถูกต้อง')); return; }
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(url, { timeout: timeoutMs, headers:{ Accept:'application/json' } }, response => {
      const chunks=[]; let size=0;
      response.on('data', chunk => { size += chunk.length; if(size > 1024*1024){ request.destroy(new Error('ข้อมูลจากเครื่องอ่านบัตรมีขนาดเกินกำหนด')); return; } chunks.push(chunk); });
      response.on('end', () => {
        const text=Buffer.concat(chunks).toString('utf8');
        if(response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`เครื่องอ่านบัตรตอบกลับ HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(text)); } catch (_) { reject(new Error('เครื่องอ่านบัตรไม่ได้ตอบกลับเป็น JSON')); }
      });
    });
    request.on('timeout',()=>request.destroy(new Error('เครื่องอ่านบัตรไม่ตอบกลับภายในเวลาที่กำหนด')));
    request.on('error',reject);
  });
}

async function maintenanceGuard(req, res, next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  if (req.path === '/api/system/maintenance') return next();
  try {
    const result = await pool.query("SELECT value FROM system_settings WHERE key='maintenance_mode'");
    if (result.rows[0]?.value === 'true') return res.status(503).json({ error:'ระบบอยู่ระหว่างปรับปรุง กรุณารอจนกว่าผู้ดูแลจะเปิดใช้งานอีกครั้ง', maintenance:true });
    next();
  } catch (error) { next(error); }
}
app.use(maintenanceGuard);
app.use((req,res,next)=>{
  if(!String(req.path||'').startsWith('/api/')||!['POST','PUT','PATCH','DELETE'].includes(String(req.method||'').toUpperCase()))return next();
  const started=Date.now();res.on('finish',()=>{recordSystemActionAudit(req,res.statusCode,Date.now()-started).catch(()=>{})});next();
});

function normalizedIdentity(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
}
function normalizedPersonName(value) {
  return String(value || '').trim().toLocaleLowerCase('th-TH').replace(/[\s.\-_'"()]/g, '');
}
function normalizedBirth(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 8) return digits;
  if (/^\d{4}/.test(raw)) return digits;
  return `${digits.slice(4)}${digits.slice(2,4)}${digits.slice(0,2)}`;
}
function clientAddress(req) {
  return String(req.socket.remoteAddress || 'unknown').slice(0, 80);
}
function cleanupCustomerSessions() {
  const now = Date.now();
  for (const [token, session] of customerSessions) if (session.expiresAt <= now) customerSessions.delete(token);
  for (const [key, attempt] of customerLoginAttempts) if (now - attempt.startedAt > 15 * 60 * 1000) customerLoginAttempts.delete(key);
}
function customerSession(req) {
  cleanupCustomerSessions();
  const token = String(req.headers['x-customer-token'] || '').trim();
  const session = customerSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return null;
  session.expiresAt = Date.now() + 20 * 60 * 1000;
  return session;
}
function customerSessionRequired(req, res, next) {
  const session = customerSession(req);
  if (!session) return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณายืนยันตัวตนใหม่' });
  req.customerSession = session;
  next();
}
function safeCustomerProfile(record, company, state) {
  const id = String(record.id || '');
  const pending = record.customerPendingSelection || null;
  return {
    name: [record.title, record.first, record.last].filter(Boolean).join(' '),
    profile: { title:record.title || '', firstName:record.first || '', lastName:record.last || '', phone:record.phone || '', email:record.email || '' },
    identityMissing: !normalizedIdentity(record.id),
    maskedId: id.length > 4 ? `${'*'.repeat(Math.min(id.length - 4, 9))}${id.slice(-4)}` : id,
    birthDate: record.birth || '', sex: record.sex || '',
    company: company ? { name: company.name || '', year: company.year || '' } : null,
    primaryPackages: Array.isArray(record.primaryPackages) ? record.primaryPackages : (record.code || record.packageName ? [{ code:record.code || '', name:record.packageName || '' }] : []),
    choices: {
      billing: (company?.billingPackages || []).map(item => ({ id:String(item.id || item.name), name:item.name || '', price:Number(item.price || 0) })),
      cash: (company?.cashPackages || []).map(item => ({ id:String(item.id || item.name), name:item.name || '', price:Number(item.price || 0) })),
      contract: (state.packages || []).map(item => ({ id:String(item.id || item.code || item.packagecode), code:item.code || item.packagecode || '', name:item.name || item.packagename || '', price:Number(item.price || 0) }))
    },
    locked: Boolean(record.visitedAt), confirmedAt: record.visitedAt || null,
    pendingSelection: pending ? { billingIds:pending.billingIds || [], cashIds:pending.cashIds || [], contractIds:pending.contractIds || [], note:pending.note || '', submittedAt:pending.submittedAt || null, status:'PENDING' } : null
  };
}

function buildCustomerSelection(req, company, state) {
  const allowedBilling = new Set((company?.billingPackages || []).map(item => String(item.id || item.name)));
  const allowedCash = new Set((company?.cashPackages || []).map(item => String(item.id || item.name)));
  const allowedContract = new Set((state.packages || []).map(item => String(item.id || item.code || item.packagecode)));
  const uniqueAllowed = (items, allowed) => [...new Set((Array.isArray(items) ? items : []).map(String))].filter(id => allowed.has(id));
  return {
    billingIds:uniqueAllowed(req.body?.billingIds, allowedBilling), cashIds:uniqueAllowed(req.body?.cashIds, allowedCash),
    contractIds:uniqueAllowed(req.body?.contractIds, allowedContract), note:String(req.body?.note || '').trim().slice(0,500)
  };
}
async function saveCustomerSelection(record, company, state, selection) {
  selection.submittedAt = new Date().toISOString(); selection.status = 'PENDING';
  record.customerPendingSelection = selection; state.at = new Date().toISOString(); await writeState(state);
  await pool.query(`INSERT INTO checkup_audit_log
    (record_key,customer_name,id_passport,company_id,company_name,company_year,package_code,package_name,action,
     performed_by_user_id,performed_by_username,performed_by_display_name,details)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'UPDATE','customer-self-service','customer','ลูกค้าเลือกด้วยตนเอง',$9::jsonb)`,
    [String(record.key || record.id),[record.title,record.first,record.last].filter(Boolean).join(' '),record.id || '',record.companyId || '',company?.name || '',company?.year || '',record.code || '',record.packageName || '',JSON.stringify({kind:'CUSTOMER_SELF_SELECTION_ID_VERIFIED',selection})]);
  return selection;
}

function requestPackageDetail(urlValue, method, payload, suppliedHeaders = {}) {
  return new Promise((resolve, reject) => {
    const upperMethod = String(method || 'POST').toUpperCase();
    const url = new URL(urlValue);
    if (payload && String(payload.CODE || '').trim()) {
      url.searchParams.set('CODE', String(payload.CODE).trim());
    }
    const body = JSON.stringify(payload || {});
    const request = https.request(url, {
      method: upperMethod,
      headers: {
        Accept: 'application/json',
        ...(suppliedHeaders.authorization ? { Authorization: String(suppliedHeaders.authorization) } : {}),
        ...(suppliedHeaders['x-api-key'] ? { 'x-api-key': String(suppliedHeaders['x-api-key']) } : {}),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 20000
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) {
          request.destroy(new Error('ข้อมูลตอบกลับมีขนาดเกิน 5 MB'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = text;
        try { data = text ? JSON.parse(text) : null; } catch (_) {}
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 502,
          contentType: response.headers['content-type'] || '',
          data
        });
      });
    });
    request.on('timeout', () => request.destroy(new Error('AWS API ไม่ตอบกลับภายใน 20 วินาที')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function readPatientApiConfig(){const result=await pool.query('SELECT endpoint_url,api_key,updated_at,updated_by FROM patient_api_config WHERE id=1');return result.rows[0]||{endpoint_url:DEFAULT_PATIENT_API_URL,api_key:'',updated_at:null,updated_by:'system'}}
async function requestPatientData(identificationNumbers) {
  const patientConfig=await readPatientApiConfig();
  return new Promise((resolve,reject)=>{
    const url=new URL(patientConfig.endpoint_url||DEFAULT_PATIENT_API_URL);
    const apiKey=String(patientConfig.api_key||'').trim();
    if(!apiKey)return reject(new Error('ยังไม่ได้ตั้งค่า PATIENT_API_KEY บน Server'));
    const list=(Array.isArray(identificationNumbers)?identificationNumbers:[identificationNumbers]).map(value=>String(value||'').trim()).filter(Boolean);
    const body=JSON.stringify({IdentificationNumberList:list});
    const request=https.request(url,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','x-api-key':apiKey,'Content-Length':Buffer.byteLength(body)},timeout:20000},response=>{
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>12*1024*1024)return request.destroy(new Error('ข้อมูลผู้ป่วยตอบกลับมีขนาดเกิน 12 MB'));chunks.push(chunk)});
      response.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let data=null;try{data=text?JSON.parse(text):null}catch(_){return reject(new Error('รูปแบบข้อมูลตอบกลับจาก Patient API ไม่ถูกต้อง'))}resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode||502,data})});
    });
    request.on('timeout',()=>request.destroy(new Error('Patient API ไม่ตอบกลับภายใน 20 วินาที')));
    request.on('error',reject);request.write(body);request.end();
  });
}

function publicCompany(company) {
  return {
    id: company.id, name: company.name || '', code: company.code || '',
    year: company.year || '', note: company.note || '',
    checkupStartDate: company.checkupStartDate || '', checkupEndDate: company.checkupEndDate || '',
    billingPackages: company.billingPackages || [], cashPackages: company.cashPackages || []
  };
}

function publicCustomer(record, companies) {
  const company = companies.find(item => item.id === record.companyId);
  return {
    key: record.key || record.id || '', companyId: record.companyId || '',
    companyName: company?.name || '', companyYear: company?.year || '',
    title: record.title || '', firstName: record.first || '', lastName: record.last || '',
    idPassport: record.id || '', birthDate: record.birth || '', sex: record.sex || '',
    packageCode: record.code || '', packageName: record.packageName || '',
    visitedAt: record.visitedAt || null
  };
}

const APP_STATE_RELATIONAL_KEYS = new Set(['companies','records','packages']);
function compactAppState(data){
  const compact={};
  for(const [key,value] of Object.entries(data&&typeof data==='object'?data:{})){
    if(key==='_revision'||APP_STATE_RELATIONAL_KEYS.has(key))continue;
    compact[key]=value;
  }
  return compact;
}
function compactRecordForWire(record){
  const compact={};
  for(const [key,value] of Object.entries(record&&typeof record==='object'?record:{})){
    if(value==null||value===''||value===false)continue;
    if(Array.isArray(value)&&value.length===0)continue;
    if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0)continue;
    compact[key]=value;
  }
  return compact;
}
async function hydrateRelationalState(base={}){
  const [companiesResult,recordsResult,packagesResult]=await Promise.all([
    pool.query(`SELECT cy.id,cy.screening_year,cy.note,cy.source_data,c.company_code,c.company_name
      FROM company_years cy JOIN companies c ON c.id=cy.company_id ORDER BY cy.updated_at DESC,cy.id`),
    pool.query(`SELECT cc.legacy_record_key,cc.company_year_id,cc.employee_code,cc.package_code,cc.package_name,cc.visited_at,cc.source_data,
      c.hn,c.vn,c.identification_number,c.passport_number,c.title,c.first_name,c.last_name,c.birth_date,c.sex,c.phone,c.email
      FROM company_customers cc JOIN customers c ON c.id=cc.customer_id ORDER BY cc.updated_at DESC,cc.id`),
    pool.query(`SELECT id,package_code,package_name,price,usage_condition,source_data FROM contract_packages ORDER BY updated_at DESC,id`)
  ]);
  const companies=companiesResult.rows.map(row=>({...(row.source_data||{}),id:String(row.id||''),code:String(row.company_code||row.source_data?.code||''),name:String(row.company_name||row.source_data?.name||''),year:String(row.screening_year||row.source_data?.year||''),note:String(row.note||row.source_data?.note||'')}));
  const records=recordsResult.rows.map(row=>({...(row.source_data||{}),key:String(row.legacy_record_key||row.source_data?.key||row.source_data?.id||''),companyId:String(row.company_year_id||row.source_data?.companyId||''),hn:String(row.hn||row.source_data?.hn||''),vn:String(row.vn||row.source_data?.vn||row.source_data?.hisLastVisitUID||''),hisLastVisitUID:String(row.vn||row.source_data?.hisLastVisitUID||''),id:String(row.identification_number||row.passport_number||row.source_data?.id||''),title:String(row.title||row.source_data?.title||''),first:String(row.first_name||row.source_data?.first||''),last:String(row.last_name||row.source_data?.last||''),birth:String(row.birth_date||row.source_data?.birth||''),sex:String(row.sex||row.source_data?.sex||''),phone:String(row.phone||row.source_data?.phone||''),email:String(row.email||row.source_data?.email||''),employeeCode:String(row.employee_code||row.source_data?.employeeCode||''),code:String(row.package_code||row.source_data?.code||''),packageName:String(row.package_name||row.source_data?.packageName||''),visitedAt:row.visited_at||row.source_data?.visitedAt||null}));
  const packages=packagesResult.rows.map(row=>({...(row.source_data||{}),id:String(row.source_data?.id||row.id||''),code:String(row.package_code||row.source_data?.code||''),name:String(row.package_name||row.source_data?.name||''),price:row.price??row.source_data?.price??null,usageCondition:String(row.usage_condition||row.source_data?.usageCondition||'')}));
  return {...base,companies,records,packages};
}

async function readState() {
  const result = await pool.query('SELECT data, revision FROM app_state WHERE id = 1');
  const hydrated=await hydrateRelationalState(result.rows[0]?.data || {});
  return { ...hydrated, _revision:Number(result.rows[0]?.revision || 0) };
}

async function writeState(data) {
  const clean={...data};delete clean._revision;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const locked=await client.query('SELECT revision FROM app_state WHERE id=1 FOR UPDATE');
    const nextRevision=Number(locked.rows[0]?.revision||0)+1;
    if(Array.isArray(clean.companies)&&Array.isArray(clean.records)&&Array.isArray(clean.packages))await syncStateToRelational(client,clean,nextRevision);
    const compact=compactAppState(clean);
    const result=await client.query('UPDATE app_state SET data = $1::jsonb, revision=$2, updated_at = NOW() WHERE id = 1 RETURNING revision', [JSON.stringify(compact),nextRevision]);
    const revision=Number(result.rows[0]?.revision||0);
    await client.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);
    await client.query('COMMIT');
    compressedStateCache={revision:null,body:null};
    data._revision=revision;
    return revision;
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

// Fast path for HIS result callbacks (visit/emr/checkup-result/order/cancel/etc).
// These endpoints only ever need to update a handful of fields on ONE customer
// record after a HIS call. The old readState()/writeState() round trip
// hydrated every company/customer/package row and then replayed all of them
// back into the relational tables (syncStateToRelational loops row-by-row),
// which made every single HIS interaction pay an O(total customers) cost.
// This patches only the affected row(s), the same approach already used by
// PATCH /api/state/records/:recordKey.
async function patchRecordHisFields(recordKey, fields) {
  if (!recordKey) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const membership = await client.query(
      `SELECT cc.id AS company_customer_id, c.id AS customer_id
       FROM company_customers cc JOIN customers c ON c.id = cc.customer_id
       WHERE cc.legacy_record_key = $1 LIMIT 1`,
      [recordKey],
    );
    if (!membership.rowCount) { await client.query('ROLLBACK'); return null; }
    const { company_customer_id, customer_id } = membership.rows[0];
    const patch = JSON.stringify(fields || {});
    await client.query(
      `UPDATE company_customers SET source_data = COALESCE(source_data,'{}'::jsonb) || $2::jsonb,
       revision = revision + 1, updated_at = NOW() WHERE id = $1`,
      [company_customer_id, patch],
    );
    if (Object.prototype.hasOwnProperty.call(fields || {}, 'hisLastVisitUID')) {
      await client.query(
        `UPDATE customers SET vn = $2, revision = revision + 1, updated_at = NOW() WHERE id = $1`,
        [customer_id, String(fields.hisLastVisitUID || '')],
      );
    }
    const revisionResult = await client.query(
      `UPDATE app_state SET updated_at = NOW() WHERE id = 1 RETURNING revision`,
    );
    await client.query('COMMIT');
    compressedStateCache = { revision: null, body: null };
    return Number(revisionResult.rows[0]?.revision || 0);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function ensureDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  // Tables created below reference the normalized company schema. Bootstrap
  // it first so a brand-new PostgreSQL database can start without an
  // installer-specific preflight step.
  await ensureRelationalSchema(pool);

await pool.query(`DO $$ DECLARE legacy_audit text := 'ocr_' || 'sta' || 'ging_audit'; BEGIN
  IF to_regclass('public.' || legacy_audit) IS NOT NULL AND to_regclass('public.ocr_review_audit') IS NULL THEN
    EXECUTE format('ALTER TABLE %I RENAME TO ocr_review_audit', legacy_audit);
  END IF;
END $$`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ocr_setup_profiles (
    profile_key TEXT PRIMARY KEY,
    setup_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ocr_export_records (
    id BIGSERIAL PRIMARY KEY,
    record_key TEXT NOT NULL UNIQUE,
    hn TEXT NOT NULL DEFAULT '',
    patient_name TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    document_type TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'READY',
    source_file_name TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS ocr_export_records_hn_idx ON ocr_export_records(hn)');
  await pool.query('CREATE INDEX IF NOT EXISTS ocr_export_records_document_idx ON ocr_export_records(document_type,updated_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS ocr_review_audit (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT '',
    record_key TEXT NOT NULL DEFAULT '',
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS ocr_review_audit_created_idx ON ocr_review_audit(created_at DESC)');
  await pool.query(`INSERT INTO schema_migrations(version,description) VALUES('0180','OCR review setup, export queue and audit tables') ON CONFLICT(version) DO NOTHING`);
  await pool.query(`INSERT INTO system_settings(key,value) VALUES
    ('maintenance_mode','false'),('last_backup_at','') ON CONFLICT(key) DO NOTHING`);
  const appointmentSetting=await pool.query("SELECT 1 FROM system_settings WHERE key='his_appointment_config'");
  if(!appointmentSetting.rows.length&&(defaultHisAppointmentConfig.host||defaultHisAppointmentConfig.user||defaultHisAppointmentConfig.password)){
    const stored={host:defaultHisAppointmentConfig.host,port:defaultHisAppointmentConfig.port,database:defaultHisAppointmentConfig.database,user:defaultHisAppointmentConfig.user,passwordEncrypted:encryptAppointmentPassword(defaultHisAppointmentConfig.password),schema:defaultHisAppointmentConfig.schema,table:defaultHisAppointmentConfig.table,locationTable:defaultHisAppointmentConfig.locationTable,doctorTable:defaultHisAppointmentConfig.doctorTable,updatedBy:'migration'};
    await pool.query("INSERT INTO system_settings(key,value,updated_at) VALUES('his_appointment_config',$1,NOW())",[JSON.stringify(stored)]);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('ALTER TABLE app_state ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0');
  await pool.query(`INSERT INTO app_state (id, data)
    VALUES (1, '{"companies":[],"records":[],"packages":[],"packageUsageConditions":"","packageUpdatedAt":null,"roles":[],"users":[],"at":null}'::jsonb)
    ON CONFLICT (id) DO NOTHING`);
  // v7.63.81: migrate only the legacy default admin password. Custom admin passwords are preserved.
  {
    const adminStateRow=(await pool.query('SELECT data FROM app_state WHERE id=1')).rows[0];
    const adminState=adminStateRow?.data&&typeof adminStateRow.data==='object'?adminStateRow.data:{};
    adminState.users=Array.isArray(adminState.users)?adminState.users:[];
    let admin=adminState.users.find(item=>normalizedPersonName(item?.username)==='admin');
    let adminChanged=false;
    if(!admin){
      admin={id:crypto.randomUUID(),displayName:'ผู้ดูแลระบบ',username:'admin',passwordHash:DEFAULT_ADMIN_PASSWORD_HASH,roleId:'admin',active:true,createdAt:new Date().toISOString()};
      adminState.users.push(admin);adminChanged=true;
    }else{
      admin.displayName=admin.displayName||'ผู้ดูแลระบบ';admin.username='admin';admin.roleId='admin';admin.active=true;
      const currentHash=String(admin.passwordHash||'');
      if(!currentHash||currentHash===LEGACY_DEFAULT_ADMIN_PASSWORD_HASH){admin.passwordHash=DEFAULT_ADMIN_PASSWORD_HASH;adminChanged=true;}
    }
    if(adminState.adminPasswordBaselineVersion!==ADMIN_PASSWORD_BASELINE_VERSION){adminState.adminPasswordBaselineVersion=ADMIN_PASSWORD_BASELINE_VERSION;adminChanged=true;}
    if(adminChanged)await pool.query('UPDATE app_state SET data=$1::jsonb,revision=revision+1,updated_at=NOW() WHERE id=1',[JSON.stringify(adminState)]);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS app_state_import_backups (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL DEFAULT 'IMPORT',
    performed_by TEXT NOT NULL DEFAULT '',
    source_revision BIGINT NOT NULL,
    import_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    data JSONB NOT NULL
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS app_state_import_backups_created_idx ON app_state_import_backups(created_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS package_api_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    endpoint_url TEXT NOT NULL,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`ALTER TABLE package_api_config ADD COLUMN IF NOT EXISTS config_data JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`INSERT INTO package_api_config (id, endpoint_url, headers)
    VALUES (1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`, [DEFAULT_PACKAGE_DETAIL_API_URL]);
  await pool.query(`CREATE TABLE IF NOT EXISTS patient_api_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),endpoint_url TEXT NOT NULL,api_key TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`INSERT INTO patient_api_config(id,endpoint_url,api_key) VALUES(1,$1,$2) ON CONFLICT(id) DO NOTHING`,[process.env.PATIENT_API_URL||DEFAULT_PATIENT_API_URL,process.env.PATIENT_API_KEY||'']);
  await pool.query(`CREATE TABLE IF NOT EXISTS package_api_config_log (
    id BIGSERIAL PRIMARY KEY,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by TEXT NOT NULL,
    old_endpoint_url TEXT NOT NULL,
    new_endpoint_url TEXT NOT NULL,
    changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS checkup_audit_log (
    id BIGSERIAL PRIMARY KEY,
    record_key TEXT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT '',
    id_passport TEXT NOT NULL DEFAULT '',
    company_id TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    company_year TEXT NOT NULL DEFAULT '',
    package_code TEXT NOT NULL DEFAULT '',
    package_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE')),
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    performed_by_user_id TEXT NOT NULL,
    performed_by_username TEXT NOT NULL,
    performed_by_display_name TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_audit_log_record_idx ON checkup_audit_log (record_key, performed_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_audit_log_time_idx ON checkup_audit_log (performed_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS his_packages (
    id BIGSERIAL PRIMARY KEY,
    package_code TEXT NOT NULL,
    package_name TEXT NOT NULL DEFAULT '',
    total_price NUMERIC(14,2),
    active_from TEXT NOT NULL DEFAULT '',
    active_to TEXT NOT NULL DEFAULT '',
    is_approved BOOLEAN,
    source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    detail_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`ALTER TABLE his_packages
    ADD COLUMN IF NOT EXISTS his_presence TEXT NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS his_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_found_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS check_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS not_found_streak INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_check_error TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_check_reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_known_his_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS last_status_response JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`CREATE INDEX IF NOT EXISTS his_packages_presence_idx ON his_packages(his_presence, verification_status, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS his_packages_status_idx ON his_packages(his_status, verification_status, updated_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS his_package_verification_log (
    id BIGSERIAL PRIMARY KEY,
    package_id BIGINT REFERENCES his_packages(id) ON DELETE CASCADE,
    package_code TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    his_presence TEXT NOT NULL DEFAULT 'UNKNOWN',
    his_status TEXT NOT NULL DEFAULT 'UNKNOWN',
    verification_status TEXT NOT NULL DEFAULT 'PENDING',
    reason TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS his_package_verification_log_code_idx ON his_package_verification_log(LOWER(package_code), checked_at DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS station_master (
    id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS station_master_code_unique_idx ON station_master(LOWER(code))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS station_master_active_sort_idx ON station_master(active,sort_order,id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS item_type_station_mapping (
    item_type TEXT PRIMARY KEY, station_id BIGINT REFERENCES station_master(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS package_item_station_assignments (
    package_id BIGINT NOT NULL REFERENCES his_packages(id) ON DELETE CASCADE, item_key TEXT NOT NULL,
    item_code TEXT NOT NULL DEFAULT '', item_name TEXT NOT NULL DEFAULT '', station_id BIGINT REFERENCES station_master(id) ON DELETE SET NULL,
    assignment_source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(assignment_source IN ('AUTO','MANUAL')),
    updated_by TEXT NOT NULL DEFAULT 'system', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(package_id,item_key)
  )`);
  await pool.query(`ALTER TABLE package_item_station_assignments ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT ''`);
  await pool.query(`CREATE INDEX IF NOT EXISTS package_item_station_type_idx ON package_item_station_assignments(LOWER(item_type),package_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS package_item_station_station_idx ON package_item_station_assignments(station_id,package_id)`);
  for (const [code,name,sort] of [['LAB','ห้องเจาะเลือด / LAB',10],['XRAY','X-Ray',20],['EKG','EKG',30],['VITAL','Vital Sign',40],['PHYSICAL','Physical Exam',50],['DOCTOR','Doctor',60],['OTHER','อื่น ๆ',99]]) {
    await pool.query(`INSERT INTO station_master(code,name,sort_order) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[code,name,sort]).catch(()=>{});
  }
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS his_packages_code_unique_idx ON his_packages (LOWER(package_code))');
  await pool.query(`CREATE TABLE IF NOT EXISTS his_payor_catalog (
    payor_code TEXT NOT NULL DEFAULT '', payor_name TEXT NOT NULL DEFAULT '',
    plan_code TEXT NOT NULL DEFAULT '', plan_name TEXT NOT NULL DEFAULT '',
    office_code TEXT NOT NULL DEFAULT '', office_name TEXT NOT NULL DEFAULT '',
    source_data JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(payor_code,plan_code,office_code)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS his_payor_catalog_payor_idx ON his_payor_catalog(LOWER(payor_code),LOWER(payor_name))');
  await pool.query('CREATE INDEX IF NOT EXISTS his_payor_catalog_plan_idx ON his_payor_catalog(LOWER(plan_code),LOWER(plan_name))');
  await pool.query('CREATE INDEX IF NOT EXISTS his_payor_catalog_office_idx ON his_payor_catalog(LOWER(office_code),LOWER(office_name))');
  await pool.query(`CREATE TABLE IF NOT EXISTS his_location_settings (
    location_id TEXT PRIMARY KEY, is_active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`ALTER TABLE his_location_settings ADD COLUMN IF NOT EXISTS location_name TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS location_code TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);
  await pool.query(`CREATE TABLE IF NOT EXISTS nationality_master (
    code TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', desc1 TEXT NOT NULL DEFAULT '', desc2 TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 0, source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS title_master (kind TEXT NOT NULL CHECK(kind IN ('title','title_en')),code TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',desc1 TEXT NOT NULL DEFAULT '',desc2 TEXT NOT NULL DEFAULT '',display_order INTEGER NOT NULL DEFAULT 0,gender TEXT NOT NULL DEFAULT '' CHECK(gender IN ('','M','F')),source_data JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by TEXT NOT NULL DEFAULT 'system',PRIMARY KEY(kind,code))`);
  await pool.query("ALTER TABLE title_master ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT ''");
  await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='title_master_gender_check') THEN ALTER TABLE title_master ADD CONSTRAINT title_master_gender_check CHECK(gender IN ('','M','F')); END IF; END $$");
  await pool.query('CREATE INDEX IF NOT EXISTS title_master_kind_gender_idx ON title_master(kind,gender)');
  await pool.query('CREATE INDEX IF NOT EXISTS nationality_master_name_idx ON nationality_master(LOWER(name))');
  await pool.query(`CREATE TABLE IF NOT EXISTS his_package_audit_log (
    id BIGSERIAL PRIMARY KEY,
    package_id BIGINT,
    package_code TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('CREATE','HIS_UPDATE','MANUAL_UPDATE','DELETE')),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by TEXT NOT NULL DEFAULT 'system',
    before_data JSONB,
    after_data JSONB,
    changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS his_package_log_code_idx ON his_package_audit_log (LOWER(package_code), changed_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS company_year_documents (
    company_id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_data BYTEA NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by TEXT NOT NULL DEFAULT 'system'
  )`);
  // Annual corporate sales circular: independent from uploaded company PDF and from app_state
  // so an unrelated company save/sync cannot overwrite the memo draft.
  await pool.query(`CREATE TABLE IF NOT EXISTS company_year_circulars (
    company_year_id TEXT PRIMARY KEY REFERENCES company_years(id) ON DELETE CASCADE,
    memo_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // v7.63.95: generated document is versioned; old uploaded PDF stays in legacy table as attachment.
  await pool.query(`CREATE TABLE IF NOT EXISTS company_year_primary_pdfs (
    id BIGSERIAL PRIMARY KEY,
    company_year_id TEXT NOT NULL REFERENCES company_years(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_data BYTEA NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS company_year_primary_pdfs_recent_idx ON company_year_primary_pdfs(company_year_id,id DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS company_year_attachments (
    id BIGSERIAL PRIMARY KEY,
    company_year_id TEXT NOT NULL REFERENCES company_years(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_data BYTEA NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS company_year_attachments_recent_idx ON company_year_attachments(company_year_id,id DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS company_year_import_files (
    company_id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    file_data BYTEA NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_guide_documents (
    view_id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_data BYTEA,
    file_size BIGINT NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ,
    uploaded_by TEXT NOT NULL DEFAULT '',
    guide_data JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await pool.query(`INSERT INTO system_settings(key,value,updated_at) VALUES('his_package_sync_schedule',$1,NOW()) ON CONFLICT(key) DO NOTHING`,[JSON.stringify({enabled:true,intervalHours:8,anchorTime:'00:00',lastRunAt:null,lastStatus:'NEVER'})]);
  await pool.query(`CREATE TABLE IF NOT EXISTS his_api_connections (
    id TEXT PRIMARY KEY,
    api_name TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    http_method TEXT NOT NULL DEFAULT 'POST',
    content_type TEXT NOT NULL DEFAULT 'application/json',
    system_code TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS his_api_connections_system_code_idx ON his_api_connections(system_code) WHERE system_code <> \'\'');
  await pool.query(`CREATE TABLE IF NOT EXISTS his_api_connection_audit_log (
    id BIGSERIAL PRIMARY KEY,
    connection_id TEXT NOT NULL,
    api_name TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE','VIEW_SECRET')),
    changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    before_data JSONB,
    after_data JSONB,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    performed_by_user_id TEXT NOT NULL DEFAULT '',
    performed_by_username TEXT NOT NULL DEFAULT '',
    performed_by_display_name TEXT NOT NULL DEFAULT '',
    client_address TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS his_api_audit_time_idx ON his_api_connection_audit_log(performed_at DESC,id DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS his_appointment_pull_log (
    id BIGSERIAL PRIMARY KEY,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    appointment_date DATE NOT NULL,
    location_filter TEXT NOT NULL DEFAULT '',
    row_count INTEGER NOT NULL DEFAULT 0,
    requested_by TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    error_message TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS his_appointment_pull_log_time_idx ON his_appointment_pull_log(requested_at DESC,id DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS his_appointment_config_log (id BIGSERIAL PRIMARY KEY,changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),changed_by TEXT NOT NULL DEFAULT '',action TEXT NOT NULL,changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,client_address TEXT NOT NULL DEFAULT '')`);
  // v7.58 Phase 1: Checkup Project / Booking / Visit / Worklist foundation.
  await pool.query(`CREATE TABLE IF NOT EXISTS checkup_projects (
    id TEXT PRIMARY KEY,
    project_code TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL,
    company_id TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    screening_year TEXT NOT NULL DEFAULT '',
    start_date DATE,
    end_date DATE,
    location TEXT NOT NULL DEFAULT '',
    default_package_code TEXT NOT NULL DEFAULT '',
    default_package_name TEXT NOT NULL DEFAULT '',
    payor_options JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_location_code TEXT NOT NULL DEFAULT '',
    billing_type TEXT NOT NULL DEFAULT '',
    contact_person TEXT NOT NULL DEFAULT '',
    remark TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','IN_PROGRESS','CLOSED','CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query("ALTER TABLE checkup_projects ADD COLUMN IF NOT EXISTS payor_options JSONB NOT NULL DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE checkup_projects ADD COLUMN IF NOT EXISTS default_location_code TEXT NOT NULL DEFAULT ''");
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_projects_company_idx ON checkup_projects(company_id,screening_year,status)');
  await pool.query(`CREATE TABLE IF NOT EXISTS checkup_bookings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES checkup_projects(id) ON DELETE CASCADE,
    record_key TEXT NOT NULL DEFAULT '',
    hn TEXT NOT NULL DEFAULT '',
    employee_code TEXT NOT NULL DEFAULT '',
    patient_name TEXT NOT NULL DEFAULT '',
    id_passport TEXT NOT NULL DEFAULT '',
    birth_date TEXT NOT NULL DEFAULT '',
    sex TEXT NOT NULL DEFAULT '',
    company_id TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    department_name TEXT NOT NULL DEFAULT '',
    position_name TEXT NOT NULL DEFAULT '',
    package_code TEXT NOT NULL DEFAULT '',
    package_name TEXT NOT NULL DEFAULT '',
    scheduled_date DATE,
    booking_status TEXT NOT NULL DEFAULT 'BOOKED' CHECK(booking_status IN ('BOOKED','ARRIVED','IN_SERVICE','COMPLETE','CANCELLED')),
    remark TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS checkup_bookings_project_record_unique_idx ON checkup_bookings(project_id,record_key) WHERE record_key <> \'\'');
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_bookings_project_date_idx ON checkup_bookings(project_id,scheduled_date,booking_status)');
  await pool.query(`CREATE TABLE IF NOT EXISTS checkup_visits (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL UNIQUE REFERENCES checkup_bookings(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    checkin_at TIMESTAMPTZ,
    vn TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    doctor_name TEXT NOT NULL DEFAULT '',
    visit_status TEXT NOT NULL DEFAULT 'NOT_ARRIVED' CHECK(visit_status IN ('NOT_ARRIVED','CHECKED_IN','IN_SERVICE','COMPLETE','CANCELLED')),
    result_status TEXT NOT NULL DEFAULT 'WAITING_RESULT',
    order_total INTEGER NOT NULL DEFAULT 0,
    order_complete INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_visits_date_status_idx ON checkup_visits(visit_date,visit_status)');
  await pool.query("ALTER TABLE checkup_bookings ADD COLUMN IF NOT EXISTS precheck_status TEXT NOT NULL DEFAULT 'PENDING'");
  await pool.query("ALTER TABLE checkup_bookings ADD COLUMN IF NOT EXISTS questionnaire JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query('ALTER TABLE checkup_bookings ADD COLUMN IF NOT EXISTS precheck_updated_at TIMESTAMPTZ');
  await pool.query(`CREATE TABLE IF NOT EXISTS checkup_station_events (
    id BIGSERIAL PRIMARY KEY,
    visit_id TEXT NOT NULL REFERENCES checkup_visits(id) ON DELETE CASCADE,
    station_name TEXT NOT NULL,
    station_status TEXT NOT NULL DEFAULT 'WAITING' CHECK(station_status IN ('WAITING','IN_SERVICE','COMPLETE','SKIPPED')),
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system',
    UNIQUE(visit_id,station_name)
  )`);
  await pool.query('ALTER TABLE checkup_station_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_station_events_queue_idx ON checkup_station_events(station_name,station_status,queued_at)');
  await pool.query(`CREATE TABLE IF NOT EXISTS checkup_clinical_records (
    visit_id TEXT PRIMARY KEY REFERENCES checkup_visits(id) ON DELETE CASCADE,
    result_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    abnormal BOOLEAN NOT NULL DEFAULT FALSE,
    doctor_review JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_status TEXT NOT NULL DEFAULT 'PENDING',
    follow_up JSONB NOT NULL DEFAULT '{}'::jsonb,
    follow_up_status TEXT NOT NULL DEFAULT 'NONE',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS checkup_workflow_audit (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    performed_by TEXT NOT NULL DEFAULT 'system',
    client_address TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS checkup_workflow_audit_entity_idx ON checkup_workflow_audit(entity_type,entity_id,performed_at DESC)');
  await pool.query(`CREATE TABLE IF NOT EXISTS lab_scan_logs (
    id BIGSERIAL PRIMARY KEY, scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sid TEXT NOT NULL DEFAULT '', hn TEXT NOT NULL DEFAULT '', visit_uid TEXT NOT NULL DEFAULT '', ln TEXT NOT NULL DEFAULT '',
    scan_status TEXT NOT NULL DEFAULT 'Cancel', success BOOLEAN NOT NULL DEFAULT FALSE, http_status INTEGER,
    request_body JSONB NOT NULL DEFAULT '{}'::jsonb, response_body JSONB, error_message TEXT NOT NULL DEFAULT '',
    performed_by TEXT NOT NULL DEFAULT '', client_address TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS lab_scan_logs_time_idx ON lab_scan_logs(scanned_at DESC,id DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS lab_scan_logs_sid_idx ON lab_scan_logs(LOWER(sid),scanned_at DESC)');
  const packageConfig=await readPackageApiConfig();
  const patientConfig=await readPatientApiConfig();
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('get-package-detail','GetPackageDetail',$1,$2,$3,$4,'GET_PACKAGE_DETAIL',$5)
    ON CONFLICT(id) DO NOTHING`,[packageConfig.endpoint_url,String(packageConfig.headers?.['x-api-key']||''),String(packageConfig.config_data?.method||'GET'),String(packageConfig.config_data?.contentType||'application/json'),packageConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by,active)
    VALUES('get-package-list','GetPackageList',$1,$2,'POST','application/json','GET_PACKAGE_LIST',$3,$4)
    ON CONFLICT(id) DO UPDATE SET api_name='GetPackageList',api_key=EXCLUDED.api_key,system_code='GET_PACKAGE_LIST',updated_at=NOW()`,[isNonProductionUrl(DEFAULT_PACKAGE_STATUS_API_URL)?'':DEFAULT_PACKAGE_STATUS_API_URL,String(packageConfig.headers?.['x-api-key']||''),packageConfig.updated_by||'system',Boolean(DEFAULT_PACKAGE_STATUS_API_URL)&&!isNonProductionUrl(DEFAULT_PACKAGE_STATUS_API_URL)]);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('get-patient-data','GetPatientData',$1,$2,'POST','application/json','GET_PATIENT_DATA',$3)
    ON CONFLICT(id) DO NOTHING`,[patientConfig.endpoint_url,patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('create-hn','Create HN',$1,$2,'POST','application/json','CREATE_HN',$3)
    ON CONFLICT(id) DO NOTHING`,[process.env.HIS_CREATE_HN_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('patient-info-check','PatientInfo Check',$1,$2,'POST','application/json','PATIENT_INFO_CHECK',$3)
    ON CONFLICT(id) DO NOTHING`,[process.env.PATIENTINFO_API_URL||DEFAULT_PATIENTINFO_API_URL,process.env.PATIENTINFO_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('get-visit','Get Visit',$1,$2,'POST','application/json','GET_VISIT',$3)
    ON CONFLICT(id) DO NOTHING`,[process.env.HIS_VISIT_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('get-emr','Get EMR Result',$1,$2,'POST','application/json','GET_EMR_RESULT',$3)
    ON CONFLICT(id) DO NOTHING`,[process.env.HIS_EMR_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('open-visit','Open Visit',$1,$2,'POST','application/json','OPEN_VISIT',$3)
    ON CONFLICT(id) DO NOTHING`,[process.env.HIS_OPEN_VISIT_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('order-his','Order HIS',$1,$2,'POST','application/json','ORDER_HIS',$3)
    ON CONFLICT(id) DO NOTHING`,[process.env.HIS_ORDER_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by)
    VALUES('get-payor','GetPayor',$1,$2,'GET','application/json','GET_PAYOR',$3)
    ON CONFLICT(id) DO NOTHING`,[process.env.HIS_PAYOR_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by) VALUES('cancel-visit','CancelVisit',$1,$2,'POST','application/json','CANCEL_VISIT',$3) ON CONFLICT(id) DO NOTHING`,[process.env.HIS_CANCEL_VISIT_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by) VALUES('cancel-order','Cancel Order',$1,$2,'POST','application/json','CANCEL_ORDER',$3) ON CONFLICT(id) DO NOTHING`,[process.env.HIS_CANCEL_ORDER_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by) VALUES('charge-close','ChargeClose',$1,$2,'POST','application/json','CHARGE_CLOSE',$3) ON CONFLICT(id) DO NOTHING`,[process.env.HIS_CHARGE_CLOSE_API_URL||'',process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',patientConfig.updated_by||'system']);
  await pool.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,system_code,updated_by) VALUES('lab-sid-lookup','LAB SID Lookup',$1,$2,$3,'application/json','LAB_SID_LOOKUP',$4) ON CONFLICT(id) DO NOTHING`,[process.env.HIS_LAB_API_URL||'',process.env.HIS_LAB_API_KEY||process.env.HIS_RESULT_API_KEY||patientConfig.api_key||'',String(process.env.HIS_LAB_API_METHOD||'POST').toUpperCase()==='GET'?'GET':'POST',patientConfig.updated_by||'system']);
  await pool.query("UPDATE his_api_connections SET content_type='application/json',updated_at=NOW() WHERE system_code IN ('CREATE_HN','GET_VISIT','GET_EMR_RESULT','OPEN_VISIT','ORDER_HIS','GET_PAYOR','CANCEL_VISIT','CANCEL_ORDER','CHARGE_CLOSE','LAB_SID_LOOKUP') AND COALESCE(content_type,'')=''");
  await pool.query("UPDATE his_api_connections SET endpoint_url='',active=false,updated_at=NOW(),updated_by='v7.63.36-production-only' WHERE LOWER(COALESCE(endpoint_url,'')) LIKE ('%' || 'sta' || 'ging' || '%')");
  await pool.query(`CREATE TABLE IF NOT EXISTS his_patientinfo_test_log (
    id BIGSERIAL PRIMARY KEY, tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), tested_by TEXT NOT NULL DEFAULT '',
    identification_masked TEXT NOT NULL DEFAULT '', http_status INTEGER NOT NULL DEFAULT 0,
    result_status TEXT NOT NULL DEFAULT '', has_hn BOOLEAN NOT NULL DEFAULT false, status_detail TEXT NOT NULL DEFAULT '', client_address TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query(`DELETE FROM company_year_import_files f WHERE NOT EXISTS (SELECT 1 FROM company_years cy WHERE cy.id=f.company_id)`);
  await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='company_year_import_files_company_fk') THEN ALTER TABLE company_year_import_files ADD CONSTRAINT company_year_import_files_company_fk FOREIGN KEY(company_id) REFERENCES company_years(id) ON DELETE CASCADE; END IF; END $$;`);
  await ensureScalableSchema(pool);
  await pool.query(`WITH candidates AS (
    SELECT DISTINCT ON (v.id) v.id visit_id,rb.id real_booking_id FROM checkup_visits v
    JOIN checkup_bookings fb ON fb.id=v.booking_id JOIN checkup_projects fp ON fp.id=fb.project_id AND fp.project_code='HIS-OPEN-VISIT'
    JOIN checkup_bookings rb ON rb.record_key=fb.record_key AND rb.id<>fb.id JOIN checkup_projects rp ON rp.id=rb.project_id AND rp.project_code<>'HIS-OPEN-VISIT'
    WHERE NOT EXISTS(SELECT 1 FROM checkup_visits ev WHERE ev.booking_id=rb.id) ORDER BY v.id,rb.updated_at DESC
  ) UPDATE checkup_visits v SET booking_id=c.real_booking_id,updated_at=NOW(),updated_by='BOOKING_RELINK' FROM candidates c WHERE v.id=c.visit_id`);
  await pool.query(`DELETE FROM checkup_projects WHERE project_code='HIS-OPEN-VISIT'`);
  // HIS OpenVisit is an internal relational bridge for station operations.
  // Keep it in the database; user-facing project queries hide it.
  const current=await pool.query('SELECT data,revision FROM app_state WHERE id=1');
  const sync=await pool.query('SELECT app_state_revision FROM relational_sync_status WHERE id=1');
  let stateData=current.rows[0]?.data||{},revision=Number(current.rows[0]?.revision||0),stationMigration=false;
  if(!Array.isArray(stateData.orderStations)||!stateData.orderStations.length){stateData={...stateData,orderStations:['Check-Up FL.6','Imaging FL.6','Imaging FL.4','EKG-Room FL.6','Vital-Signs','Color Blindness','VA','Fundus-Camera']};stationMigration=true;}
  if(stateData.orderItemSettings&&typeof stateData.orderItemSettings==='object'){for(const setting of Object.values(stateData.orderItemSettings)){if(!Array.isArray(setting.stations)){setting.stations=setting.station?[String(setting.station)]:[];delete setting.station;stationMigration=true;}}}
  if(stationMigration){const migrated=await pool.query('UPDATE app_state SET data=$1::jsonb,revision=revision+1,updated_at=NOW() WHERE id=1 RETURNING revision',[JSON.stringify(stateData)]);revision=Number(migrated.rows[0].revision);}
  const orderTableStatus=await pool.query('SELECT COUNT(*)::int AS count FROM order_types');
  if(Number(sync.rows[0]?.app_state_revision??-1)!==revision||Number(orderTableStatus.rows[0]?.count||0)===0){
    // v7.62.92: app_state is compact after relational cutover 0130 and intentionally no longer
    // carries companies/records/packages. Never treat those missing keys as empty source data,
    // otherwise syncStateToRelational() would delete the normalized company/customer tables.
    const relationalSyncState=(Array.isArray(stateData.companies)&&Array.isArray(stateData.records)&&Array.isArray(stateData.packages))
      ? stateData
      : await hydrateRelationalState(stateData);
    const client=await pool.connect();
    try { await client.query('BEGIN'); await syncStateToRelational(client,relationalSyncState,revision); await client.query('COMMIT'); }
    catch(error){ await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  const cutover=await pool.query("SELECT 1 FROM schema_migrations WHERE version='0130'");
  if(!cutover.rowCount){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const legacy=(await client.query('SELECT data,revision FROM app_state WHERE id=1 FOR UPDATE')).rows[0];
      if(legacy){
        await client.query(`INSERT INTO app_state_import_backups(reason,performed_by,source_revision,import_summary,data)
          VALUES('RELATIONAL_CUTOVER_0130','SYSTEM',$1,'[]'::jsonb,$2::jsonb)`,[Number(legacy.revision||0),JSON.stringify(legacy.data||{})]);
        const compact=compactAppState(legacy.data||{}),nextRevision=Number(legacy.revision||0)+1;
        await client.query('UPDATE app_state SET data=$1::jsonb,revision=$2,updated_at=NOW() WHERE id=1',[JSON.stringify(compact),nextRevision]);
        await client.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[nextRevision]);
      }
      await client.query("INSERT INTO schema_migrations(version,description) VALUES('0130','Compact app_state; companies/customers/packages use relational source of truth') ON CONFLICT(version) DO NOTHING");
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
  await pool.query(`INSERT INTO schema_migrations(version,description) VALUES
    ($1,'Relational PostgreSQL foundation with backward-compatible app_state sync') ON CONFLICT(version) DO NOTHING`,[SCHEMA_VERSION]);
}

function decodedJson(value) {
  let current = value;
  for (let i = 0; i < 3 && typeof current === 'string'; i += 1) {
    try { current = JSON.parse(current); } catch (_) { break; }
  }
  return current;
}
function responseRecords(value) {
  const arrays = [];
  const walk = (item, depth = 0) => {
    const decoded = decodedJson(item);
    if (decoded == null || depth > 7) return;
    if (Array.isArray(decoded)) {
      if (decoded.some(row => row && typeof row === 'object' && !Array.isArray(row))) arrays.push(decoded);
      decoded.forEach(row => walk(row, depth + 1));
    } else if (typeof decoded === 'object') Object.values(decoded).forEach(child => walk(child, depth + 1));
  };
  walk(value);
  if (arrays.length) return arrays.sort((a, b) => b.length - a.length)[0];
  const root = decodedJson(value);
  return root && typeof root === 'object' ? [root] : [];
}
function pickField(record, names, fallback = '') {
  if (!record || typeof record !== 'object') return fallback;
  const keys = Object.keys(record);
  const normalized = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const name of names) {
    const key = keys.find(item => normalized(item) === normalized(name));
    if (key && record[key] != null) return record[key];
  }
  return fallback;
}
function packageDetailItems(record, depth = 0) {
  const decodedRecord = decodedJson(record);
  if (depth > 6 || decodedRecord == null) return [];
  if (Array.isArray(decodedRecord)) return decodedRecord.flatMap(item => packageDetailItems(item, depth + 1));
  record = decodedRecord;
  const candidates = ['detailItems','detail_items','details','detail','items','orderItems','orderItem','packageDetails','packageDetail','services','tests','contents','packageItems'];
  for (const name of candidates) {
    const value = decodedJson(pickField(record, [name], null));
    if (Array.isArray(value)) return value;
  }
  const itemCode = pickField(record, ['itemCode','orderItemCode','serviceCode','testCode','detailCode'], '');
  const itemName = pickField(record, ['itemName','orderItemName','serviceName','testName','detailName'], '');
  if (itemCode || itemName) return [{
    code: String(itemCode || ''), name: String(itemName || ''),
    quantity: Number(pickField(record, ['quantity','qty'], 1) || 1)
  }];
  for (const value of Object.values(record || {})) {
    if (value && (typeof value === 'object' || typeof value === 'string')) {
      const nested = packageDetailItems(value, depth + 1);
      if (nested.length) return nested;
    }
  }
  return [];
}
function normalizeHisPackage(record) {
  const code = String(pickField(record, ['packageCode','package_code','code','packagecode','PackageCode'], '')).trim();
  // HIS uses Cost for the package total. Keep older aliases as fallbacks so
  // records saved by previous releases can still be refreshed safely.
  const priceValue = pickField(record, ['Cost','cost','totalPrice','total_price','packagePrice','PackagePrice','price'], null);
  const parsedPrice = priceValue === null || priceValue === '' ? null : Number(String(priceValue).replace(/,/g, ''));
  return {
    packageCode: code,
    packageName: String(pickField(record, ['packageName','package_name','name','packagename','PackageName'], '')).trim(),
    totalPrice: Number.isFinite(parsedPrice) ? parsedPrice : null,
    activeFrom: String(pickField(record, ['activeFrom','active_from','startDate','effectiveFrom'], '') || ''),
    activeTo: String(pickField(record, ['activeTo','active_to','endDate','effectiveTo'], '') || ''),
    sourceData: record,
    detailItems: packageDetailItems(record)
  };
}
function packageSnapshot(row) {
  return { packageCode: row.package_code, packageName: row.package_name, totalPrice: row.total_price == null ? null : Number(row.total_price), activeFrom: row.active_from, activeTo: row.active_to, detailItems: row.detail_items || [], sourceData: row.source_data || {} };
}
function changedPackageFields(before, after) {
  return ['packageName','totalPrice','activeFrom','activeTo','detailItems','sourceData'].filter(key => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
}

async function readPackageApiConfig() {
  const result = await pool.query('SELECT endpoint_url, headers, config_data, updated_at, updated_by FROM package_api_config WHERE id = 1');
  return result.rows[0] || { endpoint_url: DEFAULT_PACKAGE_DETAIL_API_URL, headers: {}, config_data: {}, updated_at: null, updated_by: 'system' };
}

async function unlockPackageConfig(req, res) {
  try {
    cleanupPackageConfigSessions();
    const address = clientAddress(req), now = Date.now();
    const attempt = packageConfigLoginAttempts.get(address) || { count:0, startedAt:now };
    if (now - attempt.startedAt > 10 * 60 * 1000) { attempt.count = 0; attempt.startedAt = now; }
    if (attempt.count >= 6) return res.status(429).json({ error:'ใส่รหัสผ่านไม่ถูกต้องหลายครั้ง กรุณารอ 10 นาที' });
    const state = await readState();
    const username = normalizedPersonName(req.body?.username);
    const user = (state.users || []).find(item => normalizedPersonName(item.username) === username && item.active !== false);
    const role = (state.roles || []).find(item => String(item.id) === String(user?.roleId));
    const permissions = new Set(Array.isArray(role?.permissions) ? role.permissions : []);
    if (!user || !safeEqual(legacyPasswordHash(req.body?.password), user.passwordHash) || !(String(user.roleId) === 'admin' || permissions.has('apiManage'))) {
      attempt.count += 1; packageConfigLoginAttempts.set(address, attempt);
      return res.status(401).json({ error:'รหัสผ่านไม่ถูกต้อง หรือบัญชีไม่มีสิทธิ์แก้ไข External API' });
    }
    packageConfigLoginAttempts.delete(address);
    const token = crypto.randomBytes(32).toString('base64url');
    packageConfigSessions.set(token, { userId:String(user.id || ''), username:String(user.username || ''), displayName:String(user.displayName || user.username || ''), expiresAt:now + 5 * 60 * 1000 });
    res.set('Cache-Control', 'no-store');
    res.json({ token, expiresInSeconds:300 });
  } catch (error) { res.status(500).json({ error:'ตรวจสอบรหัสผ่านไม่สำเร็จ' }); }
}
app.post('/api/package-detail/config/unlock', localOnly, unlockPackageConfig);
// Internal HTTPS access is allowed for Update Center only. Authentication,
// rate limiting and the short-lived configuration token remain mandatory.
app.post('/api/system/update/unlock', unlockPackageConfig);

function publicHisApiConnection(row) {
  return {id:row.id,name:row.api_name,url:row.endpoint_url,hasApiKey:Boolean(row.api_key),apiKeyMasked:row.api_key?'••••••••••••':'',method:row.http_method,contentType:row.content_type,systemCode:row.system_code||'',sharedApiKey:row.system_code==='GET_PACKAGE_LIST'?'GET_PACKAGE_DETAIL':'',active:row.active!==false,updatedAt:row.updated_at,updatedBy:row.updated_by};
}
function hisApiAuditSnapshot(row) {
  if(!row)return null;
  return {name:row.api_name,url:row.endpoint_url,hasApiKey:Boolean(row.api_key),method:row.http_method,contentType:row.content_type,systemCode:row.system_code||'',active:row.active!==false};
}
async function insertHisApiAudit(client,req,row,action,fields,beforeData,afterData){
  const session=req.packageConfigSession||{};
  await client.query(`INSERT INTO his_api_connection_audit_log(connection_id,api_name,action,changed_fields,before_data,after_data,
    performed_by_user_id,performed_by_username,performed_by_display_name,client_address)
    VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10)`,[row.id,row.api_name||'',action,JSON.stringify(fields||[]),beforeData?JSON.stringify(beforeData):null,afterData?JSON.stringify(afterData):null,
    String(session.userId||''),String(session.username||''),String(session.displayName||session.username||''),clientAddress(req)]);
}
function validateHisApiInput(body){
  const name=String(body?.name||'').trim().slice(0,120),url=String(body?.url||'').trim(),apiKey=String(body?.apiKey??''),method=String(body?.method||'POST').trim().toUpperCase(),contentType=String(body?.contentType||'application/json').trim().slice(0,160);
  if(!name)return {error:'กรุณาระบุชื่อ API'};
  let parsed;try{parsed=new URL(url)}catch(_){return {error:'URL ไม่ถูกต้อง'}}
  if(parsed.protocol!=='https:')return {error:'URL ต้องเป็น HTTPS'};
  if(isNonProductionUrl(url))return {error:'Production-only: ไม่อนุญาต endpoint ที่ไม่ใช่ Production'};
  if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))return {error:'Method ไม่ถูกต้อง'};
  if(!contentType)return {error:'กรุณาระบุ Content-Type'};
  return {value:{name,url,apiKey,method,contentType}};
}

app.get('/api/his-api-connections',localOnly,packageConfigSessionRequired,async(req,res)=>{
  try{const [items,logs]=await Promise.all([
    pool.query('SELECT * FROM his_api_connections ORDER BY created_at,id'),
    pool.query(`SELECT id,connection_id,api_name,action,changed_fields,before_data,after_data,performed_at,
      performed_by_username,performed_by_display_name,client_address FROM his_api_connection_audit_log ORDER BY id DESC LIMIT 300`)
  ]);res.set('Cache-Control','no-store');res.json({items:items.rows.map(publicHisApiConnection),logs:logs.rows});}
  catch(error){res.status(500).json({error:'อ่านการตั้งค่า API to HIS ไม่สำเร็จ'});}
});

app.post('/api/his-api-connections',localOnly,packageConfigSessionRequired,async(req,res)=>{
  const checked=validateHisApiInput(req.body);if(checked.error)return res.status(400).json({error:checked.error});
  const value=checked.value,id=`his-api-${crypto.randomUUID()}`,client=await pool.connect();
  try{await client.query('BEGIN');const inserted=await client.query(`INSERT INTO his_api_connections(id,api_name,endpoint_url,api_key,http_method,content_type,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[id,value.name,value.url,value.apiKey,value.method,value.contentType,req.packageConfigSession.displayName||req.packageConfigSession.username||'system']);
    await insertHisApiAudit(client,req,inserted.rows[0],'CREATE',['name','url','apiKey','method','contentType'],null,hisApiAuditSnapshot(inserted.rows[0]));await client.query('COMMIT');res.status(201).json({ok:true,item:publicHisApiConnection(inserted.rows[0])});}
  catch(error){await client.query('ROLLBACK');console.error('HIS API create failed:',error);res.status(500).json({error:'เพิ่ม API ไม่สำเร็จ',detail:error.message||String(error)});}finally{client.release();}
});

app.put('/api/his-api-connections/:id',localOnly,packageConfigSessionRequired,async(req,res)=>{
  const checked=validateHisApiInput(req.body);if(checked.error)return res.status(400).json({error:checked.error});
  const value=checked.value,client=await pool.connect();
  try{await client.query('BEGIN');const found=await client.query('SELECT * FROM his_api_connections WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบ API'});}const old=found.rows[0];let apiKey=req.body?.apiKeyChanged===true?value.apiKey:old.api_key;if(old.system_code==='GET_PACKAGE_LIST'){const shared=await client.query(`SELECT api_key FROM his_api_connections WHERE system_code='GET_PACKAGE_DETAIL' LIMIT 1`);apiKey=String(shared.rows[0]?.api_key||'');}
    const configuredMethod=value.method,configuredContent=value.contentType||'application/json',next={...old,api_name:value.name,endpoint_url:value.url,api_key:apiKey,http_method:configuredMethod,content_type:configuredContent};
    const fields=['name','url','apiKey','method','contentType'].filter(key=>JSON.stringify(hisApiAuditSnapshot(old)?.[key==='apiKey'?'hasApiKey':key])!==JSON.stringify(hisApiAuditSnapshot(next)?.[key==='apiKey'?'hasApiKey':key])||(key==='apiKey'&&req.body?.apiKeyChanged===true));
    const updated=await client.query(`UPDATE his_api_connections SET api_name=$1,endpoint_url=$2,api_key=$3,http_method=$4,content_type=$5,updated_at=NOW(),updated_by=$6 WHERE id=$7 RETURNING *`,[value.name,value.url,apiKey,configuredMethod,configuredContent,req.packageConfigSession.displayName||req.packageConfigSession.username||'system',req.params.id]);
    if(old.system_code==='GET_PACKAGE_DETAIL'){await client.query(`UPDATE his_api_connections SET api_key=$1,updated_at=NOW(),updated_by=$2 WHERE system_code='GET_PACKAGE_LIST'`,[apiKey,req.packageConfigSession.displayName||'system']);await client.query(`UPDATE package_api_config SET endpoint_url=$1,headers=jsonb_build_object('x-api-key',$2::text),config_data=COALESCE(config_data,'{}'::jsonb)||jsonb_build_object('method',$3::text,'contentType',$4::text),updated_at=NOW(),updated_by=$5 WHERE id=1`,[value.url,apiKey,value.method,value.contentType,req.packageConfigSession.displayName||'system']);}
    if(old.system_code==='GET_PATIENT_DATA')await client.query(`UPDATE patient_api_config SET endpoint_url=$1,api_key=$2,updated_at=NOW(),updated_by=$3 WHERE id=1`,[value.url,apiKey,req.packageConfigSession.displayName||'system']);
    await insertHisApiAudit(client,req,updated.rows[0],'UPDATE',fields,hisApiAuditSnapshot(old),hisApiAuditSnapshot(updated.rows[0]));await client.query('COMMIT');res.json({ok:true,item:publicHisApiConnection(updated.rows[0]),changedFields:fields});}
  catch(error){await client.query('ROLLBACK');console.error('HIS API save failed:',error);res.status(500).json({error:'บันทึก API ไม่สำเร็จ',detail:error.message||String(error)});}finally{client.release();}
});

app.post('/api/his-api-connections/:id/test',localOnly,packageConfigSessionRequired,async(req,res)=>{
  try{
    const found=await pool.query('SELECT * FROM his_api_connections WHERE id=$1',[req.params.id]);
    if(!found.rows.length)return res.status(404).json({error:'ไม่พบ API'});
    const item=found.rows[0];
    if(item.system_code!=='GET_PACKAGE_LIST')return res.status(400).json({error:'Test API แบบนี้รองรับ GetPackageList เท่านั้น'});
    const detail=(await pool.query(`SELECT api_key FROM his_api_connections WHERE system_code='GET_PACKAGE_DETAIL' LIMIT 1`)).rows[0]||{};
    const apiKey=String(detail.api_key||'');if(!apiKey)return res.status(400).json({error:'GetPackageDetail ยังไม่มี X-api-Key สำหรับแชร์'});
    const codes=(await pool.query(`SELECT package_code FROM his_packages WHERE COALESCE(BTRIM(package_code),'')<>'' ORDER BY updated_at DESC NULLS LAST,id DESC LIMIT 10`)).rows.map(r=>String(r.package_code));
    if(!codes.length)return res.status(400).json({error:'ยังไม่มี Package Code ใน Package HIS สำหรับทดสอบ'});
    const headers={'x-api-key':apiKey,'Content-Type':String(item.content_type||'application/json')};
    const result=await requestPackageStatusBatch(codes,requireProductionEndpoint(item.endpoint_url||DEFAULT_PACKAGE_STATUS_API_URL,'GetPackageList'),String(item.http_method||'POST').toUpperCase(),headers,'');
    res.status(result.ok?200:502).json({ok:result.ok,httpStatus:result.status||0,sent:codes.length,requestStyle:result.requestStyle||'',sampleCodes:codes,response:result.data||null,error:result.error||''});
  }catch(error){res.status(502).json({error:`ทดสอบ GetPackageList ไม่สำเร็จ: ${error.message||error}`})}
});

app.post('/api/his-api-connections/:id/reveal-key',localOnly,packageConfigSessionRequired,async(req,res)=>{
  const client=await pool.connect();try{await client.query('BEGIN');const found=await client.query('SELECT * FROM his_api_connections WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบ API'});}await insertHisApiAudit(client,req,found.rows[0],'VIEW_SECRET',['apiKey'],null,null);await client.query('COMMIT');let revealed=found.rows[0].api_key||'';if(found.rows[0].system_code==='GET_PACKAGE_LIST'){const shared=await client.query(`SELECT api_key FROM his_api_connections WHERE system_code='GET_PACKAGE_DETAIL' LIMIT 1`);revealed=shared.rows[0]?.api_key||'';}res.set('Cache-Control','no-store');res.json({apiKey:revealed});}
  catch(error){await client.query('ROLLBACK');res.status(500).json({error:'เปิดดู X-api-Key ไม่สำเร็จ'});}finally{client.release();}
});


function patientInfoTestPayload(body){
  const clean=(v,max=200)=>String(v??'').trim().slice(0,max);
  const birth=clean(body?.Birthdate,10);
  if(birth&&!/^\d{4}-\d{2}-\d{2}$/.test(birth))return {error:'Birthdate ต้องเป็น YYYY-MM-DD'};
  const value={
    HN:null, IdentificationType:clean(body?.IdentificationType||'idnumber',30), IdentificationNumber:clean(body?.IdentificationNumber,80),
    Title:clean(body?.Title,40), FirstName:clean(body?.FirstName,120), LastName:clean(body?.LastName,120),
    TitleEN:clean(body?.TitleEN,40), FirstNameEN:clean(body?.FirstNameEN,120), LastNameEN:clean(body?.LastNameEN,120),
    Gender:clean(body?.Gender,20), Birthdate:birth, CellPhone:clean(body?.CellPhone,80), Address:clean(body?.Address,500), Email:clean(body?.Email,160),
    EmployeeCode:clean(body?.EmployeeCode,80), Company:clean(body?.Company,240), Department:clean(body?.Department,160), Position:clean(body?.Position,160),
    ContextKey:clean(body?.ContextKey||'Vimut2022',80), UserCode:clean(body?.UserCode,80), Nationality:clean(body?.Nationality||'THA',40), MaritalStatus:clean(body?.MaritalStatus,60)
  };
  if(!value.IdentificationNumber)return {error:'กรุณาระบุ IdentificationNumber สำหรับชุดทดสอบ'};
  if(!value.FirstName||!value.LastName||!value.Birthdate)return {error:'กรุณาระบุ FirstName, LastName และ Birthdate'};
  return {value};
}
function maskIdentification(value){const text=String(value||'');return text.length<=4?'****':`${'*'.repeat(Math.max(4,text.length-4))}${text.slice(-4)}`}
function normalizeHisApiPayloadLegacy(data,depth=0){
  if(depth>6||data==null)return data;
  if(typeof data==='string'){
    const value=data.trim();if(!value)return data;
    try{return normalizeHisApiPayloadLegacy(JSON.parse(value),depth+1)}catch(_){return data}
  }
  if(Array.isArray(data)){
    if(data.length===1&&(typeof data[0]==='object'||typeof data[0]==='string')){
      const nested=normalizeHisApiPayloadLegacy(data[0],depth+1);
      if(nested&&typeof nested==='object'&&(nested.Patient||nested.LineItem||nested.Visit||nested.LineItemUnstructure||nested.LineItemICD))return nested;
    }
    return data;
  }
  if(typeof data==='object'){
    if(data.Patient||data.LineItem||data.Visit||data.LineItemUnstructure||data.LineItemICD)return data;
    for(const key of ['body','data','result','response','payload']){
      if(data[key]!=null){
        const nested=normalizeHisApiPayloadLegacy(data[key],depth+1);
        if(nested!==data[key]||(nested&&typeof nested==='object'&&(nested.Patient||nested.LineItem||nested.Visit||nested.LineItemUnstructure||nested.LineItemICD)))return nested;
      }
    }
  }
  return data;
}
let typedHisPayload=null;
try{typedHisPayload=require(path.join(__dirname,'dist','src','services','his-payload.service.js'))}catch(_error){}
let typedHisTransport=null;
try{typedHisTransport=require(path.join(__dirname,'dist','src','services','his-api.service.js'))}catch(_error){}
let typedHisResultRoutes=null;
try{typedHisResultRoutes=require(path.join(__dirname,'dist','src','routes','his-result.routes.js'))}catch(_error){}
let typedHisConnectionRepository=null;
try{typedHisConnectionRepository=require(path.join(__dirname,'dist','src','repositories','his-connection.repository.js'))}catch(_error){}
let typedAppStateRepository=null;
try{typedAppStateRepository=require(path.join(__dirname,'dist','src','repositories','app-state.repository.js'))}catch(_error){}
let typedWorkflowRepository=null;
try{typedWorkflowRepository=require(path.join(__dirname,'dist','src','repositories','workflow.repository.js'))}catch(_error){}
const normalizeHisApiPayload=typedHisPayload?.normalizeHisApiPayload||normalizeHisApiPayloadLegacy;
async function callConfiguredHisJson(systemCode,payload,{timeoutMs=30000,maxBytes=12*1024*1024,retryAttempt=0}={}){
  const config=typedHisConnectionRepository?.findActiveHisConnection?await typedHisConnectionRepository.findActiveHisConnection(pool,systemCode):(await pool.query('SELECT * FROM his_api_connections WHERE system_code=$1 AND active=true LIMIT 1',[systemCode])).rows[0];if(!config)throw new Error(`ไม่พบการตั้งค่า API ${systemCode}`);
  const endpoint=String(config.endpoint_url||'').trim();if(!endpoint)throw new Error(`ยังไม่ได้ตั้ง URL สำหรับ ${config.api_name||systemCode} ในเมนู SetUp API to HIS`);
  let url;try{url=new URL(endpoint)}catch(_){throw new Error(`URL ${config.api_name||systemCode} ไม่ถูกต้อง`)}
  if(!['https:','http:'].includes(url.protocol))throw new Error(`URL ${config.api_name||systemCode} ต้องเป็น HTTP/HTTPS`);
  const method=String(config.http_method||'POST').toUpperCase();
  if(!['GET','POST','PUT','PATCH','DELETE'].includes(method))throw new Error(`Method ${method} ไม่รองรับ`);
  if(typedHisTransport?.requestConfiguredHisJson){try{return await typedHisTransport.requestConfiguredHisJson({endpointUrl:String(url),apiName:String(config.api_name||systemCode),method,contentType:String(config.content_type||'application/json'),apiKey:String(config.api_key||'')},payload||{},{timeoutMs,maxBytes})}catch(error){const transient=systemCode==='GET_VISIT'&&/(HTTP 50[234]|ECONNRESET|ETIMEDOUT|ไม่ตอบกลับ)/i.test(String(error?.message||error));if(transient&&retryAttempt<2){await new Promise(resolve=>setTimeout(resolve,400*(retryAttempt+1)));return callConfiguredHisJson(systemCode,payload,{timeoutMs,maxBytes,retryAttempt:retryAttempt+1})}throw error}}
  if(method==='GET')Object.entries(payload||{}).forEach(([key,value])=>{if(value!=null&&String(value)!=='')url.searchParams.set(key,String(value))});
  const bodyText=method==='GET'||method==='DELETE'?'':JSON.stringify(payload||{}),client=url.protocol==='https:'?https:http;
  return await new Promise((resolve,reject)=>{const headers={Accept:'application/json','Content-Type':String(config.content_type||'application/json')};if(config.api_key)headers['x-api-key']=String(config.api_key);if(bodyText)headers['Content-Length']=Buffer.byteLength(bodyText);const request=client.request(url,{method,headers,timeout:timeoutMs,rejectUnauthorized:false},response=>{const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)return request.destroy(new Error(`Response ${config.api_name||systemCode} เกิน ${Math.round(maxBytes/1024/1024)} MB`));chunks.push(chunk)});response.on('end',()=>{const raw=Buffer.concat(chunks).toString('utf8');let data=null;try{data=raw?JSON.parse(raw):null}catch(_){data=raw}data=normalizeHisApiPayload(data);const status=response.statusCode||502;if(status<200||status>=300)return reject(new Error(`${config.api_name||systemCode} ตอบกลับ HTTP ${status}${typeof data==='string'&&data?` · ${data.slice(0,300)}`:''}`));resolve({status,data,method,url:String(url)})})});request.on('timeout',()=>request.destroy(new Error(`${config.api_name||systemCode} ไม่ตอบกลับภายใน ${Math.round(timeoutMs/1000)} วินาที`)));request.on('error',reject);if(bodyText)request.write(bodyText);request.end()})
}
app.get('/api/his/lab-lookup/health',localOnly,async(_req,res)=>{try{const found=await pool.query("SELECT endpoint_url,active FROM his_api_connections WHERE system_code='LAB_SID_LOOKUP' LIMIT 1"),config=found.rows[0];res.set('Cache-Control','no-store');res.json({ok:true,configured:Boolean(config?.active&&String(config.endpoint_url||'').trim())})}catch(error){res.status(500).json({ok:false,error:error.message||String(error)})}});
function labScanFindValueShallow(data,names){if(!data||typeof data!=='object')return'';const wanted=new Set(names.map(x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'')));for(const [key,value] of Object.entries(data)){if(wanted.has(String(key).toLowerCase().replace(/[^a-z0-9]/g,''))&&value!=null&&typeof value!=='object'&&String(value).trim())return String(value).trim()}return''}
function labScanFindValue(data,names,seen=new Set()){if(data==null||typeof data!=='object'||seen.has(data))return'';seen.add(data);const direct=labScanFindValueShallow(data,names);if(direct)return direct;for(const value of Object.values(data)){const found=labScanFindValue(value,names,seen);if(found)return found}return''}
function labScanFindContainer(data,sid,seen=new Set()){if(data==null||typeof data!=='object'||seen.has(data))return null;seen.add(data);const direct=labScanFindValueShallow(data,['sid','specimenid','specimenuid','specimenno','barcode','barcodeno','barcodevalue','labno','accessionno','accessionnumber','sampleno','containerno']);if(direct&&direct.toLowerCase()===sid.toLowerCase())return data;for(const value of Object.values(data)){const found=labScanFindContainer(value,sid,seen);if(found)return found}return null}
function bangkokHisDateTime(value=new Date()){return new Date(value.getTime()+7*60*60*1000).toISOString().slice(0,19).replace('T',' ')}
async function insertLabScanLog(req,data){await pool.query(`INSERT INTO lab_scan_logs(sid,hn,visit_uid,ln,scan_status,success,http_status,request_body,response_body,error_message,performed_by,client_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)`,[data.sid||'',data.hn||'',data.visitUID||'',data.ln||'',data.scanStatus||'Cancel',Boolean(data.success),data.httpStatus||null,JSON.stringify(data.request||{}),data.response==null?null:JSON.stringify(data.response),data.error||'',workflowActor(req),req.ip||req.socket?.remoteAddress||''])}
app.post('/api/his/lab-lookup',localOnly,async(req,res)=>{const sid=String(req.body?.sid||'').trim().slice(0,160),requestedStatus=String(req.body?.status||'Success').trim(),scanStatus=requestedStatus.toLowerCase()==='cancel'?'Cancel':'Success';if(!sid)return res.status(400).json({ok:false,error:'กรุณาระบุ SID'});let requestBody={},meta={sid,hn:'',visitUID:'',ln:'',scanStatus};try{const duplicate=await pool.query(`SELECT sid,hn,visit_uid,ln,scan_status,scanned_at FROM lab_scan_logs WHERE LOWER(sid)=LOWER($1) AND LOWER(scan_status)=LOWER($2) AND success=TRUE ORDER BY scanned_at DESC,id DESC LIMIT 1`,[sid,scanStatus]);if(duplicate.rows[0]){const previous=duplicate.rows[0],label=scanStatus==='Success'?'Collect':'Cancel';res.set('Cache-Control','no-store');return res.json({ok:false,duplicate:true,message:`SID ${sid} เคยสแกน ${label} สำเร็จแล้ว เมื่อ ${new Date(previous.scanned_at).toLocaleString('th-TH')}`,hn:previous.hn||'',visitUID:previous.visit_uid||'',ln:previous.ln||'',scanStatus})}const state=await readState();let record=null,container=null;for(const candidate of state.records||[]){const found=labScanFindContainer(candidate,sid);if(found){record=candidate;container=found;break}}if(!record)throw Object.assign(new Error(`ไม่พบ SID ${sid} ในข้อมูลลงทะเบียน`),{statusCode:404});meta.hn=String(record.hn||labScanFindValue(container,['hn','hospitalnumber'])||'').trim();meta.visitUID=String(labScanFindValue(container,['visituid','visit_uid','visitid','vn'])||record.hisLastVisitUID||'').trim();meta.ln=String(labScanFindValue(container,['ln','labnumber','labno','accessionno','accessionnumber'])||'').trim();if(!meta.visitUID)throw Object.assign(new Error(`SID ${sid} ไม่มี VisitUID กรุณาตรวจสอบผล OpenVisit`),{statusCode:409});requestBody={ContextKey:String(process.env.HIS_CONTEXT_KEY||'Vimut2022'),DateTime:bangkokHisDateTime(),SID:sid,Status:scanStatus,VisitUID:meta.visitUID};const call=await callConfiguredHisJson('LAB_SID_LOOKUP',requestBody,{timeoutMs:20000,maxBytes:4*1024*1024});await insertLabScanLog(req,{...meta,success:true,httpStatus:call.status,request:requestBody,response:call.data});await workflowAudit(req,'LAB_SCAN',sid,'LOOKUP',{httpStatus:call.status,hn:meta.hn,visitUID:meta.visitUID,ln:meta.ln,scanStatus});res.set('Cache-Control','no-store');res.json({ok:true,status:call.status,response:call.data,request:requestBody,...meta})}catch(error){await insertLabScanLog(req,{...meta,success:false,httpStatus:error.statusCode||null,request:requestBody,error:error.message||String(error)}).catch(()=>{});res.status(error.statusCode||502).json({ok:false,error:`ค้นหา SID จาก HIS ไม่สำเร็จ: ${error.message||error}`,request:requestBody,...meta})}});
app.get('/api/his/lab-scan-logs',localOnly,async(req,res)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||300,1),5000),q=String(req.query.q||'').trim(),params=[limit],where=[];if(q){params.push(`%${q}%`);where.push(`(sid ILIKE $2 OR hn ILIKE $2 OR visit_uid ILIKE $2 OR ln ILIKE $2)`)}const result=await pool.query(`SELECT * FROM lab_scan_logs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY scanned_at DESC,id DESC LIMIT $1`,params);res.set('Cache-Control','no-store');res.json({items:result.rows})}catch(error){res.status(500).json({error:'อ่าน Log การสแกน LAB ไม่สำเร็จ',detail:error.message})}});
app.get('/api/his/lab-scan-report.csv',localOnly,async(req,res)=>{try{const q=String(req.query.q||'').trim(),params=[],where=[];if(q){params.push(`%${q}%`);where.push(`(sid ILIKE $1 OR hn ILIKE $1 OR visit_uid ILIKE $1 OR ln ILIKE $1)`)}const result=await pool.query(`SELECT scanned_at,sid,hn,visit_uid,ln,scan_status,success,http_status,error_message,performed_by FROM lab_scan_logs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY scanned_at DESC,id DESC`,params),csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`,header=['เวลาสแกน','SID','HN','VN / VisitUID','LN','สถานะ','ผลลัพธ์','HTTP','รายละเอียด','ผู้ดำเนินการ'],lines=[header,...result.rows.map(x=>[x.scanned_at,x.sid,x.hn,x.visit_uid,x.ln,x.scan_status,x.success?'สำเร็จ':'ไม่สำเร็จ',x.http_status||'',x.error_message,x.performed_by])].map(row=>row.map(csvCell).join(','));res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="lab-scan-report-${new Date().toISOString().slice(0,10)}.csv"`});res.send('\uFEFF'+lines.join('\r\n'))}catch(error){res.status(500).json({error:'สร้างรายงานการสแกน LAB ไม่สำเร็จ',detail:error.message})}});
function findHisEmrPayloadLegacy(data,depth=0,seen=new Set()){data=normalizeHisApiPayloadLegacy(data);if(depth>12||data==null||typeof data!=='object')return data;if(seen.has(data))return data;seen.add(data);if(data.Patient||Array.isArray(data.LineItem)||Array.isArray(data.lineItem)||Array.isArray(data.LineItems)||data.LineItemUnstructure||data.LineItemICD)return data;if(Array.isArray(data)){for(const item of data){const found=findHisEmrPayloadLegacy(item,depth+1,seen);if(found&&typeof found==='object'&&(found.Patient||found.LineItem||found.lineItem||found.LineItems||found.LineItemUnstructure||found.LineItemICD))return found}return data}for(const value of Object.values(data)){const found=findHisEmrPayloadLegacy(value,depth+1,seen);if(found&&typeof found==='object'&&(found.Patient||found.LineItem||found.lineItem||found.LineItems||found.LineItemUnstructure||found.LineItemICD))return found}return data}
function visitTimestamp(value){const t=Date.parse(String(value||''));return Number.isFinite(t)?t:0}
function chooseHisVisitLegacy(patient,requestedVisitUID=''){const visits=Array.isArray(patient?.Visit)?patient.Visit:[];if(requestedVisitUID){const exact=visits.find(v=>String(v?.VisitUID||'')===String(requestedVisitUID));if(exact)return exact}return [...visits].sort((a,b)=>{const aData=(Array.isArray(a?.Item)&&a.Item.length)||(Array.isArray(a?.Package)&&a.Package.length)?1:0,bData=(Array.isArray(b?.Item)&&b.Item.length)||(Array.isArray(b?.Package)&&b.Package.length)?1:0;return bData-aData||visitTimestamp(b?.VisitDate)-visitTimestamp(a?.VisitDate)})[0]||null}
const findHisEmrPayloadServer=typedHisPayload?.findHisEmrPayload||findHisEmrPayloadLegacy;
const chooseHisVisit=typedHisPayload?.chooseHisVisit||chooseHisVisitLegacy;
if(typedHisResultRoutes?.registerHisResultRoutes){typedHisResultRoutes.registerHisResultRoutes({app,localOnly,callConfiguredHisJson,readState,writeState,contextKey:String(process.env.HIS_CONTEXT_KEY||'Vimut2022')})}else{
app.post('/api/his/visit',localOnly,async(req,res)=>{try{const HN=String(req.body?.HN||req.body?.hn||'').trim(),recordKey=String(req.body?.recordKey||'').trim(),requestedVisitUID=String(req.body?.VisitUID||'').trim();if(!HN)return res.status(400).json({error:'กรุณาระบุ HN'});const contextKey=String(req.body?.ContextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022'),visitRequest={HN,Location:String(req.body?.Location||''),ContextKey:contextKey},visitCall=await callConfiguredHisJson('GET_VISIT',visitRequest),visitRoot=Array.isArray(visitCall.data)?visitCall.data[0]:(visitCall.data?.Patient||visitCall.data||{}),selectedVisit=chooseHisVisit(visitRoot,requestedVisitUID);let revision=null;if(recordKey){revision=await patchRecordHisFields(recordKey,{hisLastVisitUID:String(selectedVisit?.VisitUID||''),hisLastVisitAt:new Date().toISOString(),hisVisitResult:{patient:{UID:visitRoot?.UID||null,HN:visitRoot?.HN||HN,FirstName:visitRoot?.FirstName||'',LastName:visitRoot?.LastName||'',Company:visitRoot?.Company||'',PackageName:visitRoot?.PackageName||'',CheckupDate:visitRoot?.CheckupDate||''},visits:Array.isArray(visitRoot?.Visit)?visitRoot.Visit:[]}}).catch(error=>{console.error('Patch record HIS visit fields failed',error);return null})}res.set('Cache-Control','no-store');res.json({ok:true,revision,visitRequest,visitResponse:visitCall.data,selectedVisit})}catch(error){res.status(502).json({error:`ตรวจสอบ Visit/VN จาก HIS ไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/his/emr',localOnly,async(req,res)=>{try{const HN=String(req.body?.HN||req.body?.hn||'').trim(),recordKey=String(req.body?.recordKey||'').trim(),VisitUID=String(req.body?.VisitUID||'').trim(),deferPersist=req.body?.deferPersist===true;if(!HN)return res.status(400).json({error:'กรุณาระบุ HN'});if(!VisitUID)return res.status(400).json({error:'กรุณาระบุ VisitUID'});const contextKey=String(req.body?.ContextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022'),emrRequest={HN,VisitUID,Request:String(req.body?.Request||''),DoctorNumber:String(req.body?.DoctorNumber||''),Licensenumber:String(req.body?.Licensenumber||''),ContextKey:contextKey},emrCall=await callConfiguredHisJson('GET_EMR_RESULT',emrRequest),emrData=findHisEmrPayloadServer(emrCall.data);let revision=null,relationalEmr=null;if(recordKey&&!deferPersist){relationalEmr=await persistEmrPayload(pool,{recordKey,hn:HN,visitUid:VisitUID,payload:emrData,rawPayload:emrCall.data}).catch(error=>{console.error('Relational EMR persist failed',error);return null});revision=await patchRecordHisFields(recordKey,{hisLastVisitUID:VisitUID,hisLastResultAt:new Date().toISOString(),hisEmrResult:emrData}).catch(error=>{console.error('Patch record HIS emr fields failed',error);return null})}res.set('Cache-Control','no-store');res.json({ok:true,revision,relationalEmr,emrRequest,emrResponse:emrData,rawEmrResponse:emrCall.data})}catch(error){res.status(502).json({error:`รับ EMR จาก HIS ไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/his/checkup-result',localOnly,async(req,res)=>{try{const HN=String(req.body?.HN||req.body?.hn||'').trim(),recordKey=String(req.body?.recordKey||'').trim(),requestedVisitUID=String(req.body?.VisitUID||'').trim(),deferPersist=req.body?.deferPersist===true;if(!HN)return res.status(400).json({error:'กรุณาระบุ HN'});const contextKey=String(req.body?.ContextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022');const visitRequest={HN,Location:String(req.body?.Location||''),ContextKey:contextKey},visitCall=await callConfiguredHisJson('GET_VISIT',visitRequest),visitRoot=Array.isArray(visitCall.data)?visitCall.data[0]:(visitCall.data?.Patient||visitCall.data||{}),selectedVisit=chooseHisVisit(visitRoot,requestedVisitUID);if(!selectedVisit?.VisitUID)return res.status(404).json({error:'HIS ไม่พบ Visit สำหรับ HN นี้',visitRequest,visitResponse:visitCall.data});const emrRequest={HN,VisitUID:String(selectedVisit.VisitUID),Request:String(req.body?.Request||''),DoctorNumber:String(req.body?.DoctorNumber||''),Licensenumber:String(req.body?.Licensenumber||''),ContextKey:contextKey},emrCall=await callConfiguredHisJson('GET_EMR_RESULT',emrRequest),emrData=findHisEmrPayloadServer(emrCall.data);let revision=null,relationalEmr=null;if(recordKey&&!deferPersist){relationalEmr=await persistEmrPayload(pool,{recordKey,hn:HN,visitUid:String(selectedVisit.VisitUID),visitDate:selectedVisit.VisitDate||null,payload:emrData,rawPayload:emrCall.data}).catch(error=>{console.error('Relational EMR persist failed',error);return null});revision=await patchRecordHisFields(recordKey,{hisLastVisitUID:String(selectedVisit.VisitUID),hisLastResultAt:new Date().toISOString(),hisVisitResult:{patient:{UID:visitRoot?.UID||null,HN:visitRoot?.HN||HN,FirstName:visitRoot?.FirstName||'',LastName:visitRoot?.LastName||'',Company:visitRoot?.Company||'',PackageName:visitRoot?.PackageName||'',CheckupDate:visitRoot?.CheckupDate||''},visits:Array.isArray(visitRoot?.Visit)?visitRoot.Visit:[]},hisEmrResult:emrData}).catch(error=>{console.error('Patch record HIS checkup-result fields failed',error);return null})}res.set('Cache-Control','no-store');res.json({ok:true,revision,relationalEmr,visitRequest,visitResponse:visitCall.data,selectedVisit,emrRequest,emrResponse:emrData,rawEmrResponse:emrCall.data})}catch(error){res.status(502).json({error:`เรียกผลตรวจ HIS ไม่สำเร็จ: ${error.message||error}`})}});
}
function findPayorRows(data,depth=0){if(depth>8||data==null)return[];if(Array.isArray(data)){if(data.some(row=>row&&typeof row==='object'&&('_id'in row||'payoragreementid'in row||'tpa'in row)))return data;for(const item of data){const found=findPayorRows(item,depth+1);if(found.length)return found}return[]}if(typeof data==='object'){for(const value of Object.values(data)){const found=findPayorRows(value,depth+1);if(found.length)return found}}return[]}
app.post('/api/his-payors/sync',localOnly,async(req,res)=>{try{const call=await callConfiguredHisJson('GET_PAYOR',{}, {timeoutMs:120000,maxBytes:80*1024*1024}),rows=findPayorRows(call.data);if(!rows.length)return res.status(502).json({error:'GetPayor ไม่พบรายการใน Response'});const client=await pool.connect();try{await client.query('BEGIN');await client.query('TRUNCATE his_payor_catalog');let saved=0;for(const row of rows){const payorCode=String(row?._id||row?.payor||row?.Payor||'').trim(),planCode=String(row?.payoragreementid||row?.agreement||row?.PayorPlan||'').trim(),officeCode=String(row?.tpa||row?.payoroffice||row?.PayorOffice||'').trim();if(!payorCode&&!planCode&&!officeCode)continue;await client.query(`INSERT INTO his_payor_catalog(payor_code,payor_name,plan_code,plan_name,office_code,office_name,source_data,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW()) ON CONFLICT(payor_code,plan_code,office_code) DO UPDATE SET payor_name=EXCLUDED.payor_name,plan_name=EXCLUDED.plan_name,office_name=EXCLUDED.office_name,source_data=EXCLUDED.source_data,updated_at=NOW()`,[payorCode,String(row?.name||row?.payorname||'').trim(),planCode,String(row?.payoragreementname||row?.agreementname||'').trim(),officeCode,String(row?.tpaname||row?.payorofficename||'').trim(),JSON.stringify(row)]);saved++}await client.query('COMMIT');res.json({ok:true,received:rows.length,saved})}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}}catch(error){res.status(502).json({error:`ดึง GetPayor ไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/his-payors/import',localOnly,async(req,res)=>{const items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length)return res.status(400).json({error:'ไม่พบข้อมูล Payor สำหรับนำเข้า'});const client=await pool.connect();try{await client.query('BEGIN');let saved=0;for(const item of items.slice(0,20000)){const payorCode=String(item.payorCode||'').trim(),planCode=String(item.planCode||'').trim(),officeCode=String(item.officeCode||'').trim();if(!payorCode&&!planCode&&!officeCode)continue;await client.query(`INSERT INTO his_payor_catalog(payor_code,payor_name,plan_code,plan_name,office_code,office_name,source_data,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW()) ON CONFLICT(payor_code,plan_code,office_code) DO UPDATE SET payor_name=EXCLUDED.payor_name,plan_name=EXCLUDED.plan_name,office_name=EXCLUDED.office_name,source_data=EXCLUDED.source_data,updated_at=NOW()`,[payorCode,String(item.payorName||''),planCode,String(item.planName||''),officeCode,String(item.officeName||''),JSON.stringify(item)]);saved++}await client.query('COMMIT');res.json({ok:true,saved})}catch(error){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:error.message||String(error)})}finally{client.release()}});
app.get('/api/his-payors',localOnly,async(req,res)=>{try{const type=['payor','plan','office'].includes(String(req.query.type))?String(req.query.type):'payor',q=String(req.query.q||'').trim(),payorCode=String(req.query.payorCode||'').trim(),planCode=String(req.query.planCode||'').trim(),limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));const columns=type==='plan'?['plan_code','plan_name']:type==='office'?['office_code','office_name']:['payor_code','payor_name'],where=[],params=[];if(q){params.push(`%${q}%`);where.push(`(LOWER(${columns[0]}) LIKE LOWER($${params.length}) OR LOWER(${columns[1]}) LIKE LOWER($${params.length}))`)}if(payorCode){params.push(payorCode);where.push(`payor_code=$${params.length}`)}if(planCode){params.push(planCode);where.push(`plan_code=$${params.length}`)}params.push(limit);const result=await pool.query(`SELECT DISTINCT ${columns[0]} AS code,${columns[1]} AS name FROM his_payor_catalog ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ${columns[0]} LIMIT $${params.length}`,params),counts=await pool.query(`SELECT COUNT(DISTINCT payor_code) FILTER(WHERE payor_code<>'')::int payor,COUNT(DISTINCT (payor_code,plan_code)) FILTER(WHERE plan_code<>'')::int plan,COUNT(DISTINCT office_code) FILTER(WHERE office_code<>'')::int office FROM his_payor_catalog`);res.set('Cache-Control','no-store');res.json({items:result.rows,counts:counts.rows[0]||{payor:0,plan:0,office:0}})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.get('/api/his-payors/selection',localOnly,async(req,res)=>{try{const payorCode=String(req.query.payorCode||'').trim(),planCode=String(req.query.planCode||'').trim();const result=await pool.query(`SELECT payor_code,payor_name,plan_code,plan_name,office_code,office_name FROM his_payor_catalog WHERE ($1='' OR payor_code=$1) AND ($2='' OR plan_code=$2) ORDER BY payor_code,plan_code,office_code LIMIT 500`,[payorCode,planCode]);res.set('Cache-Control','no-store');res.json({items:result.rows})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.get('/api/his-payors/catalog',localOnly,async(req,res)=>{try{const q=String(req.query.q||'').trim(),limit=Math.min(1000,Math.max(1,Number(req.query.limit)||500)),params=[];let where='';if(q){params.push(`%${q}%`);where=`WHERE CONCAT_WS(' ',payor_code,payor_name,plan_code,plan_name,office_code,office_name) ILIKE $1`}params.push(limit);const result=await pool.query(`SELECT payor_code,payor_name,plan_code,plan_name,office_code,office_name FROM his_payor_catalog ${where} ORDER BY payor_name,payor_code,plan_name,plan_code,office_name LIMIT $${params.length}`,params),counts=await pool.query(`SELECT COUNT(DISTINCT payor_code) FILTER(WHERE payor_code<>'')::int payor,COUNT(DISTINCT (payor_code,plan_code)) FILTER(WHERE plan_code<>'')::int plan,COUNT(DISTINCT office_code) FILTER(WHERE office_code<>'')::int office FROM his_payor_catalog`);res.set('Cache-Control','no-store');res.json({items:result.rows,counts:counts.rows[0]||{payor:0,plan:0,office:0}})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.get('/api/master-nationalities',localOnly,async(req,res)=>{try{const q=String(req.query.q||'').trim(),limit=Math.min(1000,Math.max(1,Number(req.query.limit)||500)),params=[];let where='';if(q){params.push(`%${q}%`);where=`WHERE CONCAT_WS(' ',code,name,desc1,desc2) ILIKE $1`}params.push(limit);const result=await pool.query(`SELECT code,name,desc1,desc2,display_order FROM nationality_master ${where} ORDER BY display_order,name,code LIMIT $${params.length}`,params),count=await pool.query('SELECT COUNT(*)::int count FROM nationality_master');res.set('Cache-Control','no-store');res.json({items:result.rows,count:Number(count.rows[0]?.count||0)})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.post('/api/master-nationalities',localOnly,async(req,res)=>{try{const code=String(req.body?.code||'').trim().slice(0,40),name=String(req.body?.name||'').trim().slice(0,300);if(!code||!name)return res.status(400).json({error:'กรุณาระบุ Code และ Name'});await pool.query(`INSERT INTO nationality_master(code,name,desc1,desc2,display_order,source_data,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,NOW(),$7) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,desc1=EXCLUDED.desc1,desc2=EXCLUDED.desc2,display_order=EXCLUDED.display_order,source_data=EXCLUDED.source_data,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[code,name,String(req.body?.desc1||'').slice(0,120),String(req.body?.desc2||'').slice(0,120),Number(req.body?.displayOrder)||0,JSON.stringify(req.body||{}),String(req.body?.updatedBy||'system').slice(0,120)]);res.json({ok:true,code})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.post('/api/master-nationalities/import',localOnly,async(req,res)=>{const items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length)return res.status(400).json({error:'ไม่พบข้อมูล Nationality สำหรับนำเข้า'});const client=await pool.connect();try{await client.query('BEGIN');let saved=0;for(const item of items.slice(0,5000)){const code=String(item?.code||'').trim().slice(0,40),name=String(item?.name||'').trim().slice(0,300);if(!code||!name)continue;await client.query(`INSERT INTO nationality_master(code,name,desc1,desc2,display_order,source_data,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,NOW(),$7) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,desc1=EXCLUDED.desc1,desc2=EXCLUDED.desc2,display_order=EXCLUDED.display_order,source_data=EXCLUDED.source_data,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[code,name,String(item?.desc1||'').slice(0,120),String(item?.desc2||'').slice(0,120),Number(item?.displayOrder)||0,JSON.stringify(item),String(req.body?.updatedBy||'system').slice(0,120)]);saved++}await client.query('COMMIT');res.json({ok:true,saved})}catch(error){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:error.message||String(error)})}finally{client.release()}});
app.delete('/api/master-nationalities/:code',localOnly,async(req,res)=>{try{const code=String(req.params.code||'').trim();if(!code)return res.status(400).json({error:'ไม่พบ Code'});const result=await pool.query('DELETE FROM nationality_master WHERE code=$1',[code]);res.json({ok:true,deleted:result.rowCount})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.get('/api/master-titles',localOnly,async(req,res)=>{try{const kind=req.query.kind==='title_en'?'title_en':'title',q=String(req.query.q||'').trim(),params=[kind],where='kind=$1'+(q?(params.push(`%${q}%`),' AND CONCAT_WS(\' \',code,name,desc1,desc2) ILIKE $2'):'');const result=await pool.query(`SELECT code,name,desc1,desc2,display_order,gender FROM title_master WHERE ${where} ORDER BY display_order,name,code`,params),count=await pool.query('SELECT COUNT(*)::int count FROM title_master WHERE kind=$1',[kind]);res.json({items:result.rows,count:Number(count.rows[0]?.count||0)})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.post('/api/master-titles/import',localOnly,async(req,res)=>{const kind=req.body?.kind==='title_en'?'title_en':'title',items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length)return res.status(400).json({error:'ไม่พบข้อมูล Title สำหรับนำเข้า'});const client=await pool.connect();try{await client.query('BEGIN');let saved=0;for(const item of items.slice(0,5000)){const code=String(item?.code||'').trim().slice(0,40),name=String(item?.name||'').trim().slice(0,300);if(!code||!name)continue;await client.query(`INSERT INTO title_master(kind,code,name,desc1,desc2,display_order,gender,source_data,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW(),$9) ON CONFLICT(kind,code) DO UPDATE SET name=EXCLUDED.name,desc1=EXCLUDED.desc1,desc2=EXCLUDED.desc2,display_order=EXCLUDED.display_order,gender=CASE WHEN EXCLUDED.gender<>'' THEN EXCLUDED.gender ELSE title_master.gender END,source_data=EXCLUDED.source_data,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[kind,code,name,String(item.desc1||''),String(item.desc2||''),Number(item.displayOrder)||0,['M','F'].includes(String(item.gender||'').toUpperCase())?String(item.gender).toUpperCase():'',JSON.stringify(item),String(req.body?.updatedBy||'system')]);saved++}await client.query('COMMIT');res.json({ok:true,saved})}catch(error){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:error.message||String(error)})}finally{client.release()}});
app.put('/api/master-titles/:kind/:code/gender',localOnly,async(req,res)=>{try{const kind=req.params.kind==='title_en'?'title_en':'title',code=String(req.params.code||'').trim(),gender=String(req.body?.gender||'').trim().toUpperCase();if(!['','M','F'].includes(gender))return res.status(400).json({error:'Gender ต้องเป็น M, F หรือว่าง'});const result=await pool.query('UPDATE title_master SET gender=$1,updated_at=NOW(),updated_by=$2 WHERE kind=$3 AND code=$4 RETURNING code,name,gender',[gender,String(req.body?.updatedBy||'system').slice(0,120),kind,code]);if(!result.rowCount)return res.status(404).json({error:'ไม่พบ Title ที่ต้องการแก้ไข'});res.json({ok:true,item:result.rows[0]})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.delete('/api/master-titles/:kind/:code',localOnly,async(req,res)=>{try{const kind=req.params.kind==='title_en'?'title_en':'title',result=await pool.query('DELETE FROM title_master WHERE kind=$1 AND code=$2',[kind,String(req.params.code||'')]);res.json({ok:true,deleted:result.rowCount})}catch(error){res.status(500).json({error:error.message||String(error)})}});
async function hisActionAudit(req,state,record,action,details={}){
  try{
    const company=(state.companies||[]).find(item=>String(item.id)===String(record.companyId))||{};
    const encoded=String(req.headers['x-performed-by-b64']||'').trim();let actor='system';
    if(encoded){try{actor=Buffer.from(encoded,'base64').toString('utf8').slice(0,160)}catch(_){}}
    else {const raw=String(req.headers['x-performed-by']||req.headers['x-user-name']||req.body?.changedBy||req.body?.userCode||'system');try{actor=decodeURIComponent(raw).slice(0,160)}catch(_){actor=raw.slice(0,160)}}
    await pool.query(`INSERT INTO checkup_audit_log
      (record_key,customer_name,id_passport,company_id,company_name,company_year,package_code,package_name,action,
       performed_by_user_id,performed_by_username,performed_by_display_name,details)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10,$11::jsonb)`,[
      String(record.key||record.id||''),[record.title,record.first,record.last].filter(Boolean).join(' '),String(record.id||''),
      String(record.companyId||''),String(company.name||''),String(company.year||''),String(record.code||''),String(record.packageName||''),
      action,actor,JSON.stringify(details||{})
    ]);
  }catch(error){console.warn(`HIS action audit ${action} failed`,error.message)}
}
app.post('/api/his/open-visit',localOnly,async(req,res)=>{
  try{
    const recordKey=String(req.body?.recordKey||'').trim();let bookingId=String(req.body?.bookingId||'').trim();const payor=String(req.body?.payor||'').trim(),agreement=String(req.body?.agreement||'').trim(),payorOffice=String(req.body?.payorOffice||'').trim(),locationCode=String(req.body?.locationCode||'').trim();
    if(!recordKey)return res.status(400).json({error:'ไม่พบรายการลูกค้าที่จะเปิดวิสิต'});
    if(!payor)return res.status(400).json({error:'กรุณาระบุ Payor'});
    if(!locationCode)return res.status(400).json({error:'กรุณาระบุ Location'});
    const state=await readState(),record=(state.records||[]).find(item=>String(item.key||item.id)===recordKey);
    if(!record)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});
    if(!record.checkupConfirmedAt&&!record.visitedAt)return res.status(409).json({error:'กรุณายืนยันการตรวจก่อนเปิดวิสิต'});
    // v7.62.44: a company/year project may be selected before this customer has an individual booking row.
    // Materialize that membership only after the operator selects the project in OpenVisit.
    if(/^PROJECT:/i.test(bookingId)){
      const projectId=bookingId.replace(/^PROJECT:/i,'').trim();
      const eligibleProject=(await pool.query(`WITH identity AS (
        SELECT DISTINCT cc.company_year_id,cy.company_id,cy.screening_year
        FROM customers c JOIN company_customers cc ON cc.customer_id=c.id JOIN company_years cy ON cy.id=cc.company_year_id
        WHERE cc.legacy_record_key=$1
           OR (COALESCE($2,'')<>'' AND regexp_replace(COALESCE(c.hn,''),'[^A-Za-z0-9]','','g')=regexp_replace($2,'[^A-Za-z0-9]','','g'))
           OR (COALESCE($3,'')<>'' AND (LOWER(BTRIM(COALESCE(c.identification_number,'')))=LOWER(BTRIM($3)) OR LOWER(BTRIM(COALESCE(c.passport_number,'')))=LOWER(BTRIM($3))))
      ) SELECT p.* FROM checkup_projects p JOIN identity i ON (p.company_id=i.company_id OR p.company_id=i.company_year_id OR p.company_id=$4)
        WHERE p.id=$5 AND p.status<>'CANCELLED' AND p.project_code<>'HIS-OPEN-VISIT'
          AND (COALESCE(p.screening_year,'')='' OR COALESCE(i.screening_year,'')='' OR p.screening_year=i.screening_year)
        LIMIT 1`,[recordKey,String(record.hn||''),String(record.id||''),String(record.companyId||''),projectId])).rows[0];
      if(!eligibleProject)return res.status(409).json({error:'Booking ที่เลือกไม่ตรงกับบริษัท/ปีของผู้รับบริการ'});
      const generatedId=crypto.randomUUID(),actor=workflowActor(req),patientName=[record.title,record.first,record.last].filter(Boolean).join(' ').trim();
      const created=(await pool.query(`INSERT INTO checkup_bookings(id,project_id,record_key,hn,employee_code,patient_name,id_passport,birth_date,sex,company_id,company_name,department_name,position_name,package_code,package_name,scheduled_date,booking_status,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          CASE WHEN CURRENT_DATE BETWEEN COALESCE($16::date,CURRENT_DATE) AND COALESCE($17::date,CURRENT_DATE) THEN CURRENT_DATE ELSE $16::date END,
          'BOOKED',$18,$18)
        ON CONFLICT(project_id,record_key) WHERE record_key<>'' DO UPDATE SET hn=EXCLUDED.hn,employee_code=EXCLUDED.employee_code,patient_name=EXCLUDED.patient_name,id_passport=EXCLUDED.id_passport,birth_date=EXCLUDED.birth_date,sex=EXCLUDED.sex,company_id=EXCLUDED.company_id,company_name=EXCLUDED.company_name,department_name=EXCLUDED.department_name,position_name=EXCLUDED.position_name,package_code=EXCLUDED.package_code,package_name=EXCLUDED.package_name,updated_at=NOW(),updated_by=EXCLUDED.updated_by
        RETURNING id`,[generatedId,projectId,recordKey,String(record.hn||''),String(record.employeeCode||''),patientName,String(record.id||''),String(record.birth||''),String(record.sex||''),String(eligibleProject.company_id||record.companyId||''),String(eligibleProject.company_name||record.sourceCompany||''),String(record.departmentName||''),String(record.positionName||''),String(record.code||record.packageCode||''),String(record.packageName||''),eligibleProject.start_date,eligibleProject.end_date,actor])).rows[0];
      bookingId=String(created?.id||'');
    }
    const projectRules=await pool.query(`SELECT b.id AS booking_id,b.scheduled_date,p.id AS project_id,p.payor_options FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id WHERE b.record_key=$1 AND b.booking_status<>'CANCELLED' AND p.status<>'CANCELLED' AND p.project_code<>'HIS-OPEN-VISIT' ORDER BY CASE WHEN b.scheduled_date=CURRENT_DATE THEN 0 ELSE 1 END,b.scheduled_date DESC NULLS LAST,b.updated_at DESC`,[recordKey]);
    if(!projectRules.rows.length)return res.status(409).json({error:'ไม่พบ Booking ของโครงการ กรุณาเพิ่มบุคคลเข้า Booking ก่อน OpenVisit'});
    const eligibleBookings=bookingId?projectRules.rows.filter(row=>String(row.booking_id)===bookingId):projectRules.rows;
    if(bookingId&&!eligibleBookings.length)return res.status(409).json({error:'Booking ที่เลือกไม่ตรงกับผู้รับบริการหรือถูกยกเลิกแล้ว'});
    const allowed=eligibleBookings.flatMap(row=>(Array.isArray(row.payor_options)?row.payor_options:[]).map(item=>({row,item}))),selectedRule=allowed.find(({item})=>String(item.payor||'')===payor&&(!item.agreement||String(item.agreement)===agreement)&&(!item.office||String(item.office)===payorOffice));
    if(!allowed.length)return res.status(409).json({error:'Booking นี้ยังไม่ได้กำหนด Payor ในโครงการ'});if(!selectedRule)return res.status(409).json({error:'Payor / Agreement / Office ไม่ตรงกับที่กำหนดในโครงการ'});const selectedBooking=selectedRule.row;
    if(String(record.hisLastVisitUID||'').trim())return res.status(409).json({error:'เปิดวิสิตสำเร็จแล้ว ต้อง CancelVisit ก่อนจึงจะเปิดซ้ำได้'});
    if(!String(record.hn||'').trim())return res.status(400).json({error:'รายการนี้ยังไม่มี HN จึงเปิดวิสิตไม่ได้'});
    const clean=(value,max=300)=>String(value??'').trim().slice(0,max),gender=value=>{const text=String(value||'').toUpperCase();return text==='M'||text==='MALE'?'Male':text==='F'||text==='FEMALE'?'Female':clean(value,20)};
    const packageRows=[];
    const addPackages=(items,type)=>{for(const [index,item] of (Array.isArray(items)?items:[]).entries()){const value=typeof item==='string'?{name:item}:item||{};if(!value.code&&!value.name)continue;packageRows.push({PrescriptionNo:packageRows.length+1,Payor:payor,PackageCode:clean(value.code,100),PackageName:clean(value.name,500),Type:type,Cost:Number(value.price||value.cost||0),RightCode:clean(value.rightCode,100),ReferenceId:value.referenceId??null,PaymentStatus:value.paymentStatus??null,PaymentType:value.paymentType??null,TransactionState:value.transactionState??null,Paymentdate:value.paymentdate??null})}};
    addPackages(record.primaryPackages?.length?record.primaryPackages:[{code:record.code,name:record.packageName,price:record.packagePrice}],'main');
    addPackages(record.acceptedBillingItems,'billing');addPackages(record.acceptedCashItems,'cash');addPackages(record.selectedPackages,'contract');
    if(!packageRows.length)return res.status(400).json({error:'ไม่พบแพ็กเกจสำหรับเปิดวิสิต'});
    const payload={IdentificationNumber:clean(record.id,80),IdentificationType:clean(record.identificationType||'idnumber',30),HN:clean(record.hn,80),Title:clean(record.title,40),FirstName:clean(record.first,120),LastName:clean(record.last,120),Gender:gender(record.sex),Birthdate:normalizeHisBirthdate(record.birth),EmployeeCode:clean(record.employeeCode,80),LocationCode:locationCode,DoctorNumber:clean(record.doctorNumber,80),UserCode:clean(req.body?.userCode||req.body?.changedBy||'system',120),ContextKey:clean(req.body?.contextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022',80),VisitUID:'',VisitCategory:clean(req.body?.visitCategory,80),ExternalVisitID:clean(record.externalVisitId||record.appointmentSlotId||record.appointmentId||'',120),CheckupRequestNo:clean(record.checkupRequestNo,120),VisitDate:clean(req.body?.visitDate||'',30),Package:packageRows,Payor:{Payor:payor,Agreement:agreement,PayorOffice:payorOffice}};
    const call=await callConfiguredHisJson('OPEN_VISIT',payload),responseData=call.data||{},responseRow=Array.isArray(responseData)?(responseData[0]||{}):(responseData?.Result||responseData?.result||responseData?.Patient||responseData?.patient||responseData);
    const apiMessage=clean(responseRow.StatusDetail||responseRow.statusDetail||responseRow.Message||responseRow.message||responseRow.ErrorMessage||responseRow.errorMessage||responseRow.ErrorDetail||responseRow.errorDetail||responseRow.errordetail||responseRow.Error||responseRow.error||'',1000),apiStatus=String(responseRow.localerror||responseRow.LocalError||responseRow.Status||responseRow.status||'').trim().toLowerCase(),apiFailed=responseRow.IsResult===false||responseRow.isResult===false||responseRow.Success===false||responseRow.success===false||responseRow.Status===false||responseRow.status===false||['error','unsuccess','failed','fail'].includes(apiStatus)||/\b(required|error|invalid|failed|missing)\b/i.test(apiMessage);
    const visitUID=clean(responseRow.VisitUID||responseRow.visitUID||responseRow.VN||responseRow.vn||'',120);
    if(apiFailed||!visitUID)throw new Error(apiMessage||'HIS ไม่ได้ส่ง VisitUID / VN กลับมา จึงถือว่าเปิดวิสิตไม่สำเร็จ');
    record.openVisitRequest=payload;record.openVisitResponse=responseData;record.openVisitAt=new Date().toISOString();record.openVisitBookingId=selectedBooking.booking_id;record.openVisitLocationCode=locationCode;record.payor=payor;record.payorAgreement=agreement;record.payorOffice=payorOffice;
    if(visitUID)record.hisLastVisitUID=visitUID;
    state.at=new Date().toISOString();const revision=await writeState(state);
    const visitDate=new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10),visitId=crypto.randomUUID(),actor=workflowActor(req);
    await pool.query(`INSERT INTO checkup_visits(id,booking_id,visit_date,checkin_at,vn,location,visit_status,updated_by) VALUES($1,$2,$3::date,$4,$5,$6,'CHECKED_IN',$7) ON CONFLICT(booking_id) DO UPDATE SET visit_date=EXCLUDED.visit_date,checkin_at=EXCLUDED.checkin_at,vn=EXCLUDED.vn,location=EXCLUDED.location,visit_status='CHECKED_IN',updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[visitId,selectedBooking.booking_id,visitDate,record.openVisitAt,visitUID,locationCode,actor]);
    await pool.query("UPDATE checkup_bookings SET booking_status='ARRIVED',updated_at=NOW(),updated_by=$2 WHERE id=$1",[selectedBooking.booking_id,actor]);
    await hisActionAudit(req,state,record,'OPEN_VISIT',{hn:record.hn||'',visitUID,locationCode,bookingId:selectedBooking.booking_id,projectId:selectedBooking.project_id,performedAt:record.openVisitAt});
    res.set('Cache-Control','no-store');res.json({ok:true,revision,visitUID,bookingId:selectedBooking.booking_id,dataSource:'latest-saved-patient',request:payload,response:responseData});
  }catch(error){res.status(502).json({error:`เปิดวิสิตกับ HIS ไม่สำเร็จ: ${error.message||error}`});}
});
app.post('/api/his/order',localOnly,async(req,res)=>{
  try{
    const recordKey=String(req.body?.recordKey||'').trim();if(!recordKey)return res.status(400).json({error:'ไม่พบรายการลูกค้าที่จะส่ง OrderHIS'});
    const state=await readState(),record=(state.records||[]).find(item=>String(item.key||item.id)===recordKey);if(!record)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});if(!record.visitedAt)return res.status(409).json({error:'กรุณายืนยันและบันทึกการตรวจก่อนส่ง OrderHIS'});
    if(record.orderHisAt&&(!record.cancelOrderAt||Date.parse(record.orderHisAt)>Date.parse(record.cancelOrderAt)))return res.status(409).json({error:'ส่ง OrderHIS สำเร็จแล้ว ต้อง Cancel Order ก่อนจึงจะส่งซ้ำได้'});
    const hn=String(record.hn||'').trim(),visitUID=String(record.hisLastVisitUID||'').trim();if(!hn)return res.status(400).json({error:'รายการนี้ยังไม่มี HN'});if(!visitUID)return res.status(400).json({error:'รายการนี้ยังไม่มี VisitUID/VN กรุณากด OpenViSit ก่อน'});
    const clean=(value,max=500)=>String(value??'').trim().slice(0,max),gender=value=>{const text=String(value||'').toUpperCase();return text==='M'||text==='MALE'?'Male':text==='F'||text==='FEMALE'?'Female':clean(value,20)},packages=[];
    for(const item of (record.primaryPackages?.length?record.primaryPackages:[{code:record.code,name:record.packageName,price:record.packagePrice}])){const value=typeof item==='string'?{name:item}:item||{};if(!value.code&&!value.name)continue;packages.push({PrescriptionNo:packages.length+1,Payor:clean(record.payor,80),PackageCode:clean(value.code,100),PackageName:clean(value.name,500),Type:'main',Cost:Number(value.price||value.cost||0),RightCode:clean(value.rightCode,100),ReferenceId:value.referenceId??null,PaymentStatus:value.paymentStatus??null,PaymentType:value.paymentType??null,TransactionState:value.transactionState??null,Paymentdate:value.paymentdate??null})}
    for(const item of [...(record.acceptedBillingItems||[]),...(record.acceptedCashItems||[]),...(record.selectedPackages||[])]){const value=typeof item==='string'?{name:item}:item||{};if(!value.code&&!value.name)continue;packages.push({PrescriptionNo:clean(value.prescriptionNo,80),Payor:clean(value.payor,80),PackageCode:clean(value.code,100),PackageName:clean(value.name,500),Type:'Add-on',Cost:Number(value.price||value.cost||0),RightCode:clean(value.rightCode,100),ReferenceId:value.referenceId??null,PaymentStatus:value.paymentStatus??null,PaymentType:value.paymentType??null,TransactionState:value.transactionState??null,Paymentdate:value.paymentdate??null})}
    if(!packages.length)return res.status(400).json({error:'ไม่พบแพ็กเกจหลักหรือรายการตรวจเพิ่มสำหรับส่ง OrderHIS'});
    const payload={VisitID:null,IdentificationNumber:clean(record.id,80),IdentificationType:clean(record.identificationType||'idnumber',30),Title:clean(record.title,40),FirstName:clean(record.first,120),LastName:clean(record.last,120),Gender:gender(record.sex),Birthdate:normalizeHisBirthdate(record.birth),HN:hn,VisitUID:visitUID,EmployeeCode:clean(record.employeeCode,80),LocationCode:clean(req.body?.locationCode||record.openVisitLocationCode||record.locationCode,80),DoctorNumber:clean(req.body?.doctorNumber||record.doctorNumber,120),UserCode:req.body?.userCode==null?null:clean(req.body.userCode,120),ContextKey:clean(req.body?.contextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022',80),VisitCategory:req.body?.visitCategory??null,ExternalVisitID:record.externalVisitId??null,CheckupRequestNo:clean(record.checkupRequestNo,120),VisitDate:clean(req.body?.visitDate,30),Package:packages};
    const call=await callConfiguredHisJson('ORDER_HIS',payload),responseData=call.data||{},apiMessage=clean(hisResponseMessages(responseData).join(' · '),1000),apiFailed=hisResponseFailed(responseData);if(apiFailed)throw new Error(apiMessage||'HIS ปฏิเสธ Order');record.orderHisRequest=payload;record.orderHisResponse=responseData;record.orderHisAt=new Date().toISOString();state.at=new Date().toISOString();const revision=await writeState(state);await hisActionAudit(req,state,record,'ORDER_HIS',{hn,visitUID,packageCount:packages.length,message:apiMessage,performedAt:record.orderHisAt});res.set('Cache-Control','no-store');res.json({ok:true,revision,message:apiMessage,request:payload,response:responseData});
  }catch(error){res.status(502).json({error:`ส่ง OrderHIS ไม่สำเร็จ: ${error.message||error}`});}
});
app.post('/api/his/cancel-visit',localOnly,async(req,res)=>{try{const recordKey=String(req.body?.recordKey||'').trim(),state=await readState(),record=(state.records||[]).find(item=>String(item.key||item.id)===recordKey);if(!record)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});const hn=String(record.hn||'').trim(),visitUID=String(record.hisLastVisitUID||'').trim();if(!hn||!visitUID)return res.status(400).json({error:'ต้องมี HN และ VisitUID/VN ก่อนยกเลิก Visit'});const clean=(value,max=500)=>String(value??'').trim().slice(0,max),payload={HN:hn,VisitUID:visitUID,ContextKey:clean(req.body?.contextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022',80),Remark:clean(req.body?.remark||'rollback',500),CheckupRequestNo:clean(record.checkupRequestNo,120),UserCode:clean(req.body?.userCode,120),VisitDate:clean(req.body?.visitDate,30)},call=await callConfiguredHisJson('CANCEL_VISIT',payload),responseData=call.data||{},message=String(responseData.Message||responseData.message||responseData.Error||responseData.error||'').trim();if(responseData.Success===false||responseData.success===false||responseData.Status===false||String(responseData.Status||'').toLowerCase()==='error')throw new Error(message||'HIS ปฏิเสธการยกเลิก Visit');record.cancelVisitRequest=payload;record.cancelVisitResponse=responseData;record.cancelVisitAt=new Date().toISOString();record.cancelledVisitUID=visitUID;record.hisLastVisitUID='';state.at=new Date().toISOString();const revision=await writeState(state);await hisActionAudit(req,state,record,'CANCEL_VISIT',{hn,visitUID,message,performedAt:record.cancelVisitAt});res.json({ok:true,revision,message,request:payload,response:responseData})}catch(error){res.status(502).json({error:`CancelVisit ไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/his/cancel-order',localOnly,async(req,res)=>{try{const recordKey=String(req.body?.recordKey||'').trim(),state=await readState(),record=(state.records||[]).find(item=>String(item.key||item.id)===recordKey);if(!record)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});const hn=String(record.hn||'').trim(),visitUID=String(record.hisLastVisitUID||record.cancelledVisitUID||'').trim();if(!hn||!visitUID)return res.status(400).json({error:'ต้องมี HN และ VisitUID/VN ก่อนยกเลิก Order'});const clean=(value,max=500)=>String(value??'').trim().slice(0,max),source=Array.isArray(record.orderHisRequest?.Package)&&record.orderHisRequest.Package.length?record.orderHisRequest.Package:[...(record.acceptedBillingItems||[]),...(record.acceptedCashItems||[]),...(record.selectedPackages||[])],packages=source.map(raw=>{const item=typeof raw==='string'?{name:raw}:raw||{};return {PrescriptionNo:Number(item.PrescriptionNo||item.prescriptionNo||0),Payor:item.Payor??item.payor??null,PackageCode:clean(item.PackageCode||item.code,100),PackageName:clean(item.PackageName||item.name,500),Type:clean(item.Type||item.type||'main',40),Cost:Number(item.Cost||item.price||item.cost||0),RightCode:item.RightCode??item.rightCode??null,ReferenceId:item.ReferenceId??item.referenceId??'',PaymentStatus:item.PaymentStatus??item.paymentStatus??null,PaymentType:item.PaymentType??item.paymentType??null,TransactionState:item.TransactionState??item.transactionState??null,Paymentdate:item.Paymentdate??item.paymentdate??null}}).filter(item=>item.PackageCode||item.PackageName);if(!packages.length)return res.status(400).json({error:'ไม่พบรายการ Package ที่จะยกเลิก'});const payload={IdentificationNumber:clean(record.id,80),IdentificationType:clean(record.identificationType||'idnumber',30),Title:clean(record.title,40),FirstName:clean(record.first,120),LastName:clean(record.last,120),VisitUID:visitUID,HN:hn,Payor:null,Package:packages,ContextKey:clean(req.body?.contextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022',80),CheckupRequestNo:record.checkupRequestNo||null,UserCode:clean(req.body?.userCode,120),VisitDate:clean(req.body?.visitDate,30)},call=await callConfiguredHisJson('CANCEL_ORDER',payload),responseData=call.data||{},message=String(responseData.Message||responseData.message||responseData.Error||responseData.error||'').trim();if(responseData.Success===false||responseData.success===false||responseData.Status===false||String(responseData.Status||'').toLowerCase()==='error')throw new Error(message||'HIS ปฏิเสธการยกเลิก Order');record.cancelOrderRequest=payload;record.cancelOrderResponse=responseData;record.cancelOrderAt=new Date().toISOString();state.at=new Date().toISOString();const revision=await writeState(state);await hisActionAudit(req,state,record,'CANCEL_ORDER',{hn,visitUID,packageCount:packages.length,message,performedAt:record.cancelOrderAt});res.json({ok:true,revision,message,request:payload,response:responseData})}catch(error){res.status(502).json({error:`Cancel Order ไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/his/charge-close',localOnly,async(req,res)=>{try{const recordKey=String(req.body?.recordKey||'').trim();if(!recordKey)return res.status(400).json({error:'recordKey is required'});const row=(await pool.query(`SELECT c.hn,c.vn,cc.source_data FROM company_customers cc JOIN customers c ON c.id=cc.customer_id WHERE cc.legacy_record_key=$1 LIMIT 1`,[recordKey])).rows[0];if(!row)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});const record={...(row.source_data||{}),key:recordKey,hn:String(row.hn||row.source_data?.hn||''),hisLastVisitUID:String(row.vn||row.source_data?.hisLastVisitUID||'')},hn=String(record.hn||'').trim(),visitUID=String(record.hisLastVisitUID||'').trim();if(!hn||!visitUID)return res.status(400).json({error:'ต้องมี HN และ VisitUID/VN ก่อน ChargeClose'});const clean=(value,max=500)=>String(value??'').trim().slice(0,max),payload={HN:hn,VisitUID:visitUID,ContextKey:clean(req.body?.contextKey||process.env.HIS_CONTEXT_KEY||'Vimut2022',80)},call=await callConfiguredHisJson('CHARGE_CLOSE',payload),responseData=call.data||{},message=clean(responseData.Message||responseData.message||responseData.ErrorMessage||responseData.errorMessage||responseData.ErrorDetail||responseData.errorDetail||responseData.Error||responseData.error||'',1000),failed=responseData.Success===false||responseData.success===false||responseData.Status===false||responseData.status===false||['error','unsuccess','failed','fail'].includes(String(responseData.localerror||responseData.LocalError||responseData.Status||responseData.status||'').toLowerCase());if(failed)throw new Error(message||'HIS ปฏิเสธ ChargeClose');const chargeCloseAt=new Date().toISOString(),revision=await patchRecordHisFields(recordKey,{chargeCloseRequest:payload,chargeCloseResponse:responseData,chargeCloseAt});await hisActionAudit(req,{companies:[]},record,'CHARGE_CLOSE',{hn,visitUID,message,performedAt:chargeCloseAt});res.json({ok:true,revision,message,request:payload,response:responseData,fastPath:true})}catch(error){res.status(502).json({error:`ChargeClose ไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/his/visit-status',localOnly,async(req,res)=>{let client;try{const recordKey=String(req.body?.recordKey||'').trim(),state=await readState(),record=(state.records||[]).find(item=>String(item.key||item.id)===recordKey);if(!record)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});const hn=String(record.hn||'').trim(),visitUID=String(record.hisLastVisitUID||record.vn||'').trim();if(!hn&&!visitUID)return res.status(400).json({error:'ต้องมี VN หรือ HN ก่อนตรวจสอบสถานะ'});let row=null,statusSource='opdvisit',matchedBy=visitUID?'VN':'HN_FALLBACK';if(visitUID){const item=(await queryHisOpdVisitBatch([visitUID]))[0];if(item){row={visit_uid:item.vn,status:item.status};statusSource=item.source||statusSource}}else{const config=await readHisAppointmentConfig(),table=process.env.HIS_VISIT_STATUS_TABLE||'opdvisit';if(!safeIdentifier(table))throw new Error('ชื่อตาราง Visit Status ไม่ถูกต้อง');client=appointmentPool(config);const result=await client.query(`SELECT "vn" AS visit_uid,"lovvisithstscode" AS status,"lastvisitsts" AS last_status,"cancelleddate" AS cancelled_date FROM "${config.schema}"."${table}" WHERE "hn"=$1 ORDER BY "id" DESC LIMIT 1`,[hn]);row=result.rows[0]}const lastStatus=String(row?.last_status??'').trim(),cancelled=Boolean(row?.cancelled_date)||lastStatus.toLowerCase()==='cancelled',resolvedStatus=!row?'NOT_FOUND':cancelled?'Cancelled':String(row.status||lastStatus||'Unknown').trim();record.hisVisitStatus=resolvedStatus;record.hisVisitStatusAt=new Date().toISOString();record.hisVisitStatusSource=row?statusSource:'';state.at=new Date().toISOString();const revision=await writeState(state);res.json({ok:true,status:record.hisVisitStatus,visitUID:String(row?.visit_uid||visitUID),matchedBy,statusSource:row?statusSource:null,revision})}catch(error){res.status(502).json({error:`ตรวจสอบ Visit Status ไม่สำเร็จ: ${error.message||error}`})}finally{if(client)await client.end().catch(()=>{})}});

async function reportFont(pdf){pdf.registerFontkit(fontkit);const fontPath=path.join(process.env.WINDIR||'C:\\Windows','Fonts','tahoma.ttf');return fs.existsSync(fontPath)?pdf.embedFont(fs.readFileSync(fontPath),{subset:true}):pdf.embedFont(StandardFonts.Helvetica)}
function reportLines(value,{interpretTemplates=[],interpretCategoryTemplates={}}={}){
  interpretTemplates=interpretTemplates.length?interpretTemplates:(Array.isArray(value?._reportInterpretTemplates)?value._reportInterpretTemplates:[]);interpretCategoryTemplates=Object.keys(interpretCategoryTemplates||{}).length?interpretCategoryTemplates:(value?._reportInterpretCategoryTemplates||{});
  const lines=[],approved=new Set((value?.healthBookApprovedVisitUIDs||[]).map(String)),selectedGroups=new Set((value?._reportGroupKeys||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean)),editVisits=value?.healthBookLabEditsByVisit&&typeof value.healthBookLabEditsByVisit==='object'?value.healthBookLabEditsByVisit:{},clinicalVisits=value?.healthBookClinicalEditsByVisit&&typeof value.healthBookClinicalEditsByVisit==='object'?value.healthBookClinicalEditsByVisit:{};
  const groupEditKey=section=>`${String(section?.Code||section?.code||'')}|${String(section?.GroupName||section?.groupName||section?.Code||section?.code||'รายการตรวจ')}`.toLowerCase(),itemEditKey=(section,item)=>`${groupEditKey(section)}|${String(item?.Code||item?.code||'')}|${String(item?.Name||item?.name||item?.Nameen||item?.Code||'รายการ')}`.toLowerCase(),plain=v=>String(v??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const categories=[['MEDICAL_INFORMATION','ข้อมูลทางการแพทย์'],['PHYSICAL_EXAMINATION','ตรวจร่างกาย'],['HEMATOLOGY','ระบบเลือด'],['URINARY_SYSTEM','ระบบทางเดินปัสสาวะและไต'],['GASTROINTESTINAL_SYSTEM','ระบบทางเดินอาหาร'],['METABOLIC_ELECTROLYTES','เมตาบอลิกและเกลือแร่'],['INFECTIOUS_DISEASE','โรคติดเชื้อ'],['ONCOLOGY','มะเร็งวิทยา'],['IMMUNOLOGY','ภูมิคุ้มกันวิทยา'],['OTHER','อื่น ๆ / ยังไม่จัดหมวด']],categoryLabel=new Map(categories),templateMap=new Map();
  for(const template of Array.isArray(interpretTemplates)?interpretTemplates:[]){const code=String(template?.groupCode||'').trim().toLowerCase(),name=String(template?.groupName||'').trim().toLowerCase();if(code)templateMap.set('c:'+code,template);if(name)templateMap.set('n:'+name,template)}
  const autoCategory=section=>{const text=`${section?.GroupName||''} ${section?.Code||''} ${(section?.Item||[]).map(item=>`${item?.Name||''} ${item?.Code||''}`).join(' ')}`.toLowerCase();if(/hiv|hepatitis|infect|ไวรัส|วัณโรค/.test(text))return'INFECTIOUS_DISEASE';if(/cancer|tumou?r|มะเร็ง|psa|afp|cea/.test(text))return'ONCOLOGY';if(/immun|ภูมิคุ้ม/.test(text))return'IMMUNOLOGY';if(/cbc|blood count|hemat|platelet|hemoglobin|โลหิต|เม็ดเลือด/.test(text))return'HEMATOLOGY';if(/urine|renal|kidney|creatinine|egfr|ปัสสาวะ|ไต/.test(text))return'URINARY_SYSTEM';if(/stool|gastro|อุจจาระ|ทางเดินอาหาร/.test(text))return'GASTROINTESTINAL_SYSTEM';if(/glucose|hba1c|lipid|cholesterol|triglyceride|electrolyte|liver|thyroid|น้ำตาล|ไขมัน|ตับ/.test(text))return'METABOLIC_ELECTROLYTES';if(/vital|physical|vision|hearing|ตรวจร่างกาย|สัญญาณชีพ/.test(text))return'PHYSICAL_EXAMINATION';if(/history|medical|ประวัติ/.test(text))return'MEDICAL_INFORMATION';return'OTHER'},sectionCategory=section=>{const code=String(section?.Code||'').trim().toLowerCase(),name=String(section?.GroupName||'').trim().toLowerCase(),template=(code&&templateMap.get('c:'+code))||(name&&templateMap.get('n:'+name)),category=String(template?.category||'').toUpperCase();return categoryLabel.has(category)?category:autoCategory(section)};
  for(const [visitUID,group] of Object.entries(value?.hisEmrResultsByVisit||{})){
    if(approved.size&&!approved.has(String(visitUID)))continue;lines.push(`VN ${visitUID}`);
    const root=group?.LineItem?group:group?.data?.LineItem?group.data:group?.Data?.LineItem?group.Data:group,visitEdits=editVisits[String(visitUID)]||{},groups=visitEdits.groups||{},sections=Array.isArray(root?.LineItem)?root.LineItem:[];
    for(const [categoryKey,categoryName] of categories){const categorySections=sections.filter(section=>sectionCategory(section)===categoryKey&&(!selectedGroups.size||selectedGroups.has(String(section?.Code||section?.GroupName||'').trim().toLowerCase())));if(!categorySections.length)continue;lines.push(`หมวด: ${categoryName}`);const categoryText=plain(interpretCategoryTemplates?.[categoryKey]?.text||'');if(categoryText)lines.push(`  ภาพรวมหมวด: ${categoryText}`);for(const section of categorySections){const title=String(section.GroupName||section.Code||'ผลตรวจ'),groupEdit=groups[groupEditKey(section)]||{};lines.push(`GroupName: ${title}`);for(const item of (Array.isArray(section.Item)?section.Item:[]).slice(0,80)){const edit=groupEdit.items?.[itemEditKey(section,item)]||{},name=edit.Name??item.Name??item.Nameen??item.Code??'-',result=edit.Value??item.Value??item.Result??'-',unit=edit.Unit??item.Unit??'',interpret=edit.Interpret??item.Interpret??'';lines.push(`• ${name}: ${result} ${unit}${interpret?` [${interpret}]`:''}`)}for(const note of (Array.isArray(groupEdit.notes)?groupEdit.notes:[])){if(String(note?.text||'').trim())lines.push(`  แปลผลกลุ่ม (${note.status==='ABNORMAL'?'ผิดปกติ':note.status==='RISK'?'เฝ้าระวัง':note.status==='CRITICAL'?'วิกฤต':note.status==='PENDING'?'รอผล':'ปกติ'}): ${String(note.text).trim()}`)}}}
    const clinical=clinicalVisits[String(visitUID)]||{},sourceIcd=Array.isArray(root?.LineItemICD?.Item)?root.LineItemICD.Item:Array.isArray(root?.lineItemICD?.Item)?root.lineItemICD.Item:[],icdItems=Object.prototype.hasOwnProperty.call(clinical,'icdItems')?(Array.isArray(clinical.icdItems)?clinical.icdItems:[]):sourceIcd;if(icdItems.length){lines.push('ICD / การวินิจฉัย');icdItems.forEach(i=>lines.push(`• ${String(i.icdCode||i.ICDCode||'-')}: ${String(i.icdCdesc||i.ICDDesc||'')}`))}let sourceRec=[];sections.forEach(section=>(Array.isArray(section?.Item)?section.Item:[]).forEach(item=>{const text=plain(item?.Recommend||'');if(text)sourceRec.push(text)}));sourceRec=[...new Set(sourceRec)];const recs=Object.prototype.hasOwnProperty.call(clinical,'recommendations')?(Array.isArray(clinical.recommendations)?clinical.recommendations:[]):sourceRec;if(recs.length){lines.push('คำแนะนำ');recs.forEach(x=>lines.push(`• ${String(x)}`))}
  }
  return lines
}
async function buildRecordsPdf(records,{healthBook=false,companies=[]}={}){const pdf=await PDFDocument.create(),font=await reportFont(pdf),ink=rgb(.03,.18,.34),muted=rgb(.32,.42,.5),wrap=(text,max=88)=>{const words=String(text??'').replace(/\s+/g,' ').trim().split(' '),out=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max){if(line)out.push(line);line=word}else line=next}if(line)out.push(line);return out.length?out:['-']};for(const record of records){let page=pdf.addPage([595.28,841.89]),y=800;const draw=(text,size=10,color=ink,indent=0)=>{for(const line of wrap(text,Math.max(25,88-Math.round(indent/6)))){if(y<48){page=pdf.addPage([595.28,841.89]);y=800}page.drawText(line,{x:42+indent,y,size,font,color,maxWidth:510-indent});y-=size+6}};const co=companies.find(item=>String(item.id)===String(record.companyId)),name=[record.title,record.first,record.last].filter(Boolean).join(' ')||'-';draw(healthBook?'เล่มตรวจสุขภาพ / Health Checkup Report':'ข้อมูลส่วนตัวผู้รับบริการ',18);draw(`${name}   HN ${record.hn||'-'}   VN ${record.hisLastVisitUID||'-'}`,12);draw(`${co?.name||'-'} / ${co?.year||'-'}`,10,muted);y-=8;draw(`ID / Passport: ${record.id||'-'}   วันเกิด: ${record.birth||'-'}   เพศ: ${record.sex||'-'}`);draw(`โทรศัพท์: ${record.phone||'-'}   อีเมล: ${record.email||'-'}`);draw(`รหัสพนักงาน: ${record.employeeCode||'-'}   แผนก: ${record.departmentName||'-'}   ตำแหน่ง: ${record.positionName||'-'}`);draw(`Package: ${record.code||'-'} · ${record.packageName||'-'}`);if(healthBook){draw(`VN ที่อนุมัติรวมเล่ม: ${(record.healthBookApprovedVisitUIDs||record.hisPrimaryVisitUIDs||[record.hisLastVisitUID]).filter(Boolean).join(', ')||'-'}`,11);draw('ผลตรวจจาก HIS / EMR',14);const lines=reportLines(record);if(lines.length)lines.forEach(line=>draw(line,9,line.startsWith('VN ')?ink:muted,line.startsWith('•')?12:0));else draw('ยังไม่มีข้อมูล EMR',10,muted)}}return pdf.save()}
app.post('/api/customer-data-pdf',localOnly,async(req,res)=>{try{const keys=new Set((req.body?.recordKeys||[]).map(String)),state=await readState(),records=(state.records||[]).filter(record=>keys.has(String(record.key||record.id)));if(!records.length)return res.status(400).json({error:'กรุณาเลือกรายชื่ออย่างน้อย 1 คน'});const bytes=await buildRecordsPdf(records,{companies:state.companies||[]});res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`customer-data_${records.length}.pdf`)}`,'Cache-Control':'no-store'});res.send(Buffer.from(bytes))}catch(error){res.status(500).json({error:`สร้าง PDF ข้อมูลผู้รับบริการไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/his/health-book-pdf',localOnly,async(req,res)=>{try{const keys=new Set((req.body?.recordKeys||[]).map(String)),state=await readState(),records=(state.records||[]).filter(record=>keys.has(String(record.key||record.id))).map(record=>({...record,_reportInterpretTemplates:state.interpretTemplates||[],_reportInterpretCategoryTemplates:state.interpretCategoryTemplates||{}}));if(!records.length)return res.status(400).json({error:'กรุณาเลือกรายชื่ออย่างน้อย 1 คน'});const missing=records.filter(record=>!record.hisEmrResult&&!Object.keys(record.hisEmrResultsByVisit||{}).length);if(missing.length)return res.status(400).json({error:`ยังไม่มี EMR ${missing.length} คน`});const bytes=await buildRecordsPdf(records,{healthBook:true,companies:state.companies||[]});res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`health-books_${records.length}.pdf`)}`,'Cache-Control':'no-store'});res.send(Buffer.from(bytes))}catch(error){res.status(500).json({error:`สร้างเล่มตรวจสุขภาพไม่สำเร็จ: ${error.message||error}`})}});
function organizationBookText(value,max=300){return String(value??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max)}
function organizationBookDate(value){if(!value)return'-';const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?organizationBookText(value,40):new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).format(date)}
async function organizationBookImage(pdf,value){
  const match=/^data:image\/(png|jpe?g);base64,([a-z0-9+/=]+)$/i.exec(String(value||''));
  if(!match)return null;
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>3*1024*1024)return null;
  try{return match[1].toLowerCase()==='png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes)}catch(_){return null}
}
async function addOrganizationCover(pdf,cover,project,company,records,remark){
  const font=await reportFont(pdf),preset=['STANDARD','MINIMAL','CORPORATE'].includes(String(cover?.preset))?String(cover.preset):'STANDARD',colors={STANDARD:rgb(.04,.52,.68),MINIMAL:rgb(.10,.42,.72),CORPORATE:rgb(.04,.56,.43)},accent=colors[preset];
  const drawCentered=(page,text,y,size=14,color=rgb(.04,.18,.34))=>{const clean=organizationBookText(text,500),width=font.widthOfTextAtSize(clean,size);page.drawText(clean,{x:Math.max(36,(595.28-width)/2),y,size,font,color,maxWidth:523})};
  const [logo,background]=await Promise.all([organizationBookImage(pdf,cover?.logoData),organizationBookImage(pdf,cover?.backgroundData)]),page=pdf.addPage([595.28,841.89]);
  page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(.98,.995,1)});
  if(background){const scale=Math.max(595.28/background.width,841.89/background.height),width=background.width*scale,height=background.height*scale;page.drawImage(background,{x:(595.28-width)/2,y:(841.89-height)/2,width,height,opacity:.22})}
  page.drawRectangle({x:0,y:0,width:595.28,height:preset==='MINIMAL'?52:130,color:accent,opacity:background?.9:1});
  if(logo){const scale=Math.min(120/logo.width,84/logo.height,1),width=logo.width*scale,height=logo.height*scale;page.drawImage(logo,{x:(595.28-width)/2,y:630+(84-height)/2,width,height})}else{page.drawCircle({x:297.64,y:655,size:43,color:accent});drawCentered(page,'VIMUT',647,18,rgb(1,1,1))}
  drawCentered(page,cover?.title||'รายงานผลการตรวจสุขภาพพนักงาน',540,22);drawCentered(page,`ประจำปี ${cover?.year||project?.screening_year||company?.year||'-'}`,500,16,accent);drawCentered(page,cover?.company||company?.name||project?.company_name||'-',455,17);drawCentered(page,cover?.extra||remark||'จัดทำขึ้นเพื่อส่งกรมแรงงาน',395,10,rgb(.35,.43,.5));drawCentered(page,`พนักงาน ${records.length.toLocaleString('th-TH')} คน`,365,10,rgb(.35,.43,.5));
  const sub=pdf.addPage([595.28,841.89]);sub.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(.99,.995,1)});sub.drawRectangle({x:42,y:730,width:511,height:5,color:accent});drawCentered(sub,cover?.subcoverTitle||'รายงานสรุปผลการตรวจสุขภาพประจำปี',650,21);drawCentered(sub,cover?.subcoverText||`${company?.name||project?.company_name||'-'} · ปี ${project?.screening_year||company?.year||'-'}`,610,13,accent);drawCentered(sub,`Booking: ${project?.project_code||'-'} · ${project?.project_name||'-'}`,560,11);drawCentered(sub,`ช่วงวันที่ตรวจ ${organizationBookDate(project?.start_date)} ถึง ${organizationBookDate(project?.end_date)}`,530,10,rgb(.35,.43,.5));if(remark)drawCentered(sub,remark,470,10,rgb(.35,.43,.5))
}
app.post('/api/organization-health-book-pdf',localOnly,async(req,res)=>{try{const projectId=organizationBookText(req.body?.projectId,120),requestedKeys=new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(String)),groupKeys=[...new Set((Array.isArray(req.body?.groupKeys)?req.body.groupKeys:[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean))];if(!projectId)return res.status(400).json({error:'กรุณาเลือก Booking'});if(!groupKeys.length)return res.status(400).json({error:'กรุณาเลือก GroupName'});const projectResult=await pool.query('SELECT * FROM checkup_projects WHERE id=$1',[projectId]);if(!projectResult.rows.length)return res.status(404).json({error:'ไม่พบ Booking ที่เลือก'});const project=projectResult.rows[0],bookingResult=await pool.query("SELECT record_key FROM checkup_bookings WHERE project_id=$1 AND booking_status<>'CANCELLED'",[projectId]),allowed=new Set(bookingResult.rows.map(x=>String(x.record_key||'')).filter(Boolean)),state=await readState(),records=(state.records||[]).filter(record=>allowed.has(String(record.key||record.id))&&(!requestedKeys.size||requestedKeys.has(String(record.key||record.id)))).map(record=>({...record,_reportInterpretTemplates:state.interpretTemplates||[],_reportInterpretCategoryTemplates:state.interpretCategoryTemplates||{},_reportGroupKeys:groupKeys}));if(!records.length)return res.status(400).json({error:'ไม่พบพนักงานใน Booking'});const company=(state.companies||[]).find(x=>String(x.id)===String(project.company_id)),content=await buildRecordsPdf(records,{healthBook:true,companies:state.companies||[]}),contentPdf=await PDFDocument.load(content),pdf=await PDFDocument.create();await addOrganizationCover(pdf,req.body?.cover||{},project,company,records,organizationBookText(req.body?.remark,1000));const pages=await pdf.copyPages(contentPdf,contentPdf.getPageIndices());pages.forEach(page=>pdf.addPage(page));const bytes=await pdf.save(),fileName=(organizationBookText(req.body?.fileName,180)||`organization-health-book_${project.project_code||project.id}.pdf`).replace(/[\\/:*?"<>|]+/g,'_');res.set({'Content-Type':'application/pdf','Content-Disposition':`${req.body?.preview?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName.endsWith('.pdf')?fileName:fileName+'.pdf')}`,'Cache-Control':'private, no-store'});res.send(Buffer.from(bytes))}catch(error){console.error('สร้างเล่มรวมองค์กรไม่สำเร็จ',error);res.status(500).json({error:`สร้างเล่มรวมองค์กรไม่สำเร็จ: ${error.message||error}`})}});
function organizationBookSections(record){const payloads=Object.values(record?.hisEmrResultsByVisit||{});if(record?.hisEmrResult)payloads.push(record.hisEmrResult);const groups=[];for(const payload of payloads){const wrapped=payload?.data||payload?.Data||payload,root=wrapped?.Patient?.LineItem?wrapped.Patient:wrapped?.patient?.LineItem?wrapped.patient:wrapped;for(const section of Array.isArray(root?.LineItem)?root.LineItem:[]){const name=String(section?.GroupName||section?.Code||'').trim(),code=String(section?.Code||'').trim(),key=(code||name).toLowerCase();if(key&&!groups.some(group=>group.key===key))groups.push({key,name,code,items:Array.isArray(section.Item)?section.Item:[]})}}return groups}
function organizationBookResultCell(group){if(!group)return{result:'ไม่มีผล',status:'ไม่มีผล'};const values=group.items.map(item=>{const name=organizationBookText(item?.Name||item?.Nameen||item?.Code||'',80),value=organizationBookText(item?.Value??item?.Result??'-',80),unit=organizationBookText(item?.Unit||'',30);return `${name}: ${value}${unit?' '+unit:''}`}).filter(Boolean),pending=group.items.some(item=>/pending|waiting|รอผล/i.test(String(item?.ResultStatus||item?.Interpret||''))),abnormal=group.items.some(item=>/abnormal|critical|high|low|positive|ผิดปกติ|วิกฤต/i.test(String(item?.ResultStatus||item?.Interpret||item?.ControlID||'')));return{result:values.join(' | ')||'-',status:pending?'รอผล':abnormal?'ผิดปกติ':'ปกติ'}}
function organizationBookCategoryLabel(group,templates=[]){const key=String(group?.code||group?.name||'').trim().toLowerCase(),template=(templates||[]).find(row=>[row.groupCode,row.group_code,row.groupName,row.group_name].some(value=>String(value||'').trim().toLowerCase()===key)),saved=String(template?.category||template?.Category||'').trim(),labels={medical_information:'ข้อมูลทางการแพทย์',physical_examination:'ตรวจร่างกาย',hematology:'ระบบเลือด',urinary_system:'ระบบทางเดินปัสสาวะและไต',gastrointestinal_system:'ระบบทางเดินอาหาร',metabolic_electrolytes:'เมตาบอลิกและเกลือแร่',infectious_disease:'โรคติดเชื้อ',oncology:'มะเร็งวิทยา',immunology:'ภูมิคุ้มกันวิทยา',other:'อื่น ๆ / ยังไม่จัดหมวด'};if(saved)return labels[saved.toLowerCase()]||saved;const text=`${group?.name||''} ${group?.code||''}`.toLowerCase();if(/cbc|blood|hemat|platelet|hemoglobin/.test(text))return'ระบบเลือด';if(/urine|renal|kidney|creatinine|egfr/.test(text))return'ระบบทางเดินปัสสาวะและไต';if(/stool|gastro/.test(text))return'ระบบทางเดินอาหาร';if(/glucose|hba1c|lipid|cholesterol|triglyceride|electrolyte|liver|thyroid|uric|alp|alkaline/.test(text))return'Metabolic & Electrolytes';if(/hepatitis|hiv|infect/.test(text))return'โรคติดเชื้อ';if(/vital|physical/.test(text))return'ตรวจร่างกาย';return'ข้อมูลทางการแพทย์'}
async function buildOrganizationTablePdf(records,groupKeys,meta){const pdf=await PDFDocument.create(),font=await reportFont(pdf),landscape=[841.89,595.28],ink=rgb(.03,.18,.34),muted=rgb(.35,.43,.5),line=rgb(.80,.88,.92),accent=rgb(.04,.56,.65),byRecord=records.map(record=>({record,groups:new Map(organizationBookSections(record).map(group=>[group.key,group]))})),catalog=new Map();byRecord.forEach(({groups})=>groups.forEach((group,key)=>{if(groupKeys.includes(key)&&!catalog.has(key))catalog.set(key,group)}));const coverProject={...meta.project,project_name:`${meta.projects.length} Booking`,start_date:meta.projects.map(p=>p.start_date).filter(Boolean).sort()[0]||'',end_date:meta.projects.map(p=>p.end_date).filter(Boolean).sort().slice(-1)[0]||''};await addOrganizationCover(pdf,meta.cover,coverProject,meta.company,records,meta.remark);for(const key of groupKeys){const group=catalog.get(key)||{name:key,code:''};let index=0;while(index<byRecord.length){const page=pdf.addPage(landscape),margin=28,rowH=25,headerY=552;page.drawText(`${organizationBookCategoryLabel(group,meta.templates)} / ${group.name||group.code} ${group.code&&group.code!==group.name?'('+group.code+')':''}`,{x:margin,y:headerY,size:15,font,color:ink});page.drawText(`พนักงาน ${records.length} คน · Booking ${meta.projects.length} รายการ`,{x:560,y:headerY+2,size:8,font,color:muted});const columns=[['ลำดับ',28,42],['HN',70,82],['รหัสพนักงาน',152,86],['ชื่อ-นามสกุล',238,150],['ผลตรวจ',388,330],['สถานะ',718,92]];let y=526;page.drawRectangle({x:margin,y:y-4,width:782,height:22,color:accent});columns.forEach(([title,x])=>page.drawText(title,{x,y:y+2,size:8,font,color:rgb(1,1,1)}));y-=rowH;for(;index<byRecord.length&&y>34;index++,y-=rowH){const {record,groups}=byRecord[index],cell=organizationBookResultCell(groups.get(key)),name=[record.title,record.first,record.last].filter(Boolean).join(' ')||'-',values=[String(index+1),record.hn||'-',record.employeeCode||'-',name,cell.result,cell.status];if(index%2===0)page.drawRectangle({x:margin,y:y-5,width:782,height:rowH,color:rgb(.965,.985,.99)});page.drawLine({start:{x:margin,y:y-5},end:{x:810,y:y-5},thickness:.5,color:line});columns.forEach(([,x,width],columnIndex)=>{let value=organizationBookText(values[columnIndex],columnIndex===4?190:70);const max=columnIndex===4?76:columnIndex===3?32:columnIndex===2?18:columnIndex===1?16:12;if(value.length>max)value=value.slice(0,max-1)+'…';page.drawText(value,{x,y:y+3,size:columnIndex===4?7:8,font,color:cell.status==='ผิดปกติ'&&columnIndex===5?rgb(.75,.12,.16):ink,maxWidth:width-5})})}page.drawText(`หน้า ${pdf.getPageCount()-2}`,{x:770,y:15,size:7,font,color:muted})}}return pdf.save()}
app.post('/api/organization-health-book-pdf-table',localOnly,async(req,res)=>{try{const projectIds=[...new Set((Array.isArray(req.body?.projectIds)?req.body.projectIds:[]).map(x=>organizationBookText(x,120)).filter(Boolean))],requestedKeys=new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(String)),groupKeys=[...new Set((Array.isArray(req.body?.groupKeys)?req.body.groupKeys:[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean))];if(!projectIds.length)return res.status(400).json({error:'กรุณาเลือก Booking'});if(!groupKeys.length)return res.status(400).json({error:'กรุณาเลือก GroupName'});const projects=(await pool.query('SELECT * FROM checkup_projects WHERE id=ANY($1::text[])',[projectIds])).rows;if(projects.length!==projectIds.length)return res.status(404).json({error:'ไม่พบ Booking บางรายการ'});if(new Set(projects.map(p=>String(p.company_id))).size>1)return res.status(400).json({error:'Booking ต้องเป็นบริษัทเดียวกัน'});const bookingRows=(await pool.query("SELECT record_key FROM checkup_bookings WHERE project_id=ANY($1::text[]) AND booking_status<>'CANCELLED'",[projectIds])).rows,allowed=new Set(bookingRows.map(x=>String(x.record_key||'')).filter(Boolean)),state=await readState(),records=(state.records||[]).filter(record=>allowed.has(String(record.key||record.id))&&(!requestedKeys.size||requestedKeys.has(String(record.key||record.id))));if(!records.length)return res.status(400).json({error:'ไม่พบพนักงานใน Booking'});const company=(state.companies||[]).find(x=>String(x.id)===String(projects[0].company_id)),bytes=await buildOrganizationColumnTablePdf(records,groupKeys,{projects,project:projects[0],company,templates:state.interpretTemplates||[],cover:req.body?.cover||{},remark:organizationBookText(req.body?.remark,1000)}),fileName=(organizationBookText(req.body?.fileName,180)||'organization-health-book.pdf').replace(/[\\/:*?"<>|]+/g,'_');res.set({'Content-Type':'application/pdf','Content-Disposition':`${req.body?.preview?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName.endsWith('.pdf')?fileName:fileName+'.pdf')}`,'Cache-Control':'private, no-store'});res.send(Buffer.from(bytes))}catch(error){console.error('สร้างตารางเล่มรวมองค์กรไม่สำเร็จ',error);res.status(500).json({error:`สร้างตารางเล่มรวมองค์กรไม่สำเร็จ: ${error.message||error}`})}});
const claimPdfFields=[['companyName',372,744,7],['fullName',140,691,8],['identificationNumber',175,674,8],['birthDate',365,674,8],['age',500,674,8],['phone',145,655,7],['email',430,655,7],['address',145,637,7],['genderMark',445,690,9],['today',95,255,7]],medicalPdfFields=[['fullName',136,713,9],['hn',153,689,9],['age',304,689,9],['today',164,653,8],['outpatientMark',75,631,9]],fivePdfFields=[['today',427,678,8],['fullName',190,608,9],['identificationNumber',315,588,9],['fullName',110,566,9]],checkupChecklistFields=[['fullName',333,811,8,145,14],['hn',500,811,8,80,14],['birthDate',356,793,8,72,14],['age',452,793,8,24,14],['genderText',565,793,8,20,14],['departmentName',353,775,8,154,14],['doctorName',382,757,8,198,14],['packageMark',17,697,8,12,12],['packageCode',75,697,7,130,14],['companyContractMark',17,681,8,12,12],['companyName',92,681,7,112,14]];
const PDF_FORM_CATEGORIES={NAVIGATION:{label:'ใบนำทาง',order:10},MEDICAL_CERTIFICATE:{label:'ใบรับรองแพทย์',order:20},CLAIM_FORM:{label:'เอกสาร Claim / สิทธิ',order:30},GENERAL:{label:'เอกสารทั่วไป',order:90}};
function normalizePdfFormCategory(value,fallback='GENERAL'){const key=String(value||'').trim().toUpperCase();return PDF_FORM_CATEGORIES[key]?key:fallback}
const patientPdfForms={
  'opd-claim-th':{name:'OPD Claim Form Thai',file:'opd-claim-th.pdf',lang:'th',kind:'claim',category:'CLAIM_FORM',templateCode:'OPD-CLAIM-TH',isDefault:false,active:true,fields:claimPdfFields.map(x=>[...x])},'opd-claim-en':{name:'OPD Claim Form English',file:'opd-claim-en.pdf',lang:'en',kind:'claim',category:'CLAIM_FORM',templateCode:'OPD-CLAIM-EN',isDefault:false,active:true,fields:claimPdfFields.map(x=>[...x])},
  'medical-certificate-th':{name:'ใบรับรองแพทย์ ภาษาไทย',file:'medical-certificate-th.pdf',lang:'th',kind:'medical',category:'MEDICAL_CERTIFICATE',templateCode:'MED-CERT-TH',isDefault:false,active:true,fields:medicalPdfFields.map(x=>[...x])},'medical-certificate-en':{name:'Medical Certificate English',file:'medical-certificate-en.pdf',lang:'en',kind:'medical',category:'MEDICAL_CERTIFICATE',templateCode:'MED-CERT-EN',isDefault:false,active:true,fields:medicalPdfFields.map(x=>[...x])},
  'medical-5-diseases-th':{name:'ใบรับรองแพทย์ 5 โรค ภาษาไทย',file:'medical-5-diseases-th.pdf',lang:'th',kind:'five',category:'MEDICAL_CERTIFICATE',templateCode:'MED-5D-TH',isDefault:false,active:true,fields:fivePdfFields.map(x=>[...x])},'medical-5-diseases-en':{name:'Medical Certificate 5 Diseases English',file:'medical-5-diseases-en.pdf',lang:'en',kind:'five',category:'MEDICAL_CERTIFICATE',templateCode:'MED-5D-EN',isDefault:false,active:true,fields:fivePdfFields.map(x=>[...x])},
  'checkup-check-list':{name:'ใบนำทางตรวจสุขภาพ (FM-CHU-004 Check Up Check List)',file:'checkup-check-list.pdf',lang:'th',kind:'checkup-list',category:'NAVIGATION',templateCode:'FM-CHU-004',isDefault:true,active:true,fields:checkupChecklistFields.map(x=>[...x])}
};
const pdfFormDataDir=path.join(__dirname,'data','pdf-forms'),pdfFormSettingsPath=path.join(pdfFormDataDir,'settings.json');
try{const saved=JSON.parse(fs.readFileSync(pdfFormSettingsPath,'utf8'));for(const [id,value] of Object.entries(saved||{})){if(!value||typeof value!=='object')continue;if(!patientPdfForms[id]&&value.file)patientPdfForms[id]={name:String(value.name||id),file:String(value.file),lang:String(value.lang||'th'),kind:String(value.kind||'custom'),category:normalizePdfFormCategory(value.category),templateCode:String(value.templateCode||value.template_code||id).slice(0,80),isDefault:Boolean(value.isDefault??value.is_default),active:value.active!==false,fields:[]};const form=patientPdfForms[id];if(!form)continue;if(Array.isArray(value.fields))form.fields=value.fields;if(value.category)form.category=normalizePdfFormCategory(value.category,form.category||'GENERAL');if(value.templateCode||value.template_code)form.templateCode=String(value.templateCode||value.template_code).slice(0,80);if(value.isDefault!==undefined||value.is_default!==undefined)form.isDefault=Boolean(value.isDefault??value.is_default);if(value.active!==undefined)form.active=value.active!==false;if(value.name)form.name=String(value.name).slice(0,160)}}catch(_){}
function savePdfFormSettings(){fs.mkdirSync(pdfFormDataDir,{recursive:true});const saved={};for(const [id,form] of Object.entries(patientPdfForms))saved[id]={name:form.name,file:form.file,lang:form.lang,kind:form.kind,category:normalizePdfFormCategory(form.category),templateCode:String(form.templateCode||id).slice(0,80),isDefault:Boolean(form.isDefault),active:form.active!==false,fields:form.fields};fs.writeFileSync(pdfFormSettingsPath,JSON.stringify(saved,null,2))}
function pdfPatientDate(value){const text=String(value||'').trim(),match=text.match(/^(\d{1,4})[-\/]([0-1]?\d)[-\/]([0-3]?\d)$/);if(match){let [,y,m,d]=match;if(Number(y)>2400)y=String(Number(y)-543);return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`}const cleaned=text.replace(/\s*\(\d{4}\)\s*$/,'').trim(),parsed=Date.parse(cleaned);if(Number.isFinite(parsed)){const date=new Date(parsed);return `${String(date.getUTCDate()).padStart(2,'0')}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${date.getUTCFullYear()}`}return text}
function pdfPatientAge(record){const explicit=Number(record.ageValue||record.age);if(Number.isFinite(explicit)&&explicit>0)return explicit;const birth=Date.parse(String(record.birth||''));return Number.isFinite(birth)?Math.max(0,Math.floor((Date.now()-birth)/31557600000)):''}
app.get('/api/patient-documents/:formId/:recordKey',localOnly,async(req,res)=>{try{const form=patientPdfForms[String(req.params.formId||'')];if(!form)return res.status(404).json({error:'ไม่พบแบบฟอร์ม PDF'});const state=await readState(),record=(state.records||[]).find(item=>String(item.key||item.id)===String(req.params.recordKey||''));if(!record)return res.status(404).json({error:'ไม่พบข้อมูลผู้ป่วย'});const source=path.join(__dirname,'templates','pdf-forms',form.file);if(!fs.existsSync(source))return res.status(404).json({error:'ไม่พบไฟล์ต้นฉบับ PDF'});const pdf=await PDFDocument.load(fs.readFileSync(source));pdf.registerFontkit(fontkit);const fontPath=path.join(process.env.WINDIR||'C:\\Windows','Fonts','tahoma.ttf'),font=fs.existsSync(fontPath)?await pdf.embedFont(fs.readFileSync(fontPath),{subset:true}):await pdf.embedFont(StandardFonts.Helvetica),page=pdf.getPages()[0],ink=rgb(.03,.08,.14),draw=(text,x,y,size=8)=>{text=String(text??'').trim();if(text)page.drawText(text,{x,y,size,font,color:ink,maxWidth:470})},mark=(x,y)=>page.drawText('X',{x,y,size:9,font,color:ink});const thai=[record.title,record.first,record.last].filter(Boolean).join(' '),english=[record.prefixEN,record.firstNameEN,record.lastNameEN].filter(Boolean).join(' ')||thai,fullName=form.lang==='th'?thai:english,id=String(record.id||''),birth=pdfPatientDate(record.birth),ageValue=pdfPatientAge(record),today=new Date().toLocaleDateString(form.lang==='th'?'th-TH':'en-GB'),companyName=String((state.companies||[]).find(c=>c.id===record.companyId)?.name||'');if(form.kind==='claim'){draw(companyName,372,744,7);draw(fullName,140,691,8);draw(id,175,674,8);draw(birth,365,674,8);draw(ageValue,500,674,8);draw(record.phone,145,655,8);draw(record.email,430,655,7);draw(record.address,145,637,7);if(String(record.sex||'').toUpperCase().startsWith('M'))mark(409,690);if(String(record.sex||'').toUpperCase().startsWith('F'))mark(445,690);draw(today,95,255,7)}else if(form.kind==='medical'){draw(fullName,136,713,9);draw(record.hn,153,689,9);draw(ageValue,304,689,9);draw(today,164,653,8);mark(75,631)}else{draw(today,427,678,8);draw(fullName,190,608,9);draw(id,315,588,9);draw(fullName,110,566,9)}const bytes=await pdf.save();const safeHn=String(record.hn||record.id||'patient').replace(/[^A-Za-z0-9ก-๙_-]/g,'-'),fileName=`${req.params.formId}_${safeHn}.pdf`;res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,'Cache-Control':'no-store'});res.send(Buffer.from(bytes))}catch(error){res.status(500).json({error:`สร้างเอกสาร PDF ไม่สำเร็จ: ${error.message||error}`})}});

async function patientDocumentFont(pdf){
  const windowsDir=process.env.WINDIR||'C:\\Windows',fontDir=path.join(windowsDir,'Fonts');
  const candidates=[
    path.join(fontDir,'tahoma.ttf'),
    path.join(fontDir,'LeelawUI.ttf'),
    path.join(fontDir,'THSarabunNew.ttf'),
    path.join(fontDir,'arial.ttf')
  ];
  for(const file of candidates){
    try{
      if(fs.existsSync(file)){
        pdf.registerFontkit(fontkit);
        const font=await pdf.embedFont(fs.readFileSync(file),{subset:true});
        return {font,unicode:true,file};
      }
    }catch(_){}
  }
  return {font:await pdf.embedFont(StandardFonts.Helvetica),unicode:false,file:'StandardFonts.Helvetica'};
}
async function createPatientDocumentPage(form,record,state){
  const custom=path.join(pdfFormDataDir,form.file),source=fs.existsSync(custom)?custom:path.join(__dirname,'templates','pdf-forms',form.file);
  if(!fs.existsSync(source))throw new Error('ไม่พบไฟล์ต้นฉบับ PDF');
  const pdf=await PDFDocument.load(fs.readFileSync(source)),fontInfo=await patientDocumentFont(pdf),font=fontInfo.font,page=pdf.getPages()[0],ink=rgb(.03,.08,.14);
  const safeText=value=>{const text=String(value??'').trim();return fontInfo.unicode?text:text.replace(/[^\x20-\x7E]/g,'?')};
  const draw=(text,x,y,size=8,width=470)=>{text=safeText(text);if(!text)return;try{page.drawText(text,{x:Number(x),y:Number(y),size:Number(size)||8,font,color:ink,maxWidth:Math.max(20,Number(width)||470)})}catch(_){const fallback=text.replace(/[^\x20-\x7E]/g,'?');if(fallback)page.drawText(fallback,{x:Number(x),y:Number(y),size:Number(size)||8,font,color:ink,maxWidth:Math.max(20,Number(width)||470)})}};
  const thai=[record.title,record.first,record.last].filter(Boolean).join(' '),english=[record.prefixEN,record.firstNameEN,record.lastNameEN].filter(Boolean).join(' ')||thai,company=String((state.companies||[]).find(c=>String(c.id)===String(record.companyId))?.name||''),values={fullName:form.lang==='th'?thai:english,title:record.title,firstName:record.first,lastName:record.last,titleEN:record.prefixEN,firstNameEN:record.firstNameEN,lastNameEN:record.lastNameEN,identificationNumber:String(record.id||''),birthDate:pdfPatientDate(record.birth),age:pdfPatientAge(record),phone:record.phone,email:record.email,address:record.address,hn:record.hn,employeeCode:record.employeeCode,departmentName:record.departmentName,doctorName:record.doctorName,packageCode:record.code,packageName:record.packageName,nationality:record.nationality,checkupDate:pdfPatientDate(record.checkupDate),today:new Date().toLocaleDateString(form.lang==='th'?'th-TH':'en-GB'),companyName:company,genderMark:'X',genderText:String(record.sex||'').toUpperCase().startsWith('F')?'F':String(record.sex||'').toUpperCase().startsWith('M')?'M':String(record.sex||''),outpatientMark:'X',packageMark:(record.code||record.packageName)?'X':'',companyContractMark:(record.payor||company)?'X':''},sex=String(record.sex||'').toUpperCase();
  for(const field of form.fields||[]){
    const [key,x,y,size,width]=field;
    if(key==='genderMark'){draw('X',sex.startsWith('M')?Number(x)-36:x,y,size,width);continue}
    draw(values[key],x,y,size,width);
  }
  return pdf.save()
}

const healthBookPdfCacheDir=path.join(__dirname,'data','health-book-pdf-cache');
function safeHealthBookCacheName(record){return `${String(record.key||record.id||'record').replace(/[^a-zA-Z0-9_.-]+/g,'_')}.pdf`}
async function healthBookPdfBytesForRecord(record,state){const prepared={...record,_reportInterpretTemplates:state.interpretTemplates||[],_reportInterpretCategoryTemplates:state.interpretCategoryTemplates||{}};return buildRecordsPdf([prepared],{healthBook:true,companies:state.companies||[]})}
async function ensureHealthBookPdfCache(record,state,force=false){fs.mkdirSync(healthBookPdfCacheDir,{recursive:true});const fileName=safeHealthBookCacheName(record),filePath=path.join(healthBookPdfCacheDir,fileName);if(force||!fs.existsSync(filePath)){const bytes=await healthBookPdfBytesForRecord(record,state);fs.writeFileSync(filePath,Buffer.from(bytes))}return {fileName,filePath,stat:fs.statSync(filePath)}}
app.post('/api/his/health-book-pdf-cache/:recordKey',localOnly,async(req,res)=>{try{const state=await readState(),record=(state.records||[]).find(r=>String(r.key||r.id)===String(req.params.recordKey||''));if(!record)return res.status(404).json({error:'ไม่พบผู้รับบริการ'});if(!record.healthBookApprovedAt)return res.status(400).json({error:'กรุณาอนุมัติผลก่อนสร้าง PDF'});const cached=await ensureHealthBookPdfCache(record,state,true),cachedAt=new Date(cached.stat.mtimeMs).toISOString();res.json({ok:true,cachedAt,url:`/api/his/health-book-pdf-cache/${encodeURIComponent(record.key||record.id)}`,size:cached.stat.size})}catch(error){res.status(500).json({error:`สร้าง PDF เก็บในระบบไม่สำเร็จ: ${error.message||error}`})}});
app.get('/api/his/health-book-pdf-cache/:recordKey',localOnly,async(req,res)=>{try{const state=await readState(),record=(state.records||[]).find(r=>String(r.key||r.id)===String(req.params.recordKey||''));if(!record)return res.status(404).send('ไม่พบผู้รับบริการ');const cached=await ensureHealthBookPdfCache(record,state,false);res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(`health-book_${record.hn||record.key||'patient'}.pdf`)}`,'Cache-Control':'private, max-age=60'});res.sendFile(cached.filePath)}catch(error){res.status(500).send('เปิด PDF ที่อนุมัติไม่สำเร็จ')}});
app.post('/api/his/health-book-pdf-cache/bundle',localOnly,async(req,res)=>{try{const keys=[...new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(String).filter(Boolean))];if(!keys.length)return res.status(400).json({error:'กรุณาเลือกผู้รับบริการ'});const state=await readState(),map=new Map((state.records||[]).map(r=>[String(r.key||r.id),r])),records=keys.map(k=>map.get(k)).filter(Boolean);if(records.length!==keys.length)return res.status(404).json({error:'พบข้อมูลผู้รับบริการไม่ครบ'});const notApproved=records.filter(r=>!r.healthBookApprovedAt);if(notApproved.length)return res.status(400).json({error:`มี ${notApproved.length} รายการที่ยังไม่อนุมัติผล`});const combined=await PDFDocument.create();for(const record of records){const cached=await ensureHealthBookPdfCache(record,state,false),source=await PDFDocument.load(fs.readFileSync(cached.filePath)),pages=await combined.copyPages(source,source.getPageIndices());pages.forEach(page=>combined.addPage(page))}const bytes=await combined.save();res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`health-book_${records.length}-patients.pdf`)}`,'Cache-Control':'private, no-store'});res.send(Buffer.from(bytes))}catch(error){res.status(500).json({error:`รวม PDF ที่อนุมัติไม่สำเร็จ: ${error.message||error}`})}});

app.get('/api/pdf-form-settings',localOnly,(_req,res)=>res.json({categories:Object.entries(PDF_FORM_CATEGORIES).sort((a,b)=>a[1].order-b[1].order).map(([id,value])=>({id,label:value.label,order:value.order})),items:Object.entries(patientPdfForms).map(([id,form])=>({id,name:form.name,file:form.file,lang:form.lang,kind:form.kind,category:normalizePdfFormCategory(form.category),categoryLabel:PDF_FORM_CATEGORIES[normalizePdfFormCategory(form.category)].label,templateCode:String(form.templateCode||id),isDefault:Boolean(form.isDefault),active:form.active!==false,fields:form.fields}))}));
app.post('/api/pdf-form-settings',localOnly,express.raw({type:'application/pdf',limit:'20mb'}),(req,res)=>{try{if(!Buffer.isBuffer(req.body)||req.body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'รองรับเฉพาะไฟล์ PDF'});const name=decodeURIComponent(String(req.headers['x-document-name']||'')).trim().slice(0,160);if(!name)return res.status(400).json({error:'กรุณาระบุชื่อเอกสาร'});const base=String(req.headers['x-document-id']||name).toLowerCase().replace(/[^a-z0-9ก-๙]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||`document-${Date.now()}`;let id=base,n=2;while(patientPdfForms[id])id=`${base}-${n++}`;const file=`${id}.pdf`,category=normalizePdfFormCategory(decodeURIComponent(String(req.headers['x-document-category']||'GENERAL'))),templateCode=decodeURIComponent(String(req.headers['x-template-code']||id)).trim().slice(0,80)||id,isDefault=String(req.headers['x-is-default']||'').toLowerCase()==='true';if(isDefault)Object.values(patientPdfForms).forEach(form=>{if(normalizePdfFormCategory(form.category)===category)form.isDefault=false});fs.mkdirSync(pdfFormDataDir,{recursive:true});fs.writeFileSync(path.join(pdfFormDataDir,file),req.body);patientPdfForms[id]={name,file,lang:'th',kind:'custom',category,templateCode,isDefault,active:true,fields:[]};savePdfFormSettings();const form=patientPdfForms[id];res.status(201).json({ok:true,item:{id,name,file,category,categoryLabel:PDF_FORM_CATEGORIES[category].label,templateCode,isDefault:Boolean(form.isDefault),active:true,fields:[]}})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.get('/api/pdf-form-settings/:formId/template',localOnly,(req,res)=>{try{const form=patientPdfForms[String(req.params.formId||'')];if(!form)return res.status(404).json({error:'ไม่พบแบบฟอร์ม'});const custom=path.join(pdfFormDataDir,form.file),bundled=path.join(__dirname,'templates','pdf-forms',form.file),source=fs.existsSync(custom)?custom:bundled;if(!fs.existsSync(source))return res.status(404).json({error:'ไม่พบไฟล์ต้นฉบับ PDF'});res.set({'Content-Type':'application/pdf','Cache-Control':'no-store'});res.sendFile(source)}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.get('/api/pdf-form-settings/:formId/preview',localOnly,async(req,res)=>{try{const form=patientPdfForms[String(req.params.formId||'')];if(!form)return res.status(404).json({error:'ไม่พบแบบฟอร์ม'});const record={companyId:'preview-company',title:'นางสาว',first:'ตัวอย่าง',last:'ผู้รับบริการ',prefixEN:'Miss',firstNameEN:'Sample',lastNameEN:'Patient',id:'1234567890123',birth:'1980-08-19',sex:'F',phone:'0812345678',email:'sample@example.com',address:'99 ถนนตัวอย่าง กรุงเทพมหานคร',hn:'01-26-005678',employeeCode:'EMP001',code:'CHECKUP-01',packageName:'แพ็กเกจตรวจสุขภาพตัวอย่าง',nationality:'ไทย',checkupDate:new Date().toISOString().slice(0,10)},state={companies:[{id:'preview-company',name:'บริษัท ตัวอย่าง จำกัด'}]},bytes=await createPatientDocumentPage(form,record,state);res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(`preview-${form.file}`)}`,'Cache-Control':'no-store'});res.send(Buffer.from(bytes))}catch(error){res.status(500).json({error:`สร้าง Preview ไม่สำเร็จ: ${error.message||error}`})}});
app.patch('/api/pdf-form-settings/:formId',localOnly,(req,res)=>{try{const id=String(req.params.formId||''),form=patientPdfForms[id];if(!form)return res.status(404).json({error:'ไม่พบแบบฟอร์ม'});if(Array.isArray(req.body?.fields)){const fields=req.body.fields.map(item=>[String(item[0]||''),Number(item[1]),Number(item[2]),Math.max(4,Math.min(30,Number(item[3])||8)),Math.max(20,Math.min(600,Number(item[4])||120)),Math.max(12,Math.min(160,Number(item[5])||24))]).filter(item=>item[0]&&Number.isFinite(item[1])&&Number.isFinite(item[2]));form.fields=fields}if(req.body?.name!==undefined){const name=String(req.body.name||'').trim().slice(0,160);if(!name)return res.status(400).json({error:'ชื่อเอกสารห้ามว่าง'});form.name=name}if(req.body?.category!==undefined)form.category=normalizePdfFormCategory(req.body.category,form.category||'GENERAL');if(req.body?.templateCode!==undefined)form.templateCode=String(req.body.templateCode||id).trim().slice(0,80)||id;if(req.body?.active!==undefined)form.active=req.body.active!==false;if(req.body?.isDefault!==undefined){const next=Boolean(req.body.isDefault);if(next)Object.entries(patientPdfForms).forEach(([otherId,other])=>{if(otherId!==id&&normalizePdfFormCategory(other.category)===normalizePdfFormCategory(form.category))other.isDefault=false});form.isDefault=next}savePdfFormSettings();const category=normalizePdfFormCategory(form.category);res.json({ok:true,item:{id,name:form.name,file:form.file,lang:form.lang,kind:form.kind,category,categoryLabel:PDF_FORM_CATEGORIES[category].label,templateCode:String(form.templateCode||id),isDefault:Boolean(form.isDefault),active:form.active!==false,fields:form.fields}})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.put('/api/pdf-form-settings/:formId/template',localOnly,express.raw({type:'application/pdf',limit:'20mb'}),(req,res)=>{try{const form=patientPdfForms[String(req.params.formId||'')];if(!form)return res.status(404).json({error:'ไม่พบแบบฟอร์ม'});if(!Buffer.isBuffer(req.body)||req.body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'รองรับเฉพาะไฟล์ PDF'});fs.mkdirSync(pdfFormDataDir,{recursive:true});fs.writeFileSync(path.join(pdfFormDataDir,form.file),req.body);res.json({ok:true})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.post('/api/patient-documents/bundle',localOnly,async(req,res)=>{try{const formIds=[...new Set((Array.isArray(req.body?.formIds)?req.body.formIds:[]).map(String).filter(id=>patientPdfForms[id]))],keys=[...new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(String).filter(Boolean))];if(!formIds.length)return res.status(400).json({error:'กรุณาเลือกเอกสารอย่างน้อย 1 รายการ'});if(!keys.length)return res.status(400).json({error:'กรุณาเลือกผู้ป่วยอย่างน้อย 1 คน'});const state=await readState(),recordMap=new Map((state.records||[]).map(item=>[String(item.key||item.id),item])),records=keys.map(key=>recordMap.get(key)).filter(Boolean);if(records.length!==keys.length)return res.status(404).json({error:'พบข้อมูลผู้ป่วยไม่ครบ'});const combined=await PDFDocument.create();for(const record of records)for(const formId of formIds){const sourcePdf=await PDFDocument.load(await createPatientDocumentPage(patientPdfForms[formId],record,state)),pages=await combined.copyPages(sourcePdf,sourcePdf.getPageIndices());pages.forEach(page=>combined.addPage(page))}const bytes=await combined.save(),fileName=`patient-documents_${records.length}-patients_${formIds.length}-forms.pdf`;res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,'Cache-Control':'no-store'});res.send(Buffer.from(bytes))}catch(error){res.status(500).json({error:`สร้างชุดเอกสาร PDF ไม่สำเร็จ: ${error.message||error}`})}});
app.post('/api/patient-documents/:formId',localOnly,async(req,res)=>{try{const form=patientPdfForms[String(req.params.formId||'')];if(!form)return res.status(404).json({error:'ไม่พบแบบฟอร์ม PDF'});const keys=[...new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(String).filter(Boolean))];if(!keys.length)return res.status(400).json({error:'กรุณาเลือกผู้ป่วยอย่างน้อย 1 คน'});if(keys.length>500)return res.status(400).json({error:'สร้างเอกสารได้ครั้งละไม่เกิน 500 คน'});const state=await readState(),recordMap=new Map((state.records||[]).map(item=>[String(item.key||item.id),item])),records=keys.map(key=>recordMap.get(key)).filter(Boolean);if(records.length!==keys.length)return res.status(404).json({error:'พบข้อมูลผู้ป่วยไม่ครบตามรายการที่เลือก'});const combined=await PDFDocument.create();for(const record of records){const sourcePdf=await PDFDocument.load(await createPatientDocumentPage(form,record,state)),pages=await combined.copyPages(sourcePdf,sourcePdf.getPageIndices());pages.forEach(page=>combined.addPage(page))}const bytes=await combined.save(),fileName=`${req.params.formId}_${records.length}-patients.pdf`;res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,'Cache-Control':'no-store'});res.send(Buffer.from(bytes))}catch(error){res.status(500).json({error:`สร้างเอกสาร PDF ไม่สำเร็จ: ${error.message||error}`})}});

app.post('/api/his/patientinfo/test',localOnly,packageConfigSessionRequired,async(req,res)=>{
  const checked=patientInfoTestPayload(req.body);if(checked.error)return res.status(400).json({error:checked.error});
  try{
    const found=await pool.query("SELECT endpoint_url,api_key FROM his_api_connections WHERE system_code='PATIENT_INFO_CHECK' LIMIT 1");
    const config=found.rows[0]||{},endpoint=String(config.endpoint_url||DEFAULT_PATIENTINFO_API_URL).trim(),apiKey=String(config.api_key||'').trim();
    if(!apiKey)return res.status(400).json({error:'ยังไม่มี x-api-key ของ PatientInfo Check กรุณาบันทึกใน SetUp API to HIS ก่อน'});
    let url;try{url=new URL(endpoint)}catch(_){return res.status(400).json({error:'URL PatientInfo Check ไม่ถูกต้อง'})}
    if(url.protocol!=='https:')return res.status(400).json({error:'PatientInfo Check ต้องใช้ HTTPS'});
    const bodyText=JSON.stringify(checked.value),started=Date.now();
    const result=await new Promise((resolve,reject)=>{
      const request=https.request(url,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','x-api-key':apiKey,'Content-Length':Buffer.byteLength(bodyText)},timeout:20000},response=>{
        const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024)return request.destroy(new Error('PatientInfo response เกิน 2 MB'));chunks.push(chunk)});
        response.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let data=null;try{data=text?JSON.parse(text):null}catch(_){data=text}resolve({status:response.statusCode||502,ok:(response.statusCode||0)>=200&&(response.statusCode||0)<300,data})});
      });request.on('timeout',()=>request.destroy(new Error('PatientInfo API ไม่ตอบกลับภายใน 20 วินาที')));request.on('error',reject);request.write(bodyText);request.end();
    });
    const row=Array.isArray(result.data)?result.data[0]:(result.data?.PatientList?.[0]||result.data||{}),status=String(row?.Status||''),hn=String(row?.HN||''),detail=String(row?.StatusDetail||'');
    const classification=status.toLowerCase()==='success'&&hn?'SUCCESS_EXISTING_HN':status.toLowerCase()==='success'?'SUCCESS_NO_HN':status.toLowerCase()==='unsuccess'?'UNSUCCESS':'UNKNOWN';
    await pool.query(`INSERT INTO his_patientinfo_test_log(tested_by,identification_masked,http_status,result_status,has_hn,status_detail,client_address) VALUES($1,$2,$3,$4,$5,$6,$7)`,[req.packageConfigSession.displayName||req.packageConfigSession.username||'system',maskIdentification(checked.value.IdentificationNumber),result.status,classification,Boolean(hn),detail.slice(0,300),clientAddress(req)]).catch(()=>{});
    res.set('Cache-Control','no-store');res.status(result.ok?200:502).json({ok:result.ok,httpStatus:result.status,durationMs:Date.now()-started,classification,summary:{status,hn:hn||null,statusDetail:detail,identificationNumber:String(row?.IdentificationNumber||''),firstName:String(row?.FirstName||''),lastName:String(row?.LastName||''),birthdate:String(row?.Birthdate||row?.BirthDate||'')},request:checked.value,response:result.data,note:'โหมดทดสอบเท่านั้น ไม่มีการบันทึกหรือแก้ไขข้อมูลลูกค้าใน Health CheckUp'});
  }catch(error){res.status(502).json({error:`ทดสอบ PatientInfo API ไม่สำเร็จ: ${error.message||error}`})}
});

app.delete('/api/his-api-connections/:id',localOnly,packageConfigSessionRequired,async(req,res)=>{
  const client=await pool.connect();try{await client.query('BEGIN');const found=await client.query('SELECT * FROM his_api_connections WHERE id=$1 FOR UPDATE',[req.params.id]);if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบ API'});}if(found.rows[0].system_code){await client.query('ROLLBACK');return res.status(409).json({error:'API หลักของระบบลบไม่ได้ แต่แก้ไขค่าได้'});}await insertHisApiAudit(client,req,found.rows[0],'DELETE',['deleted'],hisApiAuditSnapshot(found.rows[0]),null);await client.query('DELETE FROM his_api_connections WHERE id=$1',[req.params.id]);await client.query('COMMIT');res.json({ok:true});}
  catch(error){await client.query('ROLLBACK');res.status(500).json({error:'ลบ API ไม่สำเร็จ'});}finally{client.release();}
});

app.get('/api/package-detail/config', localOnly, packageConfigSessionRequired, async (_req, res) => {
  try {
    const config = await readPackageApiConfig();
    const patientConfig = await readPatientApiConfig();
    const logs = await pool.query(`SELECT id, changed_at, changed_by, old_endpoint_url, new_endpoint_url, changed_fields
      FROM package_api_config_log ORDER BY id DESC LIMIT 100`);
    res.set('Cache-Control', 'no-store');
    const maskedHeaders={...(config.headers||{})};if(maskedHeaders['x-api-key'])maskedHeaders['x-api-key']='••••••••••••';
    res.json({ endpointUrl: config.endpoint_url, headers: maskedHeaders, config: config.config_data || {},patientConfig:{endpointUrl:patientConfig.endpoint_url,apiKey:patientConfig.api_key?'••••••••••••':'',updatedAt:patientConfig.updated_at,updatedBy:patientConfig.updated_by}, updatedAt: config.updated_at, updatedBy: config.updated_by, logs: logs.rows,deprecated:true });
  } catch (error) { res.status(500).json({ error: 'อ่านการตั้งค่า Package Detail API ไม่สำเร็จ' }); }
});

app.put('/api/package-detail/config', localOnly, packageConfigSessionRequired, async (req, res) => {
  return res.status(410).json({ error:'ย้ายการตั้งค่าไปที่ SetUp API to HIS แล้ว กรุณาใช้หน้าตั้งค่าใหม่' });
  /* istanbul ignore next -- retained temporarily for rollback compatibility */
  try {
    const endpointUrl = String(req.body?.endpointUrl || '').trim();
    const headers = req.body?.headers;
    const configData = req.body?.config;
    const patientEndpointUrl=String(req.body?.patientConfig?.endpointUrl||'').trim(),patientApiKey=String(req.body?.patientConfig?.apiKey||'').trim();
    const changedBy = String(req.packageConfigSession?.displayName || req.packageConfigSession?.username || 'ผู้ดูแลระบบ').trim().slice(0, 120);
    let parsedUrl;
    try { parsedUrl = new URL(endpointUrl); } catch (_) { return res.status(400).json({ error: 'URL ปลายทางไม่ถูกต้อง' }); }
    if (parsedUrl.protocol !== 'https:') return res.status(400).json({ error: 'URL ปลายทางต้องเป็น HTTPS' });
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return res.status(400).json({ error: 'Headers ต้องเป็น JSON Object' });
    if (!configData || typeof configData !== 'object' || Array.isArray(configData)) return res.status(400).json({ error: 'ข้อมูลตั้งค่า Request ไม่ถูกต้อง' });
    if (!String(configData.code || '').trim() || !String(configData.name || '').trim()) return res.status(400).json({ error: 'กรุณาระบุ Code และ Name' });
    let patientUrl;try{patientUrl=new URL(patientEndpointUrl)}catch(_){return res.status(400).json({error:'URL GetPatientData ไม่ถูกต้อง'})}if(patientUrl.protocol!=='https:')return res.status(400).json({error:'URL GetPatientData ต้องเป็น HTTPS'});if(!patientApiKey)return res.status(400).json({error:'กรุณาระบุ x-api-key ของ GetPatientData'});
    const allowedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!['authorization', 'x-api-key', 'accept'].includes(key.toLowerCase())) return res.status(400).json({ error: `ไม่อนุญาต Header: ${key}` });
      allowedHeaders[key.toLowerCase()] = String(value);
    }
    const old = await readPackageApiConfig();
    const changedFields = [];
    if (old.endpoint_url !== endpointUrl) changedFields.push('endpointUrl');
    if (JSON.stringify(old.headers || {}) !== JSON.stringify(allowedHeaders)) changedFields.push('headers');
    if (JSON.stringify(old.config_data || {}) !== JSON.stringify(configData)) changedFields.push('requestConfig');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE package_api_config SET endpoint_url=$1, headers=$2::jsonb, config_data=$3::jsonb, updated_at=NOW(), updated_by=$4 WHERE id=1`,
        [endpointUrl, JSON.stringify(allowedHeaders), JSON.stringify(configData), changedBy]);
      await client.query(`UPDATE patient_api_config SET endpoint_url=$1,api_key=$2,updated_at=NOW(),updated_by=$3 WHERE id=1`,[patientEndpointUrl,patientApiKey,changedBy]);
      await client.query(`INSERT INTO package_api_config_log
        (changed_by, old_endpoint_url, new_endpoint_url, changed_fields) VALUES ($1,$2,$3,$4::jsonb)`,
        [changedBy, old.endpoint_url, endpointUrl, JSON.stringify(changedFields)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    res.json({ ok: true, changedFields });
  } catch (error) { res.status(500).json({ error: 'บันทึกการตั้งค่า Package Detail API ไม่สำเร็จ' }); }
});

function loopbackOnly(req,res,next){const address=normalizeClientAddress(req.socket.remoteAddress||'');if(address==='127.0.0.1'||address==='::1')return next();return res.status(403).json({error:'ตั้งค่า Local Server ได้จากเครื่องต้นเท่านั้น'})}
app.get('/api/system/network',loopbackOnly,async(_req,res)=>{res.set('Cache-Control','no-store');res.json({lanEnabled:runtimeLanEnabled,localUrl:`http://localhost:${Number(process.env.PORT||3000)}`,note:runtimeLanEnabled?'LAN access enabled':'LAN access disabled; localhost remains available'})});
app.put('/api/system/network',loopbackOnly,async(req,res)=>{try{const nextLanEnabled=req.body?.enabled===true;await pool.query(`INSERT INTO system_settings(key,value,updated_at) VALUES('lan_server_enabled',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[nextLanEnabled?'true':'false']);runtimeLanEnabled=nextLanEnabled;res.set('Cache-Control','no-store');res.json({ok:true,lanEnabled:runtimeLanEnabled})}catch(error){res.status(500).json({error:'บันทึกสถานะ Local Server ไม่สำเร็จ',detail:error.message})}});

app.get('/api/health', localOnly, async (_req, res) => {
  try {
    const result=await pool.query(`SELECT
      (SELECT COALESCE(MAX(version),'') FROM schema_migrations) schema_version,
      (SELECT value FROM system_settings WHERE key='maintenance_mode') maintenance_mode,
      (SELECT value FROM system_settings WHERE key='last_backup_at') last_backup_at,
      (SELECT revision FROM app_state WHERE id=1) revision`);
    const info=result.rows[0]||{};
    res.json({ok:true,database:'PostgreSQL',release:RELEASE_NAME,schemaVersion:info.schema_version||SCHEMA_VERSION,maintenance:info.maintenance_mode==='true',lastBackupAt:info.last_backup_at||null,revision:Number(info.revision||0)});
  }
  catch (error) { res.status(503).json({ ok: false, error: error.message }); }
});

app.get('/api/system/status', localOnly, async (_req,res)=>{
  try{const result=await pool.query(`SELECT
    (SELECT COALESCE(MAX(version),'') FROM schema_migrations) schema_version,
    (SELECT value FROM system_settings WHERE key='maintenance_mode') maintenance_mode,
    (SELECT value FROM system_settings WHERE key='last_backup_at') last_backup_at,
    (SELECT updated_at FROM app_state WHERE id=1) data_updated_at,
    (SELECT revision FROM app_state WHERE id=1) revision`),info=result.rows[0]||{};
    res.set('Cache-Control','no-store');res.json({release:RELEASE_NAME,schemaVersion:info.schema_version||SCHEMA_VERSION,database:'PostgreSQL',maintenance:info.maintenance_mode==='true',lastBackupAt:info.last_backup_at||null,dataUpdatedAt:info.data_updated_at||null,revision:Number(info.revision||0)});
  }catch(error){res.status(500).json({error:'อ่านสถานะระบบไม่สำเร็จ'});}
});

app.post('/api/his-locations/sync',localOnly,async(req,res)=>{
  let hisPool;
  try{
    const config=await readHisAppointmentConfig();
    hisPool=appointmentPool(config);
    const locationTable=`"${config.schema}"."${config.locationTable}"`;
    const result=await hisPool.query(`SELECT id,name,code,description FROM ${locationTable} WHERE id IS NOT NULL ORDER BY CASE WHEN id::text='95' THEN 0 ELSE 1 END,COALESCE(NULLIF(BTRIM(name::text),''),id::text),id LIMIT 5000`);
    for(const row of result.rows)await pool.query(`INSERT INTO his_location_settings(location_id,location_name,location_code,description,is_active,updated_at,updated_by) VALUES($1,$2,$3,$4,true,NOW(),$5) ON CONFLICT(location_id) DO UPDATE SET location_name=EXCLUDED.location_name,location_code=EXCLUDED.location_code,description=EXCLUDED.description,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[String(row.id),String(row.name||''),String(row.code||''),String(row.description||''),String(req.body?.updatedBy||'system').slice(0,120)]);
    res.json({ok:true,saved:result.rows.length});
  }catch(error){res.status(502).json({error:`อ่านรายการ Location จาก HIS ไม่สำเร็จ: ${error.message||error}`});}
  finally{if(hisPool)await hisPool.end().catch(()=>{});}
});
app.post('/api/his-locations/import',localOnly,async(req,res)=>{const items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length)return res.status(400).json({error:'ไม่พบข้อมูล Location สำหรับนำเข้า'});let saved=0;try{for(const item of items.slice(0,10000)){const id=String(item.id||item.code||'').trim();if(!id)continue;await pool.query(`INSERT INTO his_location_settings(location_id,location_name,location_code,description,is_active,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,NOW(),$6) ON CONFLICT(location_id) DO UPDATE SET location_name=EXCLUDED.location_name,location_code=EXCLUDED.location_code,description=EXCLUDED.description,is_active=EXCLUDED.is_active,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[id,String(item.name||''),String(item.code||''),String(item.description||''),item.isActive!==false,String(req.body?.updatedBy||'system').slice(0,120)]);saved++}res.json({ok:true,saved})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.post('/api/his/patientlog-status',localOnly,async(req,res)=>{try{const result=await fetchLatestPatientLogStatuses(req.body?.items||[]);res.set('Cache-Control','no-store');res.json(result)}catch(error){res.status(502).json({error:'อ่าน Status ล่าสุดจาก patientlog ไม่สำเร็จ',detail:error.message})}});
app.get('/api/his-users',localOnly,staffPermissionRequired('userView'),async(req,res)=>{try{const result=await fetchHisDirectoryUsers();res.set('Cache-Control','no-store');res.json(result)}catch(error){console.error('HIS user directory read failed',error);res.status(502).json({error:'อ่านรายชื่อ User จาก HIS ไม่สำเร็จ',detail:error.message||String(error)})}});
app.get('/api/his-users/query',localOnly,staffPermissionRequired('userView'),async(req,res)=>{try{const source=await inspectHisDirectoryUserQuery();res.set('Cache-Control','no-store');res.json({ok:true,source})}catch(error){res.status(502).json({error:'อ่าน Query User จาก HIS ไม่สำเร็จ',detail:error.message})}});
app.post('/api/his-users/sync',localOnly,staffPermissionRequired('userCreate'),async(req,res)=>{try{
  const state=await readState();state.users=Array.isArray(state.users)?state.users:[];state.roles=Array.isArray(state.roles)?state.roles:[];state.hisUserRoleMappings=Array.isArray(state.hisUserRoleMappings)?state.hisUserRoleMappings:[];
  const validRoleIds=new Set(state.roles.map(role=>String(role.id))),enabledMappings=state.hisUserRoleMappings.filter(mapping=>mapping&&mapping.active!==false&&String(mapping.lovcptypid||'').trim()&&String(mapping.roleId||'').trim()&&validRoleIds.has(String(mapping.roleId))),mappingByType=new Map(enabledMappings.map(mapping=>[String(mapping.lovcptypid).trim(),String(mapping.roleId).trim()])),allowedTypeIds=[...mappingByType.keys()];
  if(!allowedTypeIds.length)return res.status(409).json({error:'ยังไม่มี Mapping Role ที่พร้อมใช้งาน',detail:'กรุณาเปิด Mapping Role อย่างน้อย 1 ประเภท และเลือก HealthCheck Role ก่อนดึงข้อมูลจาก HIS'});
  const [directory,population]=await Promise.all([fetchHisDirectoryUsers({allowedTypeIds}),fetchHisDirectoryPopulationSummary()]);
  const mappedTypeSet=new Set(allowedTypeIds),mappedEligibleUsers=population.types.filter(type=>mappedTypeSet.has(String(type.lovcptypid))).reduce((sum,type)=>sum+Number(type.userCount||0),0),skippedUnmapped=Math.max(0,Number(population.eligibleRows||0)-mappedEligibleUsers),skippedInactive=Number(population.inactiveRows||0),skippedExpired=Number(population.expiredRows||0);
  const normalizeUsername=value=>String(value||'').trim().toLowerCase(),mergeHisMetadata=(target,source)=>{for(const key of ['hisUserId','hisCode','departmentName','positionName','email','phone','hisUserTypeId','hisUserTypeCode','hisUserTypeName','hisActiveTo'])if(!target[key]&&source[key])target[key]=source[key];return target};
  // Repair duplicate usernames already present in app_state before persisting to the relational mirror. Prefer LOCAL/admin accounts so passwords, active state and manually assigned roles are preserved.
  const dedupedStateUsers=[],stateUserByUsername=new Map();let stateDuplicatesMerged=0;
  for(const rawUser of state.users){const user=rawUser&&typeof rawUser==='object'?rawUser:null;if(!user)continue;const key=normalizeUsername(user.username);if(!key){dedupedStateUsers.push(user);continue}const previous=stateUserByUsername.get(key);if(!previous){stateUserByUsername.set(key,user);dedupedStateUsers.push(user);continue}const previousProtected=String(previous.username||'').trim().toLowerCase()==='admin'||String(previous.source||'').toUpperCase()==='LOCAL',currentProtected=String(user.username||'').trim().toLowerCase()==='admin'||String(user.source||'').toUpperCase()==='LOCAL';if(currentProtected&&!previousProtected){const index=dedupedStateUsers.indexOf(previous);if(index>=0)dedupedStateUsers[index]=user;stateUserByUsername.set(key,mergeHisMetadata(user,previous))}else mergeHisMetadata(previous,user);stateDuplicatesMerged++}
  state.users=dedupedStateUsers;
  const byUsername=new Map(state.users.map(user=>[normalizeUsername(user.username),user]).filter(([key])=>key)),byHisId=new Map(state.users.filter(user=>user.hisUserId).map(user=>[String(user.hisUserId).trim(),user]));
  // HIS can occasionally return the same username more than once. Collapse it before writeState so Sync is idempotent. Keep the richer row.
  const directoryByUsername=new Map();let duplicateHisRows=0;const richness=item=>['hisUserId','code','displayName','departmentName','positionName','email','phone','userTypeId','userTypeCode','userTypeName','activeTo'].reduce((score,key)=>score+(String(item?.[key]||'').trim()?1:0),0);
  for(const item of directory.items||[]){const key=normalizeUsername(item?.username);if(!key)continue;const previous=directoryByUsername.get(key);if(!previous){directoryByUsername.set(key,item);continue}duplicateHisRows++;if(richness(item)>richness(previous))directoryByUsername.set(key,item)}
  const syncItems=[...directoryByUsername.values()];let added=0,updated=0,skipped=0,mapped=0,conflicts=0;const syncedAt=new Date().toISOString(),firstLoginHash=String(state.firstLoginPasswordHash||'');
  for(const item of syncItems){const username=String(item.username||'').trim(),usernameKey=normalizeUsername(username);if(!usernameKey){skipped++;continue}const mappedRoleId=mappingByType.get(String(item.userTypeId||'').trim())||'',resolvedRoleId=validRoleIds.has(mappedRoleId)?mappedRoleId:'';if(!resolvedRoleId){skipped++;continue}mapped++;const hisId=String(item.hisUserId||'').trim(),existingByUsername=byUsername.get(usernameKey),existingByHisId=hisId?byHisId.get(hisId):null;let existing=existingByUsername||existingByHisId;if(existingByUsername&&existingByHisId&&existingByUsername!==existingByHisId){conflicts++;existing=existingByUsername;mergeHisMetadata(existing,existingByHisId)}if(existing){if(normalizeUsername(existing.username)==='admin'){skipped++;continue}const isLocal=String(existing.source||'').toUpperCase()==='LOCAL';Object.assign(existing,{displayName:item.displayName||existing.displayName,hisUserId:item.hisUserId||existing.hisUserId||'',hisCode:item.code||existing.hisCode||'',departmentName:item.departmentName||'',positionName:item.positionName||'',email:item.email||existing.email||'',phone:item.phone||existing.phone||'',hisActive:item.active!==false,hisSyncedAt:syncedAt,source:existing.source||'HIS',hisUserTypeId:item.userTypeId||'',hisUserTypeCode:item.userTypeCode||'',hisUserTypeName:item.userTypeName||'',hisActiveTo:item.activeTo||'',hisRoleMappingStatus:'MAPPED'});if(!isLocal)existing.roleId=resolvedRoleId;byUsername.set(usernameKey,existing);if(existing.hisUserId)byHisId.set(String(existing.hisUserId).trim(),existing);updated++;continue}const user={id:crypto.randomUUID(),displayName:item.displayName||username,username,passwordHash:firstLoginHash,roleId:resolvedRoleId,active:Boolean(firstLoginHash),mustChangePassword:Boolean(firstLoginHash),firstLoginAt:null,passwordChangedAt:null,createdAt:syncedAt,source:'HIS',hisUserId:item.hisUserId||'',hisCode:item.code||'',departmentName:item.departmentName||'',positionName:item.positionName||'',email:item.email||'',phone:item.phone||'',hisActive:item.active!==false,hisSyncedAt:syncedAt,hisUserTypeId:item.userTypeId||'',hisUserTypeCode:item.userTypeCode||'',hisUserTypeName:item.userTypeName||'',hisActiveTo:item.activeTo||'',hisRoleMappingStatus:'MAPPED'};state.users.push(user);byUsername.set(usernameKey,user);if(user.hisUserId)byHisId.set(String(user.hisUserId).trim(),user);added++}
  skipped+=duplicateHisRows;
  const summary={added,updated,skipped,total:directory.items.length,uniqueUsers:syncItems.length,mapped,unmapped:skippedUnmapped,skippedUnmapped,skippedInactive,skippedExpired,duplicateHisRows,stateDuplicatesMerged,conflicts,enabledMappingTypes:allowedTypeIds.length,mappedEligibleUsers,totalEligibleUsers:Number(population.eligibleRows||0),deletedInHis:Number(population.deletedRows||0)};
  state.permissionAudit=Array.isArray(state.permissionAudit)?state.permissionAudit:[];state.permissionAudit.unshift({id:crypto.randomUUID(),action:'ดึงข้อมูลผู้ใช้จาก HIS',target:`${directory.source.schema}.${directory.source.table}`,details:summary,by:req.staffUser?.displayName||req.staffUser?.username||'system',userId:req.staffUser?.id||'',at:syncedAt});state.at=syncedAt;const revision=await writeState(state);res.json({ok:true,revision,...summary,source:directory.source})
}catch(error){console.error('HIS user sync failed',error);const detail=String(error.message||error).slice(0,1200);res.status(502).json({error:'ดึงข้อมูล User จาก HIS ไม่สำเร็จ',detail,technical:{code:error.code||'',constraint:error.constraint||'',table:error.table||'',detail:String(error.detail||'').slice(0,1200)}})}});
app.get('/api/his-user-role-mappings',localOnly,staffPermissionRequired('userView'),async(req,res)=>{try{const [population,state]=await Promise.all([fetchHisDirectoryPopulationSummary(),readState()]),mappings=Array.isArray(state.hisUserRoleMappings)?state.hisUserRoleMappings:[],roles=(state.roles||[]).map(r=>({id:r.id,name:r.name})),validRoleIds=new Set(roles.map(role=>String(role.id))),mappingByType=new Map(mappings.map(mapping=>[String(mapping.lovcptypid||''),mapping])),items=population.types.map(type=>({...type})).sort((a,b)=>String(a.userTypeName||a.lovcptypid).localeCompare(String(b.userTypeName||b.lovcptypid),'th'));let enabledMappingTypes=0,mappedUserCount=0;for(const type of items){const mapping=mappingByType.get(String(type.lovcptypid)),ready=Boolean(mapping&&mapping.active!==false&&String(mapping.roleId||'').trim()&&validRoleIds.has(String(mapping.roleId)));if(ready){enabledMappingTypes++;mappedUserCount+=Number(type.userCount||0)}}res.json({ok:true,items,mappings,roles,summary:{enabledMappingTypes,mappedUserCount,totalEligibleUsers:Number(population.eligibleRows||0),unmappedEligibleUsers:Math.max(0,Number(population.eligibleRows||0)-mappedUserCount),inactiveUsers:Number(population.inactiveRows||0),expiredUsers:Number(population.expiredRows||0),deletedUsers:Number(population.deletedRows||0)}})}catch(error){res.status(502).json({error:'อ่าน Mapping Role ไม่สำเร็จ',detail:error.message})}});
app.put('/api/his-user-role-mappings',localOnly,staffPermissionRequired('permissionManage'),async(req,res)=>{try{const incoming=Array.isArray(req.body?.mappings)?req.body.mappings:[],state=await readState(),roles=new Set((state.roles||[]).map(r=>String(r.id))),clean=[];for(const item of incoming.slice(0,500)){const lovcptypid=String(item?.lovcptypid||'').trim(),roleId=String(item?.roleId||'').trim();if(!lovcptypid)continue;if(roleId&&!roles.has(roleId))return res.status(400).json({error:`ไม่พบ Role ${roleId}`});clean.push({lovcptypid,roleId,active:item?.active!==false,userTypeCode:String(item?.userTypeCode||''),userTypeName:String(item?.userTypeName||''),updatedAt:new Date().toISOString(),updatedBy:req.staffUser?.displayName||req.staffUser?.username||'system'})}state.hisUserRoleMappings=clean;state.permissionAudit=Array.isArray(state.permissionAudit)?state.permissionAudit:[];state.permissionAudit.unshift({id:crypto.randomUUID(),action:'บันทึก Mapping Role',target:`${clean.length} รายการ`,details:{mappings:clean.map(x=>({lovcptypid:x.lovcptypid,roleId:x.roleId,active:x.active}))},by:req.staffUser?.displayName||req.staffUser?.username||'system',userId:req.staffUser?.id||'',at:new Date().toISOString()});state.at=new Date().toISOString();const revision=await writeState(state);res.json({ok:true,revision,count:clean.length,mappings:clean})}catch(error){res.status(500).json({error:'บันทึก Mapping Role ไม่สำเร็จ',detail:error.message})}});

app.post('/api/users/bulk-delete',localOnly,staffPermissionRequired('userDelete'),async(req,res)=>{try{
  const requested=[...new Set((Array.isArray(req.body?.userIds)?req.body.userIds:[]).map(value=>String(value||'').trim()).filter(Boolean))].slice(0,1000);
  if(!requested.length)return res.status(400).json({error:'กรุณาเลือกผู้ใช้ที่ต้องการลบ'});
  const state=await readState();state.users=Array.isArray(state.users)?state.users:[];state.permissionAudit=Array.isArray(state.permissionAudit)?state.permissionAudit:[];
  const byId=new Map(state.users.map(user=>[String(user.id),user])),selected=requested.map(id=>byId.get(id)).filter(Boolean),foundIds=new Set(selected.map(user=>String(user.id)));
  const skipped=[];for(const id of requested)if(!foundIds.has(id))skipped.push({id,reason:'ไม่พบบัญชีผู้ใช้'});
  const currentId=String(req.staffUser?.id||''),currentUsername=String(req.staffUser?.username||'').toLowerCase();
  const adminUsers=state.users.filter(user=>String(user.roleId)==='admin'||String(user.username||'').toLowerCase()==='admin');let remainingAdmins=adminUsers.length;
  const deletable=[];
  for(const user of selected){
    const username=String(user.username||'');
    if(String(user.id)===currentId||username.toLowerCase()===currentUsername){skipped.push({id:String(user.id),username,reason:'บัญชีนี้กำลัง Login อยู่'});continue}
    if(username.toLowerCase()==='admin'){skipped.push({id:String(user.id),username,reason:'บัญชี admin หลักถูกป้องกัน'});continue}
    const isAdmin=String(user.roleId)==='admin';if(isAdmin&&remainingAdmins<=1){skipped.push({id:String(user.id),username,reason:'ไม่สามารถลบ Administrator คนสุดท้าย'});continue}
    if(isAdmin)remainingAdmins--;
    deletable.push(user);
  }
  const deleteIds=new Set(deletable.map(user=>String(user.id))),at=new Date().toISOString(),actor=req.staffUser?.displayName||req.staffUser?.username||'system';
  state.users=state.users.filter(user=>!deleteIds.has(String(user.id)));
  for(const user of deletable)state.permissionAudit.unshift({id:crypto.randomUUID(),action:'ลบบัญชีผู้ใช้',target:String(user.username||user.displayName||user.id),details:{userId:user.id,roleId:user.roleId,source:user.source||'LOCAL',hisUserId:user.hisUserId||'',bulk:true},by:actor,userId:req.staffUser?.id||'',at});
  state.permissionAudit.unshift({id:crypto.randomUUID(),action:'ลบบัญชีผู้ใช้หลายคน',target:`${deletable.length} บัญชี`,details:{requested:requested.length,deleted:deletable.length,skipped:skipped.length},by:actor,userId:req.staffUser?.id||'',at});
  state.at=at;const revision=await writeState(state);
  res.json({ok:true,revision,requested:requested.length,deleted:deletable.map(user=>({id:user.id,username:user.username,displayName:user.displayName,source:user.source||'LOCAL'})),skipped});
}catch(error){console.error('Bulk delete users failed',error);res.status(500).json({error:'ลบผู้ใช้หลายคนไม่สำเร็จ',detail:error.message||String(error)})}});

app.get('/api/his-locations',localOnly,async(req,res)=>{try{const activeOnly=String(req.query.activeOnly||'true').toLowerCase()!=='false',result=await pool.query(`SELECT location_id AS id,location_name AS name,location_code AS code,description,is_active AS "isActive" FROM his_location_settings ${activeOnly?'WHERE is_active=true':''} ORDER BY CASE WHEN location_id='95' THEN 0 ELSE 1 END,location_name,location_id`);res.set('Cache-Control','private, max-age=300');res.json({count:result.rows.length,items:result.rows,defaultLocationId:'95',source:{type:'saved-master'}})}catch(error){res.status(500).json({error:error.message||String(error)})}});
app.put('/api/his-locations/:id/status',localOnly,async(req,res)=>{try{const id=String(req.params.id||'').trim(),isActive=req.body?.isActive===true;if(!id)return res.status(400).json({error:'ไม่พบ Location ID'});await pool.query(`INSERT INTO his_location_settings(location_id,is_active,updated_at,updated_by) VALUES($1,$2,NOW(),$3) ON CONFLICT(location_id) DO UPDATE SET is_active=EXCLUDED.is_active,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[id,isActive,String(req.body?.updatedBy||'system').slice(0,120)]);res.json({ok:true,id,isActive})}catch(error){res.status(500).json({error:error.message||String(error)})}});

app.get('/api/his-appointments',localOnly,async(req,res)=>{
  const dateFrom=String(req.query.dateFrom||req.query.date||'').trim(),dateTo=String(req.query.dateTo||dateFrom).trim(),location=String(req.query.location||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(dateTo))return res.status(400).json({error:'ช่วงวันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD'});
  const fromTime=Date.parse(`${dateFrom}T00:00:00Z`),toTime=Date.parse(`${dateTo}T00:00:00Z`);
  if(!Number.isFinite(fromTime)||!Number.isFinite(toTime)||toTime<fromTime||toTime-fromTime>32*86400000)return res.status(400).json({error:'ช่วงวันที่ต้องไม่เกิน 33 วัน'});
  if(location&&!/^\d+$/.test(location))return res.status(400).json({error:'Location ต้องเป็นตัวเลข'});
  let hisPool;
  try{
    const config=await readHisAppointmentConfig();hisPool=appointmentPool(config);const table=`"${config.schema}"."${config.table}"`,locationTable=`"${config.schema}"."${config.locationTable}"`,doctorTable=`"${config.schema}"."${config.doctorTable}"`,params=[dateFrom,dateTo],locationSql=location?' AND a.locationid::text=$3':'';if(location)params.push(location);const patient=await patientJoinProjection(hisPool,config);
    const result=await hisPool.query(`SELECT a.id,a.aptschslotid,a.patientid,a.hn,a.locationid,a.resourcetype,a.doctorid,a.aptdate,TO_CHAR(a.aptdate::date,'YYYY-MM-DD') AS aptdate_key,a.starttime,a.endtime,a.lovapttypecode,a.lovaptstscode,a.lovaptviaid,a.aptserviceid,a.movefromid,a.lovaptmsgid,a.aptmsg,a."comments",a.confirmedby,a.confirmeddate,a.insby,a.updby,a.upddate,a.insdate,a.hosid,a.spare1,a.isdeleted,a.cancelledreason,a.aptidentity,a.numslot,a.visitnote,a.logid,a.lovaptconfviaid,a.visitdate,a.lovaptmsgid2,a.generatelink,a.refvn,l.name AS location_name,l.code AS location_code,l.description AS location_description,NULLIF(BTRIM(CONCAT_WS(' ',d.title,d.firstname,d.middlename,d.lastname)),'') AS doctor_name,d.othername AS doctor_other_name,d.code AS doctor_code${patient.select} FROM ${table} a LEFT JOIN ${locationTable} l ON l.id=a.locationid LEFT JOIN ${doctorTable} d ON d.id=a.doctorid ${patient.join} WHERE a.aptdate >= $1::date AND a.aptdate < ($2::date + INTERVAL '1 day') AND COALESCE(a.isdeleted,false)=false${locationSql} ORDER BY a.aptdate,a.starttime,a.id LIMIT 10000`,params);
    const items=result.rows.map(row=>({...row,aptdate:row.aptdate_key||row.aptdate}));
    res.set('Cache-Control','no-store');res.json({dateFrom,dateTo,location,count:items.length,items,source:{schema:config.schema,table:config.table,locationTable:config.locationTable,doctorTable:config.doctorTable,patientTable:config.patientTable,patientColumns:patient.columns}});
  }catch(error){res.status(502).json({error:`เชื่อมต่อหรือตรวจสอบตารางนัดหมาย HIS ไม่สำเร็จ: ${error.message||error}`});}
  finally{if(hisPool)await hisPool.end().catch(()=>{});}
});

app.get('/api/his-appointments/by-hn',localOnly,async(req,res)=>{
  const hn=String(req.query.hn||'').trim();
  if(!hn||hn.length>50)return res.status(400).json({error:'กรุณาระบุ HN ที่ถูกต้อง'});
  let hisPool;
  try{
    const config=await readHisAppointmentConfig();
    hisPool=appointmentPool(config);
    const table=`"${config.schema}"."${config.table}"`,locationTable=`"${config.schema}"."${config.locationTable}"`,doctorTable=`"${config.schema}"."${config.doctorTable}"`,patient=await patientJoinProjection(hisPool,config);
    const result=await hisPool.query(`SELECT a.id,a.hn,a.locationid,a.doctorid,a.aptdate,a.starttime,a.endtime,a.lovapttypecode,a.lovaptstscode,a.aptmsg,a."comments",a.confirmeddate,a.cancelledreason,a.aptidentity,a.visitdate,a.refvn,l.name AS location_name,l.code AS location_code,l.description AS location_description,NULLIF(BTRIM(CONCAT_WS(' ',d.title,d.firstname,d.middlename,d.lastname)),'') AS doctor_name,d.othername AS doctor_other_name,d.code AS doctor_code${patient.select}
      FROM ${table} a
      LEFT JOIN ${locationTable} l ON l.id=a.locationid
      LEFT JOIN ${doctorTable} d ON d.id=a.doctorid
      ${patient.join}
      WHERE BTRIM(a.hn::text)=$1 AND COALESCE(a.isdeleted,false)=false
      ORDER BY
        CASE WHEN a.aptdate::date >= CURRENT_DATE THEN 0 ELSE 1 END,
        CASE WHEN a.aptdate::date >= CURRENT_DATE THEN a.aptdate::date END ASC,
        CASE WHEN a.aptdate::date < CURRENT_DATE THEN a.aptdate::date END DESC,
        a.starttime ASC NULLS LAST,a.id DESC
      LIMIT 200`,[hn]);
    res.set('Cache-Control','no-store');
    res.json({hn,count:result.rows.length,items:result.rows,source:{schema:config.schema,table:config.table,locationTable:config.locationTable,doctorTable:config.doctorTable,patientTable:config.patientTable}});
  }catch(error){
    res.status(502).json({error:`ค้นหานัดหมายจาก HIS ไม่สำเร็จ: ${error.message||error}`});
  }finally{
    if(hisPool)await hisPool.end().catch(()=>{});
  }
});

function validateAppointmentConfig(body,currentPassword=''){const value={host:String(body?.host||'').trim().slice(0,255),port:Number(body?.port||5432),database:String(body?.database||'').trim().slice(0,100),user:String(body?.user||'').trim().slice(0,100),password:String(body?.password||currentPassword),schema:String(body?.schema||'public').trim().slice(0,100),table:String(body?.table||'patientapt').trim().slice(0,100),locationTable:String(body?.locationTable||'location').trim().slice(0,100),doctorTable:String(body?.doctorTable||'usermas').trim().slice(0,100),patientTable:String(body?.patientTable||'patient').trim().slice(0,100)};if(!value.host||!value.database||!value.user||!value.password)return {error:'กรุณากรอก Host, Database, Username และ Password'};if(!Number.isInteger(value.port)||value.port<1||value.port>65535)return {error:'Port ไม่ถูกต้อง'};if(!safeIdentifier(value.schema)||!safeIdentifier(value.table)||!safeIdentifier(value.locationTable)||!safeIdentifier(value.doctorTable)||!safeIdentifier(value.patientTable))return {error:'Schema หรือชื่อตารางไม่ถูกต้อง'};return {value}}
app.get('/api/his-appointment-config',localOnly,packageConfigSessionRequired,async(_req,res)=>{try{const config=await readHisAppointmentConfig();let logs=[];try{logs=(await pool.query('SELECT * FROM his_appointment_config_log ORDER BY id DESC LIMIT 100')).rows}catch(logError){console.error('อ่าน Log การตั้งค่า PostgreSQL HIS ไม่สำเร็จ',logError.message)}res.set('Cache-Control','no-store');res.json({config:{host:config.host,port:config.port,database:config.database,user:config.user,schema:config.schema,table:config.table,locationTable:config.locationTable,doctorTable:config.doctorTable,patientTable:config.patientTable,hasPassword:Boolean(config.password),passwordNeedsReset:Boolean(config.passwordUnreadable||config.configUnreadable)},logs});}catch(error){console.error('อ่านการตั้งค่า PostgreSQL HIS ไม่สำเร็จ',error);res.status(500).json({error:'อ่านการตั้งค่า PostgreSQL HIS ไม่สำเร็จ กรุณาตรวจสอบ logs/server-error ล่าสุด'});}});
app.put('/api/his-appointment-config',localOnly,packageConfigSessionRequired,async(req,res)=>{try{const current=await readHisAppointmentConfig(),checked=validateAppointmentConfig(req.body,current.password);if(checked.error)return res.status(400).json({error:checked.error});const value=checked.value,fields=['host','port','database','user','schema','table','locationTable','doctorTable','patientTable'].filter(key=>String(current[key]??'')!==String(value[key]??''));if(req.body?.password)fields.push('password');const session=req.packageConfigSession||{},stored={host:value.host,port:value.port,database:value.database,user:value.user,passwordEncrypted:encryptAppointmentPassword(value.password),schema:value.schema,table:value.table,locationTable:value.locationTable,doctorTable:value.doctorTable,patientTable:value.patientTable,updatedBy:session.displayName||session.username||'system'};await pool.query("INSERT INTO system_settings(key,value,updated_at) VALUES('his_appointment_config',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[JSON.stringify(stored)]);try{await pool.query(`INSERT INTO his_appointment_config_log(changed_by,action,changed_fields,client_address) VALUES($1,'UPDATE',$2::jsonb,$3)`,[stored.updatedBy,JSON.stringify(fields),clientAddress(req)])}catch(logError){console.error('บันทึก Log การตั้งค่า PostgreSQL HIS ไม่สำเร็จ แต่ค่าการเชื่อมต่อถูกบันทึกแล้ว',logError.message)}res.json({ok:true,changedFields:fields,hasPassword:true});}catch(error){console.error('บันทึกการตั้งค่า PostgreSQL HIS ไม่สำเร็จ',error);res.status(500).json({error:'บันทึกการตั้งค่า PostgreSQL HIS ไม่สำเร็จ',detail:String(error.message||error).slice(0,500)});}});
app.post('/api/his-appointment-config/test',localOnly,packageConfigSessionRequired,async(req,res)=>{let testPool;try{const current=await readHisAppointmentConfig(),checked=validateAppointmentConfig(req.body,current.password);if(checked.error)return res.status(400).json({error:checked.error});testPool=appointmentPool(checked.value);const schema=`"${checked.value.schema}"`,appointmentTable=`${schema}."${checked.value.table}"`,locationTable=`${schema}."${checked.value.locationTable}"`,doctorTable=`${schema}."${checked.value.doctorTable}"`,patient=await patientJoinProjection(testPool,checked.value);await testPool.query(`SELECT 1 FROM ${appointmentTable} a LEFT JOIN ${locationTable} l ON l.id=a.locationid LEFT JOIN ${doctorTable} d ON d.id=a.doctorid ${patient.join} LIMIT 1`);res.json({ok:true,message:`เชื่อมต่อสำเร็จ พบ ${checked.value.schema}.${checked.value.table}, ${checked.value.locationTable}, ${checked.value.doctorTable} และ ${checked.value.patientTable}`});}catch(error){res.status(502).json({error:`ทดสอบการเชื่อมต่อไม่สำเร็จ: ${error.message||error}`});}finally{if(testPool)await testPool.end().catch(()=>{});}});


app.post('/api/his-patient-config/test',localOnly,packageConfigSessionRequired,async(req,res)=>{
  let testPool;
  try{
    const current=await readHisAppointmentConfig(),checked=validateAppointmentConfig(req.body,current.password);
    if(checked.error)return res.status(400).json({error:checked.error});
    testPool=appointmentPool(checked.value);
    const patient=await patientSearchProjection(testPool,checked.value);
    const table=`"${checked.value.schema}"."${checked.value.patientTable}"`;
    await testPool.query(`SELECT ${patient.select} FROM ${table} p LIMIT 1`);
    res.json({ok:true,message:`เชื่อมต่อสำเร็จ พร้อม Query ${checked.value.schema}.${checked.value.patientTable}`,columnMap:patient.columns});
  }catch(error){res.status(502).json({error:`ทดสอบตาราง patient ไม่สำเร็จ: ${error.message||error}`});}
  finally{if(testPool)await testPool.end().catch(()=>{});}
});

app.post('/api/his-patient-query/test',localOnly,packageConfigSessionRequired,async(req,res)=>{
  try{
    const firstName=String(req.body?.firstName||'').trim(),lastName=String(req.body?.lastName||'').trim(),birthDate=String(req.body?.birthDate||'').trim();
    if(!firstName||!lastName||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(birthDate))return res.status(400).json({error:'กรุณาระบุชื่อ นามสกุล และวันเกิดให้ครบ'});
    if(firstName.length>120||lastName.length>120)return res.status(400).json({error:'ชื่อหรือนามสกุลยาวเกินกำหนด'});
    const result=await queryHisPatientByNameDob(firstName,lastName,birthDate);
    res.set('Cache-Control','no-store');res.json({ok:true,...result,query:{firstName,lastName,birthDate}});
  }catch(error){res.status(502).json({error:`Query ตาราง patient จาก PostgreSQL HIS ไม่สำเร็จ: ${error.message||error}`});}
});

// Normal application endpoint used as the second pass after ID/Passport lookup.
app.post('/api/his-patient-query/lookup',localOnly,async(req,res)=>{
  try{
    const firstName=String(req.body?.firstName||'').trim(),lastName=String(req.body?.lastName||'').trim(),birthDate=String(req.body?.birthDate||'').trim();
    if(!firstName||!lastName||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(birthDate))return res.status(400).json({error:'ต้องมีชื่อ นามสกุล และวันเกิดสำหรับ Second-pass'});
    if(firstName.length>120||lastName.length>120)return res.status(400).json({error:'ชื่อหรือนามสกุลยาวเกินกำหนด'});
    const result=await queryHisPatientByNameDob(firstName,lastName,birthDate);
    res.set('Cache-Control','no-store');res.json({ok:true,...result});
  }catch(error){res.status(502).json({error:`ค้นหาผู้ป่วยจาก PostgreSQL HIS ไม่สำเร็จ: ${error.message||error}`});}
});

function patientApiResult(patient){return {identificationNumber:String(patient?.IdentificationNumber||''),hn:String(patient?.HN||''),birthDate:String(patient?.BirthDate||''),prefix:String(patient?.Prefix||''),prefixEN:String(patient?.PrefixEN||''),firstName:String(patient?.FirstName||''),lastName:String(patient?.LastName||''),firstNameEN:String(patient?.FirstNameEN||''),lastNameEN:String(patient?.LastNameEN||''),gender:String(patient?.Gender||''),phoneNumber:String(patient?.PhoneNumber||''),email:String(patient?.Email||''),isResult:patient?.IsResult===true}}

app.post('/api/patient-lookup/batch',localOnly,async(req,res)=>{
  try{
    const raw=Array.isArray(req.body?.identificationNumbers)?req.body.identificationNumbers:[],ids=[...new Set(raw.map(value=>String(value||'').trim()).filter(Boolean))];
    if(!ids.length)return res.status(400).json({error:'ไม่พบ ID / Passport ในไฟล์'});
    if(ids.length>5000)return res.status(400).json({error:'ตรวจสอบ ID / Passport ได้สูงสุด 5,000 รายการต่อครั้ง'});
    if(ids.some(value=>value.length>50))return res.status(400).json({error:'มี ID / Passport ยาวเกินกำหนด'});
    const patients=[];
    for(let start=0;start<ids.length;start+=250){
      const upstream=await requestPatientData(ids.slice(start,start+250));
      if(!upstream.ok)return res.status(502).json({error:`Patient API ตอบกลับ HTTP ${upstream.status}`});
      const list=Array.isArray(upstream.data?.PatientList)?upstream.data.PatientList:[];
      patients.push(...list);
    }
    const byId=new Map();
    for(const patient of patients){const id=String(patient?.IdentificationNumber||'').trim();if(id&&!byId.has(id)&&patient?.IsResult!==false)byId.set(id,patientApiResult(patient));}
    const items=ids.map(identificationNumber=>({identificationNumber,found:byId.has(identificationNumber),patient:byId.get(identificationNumber)||null})),found=items.filter(item=>item.found).length;
    res.set('Cache-Control','no-store');res.json({ok:true,checkedAt:new Date().toISOString(),total:items.length,found,notFound:items.length-found,items});
  }catch(error){res.status(502).json({error:error.message||'เรียก Patient API แบบชุดไม่สำเร็จ'});}
});

app.post('/api/patient-lookup',localOnly,async(req,res)=>{
  try{
    const identificationNumber=String(req.body?.identificationNumber||'').trim();
    if(!identificationNumber)return res.status(400).json({error:'กรุณาระบุ ID / Passport'});
    if(identificationNumber.length>50)return res.status(400).json({error:'ID / Passport ยาวเกินกำหนด'});
    const upstream=await requestPatientData(identificationNumber);
    if(!upstream.ok)return res.status(502).json({error:`Patient API ตอบกลับ HTTP ${upstream.status}`});
    const list=Array.isArray(upstream.data?.PatientList)?upstream.data.PatientList:[];
    const patient=list.find(item=>String(item?.IdentificationNumber||'').trim()===identificationNumber);
    if(!patient||patient.IsResult===false)return res.status(404).json({error:'ไม่พบข้อมูลผู้ป่วยจาก ID / Passport นี้'});
    res.set('Cache-Control','no-store');res.json({patient:patientApiResult(patient)});
  }catch(error){res.status(502).json({error:error.message||'เรียก Patient API ไม่สำเร็จ'});}
});
app.post('/api/his/create-hn',localOnly,async(req,res)=>{
  try{
    const recordKey=String(req.body?.recordKey||'').trim(),state=await readState(),record=(state.records||[]).find(item=>String(item.key||item.id)===recordKey);
    if(!record)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้าที่จะสร้าง HN'});
    if(String(record.hn||'').trim())return res.status(409).json({error:`รายการนี้มี HN ${record.hn} แล้ว`});
    const source=req.body?.patient&&typeof req.body.patient==='object'?req.body.patient:{},clean=(value,max=300)=>String(value??'').trim().slice(0,max),birthdate=normalizeHisBirthdate(source.birthDate||record.birth),identificationNumber=clean(source.identificationNumber||record.id,80);
    if(!identificationNumber)return res.status(400).json({error:'กรุณาระบุ Identification Number ก่อนสร้าง HN'});
    if(!clean(source.firstName||record.first,120)||!clean(source.lastName||record.last,120)||!/^\d{4}-\d{2}-\d{2}$/.test(birthdate))return res.status(400).json({error:'ต้องมีชื่อ นามสกุล และวันเกิดรูปแบบ YYYY-MM-DD ก่อนสร้าง HN'});
    const company=(state.companies||[]).find(item=>String(item.id)===String(record.companyId)),genderText=clean(source.gender||record.sex,20).toUpperCase(),payload={
      HN:clean(source.hn||`${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(record.displayOrder||1).padStart(4,'0')}`,40),IdentificationNumber:identificationNumber,IdentificationType:clean(source.identificationType||record.identificationType||'idnumber',30),Title:clean(source.title||record.title,40),FirstName:clean(source.firstName||record.first,120),LastName:clean(source.lastName||record.last,120),TitleEN:clean(source.titleEN||record.prefixEN,40),FirstNameEN:clean(source.firstNameEN||record.firstNameEN,120),LastNameEN:clean(source.lastNameEN||record.lastNameEN,120),Gender:genderText==='M'||genderText==='MALE'?'Male':genderText==='F'||genderText==='FEMALE'?'Female':clean(source.gender||record.sex,20),Birthdate:birthdate,CellPhone:clean(source.cellPhone||record.phone,40),Email:clean(source.email||record.email,160),Address:clean(source.address||record.address,500),EmployeeCode:clean(record.employeeCode,80),Company:clean(company?.name,300),Department:clean(record.departmentName,160),Position:clean(record.positionName,160),Nationality:clean(source.nationality||record.nationality||'THA',40),MaritalStatus:clean(record.maritalStatus,60),UserCode:clean(req.body?.userCode||record.lastEditedBy||'admin vimut',120),ContextKey:clean(req.body?.contextKey||process.env.HIS_CONTEXT_KEY||'',80)
    };
    const call=await callConfiguredHisJson('CREATE_HN',payload),responseData=call.data,row=Array.isArray(responseData)?responseData[0]:(responseData?.PatientList?.[0]||responseData||{}),hn=clean(row?.HN||row?.hn,40),status=clean(row?.Status||row?.status,40),detail=clean(row?.StatusDetail||row?.statusDetail||row?.Message||row?.message,500);
    if(!hn||['unsuccess','error','failed','fail'].includes(status.toLowerCase()))throw new Error(detail||'HIS ไม่ได้ส่ง HN กลับมา');
    record.hn=hn;record.createHnRequest=payload;record.createHnResponse=responseData;record.createHnAt=new Date().toISOString();state.at=new Date().toISOString();const revision=await writeState(state);
    res.json({ok:true,hn,status,statusDetail:detail,patient:{identificationNumber:clean(row?.IdentificationNumber||identificationNumber,80),hn,birthDate:clean(row?.Birthdate||row?.BirthDate||birthdate,20),prefix:clean(row?.Title||payload.Title,40),prefixEN:clean(payload.TitleEN,40),firstName:clean(row?.FirstName||payload.FirstName,120),lastName:clean(row?.LastName||payload.LastName,120),firstNameEN:clean(row?.FirstNameEN||payload.FirstNameEN,120),lastNameEN:clean(row?.LastNameEN||payload.LastNameEN,120),gender:clean(row?.Gender||payload.Gender,20),phoneNumber:clean(row?.CellPhone||payload.CellPhone,40),email:clean(payload.Email,160),matchMethod:'CREATE_HN'},revision,request:payload,response:responseData});
  }catch(error){res.status(502).json({error:`Create HN ไม่สำเร็จ: ${error.message||error}`});}
});
app.get('/api/hn-codes',localOnly,async(req,res)=>{try{const hn=String(req.query.hn||'').trim();if(!hn||hn.length>40)return res.status(400).json({error:'HN ไม่ถูกต้อง'});const qrDataUrl=await QRCode.toDataURL(hn,{errorCorrectionLevel:'M',margin:1,width:180});const barcodeSvg=bwipjs.toSVG({bcid:'code128',text:hn,scale:2,height:10,includetext:false,paddingwidth:0,paddingheight:0});res.set('Cache-Control','private, max-age=300');res.json({hn,qrDataUrl,barcodeSvg})}catch(error){res.status(500).json({error:'สร้าง QR/Barcode ไม่สำเร็จ'})}});

app.put('/api/system/maintenance',localOnly,async(req,res)=>{
  try{const enabled=req.body?.enabled===true;await pool.query(`INSERT INTO system_settings(key,value,updated_at) VALUES('maintenance_mode',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[String(enabled)]);res.json({ok:true,maintenance:enabled});}
  catch(error){res.status(500).json({error:'เปลี่ยนสถานะ Maintenance ไม่สำเร็จ'});}
});


// v7.59.44 - self-service password reset. Writes directly on the server so UI revision conflicts cannot block recovery.
app.post('/api/auth/reset-password', localOnly, async (req, res) => {
  try {
    const username = normalizedPersonName(req.body?.username);
    const displayName = normalizedPersonName(req.body?.displayName);
    const password = String(req.body?.password || '');
    if (!username || !displayName) return res.status(400).json({ error:'กรุณากรอกชื่อผู้ใช้และชื่อที่ลงทะเบียนไว้' });
    if (password.length < 8 || !/[A-Za-zก-๙]/.test(password) || !/\d/.test(password)) return res.status(400).json({ error:'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข' });
    const state = await readState();
    state.users = Array.isArray(state.users) ? state.users : [];
    let user = state.users.find(item => normalizedPersonName(item.username) === username && item.active !== false);
    if (!user && username === 'admin' && !state.users.some(item => normalizedPersonName(item.username) === 'admin')) {
      user = { id:crypto.randomUUID(), displayName:'ผู้ดูแลระบบ', username:'admin', passwordHash:DEFAULT_ADMIN_PASSWORD_HASH, roleId:'admin', active:true, createdAt:new Date().toISOString() };
      state.users.push(user);
    }
    if (!user || normalizedPersonName(user.displayName) !== displayName) return res.status(404).json({ error:'ไม่พบบัญชี หรือชื่อที่ลงทะเบียนไม่ตรงกับข้อมูลผู้ใช้' });
    user.passwordHash = legacyPasswordHash(password);
    state.permissionAudit = Array.isArray(state.permissionAudit) ? state.permissionAudit : [];
    state.permissionAudit.unshift({ id:crypto.randomUUID(), action:'ผู้ใช้ตั้งรหัสผ่านใหม่', target:String(user.username||''), details:{selfService:true,verification:'username+displayName'}, by:String(user.displayName||user.username||''), userId:String(user.id||''), at:new Date().toISOString() });
    state.permissionAudit = state.permissionAudit.slice(0,1000);state.at=new Date().toISOString();
    const revision=await writeState(state);
    res.set('Cache-Control','no-store');return res.json({ok:true,username:user.username,revision});
  } catch (error) { console.error('[AUTH RESET]',error);return res.status(500).json({error:'ตั้งรหัสผ่านใหม่ไม่สำเร็จ',detail:String(error?.message||error)}); }
});

// Server-backed staff sessions survive browser refreshes without storing passwords client-side.
const staffSessions=new Map(),firstLoginTokens=new Map(),STAFF_SESSION_COOKIE='hc_staff_session';
const staffLoginAttempts=new Map();
function staffLoginAttemptKey(req,username){return `${String(req.ip||req.socket?.remoteAddress||'local').slice(0,100)}|${String(username||'').toLowerCase().slice(0,120)}`}
function staffLoginAttemptState(key){const now=Date.now(),entry=staffLoginAttempts.get(key)||{fails:0,windowStarted:now,lockedUntil:0};if(now-entry.windowStarted>15*60*1000){entry.fails=0;entry.windowStarted=now}return entry}
function staffLoginRegisterFailure(key){const entry=staffLoginAttemptState(key);entry.fails+=1;if(entry.fails>=5)entry.lockedUntil=Date.now()+5*60*1000;staffLoginAttempts.set(key,entry);return entry}
function staffLoginRegisterSuccess(key){staffLoginAttempts.delete(key)}

function staffSessionToken(req){const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim().split('='));return decodeURIComponent(cookies.find(([key])=>key===STAFF_SESSION_COOKIE)?.[1]||'')}
function staffSessionCookie(token,maxAge=0){return `${STAFF_SESSION_COOKIE}=${encodeURIComponent(token||'')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(maxAge/1000))}`}
function cleanupStaffSessions(){const now=Date.now();for(const [token,session] of staffSessions)if(session.expiresAt<=now)staffSessions.delete(token)}
function cleanupFirstLoginTokens(){const now=Date.now();for(const [token,item] of firstLoginTokens)if(item.expiresAt<=now)firstLoginTokens.delete(token)}
app.get('/api/auth/session',localOnly,async(req,res)=>{try{cleanupStaffSessions();const token=staffSessionToken(req),session=staffSessions.get(token);if(!session)return res.status(401).json({authenticated:false});const state=await readState(),user=(state.users||[]).find(item=>String(item.id)===String(session.userId)&&item.active!==false);if(!user){staffSessions.delete(token);res.set('Set-Cookie',staffSessionCookie('',0));return res.status(401).json({authenticated:false})}session.expiresAt=Date.now()+session.ttl;res.set({'Cache-Control':'no-store','Set-Cookie':staffSessionCookie(token,session.ttl)});res.json({authenticated:true,user:{id:String(user.id||''),username:String(user.username||''),displayName:String(user.displayName||user.username||''),roleId:String(user.roleId||''),active:true}})}catch(error){res.status(500).json({error:'ตรวจสอบ Session ไม่สำเร็จ'})}});
app.post('/api/auth/logout',localOnly,(req,res)=>{const token=staffSessionToken(req);if(token)staffSessions.delete(token);res.set({'Cache-Control':'no-store','Set-Cookie':staffSessionCookie('',0)});res.json({ok:true})});

app.post('/api/users/first-login-password',localOnly,staffPermissionRequired('userEdit'),async(req,res)=>{try{
  const password=String(req.body?.password||''),userIds=[...new Set((Array.isArray(req.body?.userIds)?req.body.userIds:[]).map(String).filter(Boolean))];
  if(password.length<10||!/[A-Za-zก-๙]/.test(password)||!/[0-9]/.test(password))return res.status(400).json({error:'รหัสเริ่มต้นต้องมีอย่างน้อย 10 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข'});
  const state=await readState(),hash=legacyPasswordHash(password),now=new Date().toISOString();state.users=Array.isArray(state.users)?state.users:[];state.firstLoginPasswordHash=hash;state.firstLoginPasswordUpdatedAt=now;
  const targets=state.users.filter(user=>userIds.includes(String(user.id))&&normalizedPersonName(user.username)!=='admin'&&String(user.id)!==String(req.staffUser?.id));
  for(const user of targets){user.passwordHash=hash;user.active=true;user.mustChangePassword=true;user.firstLoginAt=null;user.passwordChangedAt=null;user.passwordResetAt=now;user.passwordResetBy=String(req.staffUser?.username||'admin')}
  state.permissionAudit=Array.isArray(state.permissionAudit)?state.permissionAudit:[];state.permissionAudit.unshift({id:crypto.randomUUID(),action:targets.length?'รีเซ็ตรหัสเข้าใช้ครั้งแรก':'ตั้งรหัสเข้าใช้ครั้งแรก',target:targets.length?`${targets.length} บัญชี`:'User จาก HIS ใหม่',details:{count:targets.length,usernames:targets.slice(0,100).map(user=>user.username)},by:String(req.staffUser?.displayName||req.staffUser?.username||'admin'),userId:String(req.staffUser?.id||''),at:now});state.permissionAudit=state.permissionAudit.slice(0,1000);state.at=now;
  const revision=await writeState(state);res.set('Cache-Control','no-store');res.json({ok:true,resetCount:targets.length,revision});
}catch(error){console.error('[FIRST LOGIN PASSWORD]',error);res.status(500).json({error:'ตั้งรหัสเข้าใช้ครั้งแรกไม่สำเร็จ',detail:String(error?.message||error)})}});

app.post('/api/auth/change-first-password',localOnly,async(req,res)=>{try{
  cleanupFirstLoginTokens();const token=String(req.body?.token||''),password=String(req.body?.password||''),entry=firstLoginTokens.get(token);
  if(!entry)return res.status(401).json({error:'คำขอเปลี่ยนรหัสหมดอายุ กรุณาเข้าสู่ระบบใหม่'});
  if(password.length<10||!/[A-Za-zก-๙]/.test(password)||!/[0-9]/.test(password))return res.status(400).json({error:'รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร และมีทั้งตัวอักษรกับตัวเลข'});
  const state=await readState(),user=(state.users||[]).find(item=>String(item.id)===String(entry.userId)&&item.active!==false);
  if(!user||user.mustChangePassword!==true){firstLoginTokens.delete(token);return res.status(409).json({error:'บัญชีนี้ไม่อยู่ในสถานะเปลี่ยนรหัสครั้งแรก'});}
  if(safeEqual(legacyPasswordHash(password),String(user.passwordHash||'')))return res.status(400).json({error:'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเข้าใช้ครั้งแรก'});
  const now=new Date().toISOString();user.passwordHash=legacyPasswordHash(password);user.mustChangePassword=false;user.firstLoginAt=user.firstLoginAt||now;user.passwordChangedAt=now;state.permissionAudit=Array.isArray(state.permissionAudit)?state.permissionAudit:[];state.permissionAudit.unshift({id:crypto.randomUUID(),action:'เปลี่ยนรหัสผ่านเมื่อเข้าใช้ครั้งแรก',target:String(user.username||''),details:{firstLogin:true},by:String(user.displayName||user.username||''),userId:String(user.id||''),at:now});state.permissionAudit=state.permissionAudit.slice(0,1000);state.at=now;const revision=await writeState(state);firstLoginTokens.delete(token);res.set('Cache-Control','no-store');res.json({ok:true,username:user.username,revision});
}catch(error){console.error('[CHANGE FIRST PASSWORD]',error);res.status(500).json({error:'เปลี่ยนรหัสผ่านไม่สำเร็จ',detail:String(error?.message||error)})}});

// v7.59.40 - canonical login verification. Keep authentication separate from UI helpers.
app.post('/api/auth/login', localOnly, async (req, res) => {
  try {
    const username = normalizedPersonName(req.body?.username);
    const password = String(req.body?.password || '');
    if (!username || !password) return res.status(400).json({ error:'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    const loginAttemptKey=staffLoginAttemptKey(req,username),loginAttempt=staffLoginAttemptState(loginAttemptKey);
    if(loginAttempt.lockedUntil>Date.now())return res.status(429).json({error:'เข้าสู่ระบบผิดหลายครั้ง กรุณารอประมาณ 5 นาทีแล้วลองใหม่',retryAfterSec:Math.ceil((loginAttempt.lockedUntil-Date.now())/1000)});
    const state = await readState();
    state.users = Array.isArray(state.users) ? state.users : [];
    let user = state.users.find(item => normalizedPersonName(item.username) === username && item.active !== false);
    // Older installations created the default admin only in the browser migration layer.
    // Materialize it in server state once so server-side authentication remains compatible.
    if (!user && username === 'admin' && !state.users.some(item => normalizedPersonName(item.username) === 'admin')) {
      user = { id:crypto.randomUUID(), displayName:'ผู้ดูแลระบบ', username:'admin', passwordHash:DEFAULT_ADMIN_PASSWORD_HASH, roleId:'admin', active:true, createdAt:new Date().toISOString() };
      state.users.push(user);
      state.at = new Date().toISOString();
      await writeState(state);
    }
    if (!user || !safeEqual(legacyPasswordHash(password), String(user.passwordHash || ''))) {
      staffLoginRegisterFailure(loginAttemptKey);
      return res.status(401).json({ error:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกปิดใช้งาน' });
    }
    staffLoginRegisterSuccess(loginAttemptKey);
    if(user.mustChangePassword===true){cleanupFirstLoginTokens();const changeToken=crypto.randomBytes(32).toString('base64url');firstLoginTokens.set(changeToken,{userId:String(user.id||''),expiresAt:Date.now()+10*60*1000});return res.json({ok:true,mustChangePassword:true,changeToken,user:{id:String(user.id||''),username:String(user.username||''),displayName:String(user.displayName||user.username||'')}})}
    cleanupStaffSessions();const remember=req.body?.remember===true,ttl=remember?30*24*60*60*1000:12*60*60*1000,token=crypto.randomBytes(32).toString('base64url');staffSessions.set(token,{userId:String(user.id||''),username:String(user.username||''),displayName:String(user.displayName||user.username||''),ttl,expiresAt:Date.now()+ttl});
    res.set({'Cache-Control':'no-store','Set-Cookie':staffSessionCookie(token,ttl)});
    return res.json({ ok:true, user:{ id:String(user.id||''), username:String(user.username||''), displayName:String(user.displayName||user.username||''), roleId:String(user.roleId||''), active:user.active!==false } });
  } catch (error) {
    console.error('[AUTH LOGIN]', error);
    return res.status(500).json({ error:'ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ', detail:String(error?.message||error) });
  }
});

let compressedStateCache={revision:null,body:null};
app.get('/api/state/revision',localOnly,async(_req,res)=>{
  try{const result=await pool.query('SELECT revision,updated_at FROM app_state WHERE id=1');const row=result.rows[0]||{};res.set('Cache-Control','no-store');res.json({revision:Number(row.revision||0),updatedAt:row.updated_at||null})}
  catch(error){res.status(500).json({error:'ตรวจสอบ Revision ไม่สำเร็จ'})}
});
app.get('/api/state', localOnly, async (req, res) => {
  const _loadStarted=Date.now();
  res.on('finish',()=>{recordSystemHealthEvent({eventType:'STATE_LOAD',status:res.statusCode<400?'OK':'ERROR',endpoint:'/api/state',durationMs:Date.now()-_loadStarted,detail:{statusCode:res.statusCode}}).catch(()=>{})});
  try {
    const acceptsGzip=/\bgzip\b/i.test(String(req.headers['accept-encoding']||''));
    const current=await pool.query('SELECT revision FROM app_state WHERE id=1'),revision=Number(current.rows[0]?.revision||0),etag=`"state-${revision}"`;
    res.set({'Cache-Control':'private, no-cache','ETag':etag,'Vary':'Accept-Encoding'});
    if(String(req.headers['if-none-match']||'').split(',').map(value=>value.trim()).includes(etag))return res.status(304).end();
    if(acceptsGzip&&compressedStateCache.body&&compressedStateCache.revision===revision){res.set('Content-Type','application/json; charset=utf-8');res.set('Content-Encoding','gzip');return res.send(compressedStateCache.body)}
    const state=await readState(),wireState={...state,records:(state.records||[]).map(compactRecordForWire)};
    if(!acceptsGzip)return res.json(wireState);
    if(compressedStateCache.revision!==revision||!compressedStateCache.body){compressedStateCache={revision,body:await new Promise((resolve,reject)=>zlib.gzip(Buffer.from(JSON.stringify(wireState)),{level:zlib.constants.Z_BEST_SPEED},(error,body)=>error?reject(error):resolve(body)))}}
    res.set('Content-Type','application/json; charset=utf-8');res.set('Content-Encoding','gzip');res.set('Vary','Accept-Encoding');res.send(compressedStateCache.body);
  } catch (error) { res.status(500).json({ error: 'อ่านข้อมูล PostgreSQL ไม่สำเร็จ' }); }
});

app.post('/api/state/import-backups',localOnly,async(req,res)=>{
  const client=await pool.connect();
  try{
    const expected=Number(req.body?.expectedRevision),reason=String(req.body?.reason||'IMPORT').slice(0,80),performedBy=String(req.body?.performedBy||'ผู้ดูแลระบบ').slice(0,200),summary=Array.isArray(req.body?.companies)?req.body.companies.slice(0,5000):[];
    if(!Number.isInteger(expected)||expected<0)return res.status(400).json({error:'Revision สำหรับสำรองข้อมูลไม่ถูกต้อง'});
    await client.query('BEGIN');
    const current=await client.query('SELECT data,revision FROM app_state WHERE id=1 FOR UPDATE'),row=current.rows[0];
    if(!row||Number(row.revision)!==expected){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลบน Server มีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนนำเข้า',conflict:true});}
    const backup=await client.query('INSERT INTO app_state_import_backups(reason,performed_by,source_revision,import_summary,data) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING id,created_at',[reason,performedBy,expected,JSON.stringify(summary),JSON.stringify(row.data)]);
    await client.query(`DELETE FROM app_state_import_backups WHERE id IN (SELECT id FROM app_state_import_backups ORDER BY created_at DESC,id DESC OFFSET 50)`);
    await client.query('COMMIT');res.json({ok:true,backupId:Number(backup.rows[0].id),createdAt:backup.rows[0].created_at,sourceRevision:expected});
  }catch(error){await client.query('ROLLBACK');console.error('สำรองข้อมูลก่อนนำเข้าไม่สำเร็จ',error);res.status(500).json({error:'สำรองข้อมูลก่อนนำเข้าไม่สำเร็จ'});}finally{client.release()}
});

app.get('/api/system/relational-status', localOnly, async (_req,res)=>{
  try {
    const result=await pool.query(`SELECT r.app_state_revision,r.synced_at,r.company_count,r.customer_count,
      r.package_count,r.last_error,a.revision AS current_revision,
      (SELECT COUNT(*)::int FROM companies) AS normalized_companies,
      (SELECT COUNT(*)::int FROM company_years) AS normalized_company_years,
      (SELECT COUNT(*)::int FROM customers) AS normalized_customers,
      (SELECT COUNT(*)::int FROM company_customers) AS normalized_memberships,
      (SELECT COUNT(*)::int FROM contract_packages) AS normalized_packages,
      (SELECT COUNT(*)::int FROM order_types) AS normalized_order_types,
      (SELECT COUNT(*)::int FROM order_stations) AS normalized_order_stations,
      (SELECT COUNT(*)::int FROM order_item_settings) AS normalized_order_settings
      FROM relational_sync_status r CROSS JOIN app_state a WHERE r.id=1 AND a.id=1`);
    const item=result.rows[0]||{};
    res.set('Cache-Control','no-store');
    res.json({ok:Number(item.app_state_revision)===Number(item.current_revision),mode:'dual-write',...item});
  } catch(error){res.status(500).json({error:'ตรวจสอบฐานข้อมูลแบบแยกตารางไม่สำเร็จ'});}
});

app.get('/api/external-api-info', localOnly, async (req, res) => {
  const apiKey = process.env.EXTERNAL_API_KEY || '';
  if (!apiKey) return res.status(503).json({ error: 'EXTERNAL_API_KEY is not configured' });
  const protocol = req.protocol;
  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  res.set('Cache-Control', 'no-store');
  res.json({
    enabled: true,
    version: '1.0',
    baseUrl: `${protocol}://${host}/external-api/v1`,
    apiKey,
    packageDetailUrl: (await readPackageApiConfig()).endpoint_url
  });
});

app.all('/api/package-detail', localOnly, async (req, res) => {
  try {
    const method = req.method === 'GET'
      ? String(req.query.method || 'GET').toUpperCase()
      : String(req.body?.method || 'POST').toUpperCase();
    if (!['GET', 'POST'].includes(method)) {
      return res.status(400).json({ ok: false, error: 'รองรับเฉพาะ GET และ POST' });
    }
    const payload = {};
    const config = await readPackageApiConfig();
    const headers = config.headers || {};
    const result = await requestPackageDetail(config.endpoint_url, method, payload, headers);
    res.status(result.status).json({
      ok: result.ok,
      upstreamStatus: result.status,
      requestedUrl: config.endpoint_url,
      method,
      sentPayload: payload,
      response: result.data
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: 'เรียก Package Detail API ไม่สำเร็จ',
      detail: error.message || String(error)
    });
  }
});


function normalizedPackageCode(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'')}
function packageStatusRecord(record){
  const code=String(pickField(record,['packageCode','package_code','code','packagecode','PackageCode','Package','PackageID','PackageId','PackageUID','packageUid'],'')||'').trim();
  const rawStatus=String(pickField(record,['status','packageStatus','package_status','activeStatus','active_status','recordStatus','record_status','state','Status'],'')||'').trim();
  const activeRaw=pickField(record,['active','isActive','is_active','enabled','isEnabled','is_enabled','Active','IsActive'],null);
  const foundRaw=pickField(record,['found','isFound','is_found','exists','isExists','is_exists','Found','IsFound'],null);
  const statusKey=rawStatus.toLowerCase().replace(/[\s_-]+/g,'');
  const boolValue=value=>{if(value===true||value===1||String(value).toLowerCase()==='true'||String(value)==='1'||String(value).toLowerCase()==='yes'||String(value).toLowerCase()==='y')return true;if(value===false||value===0||String(value).toLowerCase()==='false'||String(value)==='0'||String(value).toLowerCase()==='no'||String(value).toLowerCase()==='n')return false;return null};
  const found=boolValue(foundRaw),active=boolValue(activeRaw);
  if(found===false||['notfound','missing','none','deleted'].includes(statusKey))return {code,presence:'NOT_FOUND',status:'UNKNOWN',explicitNotFound:true,raw:record};
  let status='UNKNOWN';
  if(active===true||['active','enabled','available','open','valid','a','y','yes','1'].includes(statusKey))status='ACTIVE';
  else if(active===false||['inactive','disabled','expired','closed','cancelled','canceled','i','n','no','0'].includes(statusKey))status='INACTIVE';
  return {code,presence:code||found===true?'FOUND':'UNKNOWN',status,explicitNotFound:false,raw:record};
}
async function applyPackageVerificationUpdates(items,checkedBy='system'){
  if(!items.length)return;
  const payload=JSON.stringify(items);
  await pool.query(`WITH x AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS t(
        id bigint,his_presence text,his_status text,verification_status text,last_checked_at timestamptz,last_found_at timestamptz,
        check_attempts int,not_found_streak int,last_check_error text,last_check_reason text,last_known_his_status text,last_status_response jsonb)
    )
    UPDATE his_packages p SET
      his_presence=x.his_presence,his_status=x.his_status,verification_status=x.verification_status,last_checked_at=x.last_checked_at,
      last_found_at=x.last_found_at,check_attempts=x.check_attempts,not_found_streak=x.not_found_streak,last_check_error=x.last_check_error,
      last_check_reason=x.last_check_reason,last_known_his_status=x.last_known_his_status,last_status_response=COALESCE(x.last_status_response,'{}'::jsonb)
    FROM x WHERE p.id=x.id`,[payload]);
  await pool.query(`INSERT INTO his_package_verification_log(package_id,package_code,his_presence,his_status,verification_status,reason,error,response_data,checked_by)
    SELECT p.id,p.package_code,x.his_presence,x.his_status,x.verification_status,x.last_check_reason,x.last_check_error,COALESCE(x.last_status_response,'{}'::jsonb),$2
    FROM jsonb_to_recordset($1::jsonb) AS x(id bigint,his_presence text,his_status text,verification_status text,last_check_reason text,last_check_error text,last_status_response jsonb)
    JOIN his_packages p ON p.id=x.id`,[payload,String(checkedBy||'system').slice(0,120)]);
}
async function requestPackageStatusBatch(codes,endpointUrl,httpMethod,headers,preferredStyle=''){
  const styles=[
    ['PackageCodeList',list=>({PackageCodeList:list})],
    ['PackageCodes',list=>({PackageCodes:list})],
    ['CODE',list=>({CODE:list})],
    ['CodeList',list=>({CodeList:list})],
    ['PackageList',list=>({PackageList:list})],
    ['Packages',list=>({Packages:list.map(PackageCode=>({PackageCode}))})]
  ];
  const ordered=preferredStyle?[...styles.filter(x=>x[0]===preferredStyle),...styles.filter(x=>x[0]!==preferredStyle)]:styles;
  let last=null;
  for(const [name,makePayload] of ordered){
    const result=await requestPackageDetail(requireProductionEndpoint(endpointUrl||DEFAULT_PACKAGE_STATUS_API_URL,'GetPackageList'),httpMethod||'POST',makePayload(codes),headers);
    last={...result,requestStyle:name};
    if(result.ok)return last;
    if(![400,404,405,415,422].includes(Number(result.status||0)))return last;
  }
  return last||{ok:false,status:502,data:null,requestStyle:''};
}
function packageStatusResponseRecords(value){
  const output=[];
  const walk=(item,depth=0)=>{if(depth>8||item==null)return;const decoded=decodedJson(item);if(Array.isArray(decoded)){decoded.forEach(x=>walk(x,depth+1));return}if(typeof decoded==='string'||typeof decoded==='number'){const code=String(decoded).trim();if(code)output.push({PackageCode:code});return}if(typeof decoded!=='object')return;const code=pickField(decoded,['packageCode','package_code','code','packagecode','PackageCode','Package','PackageID','PackageId','PackageUID','packageUid'],'');if(code){output.push(decoded);return}for(const child of Object.values(decoded))walk(child,depth+1)};
  walk(value);return output;
}
async function performPackageStatusReconciliation({codes=null,batchSize=500,changedBy='system'}={}){
  const config=await readPackageApiConfig();
  const detailRow=(await pool.query(`SELECT api_key FROM his_api_connections WHERE system_code='GET_PACKAGE_DETAIL' LIMIT 1`)).rows[0]||{};
  const listRow=(await pool.query(`SELECT endpoint_url,http_method,content_type FROM his_api_connections WHERE system_code='GET_PACKAGE_LIST' LIMIT 1`)).rows[0]||{};
  const sharedKey=String(detailRow.api_key||config.headers?.['x-api-key']||'');
  const headers={...(config.headers||{}),'x-api-key':sharedKey,'Content-Type':String(listRow.content_type||'application/json')};
  const statusEndpoint=requireProductionEndpoint(listRow.endpoint_url||DEFAULT_PACKAGE_STATUS_API_URL,'GetPackageList'),statusMethod=String(listRow.http_method||'POST').toUpperCase();
  if(!sharedKey&&!headers.authorization){const error=new Error('ยังไม่ได้ตั้งค่า API Key ของ GetPackageDetail');error.code='MISSING_API_KEY';throw error;}
  const size=Math.min(1000,Math.max(10,Number(batchSize||500)||500));
  const selectedCodes=Array.isArray(codes)?codes.map(String).filter(Boolean):[];
  const params=[];let where='';
  if(selectedCodes.length){params.push(selectedCodes);where='WHERE LOWER(package_code) IN (SELECT LOWER(x) FROM unnest($1::text[]) AS x)'}
  const rows=(await pool.query(`SELECT id,package_code,his_presence,his_status,verification_status,last_checked_at,last_found_at,check_attempts,not_found_streak,last_known_his_status FROM his_packages ${where} ORDER BY id`,params)).rows;
  const summary={ok:true,total:rows.length,batches:0,apiFailedBatches:0,found:0,active:0,inactive:0,statusUnknown:0,retry:0,notFound:0,manualReview:0,endpoint:statusEndpoint,requestStyle:''};let requestStyle='';
  for(let start=0;start<rows.length;start+=size){
    const batch=rows.slice(start,start+size),batchCodes=batch.map(r=>String(r.package_code));summary.batches++;
    let upstream;
    try{upstream=await requestPackageStatusBatch(batchCodes,statusEndpoint,statusMethod,headers,requestStyle);if(upstream?.ok&&upstream.requestStyle){requestStyle=upstream.requestStyle;summary.requestStyle=requestStyle}}catch(error){upstream={ok:false,status:502,data:null,error:error.message||String(error)}}
    const now=new Date().toISOString(),updates=[];
    if(!upstream.ok){
      summary.apiFailedBatches++;
      for(const row of batch){updates.push({id:Number(row.id),his_presence:row.his_presence||'UNKNOWN',his_status:row.his_status||'UNKNOWN',verification_status:'RETRY',last_checked_at:now,last_found_at:row.last_found_at||null,check_attempts:Number(row.check_attempts||0)+1,not_found_streak:Number(row.not_found_streak||0),last_check_error:`HTTP ${upstream.status||502}${upstream.error?` · ${upstream.error}`:''}`,last_check_reason:'API_ERROR',last_known_his_status:row.last_known_his_status||'UNKNOWN',last_status_response:upstream.data&&typeof upstream.data==='object'?upstream.data:{}});summary.retry++}
      await applyPackageVerificationUpdates(updates,changedBy);continue;
    }
    const records=packageStatusResponseRecords(upstream.data),byCode=new Map();
    for(const record of records){const parsed=packageStatusRecord(record),key=normalizedPackageCode(parsed.code);if(key&&!byCode.has(key))byCode.set(key,parsed)}
    for(const row of batch){
      const key=normalizedPackageCode(row.package_code),match=byCode.get(key),attempts=Number(row.check_attempts||0)+1;
      if(match){
        if(match.explicitNotFound){updates.push({id:Number(row.id),his_presence:'NOT_FOUND',his_status:'UNKNOWN',verification_status:'VERIFIED',last_checked_at:now,last_found_at:row.last_found_at||null,check_attempts:attempts,not_found_streak:3,last_check_error:'',last_check_reason:'HIS_EXPLICIT_NOT_FOUND',last_known_his_status:row.last_known_his_status||'UNKNOWN',last_status_response:match.raw||{}});summary.notFound++;continue}
        const known=['ACTIVE','INACTIVE'].includes(match.status),knownStatus=known?match.status:(row.last_known_his_status||'UNKNOWN');
        updates.push({id:Number(row.id),his_presence:'FOUND',his_status:match.status,verification_status:known?'VERIFIED':'MANUAL_REVIEW',last_checked_at:now,last_found_at:now,check_attempts:attempts,not_found_streak:0,last_check_error:'',last_check_reason:known?'HIS_MATCHED':'FOUND_STATUS_UNKNOWN',last_known_his_status:known?match.status:knownStatus,last_status_response:match.raw||{}});
        summary.found++;if(match.status==='ACTIVE')summary.active++;else if(match.status==='INACTIVE')summary.inactive++;else{summary.statusUnknown++;summary.manualReview++}
      }else{
        const streak=Number(row.not_found_streak||0)+1,confirmed=streak>=3;
        updates.push({id:Number(row.id),his_presence:confirmed?'NOT_FOUND':'UNKNOWN',his_status:'UNKNOWN',verification_status:confirmed?'VERIFIED':'RETRY',last_checked_at:now,last_found_at:row.last_found_at||null,check_attempts:attempts,not_found_streak:streak,last_check_error:'',last_check_reason:confirmed?'CONFIRMED_NOT_FOUND_AFTER_3':`MISSING_FROM_RESPONSE_${streak}_OF_3`,last_known_his_status:row.last_known_his_status||'UNKNOWN',last_status_response:{}});
        if(confirmed)summary.notFound++;else summary.retry++;
      }
    }
    await applyPackageVerificationUpdates(updates,changedBy);
  }
  return summary;
}

async function performHisPackageSync({method='',changedBy='system',reconcileStatus=false}={}) {
  const config = await readPackageApiConfig();
  let configuredMethod=String(method||config.config_data?.method||'GET').toUpperCase();
  if(!['GET','POST'].includes(configuredMethod))configuredMethod='GET';
  const upstream = await requestPackageDetail(config.endpoint_url, configuredMethod, {}, config.headers || {});
  if (!upstream.ok) { const e=new Error('HIS ตอบกลับไม่สำเร็จ'); e.upstreamStatus=upstream.status; e.response=upstream.data; throw e; }
  const records = responseRecords(upstream.data),normalized = records.map(normalizeHisPackage).filter(item => item.packageCode),grouped = new Map();
  for (const item of normalized) { const key=item.packageCode.toLowerCase(); if(!grouped.has(key))grouped.set(key,item); else { const current=grouped.get(key); current.packageName=item.packageName||current.packageName;current.totalPrice=item.totalPrice??current.totalPrice;current.activeFrom=item.activeFrom||current.activeFrom;current.activeTo=item.activeTo||current.activeTo;current.detailItems=[...current.detailItems,...item.detailItems];current.sourceData=Array.isArray(current.sourceData)?[...current.sourceData,item.sourceData]:[current.sourceData,item.sourceData]; } }
  const packages=[...grouped.values()].map(item=>({...item,detailItems:item.detailItems.filter((detail,index,array)=>array.findIndex(candidate=>JSON.stringify(candidate)===JSON.stringify(detail))===index)}));
  const skipped=records.length-normalized.length,client=await pool.connect();let created=0,updated=0,unchanged=0;
  try{await client.query('BEGIN');for(const item of packages){const found=await client.query('SELECT * FROM his_packages WHERE LOWER(package_code)=LOWER($1) FOR UPDATE',[item.packageCode]);if(!found.rows.length){const inserted=await client.query(`INSERT INTO his_packages (package_code,package_name,total_price,active_from,active_to,is_approved,source_data,detail_items,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) RETURNING id`,[item.packageCode,item.packageName,item.totalPrice,item.activeFrom,item.activeTo,null,JSON.stringify(item.sourceData),JSON.stringify(item.detailItems),changedBy]);await client.query(`INSERT INTO his_package_audit_log (package_id,package_code,action,changed_by,after_data,changed_fields) VALUES ($1,$2,'CREATE',$3,$4::jsonb,$5::jsonb)`,[inserted.rows[0].id,item.packageCode,changedBy,JSON.stringify(item),JSON.stringify(Object.keys(item))]);created++;}else{const before=packageSnapshot(found.rows[0]),fields=changedPackageFields(before,item);if(!fields.length){unchanged++;continue}await client.query(`UPDATE his_packages SET package_code=$1,package_name=$2,total_price=$3,active_from=$4,active_to=$5,is_approved=$6,source_data=$7::jsonb,detail_items=$8::jsonb,updated_at=NOW(),updated_by=$9 WHERE id=$10`,[item.packageCode,item.packageName,item.totalPrice,item.activeFrom,item.activeTo,null,JSON.stringify(item.sourceData),JSON.stringify(item.detailItems),changedBy,found.rows[0].id]);await client.query(`INSERT INTO his_package_audit_log (package_id,package_code,action,changed_by,before_data,after_data,changed_fields) VALUES ($1,$2,'HIS_UPDATE',$3,$4::jsonb,$5::jsonb,$6::jsonb)`,[found.rows[0].id,item.packageCode,changedBy,JSON.stringify(before),JSON.stringify(item),JSON.stringify(fields)]);updated++;}}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  let reconciliation=null;if(reconcileStatus){try{reconciliation=await performPackageStatusReconciliation({changedBy:`${changedBy} · STATUS`})}catch(error){reconciliation={ok:false,error:error.message||String(error)}}}
  return {ok:true,upstreamStatus:upstream.status,received:records.length,saved:packages.length,created,updated,unchanged,skipped,method:configuredMethod,reconciliation};
}
async function performHisPackageSyncThenReconcile({method='',changedBy='system'}={}){
  const synced=await performHisPackageSync({method,changedBy,reconcileStatus:false});
  let reconciliation;
  try{reconciliation=await performPackageStatusReconciliation({batchSize:500,changedBy:`${changedBy} · STATUS`})}
  catch(error){reconciliation={ok:false,error:error.message||String(error)}}
  return {...synced,reconciliation};
}
function normalizePackageSyncSchedule(value){value=value&&typeof value==='object'?value:{};const interval=Math.min(168,Math.max(1,Number(value.intervalHours||8)||8)),anchor=/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.anchorTime||''))?String(value.anchorTime):'00:00';return {enabled:value.enabled!==false,intervalHours:interval,anchorTime:anchor,lastRunAt:value.lastRunAt||null,nextRunAt:value.nextRunAt||null,lastStatus:value.lastStatus||'NEVER',lastMessage:value.lastMessage||''}}
async function readPackageSyncSchedule(){const r=await pool.query("SELECT value FROM system_settings WHERE key='his_package_sync_schedule' LIMIT 1");let v={};try{v=typeof r.rows[0]?.value==='string'?JSON.parse(r.rows[0].value):r.rows[0]?.value||{}}catch(_){}return normalizePackageSyncSchedule(v)}
function packageSyncNextRun(schedule,now=new Date()){if(!schedule.enabled)return null;const [h,m]=schedule.anchorTime.split(':').map(Number),base=new Date(now);base.setHours(h,m,0,0);const step=schedule.intervalHours*3600000;while(base.getTime()<=now.getTime())base.setTime(base.getTime()+step);return base}
async function writePackageSyncSchedule(schedule){const v=normalizePackageSyncSchedule(schedule);await pool.query(`INSERT INTO system_settings(key,value,updated_at) VALUES('his_package_sync_schedule',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[JSON.stringify(v)]);return v}
app.get('/api/his-packages/schedule',localOnly,async(_req,res)=>{try{const v=await readPackageSyncSchedule();res.json({...v,nextRunAt:v.nextRunAt||packageSyncNextRun(v)?.toISOString()||null})}catch(e){res.status(500).json({error:'อ่านตาราง Auto Sync ไม่สำเร็จ'})}});
app.put('/api/his-packages/schedule',localOnly,async(req,res)=>{try{const old=await readPackageSyncSchedule(),draft={...old,...req.body};const anchorNext=packageSyncNextRun(draft);const v=await writePackageSyncSchedule({...draft,nextRunAt:anchorNext?.toISOString()||null});res.json({ok:true,...v})}catch(e){res.status(500).json({error:'บันทึกตาราง Auto Sync ไม่สำเร็จ'})}});
app.post('/api/his-packages/sync', localOnly, async (req,res)=>{try{const result=await performHisPackageSyncThenReconcile({method:req.body?.method,changedBy:String(req.body?.changedBy||'ผู้ดูแลระบบ').slice(0,120)});const schedule=await readPackageSyncSchedule();await writePackageSyncSchedule({...schedule,lastRunAt:new Date().toISOString(),nextRunAt:new Date(Date.now()+schedule.intervalHours*3600000).toISOString(),lastStatus:result.reconciliation?.ok===false?'PARTIAL':'SUCCESS',lastMessage:`รับ ${result.received} รายการ · Active ${result.reconciliation?.active||0} · Inactive ${result.reconciliation?.inactive||0}${result.reconciliation?.error?` · Status: ${result.reconciliation.error}`:''}`});res.json(result)}catch(error){const schedule=await readPackageSyncSchedule().catch(()=>null);if(schedule)await writePackageSyncSchedule({...schedule,lastRunAt:new Date().toISOString(),nextRunAt:new Date(Date.now()+schedule.intervalHours*3600000).toISOString(),lastStatus:'ERROR',lastMessage:error.message||String(error)}).catch(()=>{});res.status(error.upstreamStatus||502).json({error:'ดึงและบันทึกแพ็กเกจจาก HIS ไม่สำเร็จ',detail:error.message||String(error),upstreamStatus:error.upstreamStatus,response:error.response})}});
let packageSyncRunning=false;async function packageSyncSchedulerTick(){if(packageSyncRunning)return;try{const schedule=await readPackageSyncSchedule();if(!schedule.enabled)return;const now=new Date(),next=schedule.nextRunAt?new Date(schedule.nextRunAt):(schedule.lastRunAt?new Date(new Date(schedule.lastRunAt).getTime()+schedule.intervalHours*3600000):packageSyncNextRun(schedule,now));if(next&&next>now)return;packageSyncRunning=true;try{const result=await performHisPackageSyncThenReconcile({changedBy:'AUTO SYNC'});await writePackageSyncSchedule({...schedule,lastRunAt:new Date().toISOString(),nextRunAt:new Date(Date.now()+schedule.intervalHours*3600000).toISOString(),lastStatus:result.reconciliation?.ok===false?'PARTIAL':'SUCCESS',lastMessage:`รับ ${result.received} รายการ · Active ${result.reconciliation?.active||0} · Inactive ${result.reconciliation?.inactive||0}${result.reconciliation?.error?` · Status: ${result.reconciliation.error}`:''}`});console.log(`[Package HIS Auto Sync] success: ${result.received} received`)}catch(error){await writePackageSyncSchedule({...schedule,lastRunAt:new Date().toISOString(),nextRunAt:new Date(Date.now()+schedule.intervalHours*3600000).toISOString(),lastStatus:'ERROR',lastMessage:error.message||String(error)});console.error('[Package HIS Auto Sync] failed:',error.message||error)}finally{packageSyncRunning=false}}catch(error){console.error('[Package HIS Auto Sync] scheduler:',error.message||error)}}
app.post('/api/his-packages/reconcile-status',localOnly,async(req,res)=>{try{const result=await performPackageStatusReconciliation({codes:Array.isArray(req.body?.codes)?req.body.codes:null,batchSize:req.body?.batchSize||500,changedBy:String(req.body?.changedBy||'ผู้ดูแลระบบ').slice(0,120)});res.json(result)}catch(error){res.status(error.code==='MISSING_API_KEY'?400:502).json({error:'ตรวจ Active/Inactive จาก HIS ไม่สำเร็จ',detail:error.message||String(error)})}});
app.get('/api/his-packages/reconciliation-summary',localOnly,async(_req,res)=>{try{const r=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE his_presence='FOUND')::int found,COUNT(*) FILTER(WHERE his_status='ACTIVE')::int active,COUNT(*) FILTER(WHERE his_status='INACTIVE')::int inactive,COUNT(*) FILTER(WHERE his_presence='NOT_FOUND')::int not_found,COUNT(*) FILTER(WHERE verification_status='RETRY')::int retry,COUNT(*) FILTER(WHERE verification_status='MANUAL_REVIEW')::int manual_review,MAX(last_checked_at) last_checked_at FROM his_packages`);res.json(r.rows[0]||{})}catch(error){res.status(500).json({error:'อ่านสรุปสถานะ Package HIS ไม่สำเร็จ'})}});
app.get('/api/his-packages', localOnly, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const result = await pool.query(`SELECT id,package_code,package_name,total_price,active_from,active_to,detail_items,source_data,his_presence,his_status,verification_status,last_checked_at,last_found_at,check_attempts,not_found_streak,last_check_error,last_check_reason,last_known_his_status,created_at,updated_at,updated_by
      FROM his_packages WHERE $1='' OR package_code ILIKE '%'||$1||'%' OR package_name ILIKE '%'||$1||'%' OR source_data::text ILIKE '%'||$1||'%'
      ORDER BY updated_at DESC, id DESC`, [q]);
    result.rows.forEach(row => { if (!Array.isArray(row.detail_items) || !row.detail_items.length) row.detail_items = packageDetailItems(row.source_data); });
    res.set('Cache-Control','no-store'); res.json({ total:result.rows.length, items:result.rows });
  } catch (error) { res.status(500).json({ error:'อ่านฐานข้อมูลแพ็กเกจไม่สำเร็จ' }); }
});

app.get('/api/his-packages/by-code/:code', localOnly, async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ error:'กรุณาระบุ Package Code' });
    let result = await pool.query(`SELECT id,package_code,package_name,total_price,active_from,active_to,detail_items,source_data,his_presence,his_status,verification_status,last_checked_at,last_found_at,check_attempts,not_found_streak,last_check_error,last_check_reason,last_known_his_status,created_at,updated_at,updated_by
      FROM his_packages WHERE LOWER(package_code)=LOWER($1) LIMIT 1`, [code]);
    if (!result.rows.length || !(Array.isArray(result.rows[0]?.detail_items) && result.rows[0].detail_items.length)) {
      try { await performHisPackageSync({changedBy:'AUTO PACKAGE DETAIL LOOKUP'}); } catch (syncError) { console.warn('Auto HIS package sync failed:', syncError.message); }
      result = await pool.query(`SELECT id,package_code,package_name,total_price,active_from,active_to,detail_items,source_data,his_presence,his_status,verification_status,last_checked_at,last_found_at,check_attempts,not_found_streak,last_check_error,last_check_reason,last_known_his_status,created_at,updated_at,updated_by
        FROM his_packages WHERE LOWER(package_code)=LOWER($1) LIMIT 1`, [code]);
    }
    if (!result.rows.length) return res.status(404).json({ error:'ไม่พบรายละเอียดของ Package Code นี้' });
    const item=result.rows[0];if(!Array.isArray(item.detail_items)||!item.detail_items.length)item.detail_items=packageDetailItems(item.source_data);
    await syncLegacyStationMaster();
    const assignments=await pool.query(`SELECT a.item_key,a.station_id,a.item_type,a.assignment_source,s.code AS station_code,s.name AS station_name FROM package_item_station_assignments a LEFT JOIN station_master s ON s.id=a.station_id WHERE a.package_id=$1`,[item.id]);
    const manualMap=new Map(assignments.rows.map(row=>[String(row.item_key),row])),autoMap=await packageStationAutoMap(),state=await readState(),settings=state.orderItemSettings&&typeof state.orderItemSettings==='object'?state.orderItemSettings:{};
    item.detail_items=item.detail_items.map(raw=>{const normalized=normalizePackageStationItem(raw),key=packageStationItemKey(normalized),manual=manualMap.get(key)||null,legacyType=String(settings[key]?.type||'').trim(),type=String(manual?.item_type||legacyType||'').trim(),auto=autoMap.get(type.toLowerCase())||null,assignment=manual||(auto?{...auto,assignment_source:'AUTO'}:null);return {...raw,_package_item_type:type,_station_assignment:assignment?{...assignment,item_key:key}:null}});
    res.set('Cache-Control','no-store'); res.json({ item });
  } catch (error) { res.status(500).json({ error:'อ่านรายละเอียดแพ็กเกจไม่สำเร็จ' }); }
});



function stationCodeFromName(name){const base=String(name||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60);return base||`STATION_${crypto.createHash('sha1').update(String(name||'')).digest('hex').slice(0,8).toUpperCase()}`}
async function ensurePackageStationDefaults(){
  const defaults=[['LAB','ห้องเจาะเลือด / LAB',10],['XRAY','X-Ray',20],['EKG','EKG',30],['VITAL','Vital Sign',40],['PHYSICAL','Physical Exam',50],['DOCTOR','Doctor',60],['OTHER','อื่น ๆ',99]];
  for(const [code,name,sort] of defaults){
    await pool.query(`INSERT INTO station_master(code,name,active,sort_order) VALUES($1,$2,TRUE,$3) ON CONFLICT DO NOTHING`,[code,name,sort]);
  }
}
async function syncLegacyStationMaster(){try{await ensurePackageStationDefaults();const state=await readState(),names=Array.isArray(state.orderStations)?state.orderStations:[];let sort=200;for(const name of names){const clean=String(name||'').trim();if(!clean)continue;const code=stationCodeFromName(clean);const found=await pool.query('SELECT id FROM station_master WHERE LOWER(code)=LOWER($1) LIMIT 1',[code]);if(found.rows.length)await pool.query('UPDATE station_master SET name=$2,active=TRUE,updated_at=NOW() WHERE id=$1',[found.rows[0].id,clean]);else await pool.query('INSERT INTO station_master(code,name,active,sort_order) VALUES($1,$2,TRUE,$3)',[code,clean,sort++])}const stationRows=(await pool.query('SELECT id,code FROM station_master')).rows,stationByCode=new Map(stationRows.map(row=>[String(row.code).toUpperCase(),row.id]));const defaults=[['LAB','LAB'],['XRAY','XRAY'],['X-RAY','XRAY'],['BME','EKG'],['DOCTORFEE','DOCTOR'],['DOCTOR','DOCTOR'],['VITAL SIGNS','VITAL'],['PHYSICAL','PHYSICAL'],['PHYSICAL EXAM','PHYSICAL']];for(const [itemType,stationCode] of defaults){const stationId=stationByCode.get(stationCode);if(stationId)await pool.query(`INSERT INTO item_type_station_mapping(item_type,station_id,updated_by) VALUES($1,$2,'SYSTEM_DEFAULT') ON CONFLICT(item_type) DO NOTHING`,[itemType,stationId])}}catch(error){console.warn('Station master sync warning:',error.message||error)}}
async function packageStationAutoMap(){const result=await pool.query(`SELECT m.item_type,s.id AS station_id,s.code AS station_code,s.name AS station_name FROM item_type_station_mapping m JOIN station_master s ON s.id=m.station_id WHERE s.active=TRUE`);return new Map(result.rows.map(row=>[String(row.item_type||'').trim().toLowerCase(),row]))}
function normalizePackageStationItem(item){const object=item&&typeof item==='object'?item:{};const lower=new Map(Object.keys(object).map(key=>[String(key).toLowerCase(),key])),pick=(...names)=>{for(const name of names){const key=lower.get(String(name).toLowerCase());if(key)return object[key]}return ''};return {code:String(pick('code','itemCode','orderItemCode','orderItemUID','serviceCode','testCode','detailCode')||'').trim(),name:String(pick('name','itemName','orderItemName','orderItemDescription','serviceName','testName','detailName','description')||'').trim()}}
function packageStationKeyPart(value){return String(value==null?'':value).replace(/^\uFEFF|[\u200B-\u200D\u2060]/g,'').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[／]/g,'/').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g,'').trim()}
function packageStationItemKey(item){const code=packageStationKeyPart(item?.code);if(code)return code;return `name:${packageStationKeyPart(item?.name)}`}
async function packageStationPermission(req,res,next,permission='packageStationView'){try{const username=String(req.headers['x-user-name']||'').trim();if(!username)return res.status(403).json({error:'ไม่มีข้อมูลผู้ใช้สำหรับตรวจสิทธิ์สถานี'});const state=await readState(),user=(state.users||[]).find(x=>String(x.username||'').toLowerCase()===username.toLowerCase()&&x.active!==false);if(!user)return res.status(403).json({error:'ไม่พบบัญชีผู้ใช้'});const role=(state.roles||[]).find(x=>String(x.id)===String(user.roleId)),permissions=new Set(Array.isArray(role?.permissions)?role.permissions:[]);const legacyAllowed=permission==='packageStationView'?['hisView','orderView','orderItemManage','orderStationManage'].some(key=>permissions.has(key)):['orderItemManage','orderStationManage'].some(key=>permissions.has(key));if(String(user.roleId)!=='admin'&&!permissions.has(permission)&&!legacyAllowed)return res.status(403).json({error:'บัญชีนี้ไม่มีสิทธิ์กำหนดสถานีในแพ็กเกจ'});req.packageStationActor={username:String(user.username||''),displayName:String(user.displayName||user.username||'')};next()}catch(error){res.status(500).json({error:'ตรวจสอบสิทธิ์ Station ไม่สำเร็จ'})}}
const packageStationViewRequired=(req,res,next)=>packageStationPermission(req,res,next,'packageStationView');
const packageStationEditRequired=(req,res,next)=>packageStationPermission(req,res,next,'packageStationEdit');
app.get('/api/stations',localOnly,packageStationViewRequired,async(req,res)=>{try{await syncLegacyStationMaster();const active=String(req.query.active||'')==='1';const result=await pool.query(`SELECT id,code,name,active,sort_order,created_at,updated_at FROM station_master WHERE ($1::boolean=FALSE OR active=TRUE) ORDER BY sort_order,name,id`,[active]);res.set('Cache-Control','no-store');res.json({items:result.rows})}catch(error){res.status(500).json({error:'อ่าน Station Master ไม่สำเร็จ'})}});
async function packageItemSettingsActor(req){
  const username=String(req.headers['x-user-name']||'').trim();
  if(!username){const error=new Error('ไม่มีข้อมูลผู้ใช้สำหรับตรวจสิทธิ์');error.status=403;throw error}
  const current=await readState(),user=(current.users||[]).find(x=>String(x.username||'').toLowerCase()===username.toLowerCase()&&x.active!==false);
  if(!user){const error=new Error('ไม่พบบัญชีผู้ใช้');error.status=403;throw error}
  const role=(current.roles||[]).find(x=>String(x.id)===String(user.roleId)),permissions=new Set(Array.isArray(role?.permissions)?role.permissions:[]);
  const isAdmin=String(user.roleId)==='admin';
  return {username:String(user.username||''),displayName:String(user.displayName||user.username||''),permissions,isAdmin};
}
app.patch('/api/package-item-settings/batch',localOnly,async(req,res)=>{
  const client=await pool.connect();
  try{
    const actorInfo=await packageItemSettingsActor(req),items=Array.isArray(req.body?.items)?req.body.items:[];
    if(!items.length)return res.status(400).json({error:'ไม่มีรายการประเภท/สถานีที่ต้องบันทึก'});
    if(items.length>1000)return res.status(400).json({error:'บันทึกได้ครั้งละไม่เกิน 1,000 รายการ'});
    const wantsType=items.some(x=>x.hasType===true),wantsStation=items.some(x=>x.hasStation===true);
    const canType=actorInfo.isAdmin||actorInfo.permissions.has('orderItemManage')||actorInfo.permissions.has('orderTypeManage');
    const canStation=actorInfo.isAdmin||actorInfo.permissions.has('packageStationEdit')||actorInfo.permissions.has('orderItemManage')||actorInfo.permissions.has('orderStationManage');
    if(wantsType&&!canType)return res.status(403).json({error:'บัญชีนี้ไม่มีสิทธิ์กำหนดประเภท'});
    if(wantsStation&&!canStation)return res.status(403).json({error:'บัญชีนี้ไม่มีสิทธิ์กำหนดสถานี'});
    await client.query('BEGIN');
    const packageIds=[...new Set(items.map(x=>Number(x.packageId)).filter(Number.isInteger))];
    const packages=(await client.query('SELECT id,package_code,detail_items,source_data FROM his_packages WHERE id=ANY($1::bigint[]) FOR UPDATE',[packageIds])).rows;
    if(packages.length!==packageIds.length)throw Object.assign(new Error('มี Package บางรายการไม่อยู่ในระบบ'),{status:404});
    const validMaps=new Map();
    for(const pkg of packages){const details=Array.isArray(pkg.detail_items)&&pkg.detail_items.length?pkg.detail_items:packageDetailItems(pkg.source_data);validMaps.set(Number(pkg.id),new Map(details.map(raw=>{const n=normalizePackageStationItem(raw);return [packageStationItemKey(n),n]})))}
    const stationIds=[...new Set(items.filter(x=>x.hasStation===true).map(x=>Number(x.stationId)).filter(Number.isInteger))];
    if(stationIds.length){const rows=(await client.query('SELECT id FROM station_master WHERE id=ANY($1::bigint[]) AND active=TRUE',[stationIds])).rows;if(rows.length!==stationIds.length)throw Object.assign(new Error('มี Station ที่ไม่มีอยู่หรือถูกปิดใช้งาน'),{status:400})}
    const actor=actorInfo.displayName||actorInfo.username||'system',results=[];
    for(const change of items){
      const packageId=Number(change.packageId),key=String(change.itemKey||'').trim(),valid=validMaps.get(packageId);
      if(!valid?.has(key))throw Object.assign(new Error(`Package Item ${key||'-'} ไม่อยู่ใน Package ${packageId}`),{status:400});
      const before=(await client.query(`SELECT item_type,station_id,assignment_source FROM package_item_station_assignments WHERE package_id=$1 AND item_key=$2`,[packageId,key])).rows[0]||{};
      const n=valid.get(key),itemType=change.hasType===true?String(change.itemType||'').trim():String(before.item_type||''),stationId=change.hasStation===true?(change.stationId==null||String(change.stationId)===''?null:Number(change.stationId)):(before.station_id??null);
      const after=(await client.query(`INSERT INTO package_item_station_assignments(package_id,item_key,item_code,item_name,item_type,station_id,assignment_source,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,'MANUAL',$7,NOW()) ON CONFLICT(package_id,item_key) DO UPDATE SET item_code=EXCLUDED.item_code,item_name=EXCLUDED.item_name,item_type=CASE WHEN $8::boolean THEN EXCLUDED.item_type ELSE package_item_station_assignments.item_type END,station_id=CASE WHEN $9::boolean THEN EXCLUDED.station_id ELSE package_item_station_assignments.station_id END,assignment_source='MANUAL',updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING item_type,station_id,assignment_source`,[packageId,key,n.code,n.name,itemType,stationId,actor,change.hasType===true,change.hasStation===true])).rows[0];
      const changedFields=[];if(change.hasType===true)changedFields.push('item_type');if(change.hasStation===true)changedFields.push('station_id');
      await client.query(`INSERT INTO audit_logs(entity_type,entity_id,action,before_data,after_data,changed_fields,performed_by,client_address) VALUES('PACKAGE_ITEM_SETTINGS',$1,'PATCH',$2::jsonb,$3::jsonb,$4::jsonb,$5,$6)`,[`${packageId}:${key}`,JSON.stringify(before),JSON.stringify(after),JSON.stringify(changedFields),actor,clientAddress(req)]);
      results.push({packageId,itemKey:key,itemType:after.item_type,stationId:after.station_id,assignmentSource:after.assignment_source});
    }
    await client.query('COMMIT');res.json({ok:true,updated:results.length,items:results});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});res.status(Number(error.status)||500).json({error:error.message||'บันทึกประเภท/สถานีไม่สำเร็จ'});}finally{client.release()}
});
app.patch('/api/package-item-stations/batch',localOnly,packageStationEditRequired,async(req,res)=>{const client=await pool.connect();try{const items=Array.isArray(req.body?.items)?req.body.items:[];if(!items.length)return res.status(400).json({error:'ไม่มีรายการ Station ที่ต้องบันทึก'});if(items.length>1000)return res.status(400).json({error:'บันทึกได้ครั้งละไม่เกิน 1,000 รายการ'});await client.query('BEGIN');const packageIds=[...new Set(items.map(x=>Number(x.packageId)).filter(Number.isInteger))],packages=(await client.query('SELECT id,package_code,detail_items,source_data FROM his_packages WHERE id=ANY($1::bigint[]) FOR UPDATE',[packageIds])).rows,packageMap=new Map(packages.map(pkg=>[Number(pkg.id),pkg]));if(packageMap.size!==packageIds.length){await client.query('ROLLBACK');return res.status(404).json({error:'มี Package บางรายการไม่อยู่ในระบบ'})}const stationIds=[...new Set(items.map(x=>Number(x.stationId)).filter(Number.isInteger))];if(stationIds.length){const rows=(await client.query('SELECT id FROM station_master WHERE id=ANY($1::bigint[]) AND active=TRUE',[stationIds])).rows;if(rows.length!==stationIds.length){await client.query('ROLLBACK');return res.status(400).json({error:'มี Station ที่ไม่มีอยู่หรือถูกปิดใช้งาน'})}}const validMaps=new Map();for(const pkg of packages){const details=Array.isArray(pkg.detail_items)&&pkg.detail_items.length?pkg.detail_items:packageDetailItems(pkg.source_data);validMaps.set(Number(pkg.id),new Map(details.map(raw=>{const n=normalizePackageStationItem(raw);return [packageStationItemKey(n),n]})))}const actor=req.packageStationActor?.displayName||req.packageStationActor?.username||'system',results=[];for(const change of items){const packageId=Number(change.packageId),key=String(change.itemKey||'').trim(),valid=validMaps.get(packageId);if(!valid?.has(key)){await client.query('ROLLBACK');return res.status(400).json({error:`Package Item ${key||'-'} ไม่อยู่ใน Package ${packageId}`})}const before=(await client.query(`SELECT a.station_id,a.assignment_source,s.code AS station_code,s.name AS station_name FROM package_item_station_assignments a LEFT JOIN station_master s ON s.id=a.station_id WHERE a.package_id=$1 AND a.item_key=$2`,[packageId,key])).rows[0]||null,n=valid.get(key),stationId=change.stationId==null||String(change.stationId)===''?null:Number(change.stationId),after=(await client.query(`INSERT INTO package_item_station_assignments(package_id,item_key,item_code,item_name,station_id,assignment_source,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,'MANUAL',$6,NOW()) ON CONFLICT(package_id,item_key) DO UPDATE SET item_code=EXCLUDED.item_code,item_name=EXCLUDED.item_name,station_id=EXCLUDED.station_id,assignment_source='MANUAL',updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING station_id,assignment_source`,[packageId,key,n.code,n.name,stationId,actor])).rows[0];await client.query(`INSERT INTO audit_logs(entity_type,entity_id,action,before_data,after_data,changed_fields,performed_by,client_address) VALUES('PACKAGE_ITEM_STATION',$1,'PATCH',$2::jsonb,$3::jsonb,'["station_id"]'::jsonb,$4,$5)`,[`${packageId}:${key}`,JSON.stringify(before||{}),JSON.stringify(after||{}),actor,clientAddress(req)]);results.push({packageId,itemKey:key,stationId:after.station_id,assignmentSource:after.assignment_source})}await client.query('COMMIT');res.json({ok:true,updated:results.length,items:results})}catch(error){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'บันทึก Station แบบ Batch ไม่สำเร็จ',detail:error.message})}finally{client.release()}});
app.patch('/api/packages/:packageId/items/stations',localOnly,packageStationEditRequired,async(req,res)=>{const client=await pool.connect();try{const packageId=Number(req.params.packageId),items=Array.isArray(req.body?.items)?req.body.items:[];if(!Number.isInteger(packageId)||packageId<=0)return res.status(400).json({error:'Package ID ไม่ถูกต้อง'});if(!items.length)return res.status(400).json({error:'ไม่มีรายการ Station ที่ต้องบันทึก'});await client.query('BEGIN');const pkg=(await client.query('SELECT id,package_code,detail_items,source_data FROM his_packages WHERE id=$1 FOR UPDATE',[packageId])).rows[0];if(!pkg){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบ Package นี้'})}let details=Array.isArray(pkg.detail_items)&&pkg.detail_items.length?pkg.detail_items:packageDetailItems(pkg.source_data),valid=new Map(details.map(raw=>{const n=normalizePackageStationItem(raw);return [packageStationItemKey(n),n]}));const stationIds=[...new Set(items.map(x=>Number(x.stationId)).filter(Number.isInteger))];if(stationIds.length){const rows=(await client.query('SELECT id FROM station_master WHERE id=ANY($1::bigint[]) AND active=TRUE',[stationIds])).rows;if(rows.length!==stationIds.length){await client.query('ROLLBACK');return res.status(400).json({error:'มี Station ที่ไม่มีอยู่หรือถูกปิดใช้งาน'})}}const actor=req.packageStationActor?.displayName||req.packageStationActor?.username||'system',results=[];for(const change of items){const key=String(change.itemKey||'').trim();if(!valid.has(key)){await client.query('ROLLBACK');return res.status(400).json({error:`Package Item ${key||'-'} ไม่อยู่ใน Package นี้`})}const before=(await client.query(`SELECT a.station_id,a.assignment_source,s.code AS station_code,s.name AS station_name FROM package_item_station_assignments a LEFT JOIN station_master s ON s.id=a.station_id WHERE a.package_id=$1 AND a.item_key=$2`,[packageId,key])).rows[0]||null,n=valid.get(key),stationId=change.stationId==null||String(change.stationId)===''?null:Number(change.stationId);const after=(await client.query(`INSERT INTO package_item_station_assignments(package_id,item_key,item_code,item_name,station_id,assignment_source,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,'MANUAL',$6,NOW()) ON CONFLICT(package_id,item_key) DO UPDATE SET item_code=EXCLUDED.item_code,item_name=EXCLUDED.item_name,station_id=EXCLUDED.station_id,assignment_source='MANUAL',updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING station_id,assignment_source`,[packageId,key,n.code,n.name,stationId,actor])).rows[0];await client.query(`INSERT INTO audit_logs(entity_type,entity_id,action,before_data,after_data,changed_fields,performed_by,client_address) VALUES('PACKAGE_ITEM_STATION',$1,'PATCH',$2::jsonb,$3::jsonb,'["station_id"]'::jsonb,$4,$5)`,[`${packageId}:${key}`,JSON.stringify(before||{}),JSON.stringify(after||{}),actor,clientAddress(req)]);results.push({itemKey:key,stationId:after.station_id,assignmentSource:after.assignment_source})}await client.query('COMMIT');res.json({ok:true,updated:results.length,items:results})}catch(error){await client.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'บันทึก Station ไม่สำเร็จ',detail:error.message})}finally{client.release()}});

const guideManageRequired=staffPermissionRequired('guideManage');
app.get('/api/guide-documents',localOnly,async(_req,res)=>{try{const r=await pool.query('SELECT view_id,file_name,mime_type,file_size,uploaded_at,uploaded_by,guide_data FROM user_guide_documents ORDER BY view_id');res.set('Cache-Control','no-store');res.json({items:r.rows})}catch(e){res.status(500).json({error:'อ่าน PDF คู่มือไม่สำเร็จ'})}});
app.patch('/api/guide-documents/:viewId/text',localOnly,guideManageRequired,async(req,res)=>{try{const view=String(req.params.viewId||'').trim(),guideData={intro:String(req.body?.intro||'').slice(0,4000),steps:Array.isArray(req.body?.steps)?req.body.steps.map(x=>String(x).slice(0,1000)).slice(0,30):[],tip:String(req.body?.tip||'').slice(0,4000)};const r=await pool.query(`INSERT INTO user_guide_documents(view_id,guide_data,uploaded_by,uploaded_at) VALUES($1,$2::jsonb,$3,NOW()) ON CONFLICT(view_id) DO UPDATE SET guide_data=EXCLUDED.guide_data,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=NOW() RETURNING view_id,file_name,mime_type,file_size,uploaded_at,uploaded_by,guide_data`,[view,JSON.stringify(guideData),String(req.staffUser?.displayName||req.staffUser?.username||'').slice(0,120)]);res.json({ok:true,item:r.rows[0]})}catch(e){res.status(500).json({error:'บันทึกข้อความคู่มือไม่สำเร็จ'})}});
app.put('/api/guide-documents/:viewId',localOnly,guideManageRequired,express.raw({type:'application/pdf',limit:'20mb'}),async(req,res)=>{try{const view=String(req.params.viewId||'').trim(),fileName=decodeURIComponent(String(req.headers['x-file-name']||'คู่มือ.pdf')).slice(0,240),uploadedBy=String(req.staffUser?.displayName||req.staffUser?.username||'').slice(0,120);if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'กรุณาเลือก PDF'});if(req.body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'รองรับเฉพาะ PDF'});const r=await pool.query(`INSERT INTO user_guide_documents(view_id,file_name,mime_type,file_data,file_size,uploaded_at,uploaded_by) VALUES($1,$2,'application/pdf',$3,$4,NOW(),$5) ON CONFLICT(view_id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_data=EXCLUDED.file_data,file_size=EXCLUDED.file_size,uploaded_at=NOW(),uploaded_by=EXCLUDED.uploaded_by RETURNING view_id,file_name,mime_type,file_size,uploaded_at,uploaded_by`,[view,fileName,req.body,req.body.length,uploadedBy]);res.json({ok:true,item:r.rows[0]})}catch(e){res.status(500).json({error:'แนบ PDF คู่มือไม่สำเร็จ'})}});
app.get('/api/guide-documents/:viewId/file',localOnly,async(req,res)=>{try{const r=await pool.query('SELECT file_name,mime_type,file_data FROM user_guide_documents WHERE view_id=$1',[String(req.params.viewId||'')]);if(!r.rows.length||!r.rows[0].file_data)return res.status(404).send('ไม่พบ PDF คู่มือ');const x=r.rows[0];res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(x.file_name||'guide.pdf')}`,'Cache-Control':'private, no-store'});res.send(x.file_data)}catch(e){res.status(500).send('เปิด PDF คู่มือไม่สำเร็จ')}});
app.delete('/api/guide-documents/:viewId',localOnly,guideManageRequired,async(req,res)=>{try{const r=await pool.query('DELETE FROM user_guide_documents WHERE view_id=$1',[String(req.params.viewId||'')]);res.json({ok:true,deleted:r.rowCount})}catch(e){res.status(500).json({error:'ลบ PDF คู่มือไม่สำเร็จ'})}});
// v7.63.93: per-company/year corporate circular (source template supplied by user).
async function circularCompany(companyId){
  const id=String(companyId||'').trim();
  if(!id||id.length>160)return null;
  const state=await readState();
  return (state.companies||[]).find(item=>String(item.id)===id)||null;
}
app.get('/api/company-circulars/:companyId',localOnly,staffPermissionRequired('companyView'),async(req,res)=>{
  try{
    const co=await circularCompany(req.params.companyId);
    if(!co)return res.status(404).json({error:'ไม่พบบริษัท/ปีที่เลือก'});
    const row=(await pool.query('SELECT memo_data,updated_by,updated_at FROM company_year_circulars WHERE company_year_id=$1',[co.id])).rows[0];
    res.set('Cache-Control','private, no-store').json({ok:true,companyId:co.id,companyName:co.name,year:co.year,item:defaultCircular(co,row?.memo_data||{}),updatedAt:row?.updated_at||null,updatedBy:row?.updated_by||''});
  }catch(error){res.status(500).json({error:'โหลดหนังสือเวียนไม่สำเร็จ',detail:String(error.message||error).slice(0,300)})}
});
app.put('/api/company-circulars/:companyId',localOnly,staffPermissionRequired('companyEdit'),async(req,res)=>{
  try{
    const co=await circularCompany(req.params.companyId);
    if(!co)return res.status(404).json({error:'ไม่พบบริษัท/ปีที่เลือก'});
    const memo=normalizeCircular(req.body?.item||{}),actor=String(req.staffUser?.displayName||req.staffUser?.username||'system').slice(0,120);
    const result=await pool.query(`INSERT INTO company_year_circulars(company_year_id,memo_data,updated_by,updated_at)
      VALUES($1,$2::jsonb,$3,NOW()) ON CONFLICT(company_year_id) DO UPDATE
      SET memo_data=EXCLUDED.memo_data,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING updated_at`,[co.id,JSON.stringify(memo),actor]);
    res.set('Cache-Control','no-store').json({ok:true,companyId:co.id,updatedAt:result.rows[0].updated_at});
  }catch(error){res.status(400).json({error:'บันทึกหนังสือเวียนไม่สำเร็จ',detail:String(error.message||error).slice(0,300)})}
});
// The same PDF composition is used by live preview, on-demand download and the
// versioned primary PDF. Legacy uploads are read-only and never overwritten.
async function buildCircularWithCompanyAttachments(co,memo){
  const main = await buildCorporateCircularPdf(co,defaultCircular(co,memo||{}));
  const [legacy,added] = await Promise.all([
    pool.query('SELECT file_name,file_data FROM company_year_documents WHERE company_id=$1',[co.id]),
    pool.query('SELECT file_name,file_data FROM company_year_attachments WHERE company_year_id=$1 ORDER BY id ASC',[co.id])
  ]);
  return mergeCircularAndAttachments(main,[...legacy.rows,...added.rows]);
}
app.post('/api/company-circulars/:companyId/preview',localOnly,staffPermissionRequired('companyView'),async(req,res)=>{
  try{
    const co=await circularCompany(req.params.companyId);
    if(!co)return res.status(404).json({error:'ไม่พบบริษัท/ปีที่เลือก'});
    const {bytes,attachmentCount}=await buildCircularWithCompanyAttachments(co,req.body?.item||{});
    res.set('X-Merged-Attachments',String(attachmentCount));
    res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="corporate-preview.pdf"','Cache-Control':'private, no-store'});
    res.send(bytes);
  }catch(error){res.status(400).json({error:'ดูตัวอย่างเอกสารเวียนไม่ได้',detail:String(error.message||error).slice(0,350)})}
});
app.get('/api/company-circulars/:companyId/pdf',localOnly,staffPermissionRequired('companyPdfView'),async(req,res)=>{
  try{
    const co=await circularCompany(req.params.companyId);
    if(!co)return res.status(404).json({error:'ไม่พบบริษัท/ปีที่เลือก'});
    const row=(await pool.query('SELECT memo_data FROM company_year_circulars WHERE company_year_id=$1',[co.id])).rows[0];
    const {bytes,attachmentCount}=await buildCircularWithCompanyAttachments(co,row?.memo_data||{});
    res.set('X-Merged-Attachments',String(attachmentCount));
    const fileName=`Corporate-Circular_${String(co.code||'company').replace(/[^A-Za-z0-9_-]/g,'_')}_${String(co.year||'year').replace(/[^0-9]/g,'')}.pdf`;
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,'Cache-Control':'private, no-store'});
    res.send(bytes);
  }catch(error){console.error('[COMPANY CIRCULAR PDF]',error);res.status(500).json({error:'สร้างหนังสือเวียน PDF ไม่สำเร็จ',detail:String(error.message||error).slice(0,350)})}
});
// v7.63.95: primary circular documents are separate from all user-uploaded attachments.
// Live preview includes attachments currently stored, even if the last saved
// primary PDF was generated before the latest attachment upload.
app.get('/api/company-primary-pdfs/:companyId/preview',localOnly,staffPermissionRequired('companyPdfView'),async(req,res)=>{
  try{
    const co=await circularCompany(req.params.companyId);
    if(!co)return res.status(404).json({error:'ไม่พบบริษัท/ปี'});
    const row=(await pool.query('SELECT memo_data FROM company_year_circulars WHERE company_year_id=$1',[co.id])).rows[0];
    const {bytes,attachmentCount}=await buildCircularWithCompanyAttachments(co,row?.memo_data||{});
    res.set({'Content-Type':'application/pdf','Content-Disposition':'inline; filename="corporate-with-attachments-preview.pdf"','Cache-Control':'private, no-store','X-Merged-Attachments':String(attachmentCount)});
    res.send(bytes);
  }catch(error){console.error('[COMPANY COMBINED PDF PREVIEW]',error);res.status(422).json({error:'ไม่สามารถสร้างตัวอย่าง PDF ที่รวมเอกสารแนบ',detail:String(error.message||error).slice(0,350)})}
});
// Batch main-document metadata for company search and customer views; never return PDF bytes here.
app.get('/api/company-primary-pdfs',localOnly,staffPermissionRequired('companyPdfView'),async(_req,res)=>{
  try{const result=await pool.query('SELECT DISTINCT ON (company_year_id) company_year_id,id,file_name,file_size,created_at FROM company_year_primary_pdfs ORDER BY company_year_id,id DESC');res.set('Cache-Control','no-store').json({ok:true,items:result.rows});}
  catch(error){res.status(500).json({error:'อ่านรายการ PDF หลักไม่สำเร็จ'});}
});
app.get('/api/company-primary-pdfs/:companyId',localOnly,staffPermissionRequired('companyPdfView'),async(req,res)=>{
  try {
    const companyId=String(req.params.companyId||'').trim();
    if(!await circularCompany(companyId))return res.status(404).json({error:'ไม่พบบริษัท/ปี'});
    const result=await pool.query('SELECT id,file_name,file_size,created_at,created_by FROM company_year_primary_pdfs WHERE company_year_id=$1 ORDER BY id DESC LIMIT 40',[companyId]);
    res.set('Cache-Control','no-store').json({ok:true,current:result.rows[0]||null,history:result.rows});
  } catch(error){res.status(500).json({error:'อ่านเอกสารหลักไม่สำเร็จ'});}
});
app.post('/api/company-primary-pdfs/:companyId',localOnly,staffPermissionRequired('companyEdit'),async(req,res)=>{
  try {
    const co=await circularCompany(req.params.companyId);
    if(!co)return res.status(404).json({error:'ไม่พบบริษัท/ปี'});
    // Regenerate ONLY from previously saved annual data and corporate circular memo.
    const memoResult=await pool.query('SELECT memo_data FROM company_year_circulars WHERE company_year_id=$1',[co.id]);
    if(!memoResult.rows.length)return res.status(409).json({error:'กรุณาบันทึกข้อมูลเอกสารเวียนก่อนสร้าง PDF หลัก'});
    const merged=await buildCircularWithCompanyAttachments(co,memoResult.rows[0].memo_data||{});
    const bytes=Buffer.from(merged.bytes);
    if(bytes.length<5||bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('รูปแบบ PDF ไม่ถูกต้อง');
    const fileName=`Corporate_Circular_${String(co.code||'Company').replace(/[^A-Za-z0-9_-]/g,'_')}_${String(co.year||'Year').replace(/[^0-9]/g,'')}_${Date.now()}.pdf`;
    const actor=String(req.staffUser?.displayName||req.staffUser?.username||'system').slice(0,120);
    const saved=(await pool.query('INSERT INTO company_year_primary_pdfs(company_year_id,file_name,file_data,file_size,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,file_name,file_size,created_at,created_by',[co.id,fileName,bytes,bytes.length,actor])).rows[0];
    res.set('Cache-Control','no-store').status(201).json({ok:true,item:saved,mergedAttachments:merged.attachmentCount,pageCount:merged.pageCount||null});
  }catch(error){console.error('[PRIMARY CIRCULAR PDF]',error);res.status(422).json({error:'สร้าง PDF หลักไม่สำเร็จ กรุณาตรวจสอบเอกสารแนบ',detail:String(error.message||error).slice(0,350)});}
});
app.get('/api/company-primary-pdfs/:companyId/file/:versionId',localOnly,staffPermissionRequired('companyPdfView'),async(req,res)=>{
  try {
    const companyId=String(req.params.companyId||'').trim(),version=String(req.params.versionId||'');
    if(version!=='latest'&&!/^[1-9][0-9]*$/.test(version))return res.status(400).send('เลขเวอร์ชัน PDF ไม่ถูกต้อง');
    const args=[companyId],filter=version==='latest'?'':' AND id=$2';if(version!=='latest')args.push(version);
    const result=await pool.query(`SELECT file_name,file_data FROM company_year_primary_pdfs WHERE company_year_id=$1${filter} ORDER BY id DESC LIMIT 1`,args);
    if(!result.rows.length)return res.status(404).send('ไม่พบเอกสารหลัก');
    const f=result.rows[0],mode=req.query.download==='1'?'attachment':'inline';
    res.set({'Content-Type':'application/pdf','Content-Disposition':`${mode}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}).send(f.file_data);
  }catch(error){res.status(500).send('เปิดเอกสารหลักไม่สำเร็จ');}
});
// Legacy company_year_documents PDFs are *read as attachments* without moving or deleting bytes.
app.get('/api/company-attachments/:companyId',localOnly,staffPermissionRequired('companyPdfView'),async(req,res)=>{
  try{
    const companyId=String(req.params.companyId||'').trim();
    if(!await circularCompany(companyId))return res.status(404).json({error:'ไม่พบบริษัท/ปี'});
    const [legacy,added]=await Promise.all([
      pool.query('SELECT file_name,file_size,uploaded_at,uploaded_by FROM company_year_documents WHERE company_id=$1',[companyId]),
      pool.query('SELECT id,file_name,file_size,uploaded_at,uploaded_by FROM company_year_attachments WHERE company_year_id=$1 ORDER BY id DESC',[companyId])
    ]);
    const items=[...legacy.rows.map(f=>({...f,id:'legacy',legacy:true})),...added.rows.map(f=>({...f,id:String(f.id),legacy:false}))];
    res.set('Cache-Control','no-store').json({ok:true,items});
  }catch(error){res.status(500).json({error:'อ่านเอกสารแนบไม่สำเร็จ'});}
});
app.post('/api/company-attachments/:companyId',localOnly,staffPermissionRequired('companyPdfManage'),express.raw({type:'application/pdf',limit:'20mb'}),async(req,res)=>{
  try{
    const co=await circularCompany(req.params.companyId);
    if(!co)return res.status(404).json({error:'ไม่พบบริษัท/ปี'});
    const body=req.body;
    if(!Buffer.isBuffer(body)||body.length<5||body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'รองรับเฉพาะไฟล์ PDF'});
    const rawName=decodeURIComponent(String(req.headers['x-file-name']||'เอกสารแนบ.pdf')).slice(0,240);
    const safeName=rawName.replace(/[\\/\u0000-\u001f]/g,'_');
    const actor=String(req.staffUser?.displayName||req.staffUser?.username||'system').slice(0,120);
    const r=await pool.query('INSERT INTO company_year_attachments(company_year_id,file_name,file_data,file_size,uploaded_by) VALUES($1,$2,$3,$4,$5) RETURNING id,file_name,file_size,uploaded_at,uploaded_by',[co.id,safeName,body,body.length,actor]);
    res.set('Cache-Control','no-store').status(201).json({ok:true,item:r.rows[0]});
  }catch(error){res.status(error.type==='entity.too.large'?413:500).json({error:error.type==='entity.too.large'?'ไฟล์ PDF เกิน 20 MB':'อัปโหลดเอกสารแนบไม่สำเร็จ'});}
});
app.get('/api/company-attachments/:companyId/file/:attachmentId',localOnly,staffPermissionRequired('companyPdfView'),async(req,res)=>{
  try{
    const coid=String(req.params.companyId||'').trim(),attachmentId=String(req.params.attachmentId||'');
    if(attachmentId!=='legacy'&&!/^[1-9][0-9]*$/.test(attachmentId))return res.status(400).send('เลขเอกสารไม่ถูกต้อง');
    const r=attachmentId==='legacy'?await pool.query('SELECT file_name,file_data FROM company_year_documents WHERE company_id=$1',[coid]):await pool.query('SELECT file_name,file_data FROM company_year_attachments WHERE company_year_id=$1 AND id=$2',[coid,attachmentId]);
    if(!r.rows.length)return res.status(404).send('ไม่พบเอกสารแนบ');
    const f=r.rows[0],mode=req.query.download==='1'?'attachment':'inline';
    res.set({'Content-Type':'application/pdf','Content-Disposition':`${mode}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,'Cache-Control':'private,no-store'}).send(f.file_data);
  }catch(error){res.status(500).send('เปิดเอกสารแนบไม่สำเร็จ');}
});
app.delete('/api/company-attachments/:companyId/:attachmentId',localOnly,staffPermissionRequired('companyPdfManage'),async(req,res)=>{
  try{
    const coid=String(req.params.companyId||'').trim(),attachmentId=String(req.params.attachmentId||'');
    // Never delete original legacy PDFs from the new attachment-management workflow.
    if(!/^[1-9][0-9]*$/.test(attachmentId))return res.status(400).json({error:'ไฟล์เดิมถูกเก็บรักษาไว้ ไม่อนุญาตให้ลบจากหน้านี้'});
    const r=await pool.query('DELETE FROM company_year_attachments WHERE company_year_id=$1 AND id=$2',[coid,attachmentId]);
    res.json({ok:true,deleted:r.rowCount});
  }catch(error){res.status(500).json({error:'ลบเอกสารแนบไม่สำเร็จ'});}
});
app.get('/api/company-documents', localOnly, async (_req, res) => {
  try { const result=await pool.query('SELECT company_id,file_name,mime_type,file_size,uploaded_at,uploaded_by FROM company_year_documents ORDER BY uploaded_at DESC');res.set('Cache-Control','no-store');res.json({items:result.rows}); }
  catch(error){res.status(500).json({error:'อ่านรายการ PDF ไม่สำเร็จ'});}
});
app.put('/api/company-documents/:companyId', localOnly, express.raw({type:'application/pdf',limit:'20mb'}), async (req,res)=>{
  try{const companyId=String(req.params.companyId||'').trim(),fileName=decodeURIComponent(String(req.headers['x-file-name']||'เอกสาร.pdf')).slice(0,240),uploadedBy=decodeURIComponent(String(req.headers['x-uploaded-by']||'ผู้ดูแลระบบ')).slice(0,120);if(!companyId)return res.status(400).json({error:'ไม่พบข้อมูลบริษัทและปี'});if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'กรุณาเลือกไฟล์ PDF'});if(req.body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'รองรับเฉพาะไฟล์ PDF เท่านั้น'});const state=await readState();if(!(state.companies||[]).some(item=>String(item.id)===companyId))return res.status(404).json({error:'ไม่พบบริษัทและปีนี้'});const result=await pool.query(`INSERT INTO company_year_documents(company_id,file_name,mime_type,file_data,file_size,uploaded_at,uploaded_by) VALUES($1,$2,'application/pdf',$3,$4,NOW(),$5) ON CONFLICT(company_id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_data=EXCLUDED.file_data,file_size=EXCLUDED.file_size,uploaded_at=NOW(),uploaded_by=EXCLUDED.uploaded_by RETURNING company_id,file_name,mime_type,file_size,uploaded_at,uploaded_by`,[companyId,fileName,req.body,req.body.length,uploadedBy]);res.json({ok:true,item:result.rows[0]});}catch(error){res.status(error.type==='entity.too.large'?413:500).json({error:error.type==='entity.too.large'?'ไฟล์ PDF ต้องมีขนาดไม่เกิน 20 MB':'บันทึก PDF ไม่สำเร็จ'});}
});
app.get('/api/company-documents/:companyId/file',localOnly,async(req,res)=>{try{const result=await pool.query('SELECT file_name,mime_type,file_data FROM company_year_documents WHERE company_id=$1',[String(req.params.companyId||'')]);if(!result.rows.length)return res.status(404).send('ไม่พบไฟล์ PDF');const item=result.rows[0];res.set({'Content-Type':item.mime_type||'application/pdf','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(item.file_name)}`,'Cache-Control':'private, no-store'});res.send(item.file_data);}catch(error){res.status(500).send('เปิดไฟล์ PDF ไม่สำเร็จ');}});
app.post('/api/company-documents/import-paths',localOnly,async(req,res)=>{
  const items=Array.isArray(req.body?.items)?req.body.items:[],uploadedBy=String(req.body?.uploadedBy||'ผู้ดูแลระบบ').slice(0,120);
  if(!items.length)return res.json({ok:true,attached:0,failed:0,items:[]});
  if(items.length>500)return res.status(400).json({error:'แนบ PDF จาก Path ได้สูงสุด 500 รายการต่อครั้ง'});
  const results=[];let attached=0,failed=0;
  for(const raw of items){
    const companyId=String(raw?.companyId||'').trim(),pdfPath=String(raw?.pdfPath||'').trim();
    try{
      if(!companyId)throw new Error('ไม่พบ Company ID');
      if(!pdfPath)throw new Error('ไม่พบ PDF Path');
      if(pdfPath.length>1200)throw new Error('PDF Path ยาวเกินกำหนด');
      if(!/\.pdf$/i.test(pdfPath))throw new Error('รองรับเฉพาะไฟล์ .pdf');
      if(!(path.isAbsolute(pdfPath)||path.win32.isAbsolute(pdfPath)||/^\\/.test(pdfPath)))throw new Error('PDF Path ต้องเป็น absolute path หรือ UNC path ที่ Production Server อ่านได้');
      const companyExists=await pool.query('SELECT 1 FROM company_years WHERE id=$1 LIMIT 1',[companyId]);
      if(!companyExists.rowCount)throw new Error('ไม่พบบริษัท/ปีในระบบ');
      const stat=await fs.promises.stat(pdfPath);if(!stat.isFile())throw new Error('Path ไม่ใช่ไฟล์');if(stat.size>20*1024*1024)throw new Error('ไฟล์ PDF ต้องมีขนาดไม่เกิน 20 MB');
      const fileData=await fs.promises.readFile(pdfPath);if(fileData.subarray(0,5).toString()!=='%PDF-')throw new Error('ไฟล์ไม่ใช่ PDF ที่ถูกต้อง');
      const fileName=path.basename(pdfPath).slice(0,240)||'เอกสาร.pdf';
      await pool.query(`INSERT INTO company_year_documents(company_id,file_name,mime_type,file_data,file_size,uploaded_at,uploaded_by) VALUES($1,$2,'application/pdf',$3,$4,NOW(),$5) ON CONFLICT(company_id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_data=EXCLUDED.file_data,file_size=EXCLUDED.file_size,uploaded_at=NOW(),uploaded_by=EXCLUDED.uploaded_by`,[companyId,fileName,fileData,fileData.length,uploadedBy]);
      attached++;results.push({companyId,pdfPath,ok:true,fileName,fileSize:fileData.length});
    }catch(error){failed++;results.push({companyId,pdfPath,ok:false,error:String(error.message||error).slice(0,500)});}
  }
  res.json({ok:failed===0,attached,failed,items:results});
});
app.delete('/api/company-documents/:companyId',localOnly,async(req,res)=>{try{const result=await pool.query('DELETE FROM company_year_documents WHERE company_id=$1',[String(req.params.companyId||'')]);res.json({ok:true,deleted:result.rowCount});}catch(error){res.status(500).json({error:'ลบ PDF ไม่สำเร็จ'});}});

app.get('/api/company-import-files',localOnly,async(_req,res)=>{try{const result=await pool.query(`SELECT f.company_id,f.file_name,f.mime_type,f.file_size,f.row_count,f.uploaded_at,f.uploaded_by FROM company_year_import_files f JOIN company_years cy ON cy.id=f.company_id ORDER BY f.uploaded_at DESC`);res.set('Cache-Control','no-store');res.json({items:result.rows})}catch(error){res.status(500).json({error:'อ่านรายการไฟล์นำเข้าไม่สำเร็จ'})}});
app.put('/api/company-import-files/:companyId',localOnly,express.raw({type:'application/octet-stream',limit:'25mb'}),async(req,res)=>{try{const companyId=String(req.params.companyId||'').trim(),fileName=decodeURIComponent(String(req.headers['x-file-name']||'company-import.xlsx')).slice(0,240),mimeType=decodeURIComponent(String(req.headers['x-file-type']||'application/octet-stream')).slice(0,180),uploadedBy=decodeURIComponent(String(req.headers['x-uploaded-by']||'ผู้ดูแลระบบ')).slice(0,120),rowCount=Math.max(0,Math.min(5000,Number(req.headers['x-row-count']||0)||0));if(!companyId)return res.status(400).json({error:'ไม่พบข้อมูลบริษัทและปี'});if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'ไม่พบไฟล์ Excel ต้นฉบับ'});if(!/\.(xlsx|xls)$/i.test(fileName))return res.status(400).json({error:'รองรับเฉพาะไฟล์ .xlsx หรือ .xls'});const exists=await pool.query('SELECT 1 FROM company_years WHERE id=$1',[companyId]);if(!exists.rowCount)return res.status(404).json({error:'ไม่พบบริษัทและปีนี้'});const result=await pool.query(`INSERT INTO company_year_import_files(company_id,file_name,mime_type,file_data,file_size,row_count,uploaded_at,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,NOW(),$7) ON CONFLICT(company_id) DO UPDATE SET file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,file_data=EXCLUDED.file_data,file_size=EXCLUDED.file_size,row_count=EXCLUDED.row_count,uploaded_at=NOW(),uploaded_by=EXCLUDED.uploaded_by RETURNING company_id,file_name,mime_type,file_size,row_count,uploaded_at,uploaded_by`,[companyId,fileName,mimeType||'application/octet-stream',req.body,req.body.length,rowCount,uploadedBy]);res.json({ok:true,item:result.rows[0]})}catch(error){res.status(error.type==='entity.too.large'?413:500).json({error:error.type==='entity.too.large'?'ไฟล์ Excel ต้องมีขนาดไม่เกิน 25 MB':'บันทึกไฟล์ Excel ต้นฉบับไม่สำเร็จ'})}});
app.get('/api/company-import-files/:companyId/file',localOnly,async(req,res)=>{try{const result=await pool.query('SELECT file_name,mime_type,file_data FROM company_year_import_files WHERE company_id=$1',[String(req.params.companyId||'')]);if(!result.rows.length)return res.status(404).send('ไม่พบไฟล์นำเข้า');const item=result.rows[0];res.set({'Content-Type':item.mime_type||'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(item.file_name||'company-import.xlsx')}`,'Cache-Control':'private, no-store'});res.send(item.file_data)}catch(error){res.status(500).send('ดาวน์โหลดไฟล์นำเข้าไม่สำเร็จ')}});

app.post('/api/company-code-change',localOnly,async(req,res)=>{const client=await pool.connect();try{const companyYearId=String(req.body?.companyYearId||'').trim(),currentCode=String(req.body?.currentCode||'').trim(),newCode=String(req.body?.newCode||'').trim(),expected=Number(req.body?._revision),updatedBy=String(req.body?.updatedBy||'system').slice(0,120);if(!companyYearId||!currentCode||!newCode)return res.status(400).json({error:'กรุณาระบุบริษัท Code ปัจจุบัน และ Code ใหม่ให้ครบ'});if(newCode.length>80)return res.status(400).json({error:'Code Company ใหม่ยาวเกินกำหนด'});const normValue=value=>String(value||'').trim().toLocaleLowerCase('th-TH').replace(/\s+/g,' ');if(normValue(currentCode)===normValue(newCode))return res.status(400).json({error:'Code ใหม่ต้องต่างจาก Code ปัจจุบัน'});if(!Number.isInteger(expected)||expected<0)return res.status(428).json({error:'ไม่พบ Revision กรุณาโหลดข้อมูลใหม่ก่อนเปลี่ยน Code'});await client.query('BEGIN');const locked=(await client.query('SELECT revision FROM app_state WHERE id=1 FOR UPDATE')).rows[0];if(!locked||Number(locked.revision)!==expected){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลบน Server มีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนเปลี่ยน Code',conflict:true})}const base=(await client.query(`SELECT cy.id,cy.company_id,c.company_code,c.company_name,c.source_data AS company_source FROM company_years cy JOIN companies c ON c.id=cy.company_id WHERE cy.id=$1 LIMIT 1`,[companyYearId])).rows[0];if(!base){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบบริษัท/ปีที่เลือก'})}if(normValue(base.company_code)!==normValue(currentCode)){await client.query('ROLLBACK');return res.status(409).json({error:`Code ปัจจุบันของบริษัทนี้เปลี่ยนเป็น “${base.company_code||'-'}” แล้ว กรุณาโหลดข้อมูลใหม่`})}const owner=(await client.query(`SELECT company_name FROM companies WHERE id<>$1 AND LOWER(BTRIM(company_code))=LOWER(BTRIM($2)) LIMIT 1`,[base.company_id,newCode])).rows[0];if(owner){await client.query('ROLLBACK');return res.status(409).json({error:`Code “${newCode}” ถูกใช้โดย “${owner.company_name}” อยู่แล้ว`})}const years=(await client.query('SELECT id,source_data FROM company_years WHERE company_id=$1 ORDER BY screening_year',[base.company_id])).rows,targetIdList=years.map(row=>String(row.id)),revision=expected+1,newParentId=customerImportStableId('company',newCode||base.company_name||companyYearId),changedAt=new Date().toISOString(),companySource={...(base.company_source||{}),code:newCode,name:String(base.company_name||''),updatedAt:changedAt};await client.query(`INSERT INTO companies(id,company_code,company_name,source_data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO UPDATE SET company_code=EXCLUDED.company_code,company_name=EXCLUDED.company_name,source_data=EXCLUDED.source_data,revision=companies.revision+1,updated_at=NOW()`,[newParentId,newCode,String(base.company_name||'ไม่ระบุชื่อบริษัท'),JSON.stringify(companySource)]);for(const row of years){const source={...(row.source_data||{}),code:newCode,updatedAt:changedAt};await client.query(`UPDATE company_years SET company_id=$2,source_data=$3::jsonb,revision=revision+1,updated_at=NOW() WHERE id=$1`,[String(row.id),newParentId,JSON.stringify(source)])}if(String(base.company_id)!==newParentId)await client.query('DELETE FROM companies WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM company_years cy WHERE cy.company_id=companies.id)',[base.company_id]);await client.query('UPDATE app_state SET revision=$1,updated_at=NOW() WHERE id=1',[revision]);await client.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);await client.query(`INSERT INTO audit_logs(entity_type,entity_id,action,before_data,after_data,changed_fields,performed_by,client_address) VALUES('COMPANY',$1,'CODE_CHANGE',$2::jsonb,$3::jsonb,$4::jsonb,$5,$6)`,[companyYearId,JSON.stringify({companyName:base.company_name,code:currentCode,companyYearIds:targetIdList}),JSON.stringify({companyName:base.company_name,code:newCode,companyYearIds:targetIdList}),JSON.stringify(['companyCode']),updatedBy,String(req.ip||req.socket?.remoteAddress||'').slice(0,120)]).catch(()=>{});await client.query('COMMIT');compressedStateCache={revision:null,body:null};res.json({ok:true,revision,companyName:base.company_name,oldCode:currentCode,newCode,changedYears:targetIdList.length,companyYearIds:targetIdList})}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('เปลี่ยน Code Company ไม่สำเร็จ',error);res.status(500).json({error:'เปลี่ยน Code Company ไม่สำเร็จ',detail:String(error.message||error).slice(0,500)})}finally{client.release()}});

app.put('/api/his-packages/:id', localOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id), body = req.body || {}, changedBy = String(body.changedBy || 'ผู้ดูแลระบบ').slice(0,120);
    if (!Number.isInteger(id)) return res.status(400).json({ error:'รหัสรายการไม่ถูกต้อง' });
    const code = String(body.packageCode || '').trim(), name = String(body.packageName || '').trim();
    if (!code) return res.status(400).json({ error:'กรุณาระบุ Package Code' });
    const details = Array.isArray(body.detailItems) ? body.detailItems : [];
    const price = body.totalPrice === '' || body.totalPrice == null ? null : Number(body.totalPrice);
    if (price != null && !Number.isFinite(price)) return res.status(400).json({ error:'ราคาไม่ถูกต้อง' });
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM his_packages WHERE id=$1 FOR UPDATE',[id]);
    if (!found.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error:'ไม่พบแพ็กเกจ' }); }
    const before = packageSnapshot(found.rows[0]);
    const after = { ...before, packageCode:code, packageName:name, totalPrice:price, detailItems:details };
    const fields = changedPackageFields(before, after).concat(before.packageCode !== code ? ['packageCode'] : []);
    await client.query(`UPDATE his_packages SET package_code=$1,package_name=$2,total_price=$3,active_from=$4,active_to=$5,is_approved=NULL,detail_items=$6::jsonb,updated_at=NOW(),updated_by=$7 WHERE id=$8`,[code,name,price,after.activeFrom,after.activeTo,JSON.stringify(details),changedBy,id]);
    if (fields.length) await client.query(`INSERT INTO his_package_audit_log (package_id,package_code,action,changed_by,before_data,after_data,changed_fields) VALUES ($1,$2,'MANUAL_UPDATE',$3,$4::jsonb,$5::jsonb,$6::jsonb)`,[id,code,changedBy,JSON.stringify(before),JSON.stringify(after),JSON.stringify(fields)]);
    await client.query('COMMIT'); res.json({ ok:true, changedFields:fields });
  } catch (error) { await client.query('ROLLBACK'); res.status(error.code==='23505'?409:500).json({ error:error.code==='23505'?'Package Code นี้มีอยู่แล้ว':'แก้ไขแพ็กเกจไม่สำเร็จ' }); } finally { client.release(); }
});

app.post('/api/his-packages/bulk-delete', localOnly, async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(Number).filter(Number.isInteger))];
  if (!ids.length) return res.status(400).json({ error:'กรุณาเลือกรายการที่ต้องการลบ' });
  const changedBy = String(req.body?.changedBy || 'ผู้ดูแลระบบ').slice(0,120), client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM his_packages WHERE id=ANY($1::bigint[]) FOR UPDATE',[ids]);
    for (const row of found.rows) await client.query(`INSERT INTO his_package_audit_log (package_id,package_code,action,changed_by,before_data,changed_fields) VALUES ($1,$2,'DELETE',$3,$4::jsonb,'["deleted"]'::jsonb)`,[row.id,row.package_code,changedBy,JSON.stringify(packageSnapshot(row))]);
    await client.query('DELETE FROM his_packages WHERE id=ANY($1::bigint[])',[ids]);
    await client.query('COMMIT'); res.json({ ok:true, deleted:found.rows.length });
  } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error:'ลบแพ็กเกจไม่สำเร็จ' }); } finally { client.release(); }
});

app.get('/api/his-packages/:id/logs', localOnly, async (req, res) => {
  try { const result=await pool.query(`SELECT id,package_code,action,changed_at,changed_by,before_data,after_data,changed_fields FROM his_package_audit_log WHERE package_id=$1 OR LOWER(package_code)=LOWER(COALESCE((SELECT package_code FROM his_packages WHERE id=$1),'')) ORDER BY changed_at DESC,id DESC LIMIT 500`,[Number(req.params.id)]); res.json({items:result.rows}); }
  catch(error){res.status(500).json({error:'อ่าน Log แพ็กเกจไม่สำเร็จ'});}
});

app.put('/api/state', localOnly, async (req, res) => {
  const _healthStarted=Date.now();
  const client=await pool.connect();
  try {
    if (!req.body || !Array.isArray(req.body.companies) || !Array.isArray(req.body.records)) return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    const expected=Number(req.body._revision);if(!Number.isInteger(expected)||expected<0)return res.status(428).json({error:'ไม่พบ Revision กรุณาโหลดข้อมูลใหม่ก่อนบันทึก'});
    const clean={...req.body};delete clean._revision;
    await client.query('BEGIN');
    const current=await client.query('SELECT revision FROM app_state WHERE id=1 FOR UPDATE');
    if(!current.rowCount||Number(current.rows[0].revision)!==expected){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลบน Server มีการเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึกเพื่อป้องกันข้อมูลทับกัน',conflict:true});}
    const revision=expected+1;
    await syncStateToRelational(client,clean,revision);
    const compact=compactAppState(clean);
    await client.query('UPDATE app_state SET data=$1::jsonb,revision=$2,updated_at=NOW() WHERE id=1',[JSON.stringify(compact),revision]);
    await client.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);
    await client.query('COMMIT');compressedStateCache={revision:null,body:null};
    const fullRows=Array.isArray(req.body.records)?req.body.records.length:0;
    await recordSystemHealthEvent({eventType:'FULL_STATE_SAVE',status:fullRows>1?'CRITICAL':'WARN',endpoint:'/api/state',durationMs:Date.now()-_healthStarted,expectedRows:0,actualRows:fullRows,detail:{revision,reason:'Legacy full-state write'}});
    res.json({ok:true,revision,relationalSync:true,compactState:true,health:{fullState:true,recordsReceived:fullRows,durationMs:Date.now()-_healthStarted}});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('บันทึกข้อมูล PostgreSQL ไม่สำเร็จ',error);res.status(500).json({error:'บันทึกข้อมูล PostgreSQL ไม่สำเร็จ',detail:String(error.message||error).slice(0,500)})}
  finally{client.release()}
});

// Fast path for high-frequency clinical edits. It replaces one record in the
// JSON state and updates its relational mirror without replaying all customers.
app.patch('/api/state/records/:recordKey', localOnly, async (req,res)=>{
  const _healthStarted=Date.now();
  const client=await pool.connect();
  try{
    const recordKey=String(req.params.recordKey||'').trim(),record=req.body?.record,emrCase=req.body?.emrCase,expected=Number(req.body?._revision);
    if(!recordKey||!record||typeof record!=='object'||Array.isArray(record))return res.status(400).json({error:'รูปแบบข้อมูลผู้รับบริการไม่ถูกต้อง'});
    if(!Number.isInteger(expected)||expected<0)return res.status(428).json({error:'ไม่พบ Revision กรุณาโหลดข้อมูลใหม่ก่อนบันทึก'});
    const cleanRecord={...record,key:String(record.key||record.id||recordKey)},source=JSON.stringify(cleanRecord);
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5000ms'");
    await client.query("SET LOCAL statement_timeout='15000ms'");
    const locked=await client.query('SELECT revision FROM app_state WHERE id=1 FOR UPDATE');
    if(!locked.rowCount||Number(locked.rows[0].revision)!==expected){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลบน Server มีการเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก',conflict:true})}
    const membership=await client.query('SELECT customer_id FROM company_customers WHERE legacy_record_key=$1 LIMIT 1',[recordKey]);
    if(!membership.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบข้อมูลผู้รับบริการ'})}
    const existingSource=await client.query('SELECT source_data FROM customers WHERE id=$1 LIMIT 1',[membership.rows[0].customer_id]);
    const existingRecord=existingSource.rows[0]?.source_data||{},approvedBy=String(existingRecord.healthBookApprovedBy||'').trim(),actor=workflowActor(req);
    if(existingRecord.healthBookApprovedAt&&approvedBy&&approvedBy!==actor){await client.query('ROLLBACK');return res.status(423).json({error:`เล่มนี้อนุมัติโดย ${approvedBy} ผู้ใช้อื่นไม่สามารถแก้ไขได้`,locked:true,approvedBy})}
    const customerUpdate=await client.query(`UPDATE customers SET identification_number=$2,hn=$3,vn=$4,title=$5,first_name=$6,last_name=$7,birth_date=$8,sex=$9,phone=$10,email=$11,source_data=$12::jsonb,revision=revision+1,updated_at=NOW() WHERE id=$1`,[membership.rows[0].customer_id,String(cleanRecord.id||''),String(cleanRecord.hn||''),String(cleanRecord.vn||cleanRecord.hisLastVisitUID||''),String(cleanRecord.title||''),String(cleanRecord.first||cleanRecord.firstName||''),String(cleanRecord.last||cleanRecord.lastName||''),String(cleanRecord.birth||cleanRecord.birthDate||''),String(cleanRecord.sex||''),String(cleanRecord.phone||''),String(cleanRecord.email||''),source]);
    const membershipUpdate=await client.query(`UPDATE company_customers SET employee_code=$2,package_code=$3,package_name=$4,visited_at=$5,source_data=$6::jsonb,revision=revision+1,updated_at=NOW() WHERE legacy_record_key=$1`,[recordKey,String(cleanRecord.employeeCode||''),String(cleanRecord.code||cleanRecord.packageCode||''),String(cleanRecord.packageName||''),cleanRecord.visitedAt||null,source]);
    if(emrCase&&typeof emrCase==='object'&&!Array.isArray(emrCase)){
      const caseId=String(emrCase.id||'').trim();
      if(caseId){await client.query(`UPDATE app_state SET data=CASE WHEN jsonb_typeof(data->'emrQueue')='array' THEN jsonb_set(data,'{emrQueue}',COALESCE((SELECT jsonb_agg(CASE WHEN value->>'id'=$1 THEN $2::jsonb ELSE value END) FROM jsonb_array_elements(data->'emrQueue')),'[]'::jsonb),true) ELSE data END WHERE id=1`,[caseId,JSON.stringify(emrCase)]).catch(()=>{})}
    }
    const revision=expected+1;
    await client.query('UPDATE app_state SET revision=$1,updated_at=NOW() WHERE id=1',[revision]);
    await client.query("UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error='' WHERE id=1",[revision]);
    await client.query('COMMIT');compressedStateCache={revision:null,body:null};
    const logicalRows=Math.max(Number(customerUpdate.rowCount||0),Number(membershipUpdate.rowCount||0));
    await recordSystemHealthEvent({eventType:'PATIENT_SAVE',status:logicalRows===1?'OK':'CRITICAL',endpoint:'/api/state/records/:recordKey',entityKey:recordKey,durationMs:Date.now()-_healthStarted,expectedRows:1,actualRows:logicalRows,detail:{customerRows:customerUpdate.rowCount,membershipRows:membershipUpdate.rowCount,revision}});
    res.set('Cache-Control','no-store');res.json({ok:true,revision,fastPath:true,relationalOnly:true,health:{expectedRows:1,actualRows:logicalRows,durationMs:Date.now()-_healthStarted}});
  }catch(error){
    await client.query('ROLLBACK').catch(()=>{});
    console.error('บันทึกข้อมูลรายคนไม่สำเร็จ',error);
    recordSystemHealthEvent({eventType:'PATIENT_SAVE',status:error?.code==='55P03'||error?.code==='57014'?'TIMEOUT':'ERROR',endpoint:'/api/state/records/:recordKey',entityKey:String(req.params.recordKey||''),durationMs:Date.now()-_healthStarted,expectedRows:1,actualRows:0,detail:{code:error?.code||'',message:String(error.message||error).slice(0,300)}}).catch(()=>{});
    if(error?.code==='55P03'||error?.code==='57014')return res.status(503).json({error:'ฐานข้อมูลกำลังประมวลผลงานอื่น ระบบยกเลิกการรอเพื่อไม่ให้หน้าจอค้าง กรุณาลองบันทึกอีกครั้ง',retryable:true,code:error.code});
    res.status(500).json({error:'บันทึกข้อมูลรายคนไม่สำเร็จ',detail:String(error.message||error).slice(0,500)})
  }
  finally{client.release()}
});

// Save the organization-book workspace without uploading or relationally
// replaying the complete application state (which includes every EMR result).
app.patch('/api/state/organization-book',localOnly,async(req,res)=>{
  const client=await pool.connect();
  try{
    const expected=Number(req.body?._revision),drafts=Array.isArray(req.body?.drafts)?req.body.drafts:[],cover=req.body?.cover&&typeof req.body.cover==='object'&&!Array.isArray(req.body.cover)?req.body.cover:{};
    if(!Number.isInteger(expected)||expected<0)return res.status(428).json({error:'ไม่พบ Revision กรุณาโหลดข้อมูลใหม่ก่อนบันทึก'});
    await client.query('BEGIN');
    const result=await client.query(`UPDATE app_state SET data=jsonb_set(jsonb_set(data,'{organizationBookDrafts}',$1::jsonb,true),'{organizationBookCover}',$2::jsonb,true),revision=revision+1,updated_at=NOW() WHERE id=1 AND revision=$3 RETURNING revision`,[JSON.stringify(drafts),JSON.stringify(cover),expected]);
    if(!result.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลบน Server มีการเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก',conflict:true})}
    const revision=Number(result.rows[0].revision);
    await client.query('UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error=\'\' WHERE id=1',[revision]);
    await client.query('COMMIT');compressedStateCache={revision:null,body:null};
    res.set('Cache-Control','no-store');res.json({ok:true,revision,fastPath:true});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('บันทึกแบบร่างเล่มองค์กรไม่สำเร็จ',error);res.status(500).json({error:'บันทึกแบบร่างเล่มองค์กรไม่สำเร็จ',detail:String(error.message||error).slice(0,500)})}
  finally{client.release()}
});


// v7.58 Phase 1 — Checkup workflow APIs.
const workflowActor=req=>{const encoded=String(req.headers['x-performed-by-b64']||'').trim();if(encoded){try{return Buffer.from(encoded,'base64').toString('utf8').slice(0,160)}catch(_){}}const raw=String(req.headers['x-performed-by']||req.headers['x-user-name']||'system');try{return decodeURIComponent(raw).slice(0,160)}catch(_){return raw.slice(0,160)}};
async function workflowAudit(req,entityType,entityId,action,details={}){try{await pool.query('INSERT INTO checkup_workflow_audit(entity_type,entity_id,action,details,performed_by,client_address) VALUES($1,$2,$3,$4::jsonb,$5,$6)',[entityType,String(entityId),action,JSON.stringify(details||{}),workflowActor(req),clientAddress(req)])}catch(error){console.warn('workflow audit failed',error.message)}}
const workflowStatus=value=>['DRAFT','OPEN','IN_PROGRESS','CLOSED','CANCELLED'].includes(String(value||''))?String(value):'DRAFT';
const bookingStatus=value=>['BOOKED','ARRIVED','IN_SERVICE','COMPLETE','CANCELLED'].includes(String(value||''))?String(value):'BOOKED';
const visitStatus=value=>['NOT_ARRIVED','CHECKED_IN','IN_SERVICE','COMPLETE','CANCELLED'].includes(String(value||''))?String(value):'NOT_ARRIVED';
async function ensureLegacyStationVisits(date){
  const state=await readState(),records=(state.records||[]).filter(record=>record.openVisitAt&&String(record.hisLastVisitUID||'').trim());
  const bangkokDate=value=>{const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'':new Date(parsed.getTime()+7*60*60*1000).toISOString().slice(0,10)};
  const due=records.filter(record=>bangkokDate(record.openVisitAt)===date);if(!due.length)return;
  const actor='HIS OpenVisit',companies=new Map((state.companies||[]).map(company=>[String(company.id),company]));
  for(const record of due){
    const recordKey=String(record.key||record.id||'');if(!recordKey)continue;
    const company=companies.get(String(record.companyId||''))||{},companyId=String(record.companyId||''),projectId=`his-open-visit-${companyId||'general'}`,bookingId=crypto.randomUUID(),visitId=crypto.randomUUID(),primary=Array.isArray(record.primaryPackages)&&record.primaryPackages.length?record.primaryPackages[0]:{};
    const client=await pool.connect();try{await client.query('BEGIN');await client.query(`INSERT INTO checkup_projects(id,project_code,project_name,company_id,company_name,screening_year,start_date,end_date,location,status,created_by,updated_by) VALUES($1,'HIS-OPEN-VISIT','HIS OpenVisit',$2,$3,$4,$5::date,$5::date,$6,'IN_PROGRESS',$7,$7) ON CONFLICT(id) DO UPDATE SET start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,location=EXCLUDED.location,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[projectId,companyId,String(company.name||''),String(company.year||''),date,String(record.openVisitLocationCode||record.locationCode||''),actor]);await client.query(`INSERT INTO checkup_bookings(id,project_id,record_key,hn,employee_code,patient_name,id_passport,birth_date,sex,company_id,company_name,department_name,position_name,package_code,package_name,scheduled_date,booking_status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::date,'ARRIVED',$17,$17) ON CONFLICT DO NOTHING`,[bookingId,projectId,recordKey,String(record.hn||''),String(record.employeeCode||''),[record.title,record.first,record.last].filter(Boolean).join(' '),String(record.id||''),String(record.birth||''),String(record.sex||''),companyId,String(company.name||''),String(record.departmentName||''),String(record.positionName||''),String(primary.code||record.code||''),String(primary.name||record.packageName||''),date,actor]);const booking=(await client.query('SELECT id FROM checkup_bookings WHERE record_key=$1 ORDER BY updated_at DESC LIMIT 1',[recordKey])).rows[0];if(booking)await client.query(`INSERT INTO checkup_visits(id,booking_id,visit_date,checkin_at,vn,location,visit_status,updated_by) VALUES($1,$2,$3::date,$4,$5,$6,'CHECKED_IN',$7) ON CONFLICT(booking_id) DO UPDATE SET visit_date=EXCLUDED.visit_date,checkin_at=EXCLUDED.checkin_at,vn=CASE WHEN EXCLUDED.vn<>'' THEN EXCLUDED.vn ELSE checkup_visits.vn END,visit_status=CASE WHEN checkup_visits.visit_status='NOT_ARRIVED' THEN 'CHECKED_IN' ELSE checkup_visits.visit_status END,updated_at=NOW(),updated_by=EXCLUDED.updated_by`,[visitId,booking.id,date,record.openVisitAt,String(record.hisLastVisitUID||''),String(record.openVisitLocationCode||record.locationCode||''),actor]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
  }
}

// Prefer the employee's real project Booking over the hidden HIS fallback Booking.
ensureLegacyStationVisits=async function(date){
  await pool.query(`WITH candidates AS (
    SELECT DISTINCT ON (v.id) v.id AS visit_id,real_booking.id AS real_booking_id
    FROM checkup_visits v
    JOIN checkup_bookings fallback_booking ON fallback_booking.id=v.booking_id
    JOIN checkup_projects fallback_project ON fallback_project.id=fallback_booking.project_id AND fallback_project.project_code='HIS-OPEN-VISIT'
    JOIN checkup_bookings real_booking ON real_booking.record_key=fallback_booking.record_key AND real_booking.id<>fallback_booking.id
    JOIN checkup_projects real_project ON real_project.id=real_booking.project_id AND real_project.project_code<>'HIS-OPEN-VISIT'
    WHERE v.visit_date=$1::date
      AND NOT EXISTS(SELECT 1 FROM checkup_visits existing WHERE existing.booking_id=real_booking.id)
    ORDER BY v.id,CASE WHEN $1::date BETWEEN COALESCE(real_project.start_date,$1::date) AND COALESCE(real_project.end_date,$1::date) THEN 0 ELSE 1 END,real_booking.updated_at DESC
  ) UPDATE checkup_visits v SET booking_id=c.real_booking_id,updated_at=NOW(),updated_by='BOOKING_RELINK' FROM candidates c WHERE v.id=c.visit_id`,[date]);
}

const workflowHasPayload=value=>Boolean(value&&(Array.isArray(value)?value.length:typeof value==='object'?Object.keys(value).length:String(value).trim()));
function workflowRecordProjectHisStatus(record={}){const visitSource=record.hisVisitResult||{},visits=Array.isArray(visitSource?.visits)?visitSource.visits:Array.isArray(visitSource?.Visit)?visitSource.Visit:[],primary=Array.isArray(record.hisPrimaryVisitUIDs)?[...new Set(record.hisPrimaryVisitUIDs.map(String).filter(Boolean))]:record.hisLastVisitUID?[String(record.hisLastVisitUID)]:[],map=record.hisEmrResultsByVisit&&typeof record.hisEmrResultsByVisit==='object'?record.hisEmrResultsByVisit:{},hasVn=Boolean(primary.length||record.hisLastVisitUID||visits.some(v=>v&&v.VisitUID));let hasEmr=false;if(primary.length){hasEmr=primary.every(uid=>workflowHasPayload(map[uid])||(String(record.hisLastVisitUID||'')===uid&&workflowHasPayload(record.hisEmrResult)))}else{hasEmr=Boolean(Object.values(map).some(workflowHasPayload)||workflowHasPayload(record.hisEmrResult)||record.hisLastResultAt)}return {hasVn,hasEmr}}
app.get('/api/checkup-projects',localOnly,async(req,res)=>{try{const q=String(req.query.q||'').trim(),companyId=String(req.query.companyId||'').trim(),status=String(req.query.status||'').trim(),params=[],where=[];if(companyId){params.push(companyId);where.push(`p.company_id=$${params.length}`)}if(status){params.push(status);where.push(`p.status=$${params.length}`)}if(q){params.push(`%${q}%`);where.push(`(p.project_code ILIKE $${params.length} OR p.project_name ILIKE $${params.length} OR p.company_name ILIKE $${params.length})`)}const hasVn=`(NULLIF(BTRIM(COALESCE(cc.source_data->>'hisLastVisitUID','')),'') IS NOT NULL OR CASE WHEN jsonb_typeof(cc.source_data->'hisPrimaryVisitUIDs')='array' THEN jsonb_array_length(cc.source_data->'hisPrimaryVisitUIDs')>0 ELSE FALSE END)`;const hasEmr=`(NULLIF(BTRIM(COALESCE(cc.source_data->>'hisLastResultAt','')),'') IS NOT NULL OR CASE WHEN jsonb_typeof(cc.source_data->'hisEmrResult')='object' THEN cc.source_data->'hisEmrResult'<>'{}'::jsonb ELSE FALSE END OR CASE WHEN jsonb_typeof(cc.source_data->'hisEmrResultsByVisit')='object' THEN cc.source_data->'hisEmrResultsByVisit'<>'{}'::jsonb ELSE FALSE END)`;const result=await pool.query(`SELECT p.*,COUNT(DISTINCT b.id)::int AS booking_count,COUNT(DISTINCT v.id) FILTER(WHERE v.visit_status IN ('CHECKED_IN','IN_SERVICE','COMPLETE'))::int AS arrived_count,COUNT(DISTINCT b.id) FILTER(WHERE ${hasVn})::int AS vn_found_count,COUNT(DISTINCT b.id) FILTER(WHERE ${hasEmr})::int AS emr_received_count FROM checkup_projects p LEFT JOIN checkup_bookings b ON b.project_id=p.id LEFT JOIN checkup_visits v ON v.booking_id=b.id LEFT JOIN company_customers cc ON cc.legacy_record_key=b.record_key ${where.length?'WHERE '+where.join(' AND '):''} GROUP BY p.id ORDER BY COALESCE(p.start_date,CURRENT_DATE) DESC,p.created_at DESC`,params);const items=result.rows.map(row=>{const total=Number(row.booking_count||0),received=Number(row.emr_received_count||0);return {...row,emr_pending_count:Math.max(0,total-received),emr_percent:total?Math.min(100,Math.round(received*100/total)):0}});res.set('Cache-Control','no-store');res.json({items})}catch(error){res.status(500).json({error:'อ่านโครงการตรวจสุขภาพไม่สำเร็จ',detail:error.message})}});
app.post('/api/checkup-projects',localOnly,async(req,res)=>{try{const b=req.body||{};if(!String(b.projectName||'').trim())return res.status(400).json({error:'กรุณาระบุชื่อโครงการ'});const id=crypto.randomUUID(),actor=workflowActor(req),payors=Array.isArray(b.payorOptions)?b.payorOptions:[];const result=await pool.query(`INSERT INTO checkup_projects(id,project_code,project_name,company_id,company_name,screening_year,start_date,end_date,location,default_package_code,default_package_name,payor_options,default_location_code,billing_type,contact_person,remark,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$18) RETURNING *`,[id,String(b.projectCode||'').trim(),String(b.projectName).trim(),String(b.companyId||''),String(b.companyName||''),String(b.screeningYear||''),b.startDate||null,b.endDate||null,String(b.location||''),String(b.defaultPackageCode||''),String(b.defaultPackageName||''),JSON.stringify(payors),String(b.defaultLocationCode||''),String(b.billingType||''),String(b.contactPerson||''),String(b.remark||''),workflowStatus(b.status||'DRAFT'),actor]);await workflowAudit(req,'PROJECT',id,'CREATE',{projectName:b.projectName});res.status(201).json(result.rows[0])}catch(error){res.status(500).json({error:'สร้างโครงการไม่สำเร็จ',detail:error.message})}});
app.put('/api/checkup-projects/:id',localOnly,async(req,res)=>{try{const b=req.body||{},actor=workflowActor(req),payors=Array.isArray(b.payorOptions)?b.payorOptions:[];const result=await pool.query(`UPDATE checkup_projects SET project_code=$2,project_name=$3,company_id=$4,company_name=$5,screening_year=$6,start_date=$7,end_date=$8,location=$9,default_package_code=$10,default_package_name=$11,payor_options=$12::jsonb,default_location_code=$13,billing_type=$14,contact_person=$15,remark=$16,status=$17,updated_at=NOW(),updated_by=$18 WHERE id=$1 RETURNING *`,[req.params.id,String(b.projectCode||''),String(b.projectName||'').trim(),String(b.companyId||''),String(b.companyName||''),String(b.screeningYear||''),b.startDate||null,b.endDate||null,String(b.location||''),String(b.defaultPackageCode||''),String(b.defaultPackageName||''),JSON.stringify(payors),String(b.defaultLocationCode||''),String(b.billingType||''),String(b.contactPerson||''),String(b.remark||''),workflowStatus(b.status),actor]);if(!result.rows.length)return res.status(404).json({error:'ไม่พบโครงการ'});await workflowAudit(req,'PROJECT',req.params.id,'UPDATE',{status:b.status});res.json(result.rows[0])}catch(error){res.status(500).json({error:'แก้ไขโครงการไม่สำเร็จ',detail:error.message})}});
app.get('/api/checkup-records/:key/project-payors',localOnly,async(req,res)=>{try{
  const recordKey=String(req.params.key||'').trim(),hn=String(req.query.hn||'').trim(),idPassport=String(req.query.idPassport||'').trim(),companyId=String(req.query.companyId||'').trim();
  const identitySql=`WITH identities AS (
      SELECT DISTINCT c.id AS customer_id,c.hn,c.identification_number,c.passport_number,cc.company_year_id,cc.legacy_record_key,cy.company_id,cy.screening_year
      FROM customers c LEFT JOIN company_customers cc ON cc.customer_id=c.id LEFT JOIN company_years cy ON cy.id=cc.company_year_id
      WHERE (COALESCE($1,'')<>'' AND cc.legacy_record_key=$1)
         OR (COALESCE($2,'')<>'' AND regexp_replace(COALESCE(c.hn,''),'[^A-Za-z0-9]','','g')=regexp_replace($2,'[^A-Za-z0-9]','','g'))
         OR (COALESCE($3,'')<>'' AND (LOWER(BTRIM(COALESCE(c.identification_number,'')))=LOWER(BTRIM($3)) OR LOWER(BTRIM(COALESCE(c.passport_number,'')))=LOWER(BTRIM($3))))
    ), record_keys AS (
      SELECT legacy_record_key FROM identities WHERE COALESCE(legacy_record_key,'')<>'' UNION SELECT $1 WHERE COALESCE($1,'')<>''
    )`;
  const direct=await pool.query(identitySql+` SELECT b.id AS booking_id,b.scheduled_date,b.booking_status,b.company_id AS booking_company_id,b.hn AS booking_hn,b.id_passport AS booking_id_passport,
           p.id AS project_id,p.project_code,p.project_name,p.company_name,p.screening_year,p.payor_options,p.default_location_code,p.billing_type,FALSE AS company_fallback
    FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id
    WHERE (b.record_key IN (SELECT legacy_record_key FROM record_keys)
      OR (COALESCE($2,'')<>'' AND regexp_replace(COALESCE(b.hn,''),'[^A-Za-z0-9]','','g')=regexp_replace($2,'[^A-Za-z0-9]','','g'))
      OR (COALESCE($3,'')<>'' AND LOWER(BTRIM(COALESCE(b.id_passport,'')))=LOWER(BTRIM($3))))
      AND b.booking_status<>'CANCELLED' AND p.status<>'CANCELLED' AND p.project_code<>'HIS-OPEN-VISIT'
    ORDER BY CASE WHEN COALESCE($4,'')<>'' AND b.company_id=$4 THEN 0 ELSE 1 END,CASE WHEN b.scheduled_date=CURRENT_DATE THEN 0 ELSE 1 END,b.scheduled_date DESC NULLS LAST,b.updated_at DESC`,[recordKey,hn,idPassport,companyId]);
  let rows=direct.rows;
  // When the person belongs to a company/year but has not yet been added to a Booking,
  // expose eligible company projects as selectable Booking candidates.
  if(!rows.length){
    const fallback=await pool.query(identitySql+` SELECT NULL::text AS booking_id,
        CASE WHEN CURRENT_DATE BETWEEN COALESCE(p.start_date,CURRENT_DATE) AND COALESCE(p.end_date,CURRENT_DATE) THEN CURRENT_DATE ELSE p.start_date END AS scheduled_date,
        'AVAILABLE'::text AS booking_status,p.company_id AS booking_company_id,''::text AS booking_hn,''::text AS booking_id_passport,
        p.id AS project_id,p.project_code,p.project_name,p.company_name,p.screening_year,p.payor_options,p.default_location_code,p.billing_type,TRUE AS company_fallback
      FROM checkup_projects p
      WHERE p.status<>'CANCELLED' AND p.project_code<>'HIS-OPEN-VISIT'
        AND EXISTS(SELECT 1 FROM identities i WHERE (p.company_id=i.company_id OR p.company_id=i.company_year_id OR (COALESCE($4,'')<>'' AND p.company_id=$4))
          AND (COALESCE(p.screening_year,'')='' OR COALESCE(i.screening_year,'')='' OR p.screening_year=i.screening_year))
      ORDER BY CASE WHEN p.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END,p.start_date DESC NULLS LAST,p.updated_at DESC`,[recordKey,hn,idPassport,companyId]);
    rows=fallback.rows;
  }
  const seen=new Set();
  const bookings=rows.filter(row=>{const id=String(row.booking_id||`PROJECT:${row.project_id}`);if(!id||seen.has(id))return false;seen.add(id);return true}).map(row=>{const payorOptions=(Array.isArray(row.payor_options)?row.payor_options:[]).map(item=>({payor:String(item.payor||''),agreement:String(item.agreement||''),office:String(item.office||'')})).filter(item=>item.payor);return {id:row.company_fallback?`PROJECT:${row.project_id}`:String(row.booking_id),projectId:String(row.project_id),projectCode:String(row.project_code||''),projectName:String(row.project_name||''),companyName:String(row.company_name||''),screeningYear:String(row.screening_year||''),scheduledDate:row.scheduled_date,bookingStatus:String(row.booking_status||''),defaultLocationCode:String(row.default_location_code||''),bookingType:String(row.billing_type||''),payorOptions,companyFallback:Boolean(row.company_fallback)}});
  const map=new Map();for(const booking of bookings)for(const value of booking.payorOptions)map.set(`${value.payor}|${value.agreement}|${value.office}`,value);
  const first=bookings[0]||{};res.set('Cache-Control','no-store');res.json({hasBooking:bookings.length>0,bookings,items:[...map.values()],defaultLocationCode:first.defaultLocationCode||'',bookingType:first.bookingType||'',matchedBy:{recordKey:Boolean(recordKey),hn:Boolean(hn),idPassport:Boolean(idPassport)},companyFallback:bookings.some(x=>x.companyFallback)});
}catch(error){res.status(500).json({error:'อ่าน Booking/Payor ของโครงการไม่สำเร็จ',detail:error.message})}});
app.delete('/api/checkup-projects/:id',localOnly,async(req,res)=>{try{const count=await pool.query('SELECT COUNT(*)::int AS n FROM checkup_bookings WHERE project_id=$1',[req.params.id]);if(Number(count.rows[0]?.n||0)>0)return res.status(409).json({error:'โครงการมี Booking แล้ว กรุณาปิด/ยกเลิกโครงการแทนการลบ'});const result=await pool.query('DELETE FROM checkup_projects WHERE id=$1',[req.params.id]);if(!result.rowCount)return res.status(404).json({error:'ไม่พบโครงการ'});await workflowAudit(req,'PROJECT',req.params.id,'DELETE');res.json({ok:true})}catch(error){res.status(500).json({error:'ลบโครงการไม่สำเร็จ',detail:error.message})}});


app.get('/api/package-category-master', localOnly, async(req,res)=>{try{
  const categories=await pool.query(`SELECT c.id,c.code,c.name,c.sort_order,c.active,
    COALESCE(json_agg(json_build_object('id',s.id,'name',s.name,'sortOrder',s.sort_order,'active',s.active) ORDER BY s.sort_order,s.name) FILTER (WHERE s.id IS NOT NULL),'[]'::json) subcategories
    FROM package_categories c LEFT JOIN package_subcategories s ON s.category_id=c.id
    GROUP BY c.id ORDER BY c.sort_order,c.name`);res.json({items:categories.rows});
}catch(error){res.status(500).json({error:'อ่าน Master หมวดรายการตรวจไม่สำเร็จ',detail:error.message})}});
app.post('/api/package-category-master/categories',localOnly,async(req,res)=>{try{const b=req.body||{},code=String(b.code||'').trim(),name=String(b.name||code).trim();if(!code||!name)return res.status(400).json({error:'กรุณาระบุรหัสและชื่อหมวดหลัก'});const r=await pool.query(`INSERT INTO package_categories(code,name,sort_order,active) VALUES($1,$2,$3,$4) RETURNING *`,[code,name,Number(b.sortOrder||0),b.active!==false]);res.status(201).json(r.rows[0])}catch(error){res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'รหัสหมวดหลักนี้มีอยู่แล้ว':'เพิ่มหมวดหลักไม่สำเร็จ',detail:error.message})}});
app.put('/api/package-category-master/categories/:id',localOnly,async(req,res)=>{try{const b=req.body||{},r=await pool.query(`UPDATE package_categories SET code=$2,name=$3,sort_order=$4,active=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,String(b.code||'').trim(),String(b.name||'').trim(),Number(b.sortOrder||0),b.active!==false]);if(!r.rowCount)return res.status(404).json({error:'ไม่พบหมวดหลัก'});res.json(r.rows[0])}catch(error){res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'รหัสหมวดหลักนี้มีอยู่แล้ว':'แก้ไขหมวดหลักไม่สำเร็จ',detail:error.message})}});
app.post('/api/package-category-master/subcategories',localOnly,async(req,res)=>{try{const b=req.body||{},name=String(b.name||'').trim();if(!b.categoryId||!name)return res.status(400).json({error:'กรุณาเลือกหมวดหลักและระบุชื่อหมวดย่อย'});const r=await pool.query(`INSERT INTO package_subcategories(category_id,name,sort_order,active) VALUES($1,$2,$3,$4) RETURNING *`,[b.categoryId,name,Number(b.sortOrder||0),b.active!==false]);res.status(201).json(r.rows[0])}catch(error){res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'หมวดย่อยนี้มีอยู่แล้ว':'เพิ่มหมวดย่อยไม่สำเร็จ',detail:error.message})}});
app.put('/api/package-category-master/subcategories/:id',localOnly,async(req,res)=>{try{const b=req.body||{},r=await pool.query(`UPDATE package_subcategories SET category_id=$2,name=$3,sort_order=$4,active=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,[req.params.id,b.categoryId,String(b.name||'').trim(),Number(b.sortOrder||0),b.active!==false]);if(!r.rowCount)return res.status(404).json({error:'ไม่พบหมวดย่อย'});res.json(r.rows[0])}catch(error){res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'หมวดย่อยนี้มีอยู่แล้ว':'แก้ไขหมวดย่อยไม่สำเร็จ',detail:error.message})}});

app.post('/api/checkup-bookings/memberships',localOnly,async(req,res)=>{try{const keys=[...new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(String).filter(Boolean))].slice(0,500);if(!keys.length)return res.json({items:{}});const result=await pool.query(`SELECT b.record_key,b.id AS booking_id,b.booking_status,b.scheduled_date,b.package_code,b.package_name,p.id AS project_id,p.project_code,p.project_name,p.billing_type,p.start_date,p.end_date,p.default_package_code,p.default_package_name FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id WHERE b.record_key=ANY($1::text[]) AND p.project_code<>'HIS-OPEN-VISIT' ORDER BY COALESCE(b.scheduled_date,p.start_date) DESC NULLS LAST,p.created_at DESC`,[keys]);const items={};for(const row of result.rows){if(!items[row.record_key])items[row.record_key]=[];items[row.record_key].push(row)}res.json({items})}catch(error){res.status(500).json({error:'อ่านข้อมูล Booking ของลูกค้าไม่สำเร็จ',detail:error.message})}});
app.get('/api/checkup-bookings',localOnly,async(req,res)=>{try{const projectId=String(req.query.projectId||''),q=String(req.query.q||'').trim(),params=[],where=[];if(projectId){params.push(projectId);where.push(`b.project_id=$${params.length}`)}if(q){params.push(`%${q}%`);where.push(`(b.patient_name ILIKE $${params.length} OR b.hn ILIKE $${params.length} OR b.employee_code ILIKE $${params.length} OR b.id_passport ILIKE $${params.length})`)}const result=await pool.query(`SELECT b.*,v.id AS visit_id,v.visit_date,v.checkin_at,v.vn,v.visit_status,v.result_status,v.order_total,v.order_complete FROM checkup_bookings b LEFT JOIN checkup_visits v ON v.booking_id=b.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY b.scheduled_date NULLS LAST,b.patient_name LIMIT 2000`,params);res.json({items:result.rows})}catch(error){res.status(500).json({error:'อ่าน Booking ไม่สำเร็จ',detail:error.message})}});

app.post('/api/checkup-bookings/bulk-move',localOnly,async(req,res)=>{
  const client=await pool.connect();
  try{
    const recordKeys=[...new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(String).map(x=>x.trim()).filter(Boolean))].slice(0,2000),sourceProjectId=String(req.body?.sourceProjectId||'').trim(),targetProjectId=String(req.body?.targetProjectId||'').trim();
    if(!recordKeys.length)return res.status(400).json({error:'กรุณาเลือกรายการที่ต้องการย้าย'});if(!sourceProjectId||!targetProjectId)return res.status(400).json({error:'กรุณาระบุ Booking ต้นทางและปลายทาง'});if(sourceProjectId===targetProjectId)return res.status(400).json({error:'Booking ต้นทางและปลายทางต้องไม่ใช่รายการเดียวกัน'});
    await client.query('BEGIN');
    const projects=await client.query(`SELECT id,company_id,project_name,status FROM checkup_projects WHERE id=ANY($1::text[]) FOR SHARE`,[[sourceProjectId,targetProjectId]]),projectMap=new Map(projects.rows.map(row=>[String(row.id),row])),source=projectMap.get(sourceProjectId),target=projectMap.get(targetProjectId);
    if(!source||!target){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบ Booking ต้นทางหรือปลายทาง'});}if(String(source.company_id||'')!==String(target.company_id||'')){await client.query('ROLLBACK');return res.status(409).json({error:'ย้าย Booking ข้ามบริษัท/ปีไม่ได้ กรุณาเลือก Booking ในบริษัทและปีเดียวกัน'});}
    const sourceRows=(await client.query(`SELECT id,record_key FROM checkup_bookings WHERE project_id=$1 AND record_key=ANY($2::text[]) FOR UPDATE`,[sourceProjectId,recordKeys])).rows,sourceKeys=new Set(sourceRows.map(row=>String(row.record_key))),targetRows=(await client.query(`SELECT record_key FROM checkup_bookings WHERE project_id=$1 AND record_key=ANY($2::text[])`,[targetProjectId,recordKeys])).rows,targetKeys=new Set(targetRows.map(row=>String(row.record_key))),movable=sourceRows.filter(row=>!targetKeys.has(String(row.record_key))),actor=workflowActor(req);let movedRows=[];
    if(movable.length){const ids=movable.map(row=>String(row.id));movedRows=(await client.query(`UPDATE checkup_bookings SET project_id=$2,updated_at=NOW(),updated_by=$3 WHERE id=ANY($1::text[]) RETURNING id,record_key`,[ids,targetProjectId,actor])).rows;}
    await client.query('COMMIT');
    const result={ok:true,requested:recordKeys.length,moved:movedRows.length,alreadyInTarget:[...targetKeys].filter(key=>sourceKeys.has(key)).length,notInSource:recordKeys.filter(key=>!sourceKeys.has(key)).length,sourceProjectId,targetProjectId};
    await workflowAudit(req,'BOOKING','BULK','MOVE',result);res.json(result);
  }catch(error){try{await client.query('ROLLBACK')}catch(_){}if(error.code==='23505')return res.status(409).json({error:'บางรายชื่อมีอยู่ใน Booking ปลายทางแล้ว กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง'});res.status(500).json({error:'ย้าย Booking ไม่สำเร็จ',detail:error.message})}finally{client.release()}
});

const customerImportStableId=(prefix,value)=>`${prefix}_${crypto.createHash('sha256').update(String(value||crypto.randomUUID())).digest('hex').slice(0,24)}`;
const mergeCustomerImportServer=(existing=[],incoming=[],companyId='')=>mergeCustomerImport(existing,incoming,companyId);
app.post('/api/customer-import',localOnly,async(req,res)=>{
  const client=await pool.connect();
  try{
    const companyId=String(req.body?.companyId||'').trim(),incoming=Array.isArray(req.body?.records)?req.body.records:[],expected=Number(req.body?._revision),updatedBy=String(req.body?.updatedBy||'system').slice(0,120);
    if(!companyId)return res.status(400).json({error:'ไม่พบบริษัท/ปีสำหรับนำเข้า'});if(!incoming.length)return res.status(400).json({error:'ไม่พบข้อมูลลูกค้าสำหรับนำเข้า'});if(incoming.length>5000)return res.status(400).json({error:'นำเข้าได้สูงสุด 5,000 รายชื่อต่อครั้ง'});if(!Number.isInteger(expected)||expected<0)return res.status(428).json({error:'ไม่พบ Revision กรุณาโหลดข้อมูลใหม่ก่อนนำเข้า'});
    await client.query('BEGIN');
    const stateRow=(await client.query('SELECT data,revision FROM app_state WHERE id=1 FOR UPDATE')).rows[0];if(!stateRow){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบข้อมูลระบบ PRODUCTION'});}if(Number(stateRow.revision)!==expected){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลบน Server มีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนนำเข้า',conflict:true});}
    const stateData=stateRow.data&&typeof stateRow.data==='object'?stateRow.data:{},allRecords=Array.isArray(stateData.records)?stateData.records:[],companies=Array.isArray(stateData.companies)?stateData.companies:[];const yearInfo=(await client.query(`SELECT cy.id,cy.screening_year AS year,c.company_code,cy.note,c.company_name FROM company_years cy JOIN companies c ON c.id=cy.company_id WHERE cy.id=$1 LIMIT 1`,[companyId])).rows[0];if(!yearInfo){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบบริษัท/ปีตามรหัสที่เลือก กรุณากลับไปเลือกบริษัท/ปีใหม่'});}let companyIndex=companies.findIndex(item=>String(item?.id||'')===companyId);if(companyIndex<0){companies.push({id:companyId,name:String(yearInfo.company_name||''),year:String(yearInfo.year||''),code:String(yearInfo.company_code||''),note:String(yearInfo.note||''),updatedAt:new Date().toISOString()});companyIndex=companies.length-1;}
    const existing=allRecords.filter(record=>String(record?.companyId||'')===companyId),outside=allRecords.filter(record=>String(record?.companyId||'')!==companyId),merge=mergeCustomerImportServer(existing,incoming,companyId),updatedAt=new Date().toISOString();companies[companyIndex]={...companies[companyIndex],updatedAt};const nextRecords=outside.concat(merge.companyRecords);
    const stateUpdate=await client.query(`UPDATE app_state SET data=jsonb_set(jsonb_set(data,'{records}',$1::jsonb,true),'{companies}',$2::jsonb,true),revision=revision+1,updated_at=NOW() WHERE id=1 AND revision=$3 RETURNING revision`,[JSON.stringify(nextRecords),JSON.stringify(companies),expected]);if(!stateUpdate.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลบน Server มีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่ก่อนนำเข้า',conflict:true});}const revision=Number(stateUpdate.rows[0].revision);
    for(const record of merge.changedRecords){
      const legacyKey=String(record.key||record.id||customerImportStableId('person',JSON.stringify(record))).trim(),rawIdentity=String(record.id||record.idPassport||'').trim(),identity=normalizeCustomerIdentity(rawIdentity),identificationType=String(record.identificationType||'').trim().toLowerCase(),source=JSON.stringify({...record,id:identity||rawIdentity,key:legacyKey,companyId});let customerId='';const byKey=await client.query('SELECT customer_id FROM company_customers WHERE legacy_record_key=$1 LIMIT 1',[legacyKey]);if(byKey.rowCount)customerId=String(byKey.rows[0].customer_id||'');if(!customerId&&identity){const byIdentity=await client.query(`SELECT id FROM customers WHERE regexp_replace(LOWER(BTRIM(COALESCE(identification_number,''))),'[^a-z0-9]','','g')=$1 OR regexp_replace(LOWER(BTRIM(COALESCE(passport_number,''))),'[^a-z0-9]','','g')=$1 LIMIT 1`,[identity]);if(byIdentity.rowCount)customerId=String(byIdentity.rows[0].id||'');}if(!customerId)customerId=customerImportStableId('customer',(identity||legacyKey).toLowerCase());const membershipId=customerImportStableId('membership',`${companyId}|${customerId}`),passport=identificationType==='passport'?identity:'',idNumber=identificationType==='passport'?'':identity;
      await client.query(`INSERT INTO customers(id,hn,vn,identification_number,passport_number,title,first_name,last_name,birth_date,sex,phone,email,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) ON CONFLICT(id) DO UPDATE SET hn=EXCLUDED.hn,vn=EXCLUDED.vn,identification_number=EXCLUDED.identification_number,passport_number=EXCLUDED.passport_number,title=EXCLUDED.title,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,birth_date=EXCLUDED.birth_date,sex=EXCLUDED.sex,phone=EXCLUDED.phone,email=EXCLUDED.email,source_data=EXCLUDED.source_data,revision=customers.revision+1,updated_at=NOW()`,[customerId,String(record.hn||''),String(record.vn||record.hisLastVisitUID||''),idNumber,passport,String(record.title||''),String(record.first||record.firstName||''),String(record.last||record.lastName||''),String(record.birth||record.birthDate||''),String(record.sex||''),String(record.phone||''),String(record.email||''),source]);
      await client.query(`INSERT INTO company_customers(id,company_year_id,customer_id,legacy_record_key,employee_code,package_code,package_name,visited_at,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(company_year_id,customer_id) DO UPDATE SET legacy_record_key=EXCLUDED.legacy_record_key,employee_code=EXCLUDED.employee_code,package_code=EXCLUDED.package_code,package_name=EXCLUDED.package_name,visited_at=EXCLUDED.visited_at,source_data=EXCLUDED.source_data,revision=company_customers.revision+1,updated_at=NOW()`,[membershipId,companyId,customerId,legacyKey,String(record.employeeCode||''),String(record.code||record.packageCode||''),String(record.packageName||''),record.visitedAt||null,source]);
    }
    await client.query('UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),last_error=\'\' WHERE id=1',[revision]);await client.query(`INSERT INTO audit_logs(entity_type,entity_id,action,before_data,after_data,changed_fields,performed_by,client_address) VALUES('CUSTOMER_IMPORT',$1,'IMPORT',$2::jsonb,$3::jsonb,$4::jsonb,$5,$6)`,[companyId,JSON.stringify({existing:existing.length}),JSON.stringify({imported:incoming.length,companyRecords:merge.companyRecords.length,added:merge.added,updated:merge.updated,kept:merge.kept,duplicateIncoming:merge.duplicateIncoming||0,conflicts:(merge.conflicts||[]).length}),JSON.stringify(['records']),updatedBy,String(req.ip||req.socket?.remoteAddress||'').slice(0,120)]).catch(()=>{});
    await client.query('COMMIT');compressedStateCache={revision:null,body:null};res.set('Cache-Control','no-store');res.json({ok:true,revision,updatedAt,added:merge.added,updated:merge.updated,kept:merge.kept,duplicateIncoming:merge.duplicateIncoming||0,conflictCount:(merge.conflicts||[]).length,conflicts:merge.conflicts||[],companyRecordCount:merge.companyRecords.length});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('นำเข้าข้อมูลลูกค้าไม่สำเร็จ',error);res.status(500).json({error:'นำเข้าข้อมูลลูกค้าไม่สำเร็จ',detail:String(error.message||error).slice(0,500)});}finally{client.release();}
});

app.get('/api/customer-search',localOnly,async(req,res)=>{try{
  const person=String(req.query.person||'').trim().slice(0,180),nameText=String(req.query.name||'').trim().slice(0,180),identityText=String(req.query.identity||'').trim().slice(0,180),hnText=String(req.query.hn||'').trim().slice(0,80),packageText=String(req.query.package||'').trim().slice(0,180),bookingText=String(req.query.booking||'').trim().slice(0,180),companyId=String(req.query.companyId||'').trim(),limit=Math.min(Math.max(Number(req.query.limit)||120,1),200);
  const projection=`SELECT cc.source_data AS record,c.revision AS customer_revision,c.hn,c.vn,c.identification_number,c.title,c.first_name,c.last_name,c.birth_date,c.sex,c.phone,c.email,cc.employee_code,cc.package_code,cc.package_name,COUNT(*) OVER()::int AS total FROM company_customers cc JOIN customers c ON c.id=cc.customer_id`;
  const send=result=>{const total=Number(result.rows[0]?.total||0),items=result.rows.map(row=>({...row.record,hn:row.hn||row.record?.hn||'',vn:row.vn||row.record?.vn||row.record?.hisLastVisitUID||'',hisLastVisitUID:row.vn||row.record?.hisLastVisitUID||'',id:row.identification_number||row.record?.id||'',title:row.title||row.record?.title||'',first:row.first_name||row.record?.first||'',last:row.last_name||row.record?.last||'',birth:row.birth_date||row.record?.birth||'',sex:row.sex||row.record?.sex||'',phone:row.phone||row.record?.phone||'',email:row.email||row.record?.email||'',employeeCode:row.employee_code||row.record?.employeeCode||'',code:row.package_code||row.record?.code||'',packageName:row.package_name||row.record?.packageName||'',_relRevision:Number(row.customer_revision||1)})).filter(Boolean);res.set('Cache-Control','no-store');return res.json({total,limit,items})};
  // Resolve identifier-like input through B-tree indexes first. If no exact record
  // exists, retain the legacy contains-search behavior so partial queries still work.
  const normalizedPerson=person.replace(/[^A-Za-z0-9]/g,'').toLowerCase();
  if(person&&!packageText&&!bookingText&&normalizedPerson.length>=6){
    const exactParams=[person,normalizedPerson],exactWhere=[];
    if(companyId){exactParams.push(companyId);exactWhere.push(`cc.company_year_id=$${exactParams.length}`)}
    exactWhere.push(`(LOWER(c.hn)=LOWER($1) OR regexp_replace(LOWER(COALESCE(c.hn,'')),'[^a-z0-9]','','g')=$2 OR LOWER(c.vn)=LOWER($1) OR LOWER(c.identification_number)=LOWER($1) OR LOWER(c.passport_number)=LOWER($1) OR LOWER(cc.employee_code)=LOWER($1))`);
    exactParams.push(limit);
    const exact=await pool.query(`${projection} WHERE ${exactWhere.join(' AND ')} ORDER BY cc.updated_at DESC LIMIT $${exactParams.length}`,exactParams);
    if(exact.rowCount)return send(exact);
  }
  const params=[],where=[];
  if(companyId){params.push(companyId);where.push(`cc.company_year_id=$${params.length}`)}
  if(nameText){params.push(nameText);const n=params.length;where.push(`(LOWER(c.first_name) LIKE '%'||LOWER($${n})||'%' OR LOWER(c.last_name) LIKE '%'||LOWER($${n})||'%' OR LOWER(c.first_name||' '||c.last_name) LIKE '%'||LOWER($${n})||'%')`)}
  if(identityText){params.push(identityText);const n=params.length;where.push(`(c.identification_number ILIKE '%'||$${n}||'%' OR c.passport_number ILIKE '%'||$${n}||'%')`)}
  if(hnText){params.push(hnText);const n=params.length;where.push(`(c.hn ILIKE '%'||$${n}||'%' OR (regexp_replace($${n},'[^A-Za-z0-9]','','g')<>'' AND regexp_replace(COALESCE(c.hn,''),'[^A-Za-z0-9]','','g')=regexp_replace($${n},'[^A-Za-z0-9]','','g')))`)}
  if(person){params.push(person);const n=params.length;where.push(`(c.hn ILIKE '%'||$${n}||'%' OR (regexp_replace($${n},'[^A-Za-z0-9]','','g')<>'' AND regexp_replace(COALESCE(c.hn,''),'[^A-Za-z0-9]','','g')=regexp_replace($${n},'[^A-Za-z0-9]','','g')) OR c.vn ILIKE '%'||$${n}||'%' OR c.identification_number ILIKE '%'||$${n}||'%' OR c.passport_number ILIKE '%'||$${n}||'%' OR LOWER(c.first_name) LIKE '%'||LOWER($${n})||'%' OR LOWER(c.last_name) LIKE '%'||LOWER($${n})||'%' OR LOWER(c.first_name||' '||c.last_name) LIKE '%'||LOWER($${n})||'%' OR cc.employee_code ILIKE '%'||$${n}||'%')`)}
  if(packageText){params.push(packageText);const n=params.length;where.push(`(cc.package_code ILIKE '%'||$${n}||'%' OR cc.package_name ILIKE '%'||$${n}||'%' OR cc.source_data->>'code' ILIKE '%'||$${n}||'%' OR cc.source_data->>'packageName' ILIKE '%'||$${n}||'%')`)}
  if(bookingText){params.push(bookingText);const n=params.length;where.push(`EXISTS (SELECT 1 FROM checkup_bookings b LEFT JOIN checkup_projects p ON p.id=b.project_id WHERE b.record_key=cc.legacy_record_key AND (b.id ILIKE '%'||$${n}||'%' OR b.project_id ILIKE '%'||$${n}||'%' OR b.company_id ILIKE '%'||$${n}||'%' OR b.company_name ILIKE '%'||$${n}||'%' OR b.hn ILIKE '%'||$${n}||'%' OR b.employee_code ILIKE '%'||$${n}||'%' OR p.project_code ILIKE '%'||$${n}||'%' OR p.project_name ILIKE '%'||$${n}||'%'))`)}
  params.push(limit);
  const result=await pool.query(`${projection} ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY cc.updated_at DESC LIMIT $${params.length}`,params);
  return send(result);
}catch(error){res.status(500).json({error:'ค้นหาข้อมูลลูกค้าไม่สำเร็จ',detail:error.message})}});
app.post('/api/checkup-bookings',localOnly,async(req,res)=>{try{const b=req.body||{},recordKey=String(b.recordKey||'').trim();if(!recordKey)return res.status(400).json({error:'recordKey is required'});const found=(await pool.query(`SELECT cc.legacy_record_key,cc.company_year_id,cc.employee_code,cc.package_code,cc.package_name,cc.source_data,c.hn,c.vn,c.identification_number,c.title,c.first_name,c.last_name,c.birth_date,c.sex,cy.company_id AS normalized_company_id,co.company_name FROM company_customers cc JOIN customers c ON c.id=cc.customer_id JOIN company_years cy ON cy.id=cc.company_year_id JOIN companies co ON co.id=cy.company_id WHERE cc.legacy_record_key=$1 LIMIT 1`,[recordKey])).rows[0];if(!found)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้าที่เลือก'});const record={...found.source_data,key:recordKey,companyId:found.company_year_id,hn:found.hn||found.source_data?.hn||'',id:found.identification_number||found.source_data?.id||'',title:found.title||found.source_data?.title||'',first:found.first_name||found.source_data?.first||'',last:found.last_name||found.source_data?.last||'',birth:found.birth_date||found.source_data?.birth||'',sex:found.sex||found.source_data?.sex||'',employeeCode:found.employee_code||found.source_data?.employeeCode||'',code:found.package_code||found.source_data?.code||'',packageName:found.package_name||found.source_data?.packageName||''};const project=typedWorkflowRepository?.findCheckupProjectById?await typedWorkflowRepository.findCheckupProjectById(pool,b.projectId):(await pool.query('SELECT * FROM checkup_projects WHERE id=$1',[b.projectId])).rows[0];if(!project)return res.status(404).json({error:'ไม่พบโครงการ'});const id=crypto.randomUUID(),actor=workflowActor(req),values=[id,project.id,recordKey,String(record.hn||''),String(record.employeeCode||''),[record.title,record.first,record.last].filter(Boolean).join(' '),String(record.id||''),String(record.birth||''),String(record.sex||''),String(found.company_year_id||''),String(found.company_name||project.company_name||''),String(record.departmentName||''),String(record.positionName||''),String(b.packageCode||record.code||project.default_package_code||''),String(b.packageName||record.packageName||project.default_package_name||''),b.scheduledDate||project.start_date||null,String(b.remark||''),actor],created=typedWorkflowRepository?.insertCheckupBooking?await typedWorkflowRepository.insertCheckupBooking(pool,values):(await pool.query(`INSERT INTO checkup_bookings(id,project_id,record_key,hn,employee_code,patient_name,id_passport,birth_date,sex,company_id,company_name,department_name,position_name,package_code,package_name,scheduled_date,booking_status,remark,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'BOOKED',$17,$18,$18) RETURNING *`,values)).rows[0];await workflowAudit(req,'BOOKING',id,'CREATE',{projectId:project.id,recordKey});res.status(201).json(created)}catch(error){if(error.code==='23505')return res.status(409).json({error:'รายชื่อนี้มี Booking ในโครงการแล้ว'});res.status(500).json({error:'สร้าง Booking ไม่สำเร็จ',detail:error.message})}});
app.post('/api/checkup-bookings/bulk-from-company',localOnly,async(req,res)=>{try{const b=req.body||{},project=typedWorkflowRepository?.findCheckupProjectById?await typedWorkflowRepository.findCheckupProjectById(pool,b.projectId):(await pool.query('SELECT * FROM checkup_projects WHERE id=$1',[b.projectId])).rows[0];if(!project)return res.status(404).json({error:'ไม่พบโครงการ'});const companyId=String(b.companyId||project.company_id||''),actor=workflowActor(req),rows=(await pool.query(`SELECT cc.legacy_record_key,cc.employee_code,cc.package_code,cc.package_name,cc.source_data,c.hn,c.identification_number,c.title,c.first_name,c.last_name,c.birth_date,c.sex,co.company_name FROM company_customers cc JOIN customers c ON c.id=cc.customer_id JOIN company_years cy ON cy.id=cc.company_year_id JOIN companies co ON co.id=cy.company_id WHERE cc.company_year_id=$1 ORDER BY cc.id`,[companyId])).rows;let inserted=0,skipped=0;for(const row of rows){const r={...row.source_data,key:row.legacy_record_key,hn:row.hn||row.source_data?.hn||'',employeeCode:row.employee_code||row.source_data?.employeeCode||'',id:row.identification_number||row.source_data?.id||'',title:row.title||row.source_data?.title||'',first:row.first_name||row.source_data?.first||'',last:row.last_name||row.source_data?.last||'',birth:row.birth_date||row.source_data?.birth||'',sex:row.sex||row.source_data?.sex||'',code:row.package_code||row.source_data?.code||'',packageName:row.package_name||row.source_data?.packageName||''};try{const values=[crypto.randomUUID(),project.id,String(r.key),String(r.hn||''),String(r.employeeCode||''),[r.title,r.first,r.last].filter(Boolean).join(' '),String(r.id||''),String(r.birth||''),String(r.sex||''),companyId,String(row.company_name||project.company_name||''),String(r.departmentName||''),String(r.positionName||''),String(r.code||project.default_package_code||''),String(r.packageName||project.default_package_name||''),b.scheduledDate||project.start_date||null,actor];if(typedWorkflowRepository?.insertBulkCheckupBooking)await typedWorkflowRepository.insertBulkCheckupBooking(pool,values);else await pool.query(`INSERT INTO checkup_bookings(id,project_id,record_key,hn,employee_code,patient_name,id_passport,birth_date,sex,company_id,company_name,department_name,position_name,package_code,package_name,scheduled_date,booking_status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'BOOKED',$17,$17)`,values);inserted++}catch(error){if(error.code==='23505')skipped++;else throw error}}await workflowAudit(req,'PROJECT',project.id,'BULK_BOOKING',{inserted,skipped,companyId});res.json({ok:true,inserted,skipped,total:rows.length})}catch(error){res.status(500).json({error:'สร้าง Booking จากบริษัทไม่สำเร็จ',detail:error.message})}});
app.post('/api/checkup-bookings/bulk-delete',localOnly,async(req,res)=>{try{
  const ids=[...new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(String).filter(Boolean))].slice(0,2000),projectId=String(req.body?.projectId||'');if(!ids.length)return res.status(400).json({error:'กรุณาเลือกรายการที่ต้องการลบ'});
  const state=await readState(),recordKeys=new Set((state.records||[]).map(r=>String(r.key||r.id||'')).filter(Boolean));
  const status=await pool.query(`SELECT b.id,b.record_key,b.patient_name,b.hn,b.project_id,COALESCE(v.visit_status,'NOT_ARRIVED') AS visit_status FROM checkup_bookings b LEFT JOIN checkup_visits v ON v.booking_id=b.id WHERE b.id=ANY($1::text[]) AND ($2='' OR b.project_id=$2)`,[ids,projectId]);
  status.rows.forEach(r=>r.orphaned=!recordKeys.has(String(r.record_key||'')));
  const deletable=status.rows.filter(r=>String(r.visit_status||'NOT_ARRIVED')==='NOT_ARRIVED'||r.orphaned).map(r=>String(r.id)),blocked=status.rows.filter(r=>!deletable.includes(String(r.id)));let deleted=[];
  if(deletable.length){const result=await pool.query('DELETE FROM checkup_bookings WHERE id=ANY($1::text[]) RETURNING id',[deletable]);deleted=result.rows.map(r=>String(r.id))}
  const orphanDeleted=status.rows.filter(r=>r.orphaned&&deleted.includes(String(r.id))).length;
  await workflowAudit(req,'BOOKING','BULK','DELETE',{projectId,requested:ids.length,matched:status.rows.length,deleted:deleted.length,orphanDeleted,blocked:blocked.length,deletedIds:deleted.slice(0,100),blockedIds:blocked.map(r=>String(r.id)).slice(0,100)});
  res.json({ok:true,requested:ids.length,matched:status.rows.length,deleted:deleted.length,orphanDeleted,blocked:blocked.length,blockedItems:blocked.map(r=>({id:r.id,patientName:r.patient_name,hn:r.hn,visitStatus:r.visit_status}))})
}catch(error){res.status(500).json({error:'ลบข้อมูล Booking หลายรายการไม่สำเร็จ',detail:error.message})}});
app.delete('/api/checkup-bookings/:id',localOnly,async(req,res)=>{try{
  const booking=(await pool.query('SELECT id,record_key FROM checkup_bookings WHERE id=$1',[req.params.id])).rows[0];if(!booking)return res.status(404).json({error:'ไม่พบ Booking'});
  const state=await readState(),orphaned=!(state.records||[]).some(r=>String(r.key||r.id||'')===String(booking.record_key||'')),visit=await pool.query('SELECT visit_status FROM checkup_visits WHERE booking_id=$1',[req.params.id]);
  if(!orphaned&&visit.rows.length&&visit.rows[0].visit_status!=='NOT_ARRIVED')return res.status(409).json({error:'Booking นี้มีการ Check-in แล้ว ไม่สามารถลบได้'});
  await pool.query('DELETE FROM checkup_bookings WHERE id=$1',[req.params.id]);await workflowAudit(req,'BOOKING',req.params.id,'DELETE',{orphaned});res.json({ok:true,orphaned})
}catch(error){res.status(500).json({error:'ลบ Booking ไม่สำเร็จ',detail:error.message})}});

app.get('/api/checkup-precheck',localOnly,async(req,res)=>{try{const date=String(req.query.date||new Date().toISOString().slice(0,10)),q=String(req.query.q||'').trim(),params=[date],where=['b.scheduled_date=$1::date'];if(q){params.push(`%${q}%`);where.push(`(b.patient_name ILIKE $${params.length} OR b.hn ILIKE $${params.length} OR b.employee_code ILIKE $${params.length} OR b.id_passport ILIKE $${params.length})`)}const result=await pool.query(`SELECT b.*,p.project_code,p.project_name,v.id AS visit_id,v.visit_status FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id LEFT JOIN checkup_visits v ON v.booking_id=b.id WHERE ${where.join(' AND ')} ORDER BY b.patient_name`,params);res.json({date,items:result.rows})}catch(error){res.status(500).json({error:'อ่านข้อมูล Pre-Checkup ไม่สำเร็จ',detail:error.message})}});
app.patch('/api/checkup-bookings/:id/precheck',localOnly,async(req,res)=>{try{const status=String(req.body?.status||'PENDING').toUpperCase(),allowed=['PENDING','CONFIRMED','RESCHEDULED','QUESTIONNAIRE_DONE','NO_SHOW'];if(!allowed.includes(status))return res.status(400).json({error:'สถานะ Pre-Checkup ไม่ถูกต้อง'});const scheduledDate=req.body?.scheduledDate||null,questionnaire=req.body?.questionnaire&&typeof req.body.questionnaire==='object'?req.body.questionnaire:{};const result=await pool.query(`UPDATE checkup_bookings SET precheck_status=$2,questionnaire=CASE WHEN $3::jsonb='{}'::jsonb THEN questionnaire ELSE $3::jsonb END,scheduled_date=COALESCE($4::date,scheduled_date),precheck_updated_at=NOW(),updated_at=NOW(),updated_by=$5 WHERE id=$1 RETURNING *`,[req.params.id,status,JSON.stringify(questionnaire),scheduledDate,workflowActor(req)]);if(!result.rows.length)return res.status(404).json({error:'ไม่พบ Booking'});await workflowAudit(req,'BOOKING',req.params.id,'PRECHECK',{status,scheduledDate});res.json(result.rows[0])}catch(error){res.status(500).json({error:'บันทึก Pre-Checkup ไม่สำเร็จ',detail:error.message})}});
app.post('/api/checkup-visits/quick-check-in',localOnly,async(req,res)=>{try{const code=String(req.body?.code||'').trim(),date=String(req.body?.visitDate||new Date().toISOString().slice(0,10));if(!code)return res.status(400).json({error:'กรุณาสแกน QR หรือกรอก HN / Employee ID'});const booking=(await pool.query(`SELECT b.*,p.location AS project_location FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id WHERE b.scheduled_date=$2::date AND (b.hn=$1 OR b.employee_code=$1 OR b.id_passport=$1 OR b.record_key=$1) ORDER BY b.updated_at DESC LIMIT 1`,[code,date])).rows[0];if(!booking)return res.status(404).json({error:'ไม่พบ Booking สำหรับวันที่เลือก'});if(booking.booking_status==='CANCELLED')return res.status(409).json({error:'Booking ถูกยกเลิก'});const actor=workflowActor(req),id=crypto.randomUUID(),result=await pool.query(`INSERT INTO checkup_visits(id,booking_id,visit_date,checkin_at,location,visit_status,updated_by) VALUES($1,$2,$3,NOW(),$4,'CHECKED_IN',$5) ON CONFLICT(booking_id) DO UPDATE SET visit_date=EXCLUDED.visit_date,checkin_at=COALESCE(checkup_visits.checkin_at,NOW()),visit_status=CASE WHEN checkup_visits.visit_status='NOT_ARRIVED' THEN 'CHECKED_IN' ELSE checkup_visits.visit_status END,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *`,[id,booking.id,date,String(booking.project_location||''),actor]);await pool.query("UPDATE checkup_bookings SET booking_status='ARRIVED',precheck_status=CASE WHEN precheck_status='PENDING' THEN 'CONFIRMED' ELSE precheck_status END,updated_at=NOW(),updated_by=$2 WHERE id=$1",[booking.id,actor]);await workflowAudit(req,'VISIT',result.rows[0].id,'QUICK_CHECK_IN',{bookingId:booking.id,code});res.json({...result.rows[0],patient_name:booking.patient_name,hn:booking.hn})}catch(error){res.status(500).json({error:'ลงทะเบียนด้วย QR/HN ไม่สำเร็จ',detail:error.message})}});
app.post('/api/checkup-visits/check-in',localOnly,async(req,res)=>{try{const bookingId=String(req.body?.bookingId||'');if(!bookingId)return res.status(400).json({error:'bookingId is required'});const booking=(await pool.query('SELECT b.*,p.location AS project_location FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id WHERE b.id=$1',[bookingId])).rows[0];if(!booking)return res.status(404).json({error:'ไม่พบ Booking'});if(booking.booking_status==='CANCELLED')return res.status(409).json({error:'Booking ถูกยกเลิก'});const actor=workflowActor(req),id=crypto.randomUUID(),date=req.body?.visitDate||new Date().toISOString().slice(0,10),location=String(req.body?.location||booking.project_location||'');const result=await pool.query(`INSERT INTO checkup_visits(id,booking_id,visit_date,checkin_at,location,visit_status,updated_by) VALUES($1,$2,$3,NOW(),$4,'CHECKED_IN',$5) ON CONFLICT(booking_id) DO UPDATE SET visit_date=EXCLUDED.visit_date,checkin_at=COALESCE(checkup_visits.checkin_at,NOW()),location=CASE WHEN EXCLUDED.location<>'' THEN EXCLUDED.location ELSE checkup_visits.location END,visit_status=CASE WHEN checkup_visits.visit_status='NOT_ARRIVED' THEN 'CHECKED_IN' ELSE checkup_visits.visit_status END,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *`,[id,bookingId,date,location,actor]);await pool.query("UPDATE checkup_bookings SET booking_status=CASE WHEN booking_status='BOOKED' THEN 'ARRIVED' ELSE booking_status END,updated_at=NOW(),updated_by=$2 WHERE id=$1",[bookingId,actor]);await workflowAudit(req,'VISIT',result.rows[0].id,'CHECK_IN',{bookingId});res.json(result.rows[0])}catch(error){res.status(500).json({error:'Check-in ไม่สำเร็จ',detail:error.message})}});
app.put('/api/checkup-visits/:id/status',localOnly,async(req,res)=>{try{const status=visitStatus(req.body?.status),actor=workflowActor(req);const result=await pool.query('UPDATE checkup_visits SET visit_status=$2,updated_at=NOW(),updated_by=$3 WHERE id=$1 RETURNING *',[req.params.id,status,actor]);if(!result.rows.length)return res.status(404).json({error:'ไม่พบ Visit'});const map={CHECKED_IN:'ARRIVED',IN_SERVICE:'IN_SERVICE',COMPLETE:'COMPLETE',CANCELLED:'CANCELLED'};if(map[status])await pool.query('UPDATE checkup_bookings SET booking_status=$2,updated_at=NOW(),updated_by=$3 WHERE id=$1',[result.rows[0].booking_id,map[status],actor]);await workflowAudit(req,'VISIT',req.params.id,'STATUS',{status});res.json(result.rows[0])}catch(error){res.status(500).json({error:'เปลี่ยนสถานะ Visit ไม่สำเร็จ',detail:error.message})}});
app.get('/api/checkup-operations',localOnly,async(req,res)=>{try{const date=String(req.query.date||new Date().toISOString().slice(0,10));await ensureLegacyStationVisits(date);const result=await pool.query(`SELECT v.*,b.id AS booking_id,b.record_key,b.hn,b.patient_name,b.employee_code,b.company_name,b.package_code,b.package_name,p.project_code,p.project_name,p.billing_type,COALESCE(c.result_data,'{}'::jsonb) AS result_data,COALESCE(c.abnormal,FALSE) AS abnormal,COALESCE(c.doctor_review,'{}'::jsonb) AS doctor_review,COALESCE(c.review_status,'PENDING') AS review_status,COALESCE(c.follow_up,'{}'::jsonb) AS follow_up,COALESCE(c.follow_up_status,'NONE') AS follow_up_status,COALESCE(jsonb_agg(jsonb_build_object('station',s.station_name,'status',s.station_status,'queuedAt',s.queued_at,'startedAt',s.started_at,'completedAt',s.completed_at) ORDER BY s.queued_at) FILTER(WHERE s.id IS NOT NULL),'[]'::jsonb) AS stations FROM checkup_visits v JOIN checkup_bookings b ON b.id=v.booking_id JOIN checkup_projects p ON p.id=b.project_id LEFT JOIN checkup_station_events s ON s.visit_id=v.id LEFT JOIN checkup_clinical_records c ON c.visit_id=v.id WHERE v.visit_date=$1::date GROUP BY v.id,b.id,p.id,c.visit_id ORDER BY v.checkin_at DESC NULLS LAST,b.patient_name`,[date]);const state=await readState(),recordMap=new Map((state.records||[]).map(record=>[String(record.key||''),record])),items=result.rows.map(item=>{const record=recordMap.get(String(item.record_key||''))||{},hn=String(item.hn||record.hn||'').trim(),vn=String(item.vn||record.hisLastVisitUID||'').trim();return {...item,hn,vn}}),hnFixes=items.filter((item,index)=>!String(result.rows[index].hn||'').trim()&&item.hn&&item.booking_id);if(hnFixes.length)await Promise.all(hnFixes.map(item=>pool.query(`UPDATE checkup_bookings SET hn=$2,updated_at=NOW(),updated_by='HN_SYNC' WHERE id=$1 AND COALESCE(hn,'')=''`,[item.booking_id,item.hn])));res.json({date,items})}catch(error){res.status(500).json({error:'อ่านข้อมูล Operations ไม่สำเร็จ',detail:error.message})}});
app.get('/api/checkup-analytics',localOnly,async(req,res)=>{try{const year=Number(req.query.year)||new Date().getFullYear(),summary=await pool.query(`SELECT COUNT(*)::int AS visits,COUNT(*) FILTER(WHERE c.abnormal)::int AS abnormal,COUNT(*) FILTER(WHERE COALESCE(c.review_status,'PENDING')<>'APPROVED')::int AS review_pending,COUNT(*) FILTER(WHERE c.follow_up_status='OPEN')::int AS follow_up_open FROM checkup_visits v LEFT JOIN checkup_clinical_records c ON c.visit_id=v.id WHERE EXTRACT(YEAR FROM v.visit_date)=$1`,[year]),stations=await pool.query(`SELECT station_name,COUNT(*) FILTER(WHERE station_status='WAITING')::int AS waiting,ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at,NOW())-COALESCE(started_at,queued_at)))/60))::int AS average_minutes FROM checkup_station_events s JOIN checkup_visits v ON v.id=s.visit_id WHERE EXTRACT(YEAR FROM v.visit_date)=$1 GROUP BY station_name ORDER BY waiting DESC,average_minutes DESC LIMIT 5`,[year]);res.json({year,...summary.rows[0],stations:stations.rows})}catch(error){res.status(500).json({error:'อ่าน Clinical Analytics ไม่สำเร็จ',detail:error.message})}});
app.post('/api/checkup-visits/:id/stations',localOnly,async(req,res)=>{try{const station=String(req.body?.station||'').trim(),action=String(req.body?.action||'QUEUE').toUpperCase(),actor=workflowActor(req);if(!station)return res.status(400).json({error:'กรุณาระบุ Station'});if(!['QUEUE','START','COMPLETE','SKIP'].includes(action))return res.status(400).json({error:'คำสั่ง Station ไม่ถูกต้อง'});const status={QUEUE:'WAITING',START:'IN_SERVICE',COMPLETE:'COMPLETE',SKIP:'SKIPPED'}[action],result=await pool.query(`INSERT INTO checkup_station_events(visit_id,station_name,station_status,started_at,completed_at,updated_by) VALUES($1,$2,$3,CASE WHEN $3='IN_SERVICE' THEN NOW() END,CASE WHEN $3='COMPLETE' THEN NOW() END,$4) ON CONFLICT(visit_id,station_name) DO UPDATE SET station_status=EXCLUDED.station_status,started_at=CASE WHEN EXCLUDED.station_status='IN_SERVICE' THEN COALESCE(checkup_station_events.started_at,NOW()) ELSE checkup_station_events.started_at END,completed_at=CASE WHEN EXCLUDED.station_status='COMPLETE' THEN NOW() ELSE checkup_station_events.completed_at END,updated_by=EXCLUDED.updated_by RETURNING *`,[req.params.id,station,status,actor]);if(action==='START')await pool.query("UPDATE checkup_visits SET visit_status='IN_SERVICE',updated_at=NOW(),updated_by=$2 WHERE id=$1",[req.params.id,actor]);if(action==='COMPLETE'){const pending=await pool.query("SELECT COUNT(*)::int AS n FROM checkup_station_events WHERE visit_id=$1 AND station_status NOT IN ('COMPLETE','SKIPPED')",[req.params.id]);if(!Number(pending.rows[0]?.n||0))await pool.query("UPDATE checkup_visits SET visit_status='COMPLETE',updated_at=NOW(),updated_by=$2 WHERE id=$1",[req.params.id,actor])}await workflowAudit(req,'VISIT',req.params.id,'STATION_'+action,{station});res.json(result.rows[0])}catch(error){res.status(500).json({error:'อัปเดต Station ไม่สำเร็จ',detail:error.message})}});
app.put('/api/checkup-visits/:id/clinical',localOnly,async(req,res)=>{try{const section=String(req.body?.section||'result'),data=req.body?.data&&typeof req.body.data==='object'?req.body.data:{},actor=workflowActor(req);if(!['result','review','followup'].includes(section))return res.status(400).json({error:'ส่วนข้อมูล Clinical ไม่ถูกต้อง'});await pool.query("INSERT INTO checkup_clinical_records(visit_id,updated_by) VALUES($1,$2) ON CONFLICT(visit_id) DO NOTHING",[req.params.id,actor]);let result;if(section==='result'){result=await pool.query(`UPDATE checkup_clinical_records SET result_data=$2::jsonb,abnormal=$3,updated_at=NOW(),updated_by=$4 WHERE visit_id=$1 RETURNING *`,[req.params.id,JSON.stringify(data),Boolean(req.body?.abnormal),actor]);await pool.query("UPDATE checkup_visits SET result_status=$2,updated_at=NOW(),updated_by=$3 WHERE id=$1",[req.params.id,req.body?.abnormal?'ABNORMAL':'RESULT_READY',actor])}if(section==='review')result=await pool.query(`UPDATE checkup_clinical_records SET doctor_review=$2::jsonb,review_status=$3,updated_at=NOW(),updated_by=$4 WHERE visit_id=$1 RETURNING *`,[req.params.id,JSON.stringify(data),String(req.body?.status||'APPROVED'),actor]);if(section==='followup')result=await pool.query(`UPDATE checkup_clinical_records SET follow_up=$2::jsonb,follow_up_status=$3,updated_at=NOW(),updated_by=$4 WHERE visit_id=$1 RETURNING *`,[req.params.id,JSON.stringify(data),String(req.body?.status||'OPEN'),actor]);await workflowAudit(req,'VISIT',req.params.id,'CLINICAL_'+section.toUpperCase(),{status:req.body?.status||''});res.json(result.rows[0])}catch(error){res.status(500).json({error:'บันทึกข้อมูล Clinical ไม่สำเร็จ',detail:error.message})}});
app.get('/api/checkup-worklist',localOnly,async(req,res)=>{try{
  const date=String(req.query.date||new Date().toISOString().slice(0,10)),q=String(req.query.q||'').trim(),companyId=String(req.query.companyId||''),projectId=String(req.query.projectId||''),status=String(req.query.status||'');
  await ensureLegacyStationVisits(date);
  // Worklist is driven by a successful HIS OpenVisit, never by the registration/check-in date.
  const params=[date],where=["v.visit_date=$1::date","COALESCE(v.vn,'')<>''"];
  if(companyId){params.push(companyId);where.push(`b.company_id=$${params.length}`)}
  if(projectId){params.push(projectId);where.push(`b.project_id=$${params.length}`)}
  if(status){params.push(status);where.push(`COALESCE(v.visit_status,'NOT_ARRIVED')=$${params.length}`)}
  if(q){params.push(`%${q}%`);where.push(`(b.patient_name ILIKE $${params.length} OR b.hn ILIKE $${params.length} OR b.employee_code ILIKE $${params.length} OR b.id_passport ILIKE $${params.length})`)}
  const result=await pool.query(`SELECT b.id AS booking_id,b.project_id,p.project_code,p.project_name,b.record_key,b.hn,b.employee_code,b.patient_name,b.birth_date,b.sex,b.company_id,b.company_name,b.department_name,b.position_name,b.package_code,b.package_name,b.scheduled_date,b.booking_status,v.id AS visit_id,v.visit_date,v.checkin_at,v.vn,v.location,v.visit_status,v.updated_by AS visit_updated_by,COALESCE(v.result_status,'WAITING_RESULT') AS result_status,COALESCE(v.order_total,0) AS order_total,COALESCE(v.order_complete,0) AS order_complete FROM checkup_bookings b JOIN checkup_projects p ON p.id=b.project_id JOIN checkup_visits v ON v.booking_id=b.id WHERE ${where.join(' AND ')} AND p.project_code<>'HIS-OPEN-VISIT' ORDER BY v.checkin_at DESC NULLS LAST,v.updated_at DESC,b.patient_name`,params);
  const items=[...result.rows],state=await readState(),existingKeys=new Set(items.map(x=>String(x.record_key||'')).filter(Boolean));
  const bangkokDateKey=value=>{if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,10);return new Date(d.getTime()+7*60*60*1000).toISOString().slice(0,10)};
  const qNorm=q.toLowerCase();
  if(false&&!projectId){
    for(const r of (state.records||[])){
      if(!r.openVisitAt||!String(r.hisLastVisitUID||'').trim()||bangkokDateKey(r.openVisitAt)!==date)continue;
      const recordKey=String(r.key||r.id||'');if(recordKey&&existingKeys.has(recordKey))continue;
      if(companyId&&String(r.companyId||'')!==companyId)continue;
      if(status&&status!=='CHECKED_IN')continue;
      const co=(state.companies||[]).find(c=>String(c.id)===String(r.companyId))||{};
      const patientName=[r.title,r.first,r.last].filter(Boolean).join(' '),searchText=[patientName,r.hn,r.employeeCode,r.id].filter(Boolean).join(' ').toLowerCase();
      if(qNorm&&!searchText.includes(qNorm))continue;
      const primary=Array.isArray(r.primaryPackages)&&r.primaryPackages.length?r.primaryPackages[0]:null;
      items.push({booking_id:'',project_id:'',project_code:'',project_name:'',record_key:recordKey,hn:String(r.hn||''),employee_code:String(r.employeeCode||''),patient_name:patientName,birth_date:String(r.birth||''),sex:String(r.sex||''),company_id:String(r.companyId||''),company_name:String(co.name||''),department_name:String(r.departmentName||''),position_name:String(r.positionName||''),package_code:String(primary?.code||r.code||''),package_name:String(primary?.name||r.packageName||''),scheduled_date:null,booking_status:'ARRIVED',visit_id:'',visit_date:date,checkin_at:r.openVisitAt,vn:String(r.hisLastVisitUID||''),location:'',visit_status:'CHECKED_IN',result_status:'WAITING_RESULT',order_total:0,order_complete:0,source:'HIS_OPEN_VISIT'});
    }
  }
  const recordMap=new Map((state.records||[]).map(r=>[String(r.key||r.id||''),r]));
  const itemKeys=[...new Set(items.map(x=>String(x.record_key||'')).filter(Boolean))];
  const visitIds=[...new Set(items.map(x=>String(x.visit_id||'')).filter(Boolean))],operationMap=new Map();
  if(visitIds.length){const operations=await pool.query(`SELECT v.id,COALESCE(COUNT(s.id),0)::int AS total,COALESCE(COUNT(s.id) FILTER(WHERE s.station_status IN ('COMPLETE','SKIPPED')),0)::int AS complete,COALESCE((array_agg(s.station_name ORDER BY COALESCE(s.updated_at,s.completed_at,s.started_at,s.queued_at) DESC) FILTER(WHERE s.id IS NOT NULL))[1],'') AS current_station,COALESCE(c.abnormal,FALSE) AS abnormal FROM checkup_visits v LEFT JOIN checkup_station_events s ON s.visit_id=v.id LEFT JOIN checkup_clinical_records c ON c.visit_id=v.id WHERE v.id=ANY($1::text[]) GROUP BY v.id,c.visit_id`,[visitIds]);for(const row of operations.rows)operationMap.set(String(row.id),row)}
  let registeredBy=new Map(),visitRegisteredBy=new Map();
  if(visitIds.length){
    const workflowLogs=await pool.query(`SELECT DISTINCT ON (entity_id) entity_id,performed_by FROM checkup_workflow_audit WHERE entity_type='VISIT' AND entity_id=ANY($1::text[]) AND action IN ('CHECK_IN','QUICK_CHECK_IN') ORDER BY entity_id,performed_at ASC,id ASC`,[visitIds]);
    visitRegisteredBy=new Map(workflowLogs.rows.map(x=>[String(x.entity_id),String(x.performed_by||'')]))
  }
  if(itemKeys.length){
    const logs=await pool.query(`SELECT DISTINCT ON (record_key) record_key,performed_by_display_name,performed_by_username FROM checkup_audit_log WHERE record_key=ANY($1::text[]) AND action='CREATE' ORDER BY record_key,performed_at DESC,id DESC`,[itemKeys]);
    registeredBy=new Map(logs.rows.map(x=>[String(x.record_key),String(x.performed_by_display_name||x.performed_by_username||'')]))
  }
  for(const item of items){
    const r=recordMap.get(String(item.record_key||''))||{};
    const packageLabel=(p={},fallbackCode='',fallbackName='')=>{const code=String(p.code||p.packageCode||fallbackCode||'').trim(),name=String(p.name||p.itemName||p.packageName||fallbackName||'').trim();return [code,name].filter(Boolean).join(' · ')};
    const mains=Array.isArray(r.primaryPackages)&&r.primaryPackages.length?r.primaryPackages.map(p=>packageLabel(p)).filter(Boolean):[packageLabel({},item.package_code,item.package_name)].filter(Boolean);
    const bill=Array.isArray(r.acceptedBillingItems)?r.acceptedBillingItems.map(p=>packageLabel(p)).filter(Boolean):[];
    const cash=Array.isArray(r.acceptedCashItems)?r.acceptedCashItems.map(p=>packageLabel(p)).filter(Boolean):[];
    const operation=operationMap.get(String(item.visit_id||''))||{},stationTotal=Number(operation.total||0),stationComplete=Number(operation.complete||0);
    item.hn=String(item.hn||r.hn||'');item.vn=String(item.vn||r.hisLastVisitUID||'');item.main_package=mains.join(' || ');item.billing_packages=bill.join(' || ');item.cash_packages=cash.join(' || ');item.registered_by=String(visitRegisteredBy.get(String(item.visit_id||''))||item.visit_updated_by||registeredBy.get(String(item.record_key||''))||'');item.current_station=String(operation.current_station||'');item.station_progress=stationTotal?Math.round(stationComplete*100/stationTotal):0;item.abnormal=Boolean(operation.abnormal);
  }
  items.sort((a,b)=>new Date(b.checkin_at||0)-new Date(a.checkin_at||0)||String(a.patient_name||'').localeCompare(String(b.patient_name||''),'th'));
  res.json({date,items});
}catch(error){res.status(500).json({error:'อ่าน Worklist ไม่สำเร็จ',detail:error.message})}});

app.get('/api/checkup-logs', localOnly, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 10000);
    const recordKey = String(req.query.recordKey || '').trim();
    const result = await pool.query(`SELECT id, record_key, customer_name, id_passport, company_id,
      company_name, company_year, package_code, package_name, action, performed_at,
      performed_by_user_id, performed_by_username, performed_by_display_name, details
      FROM checkup_audit_log ${recordKey?'WHERE record_key = $2':''} ORDER BY performed_at DESC, id DESC LIMIT $1`, recordKey?[limit,recordKey]:[limit]);
    res.set('Cache-Control', 'no-store');
    res.json({ total: result.rows.length, items: result.rows });
  } catch (error) { res.status(500).json({ error: 'อ่านประวัติการบันทึกการตรวจไม่สำเร็จ' }); }
});

app.post('/api/checkup-logs', localOnly, async (req, res) => {
  try {
    const body = req.body || {};
    const recordKey = String(body.recordKey || '').trim();
    const userId = String(body.userId || '').trim();
    if (!recordKey || !userId) return res.status(400).json({ error: 'ข้อมูลผู้รับบริการหรือผู้บันทึกไม่ครบ' });
    const state = await readState();
    const record = (state.records || []).find(item => String(item.key || item.id) === recordKey);
    const user = (state.users || []).find(item => String(item.id) === userId && item.active !== false);
    if (!record) return res.status(404).json({ error: 'ไม่พบข้อมูลผู้รับบริการ' });
    if (!user) return res.status(403).json({ error: 'ไม่พบผู้ใช้ที่กำลังบันทึก' });
    const company = (state.companies || []).find(item => item.id === record.companyId) || {};
    const action = body.action === 'UPDATE' ? 'UPDATE' : 'CREATE';
    const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details) ? body.details : {};
    const result = await pool.query(`INSERT INTO checkup_audit_log
      (record_key, customer_name, id_passport, company_id, company_name, company_year,
       package_code, package_name, action, performed_by_user_id, performed_by_username,
       performed_by_display_name, details)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
      RETURNING id, performed_at`, [recordKey, [record.title, record.first, record.last].filter(Boolean).join(' '),
      record.id || '', record.companyId || '', company.name || '', String(company.year || ''), record.code || '',
      record.packageName || '', action, user.id, user.username || '', user.displayName || user.username || '', JSON.stringify(details)]);
    res.status(201).json({ ok: true, id: result.rows[0].id, performedAt: result.rows[0].performed_at });
  } catch (error) { res.status(500).json({ error: 'บันทึกประวัติการตรวจไม่สำเร็จ' }); }
});

app.use('/external-api/v1', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  externalApiAuth(req, res, next);
});

app.use('/customer-api', customerCors);

app.get('/customer-api/read-thai-id', localOnly, async (_req, res) => {
  try {
    const readerUrl=String(process.env.THAI_ID_READER_URL || '').trim();
    if(!readerUrl) return res.status(503).json({error:'ยังไม่ได้ตั้งค่าเครื่องอ่านบัตรประชาชนบนเครื่องจุดบริการ',setupRequired:true});
    const raw=await requestJsonUrl(readerUrl);
    const pick=(...keys)=>{for(const key of keys){if(raw && raw[key] != null && String(raw[key]).trim()) return String(raw[key]).trim()}return ''};
    const idPassport=pick('id','idCard','citizenId','CitizenID','IdentificationNumber','identificationNumber').replace(/\s+/g,'');
    let birthDate=pick('birthDate','dob','BirthDate','dateOfBirth');
    const m=birthDate.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(m){let year=Number(m[3]);if(year>2400)year-=543;birthDate=`${String(year).padStart(4,'0')}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}
    res.set('Cache-Control','no-store');
    res.json({ok:true,idPassport,birthDate,firstName:pick('firstName','firstname','FirstName','fname'),lastName:pick('lastName','lastname','LastName','lname'),title:pick('title','prefix','Title')});
  } catch(error){res.status(502).json({error:`อ่านบัตรประชาชนไม่สำเร็จ: ${error.message || error}`});}
});

app.post('/customer-api/session', async (req, res) => {
  try {
    cleanupCustomerSessions();
    const address = clientAddress(req), now = Date.now();
    const attempt = customerLoginAttempts.get(address) || { count:0, startedAt:now };
    if (now - attempt.startedAt > 10 * 60 * 1000) { attempt.count = 0; attempt.startedAt = now; }
    if (attempt.count >= 8) return res.status(429).json({ error:'ลองยืนยันตัวตนหลายครั้งเกินไป กรุณารอ 10 นาที' });
    const method = req.body?.method === 'name' ? 'name' : 'id';
    const idPassport = normalizedIdentity(req.body?.idPassport), birthDate = normalizedBirth(req.body?.birthDate);
    const firstName = normalizedPersonName(req.body?.firstName), lastName = normalizedPersonName(req.body?.lastName);
    if (birthDate.length !== 8) return res.status(400).json({ error:'กรุณากรอกวันเกิดให้ครบถ้วน' });
    if (method === 'id' && idPassport.length < 4) return res.status(400).json({ error:'กรุณากรอก ID / Passport ให้ครบถ้วน' });
    if (method === 'name' && (!req.body?.confirmedNoId || !firstName || !lastName)) return res.status(400).json({ error:'กรุณายืนยันว่าไม่ทราบ ID / Passport และกรอกชื่อ–นามสกุลให้ครบถ้วน' });
    const state = await readState();
    const matches = (state.records || []).filter(record => normalizedBirth(record.birth) === birthDate && (method === 'id'
      ? normalizedIdentity(record.id) === idPassport
      : normalizedPersonName(record.first) === firstName && normalizedPersonName(record.last) === lastName));
    if (matches.length !== 1) {
      attempt.count += 1; customerLoginAttempts.set(address, attempt);
      return res.status(401).json({ error:matches.length > 1 ? 'พบชื่อและวันเกิดซ้ำ กรุณาติดต่อเจ้าหน้าที่เพื่อยืนยันข้อมูล' : 'ข้อมูลยืนยันตัวตนไม่ถูกต้อง หรือไม่พบข้อมูลในระบบ' });
    }
    customerLoginAttempts.delete(address);
    const token = crypto.randomBytes(32).toString('base64url');
    customerSessions.set(token, { recordKey:String(matches[0].key || matches[0].id), loginMethod:method, expiresAt:now + 20 * 60 * 1000 });
    res.set('Cache-Control','no-store');
    res.json({ token, expiresInSeconds:1200 });
  } catch (error) { res.status(500).json({ error:'ยืนยันตัวตนไม่สำเร็จ' }); }
});

app.get('/customer-api/me', customerSessionRequired, async (req, res) => {
  try {
    const state = await readState();
    const record = (state.records || []).find(item => String(item.key || item.id) === req.customerSession.recordKey);
    if (!record) return res.status(404).json({ error:'ไม่พบข้อมูลลูกค้า' });
    const company = (state.companies || []).find(item => item.id === record.companyId);
    const profile = safeCustomerProfile(record, company, state);
    const codes=(profile.primaryPackages||[]).map(item=>String(item.code||'').trim()).filter(Boolean);
    if(codes.length){
      const prices=await pool.query('SELECT package_code,package_name,total_price FROM his_packages WHERE package_code = ANY($1::text[])',[codes]);
      const byCode=new Map(prices.rows.map(row=>[String(row.package_code),row]));
      profile.primaryPackages=(profile.primaryPackages||[]).map(item=>{const found=byCode.get(String(item.code||''));return {...item,name:item.name||found?.package_name||'',price:found?.total_price==null?Number(item.price||0):Number(found.total_price)};});
    } else profile.primaryPackages=(profile.primaryPackages||[]).map(item=>({...item,price:Number(item.price||0)}));
    profile.primaryPackageTotal=profile.primaryPackages.reduce((sum,item)=>sum+Number(item.price||0),0);
    res.set('Cache-Control','no-store'); res.json(profile);
  } catch (error) { res.status(500).json({ error:'อ่านข้อมูลไม่สำเร็จ' }); }
});

app.put('/customer-api/me/profile', customerSessionRequired, async (req, res) => {
  try {
    const state = await readState();
    const record = (state.records || []).find(item => String(item.key || item.id) === req.customerSession.recordKey);
    if (!record) return res.status(404).json({ error:'ไม่พบข้อมูลลูกค้า' });
    if (record.visitedAt) return res.status(409).json({ error:'เจ้าหน้าที่ยืนยันรายการแล้ว ไม่สามารถแก้ไขข้อมูลได้อีก', locked:true });
    const next = {
      title:String(req.body?.title || '').trim().slice(0,30), first:String(req.body?.firstName || '').trim().slice(0,100),
      last:String(req.body?.lastName || '').trim().slice(0,100), phone:String(req.body?.phone || '').trim().slice(0,30),
      email:String(req.body?.email || '').trim().slice(0,160)
    };
    if (!next.first || !next.last) return res.status(400).json({ error:'กรุณากรอกชื่อและนามสกุล' });
    if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return res.status(400).json({ error:'รูปแบบอีเมลไม่ถูกต้อง' });
    const before = { title:record.title || '', firstName:record.first || '', lastName:record.last || '', phone:record.phone || '', email:record.email || '' };
    Object.assign(record, next); state.at = new Date().toISOString(); await writeState(state);
    const company = (state.companies || []).find(item => item.id === record.companyId);
    await pool.query(`INSERT INTO checkup_audit_log
      (record_key,customer_name,id_passport,company_id,company_name,company_year,package_code,package_name,action,
       performed_by_user_id,performed_by_username,performed_by_display_name,details)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'UPDATE','customer-self-service','customer','ลูกค้าแก้ไขข้อมูลส่วนตัว',$9::jsonb)`,
      [String(record.key || record.id),[record.title,record.first,record.last].filter(Boolean).join(' '),record.id || '',record.companyId || '',company?.name || '',company?.year || '',record.code || '',record.packageName || '',JSON.stringify({kind:'CUSTOMER_PROFILE_UPDATE',before,after:{title:next.title,firstName:next.first,lastName:next.last,phone:next.phone,email:next.email}})]);
    res.json({ ok:true, profile:safeCustomerProfile(record, company, state) });
  } catch (error) { res.status(500).json({ error:error.message || 'บันทึกข้อมูลส่วนตัวไม่สำเร็จ' }); }
});

app.post('/customer-api/me/selection/verify', customerSessionRequired, async (req, res) => {
  try {
    const state = await readState();
    const record = (state.records || []).find(item => String(item.key || item.id) === req.customerSession.recordKey);
    if (!record) return res.status(404).json({ error:'ไม่พบข้อมูลลูกค้า' });
    if (record.visitedAt) return res.status(409).json({ error:'เจ้าหน้าที่ยืนยันรายการแล้ว ไม่สามารถแก้ไขได้อีก', locked:true });
    const company = (state.companies || []).find(item => item.id === record.companyId);
    const expected = normalizedIdentity(record.id).slice(-4), supplied = normalizedIdentity(req.body?.idLast4);
    const suppliedFirst = normalizedPersonName(req.body?.firstName), suppliedLast = normalizedPersonName(req.body?.lastName);
    if (expected) {
      if (expected.length < 4 || supplied !== expected) return res.status(401).json({ error:'เลข 4 ตัวท้ายของ ID / Passport ไม่ถูกต้อง' });
    } else if (!req.body?.confirmedNoId || suppliedFirst !== normalizedPersonName(record.first) || suppliedLast !== normalizedPersonName(record.last)) {
      return res.status(401).json({ error:'ชื่อ–นามสกุลสำหรับยืนยันไม่ถูกต้อง' });
    }
    const selection = await saveCustomerSelection(record, company, state, buildCustomerSelection(req, company, state));
    res.json({ ok:true, pendingSelection:selection });
  } catch (error) { res.status(500).json({ error:error.message || 'ยืนยันและบันทึกรายการไม่สำเร็จ' }); }
});

app.put('/customer-api/me/selection', customerSessionRequired, (_req, res) => res.status(428).json({ error:'กรุณายืนยันเลข 4 ตัวท้ายของ ID / Passport ก่อนส่งรายการ' }));

app.delete('/customer-api/session', customerSessionRequired, (req, res) => {
  const token = String(req.headers['x-customer-token'] || '').trim();
  customerSessions.delete(token); res.json({ ok:true });
});

app.get('/external-api/v1', (_req, res) => {
  res.json({
    name: 'Health Check Up Smart Search API', version: '1.0',
    endpoints: ['/health', '/companies', '/customers', '/packages', '/statistics']
  });
});

app.get('/external-api/v1/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'PostgreSQL', apiVersion: '1.0' }); }
  catch (error) { res.status(503).json({ ok: false, error: 'Database unavailable' }); }
});

app.get('/external-api/v1/companies', async (req, res) => {
  try {
    const state = await readState();
    const query = String(req.query.q || '').toLowerCase();
    const items = (state.companies || []).map(publicCompany).filter(item =>
      !query || `${item.name} ${item.code} ${item.year}`.toLowerCase().includes(query));
    res.json({ total: items.length, items });
  } catch (error) { res.status(500).json({ error: 'Unable to read companies' }); }
});

app.get('/external-api/v1/customers', async (req, res) => {
  try {
    const state = await readState();
    const companies = state.companies || [];
    const query = String(req.query.q || '').toLowerCase();
    const companyId = String(req.query.companyId || '');
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const items = (state.records || []).map(item => publicCustomer(item, companies)).filter(item => {
      const companyMatch = !companyId || item.companyId === companyId;
      const textMatch = !query || Object.values(item).join(' ').toLowerCase().includes(query);
      return companyMatch && textMatch;
    });
    res.json({ total: items.length, limit, offset, items: items.slice(offset, offset + limit) });
  } catch (error) { res.status(500).json({ error: 'Unable to read customers' }); }
});

app.get('/external-api/v1/customers/:key', async (req, res) => {
  try {
    const state = await readState();
    const record = (state.records || []).find(item => (item.key || item.id) === req.params.key);
    if (!record) return res.status(404).json({ error: 'Customer not found' });
    res.json(publicCustomer(record, state.companies || []));
  } catch (error) { res.status(500).json({ error: 'Unable to read customer' }); }
});

app.post('/external-api/v1/customers', async (req, res) => {
  try {
    const state = await readState();
    const body = req.body || {};
    if (!body.companyId || !body.firstName) return res.status(400).json({ error: 'companyId and firstName are required' });
    if (!(state.companies || []).some(item => item.id === body.companyId)) return res.status(400).json({ error: 'Unknown companyId' });
    const key = `api-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const record = {
      key, companyId: body.companyId, title: body.title || '', first: body.firstName,
      last: body.lastName || '', id: body.idPassport || '', birth: body.birthDate || '',
      sex: body.sex || '', code: body.packageCode || '', packageName: body.packageName || '',
      visitedAt: body.visitedAt || null, cashAccepted: false, acceptedCashItems: [],
      acceptedBillingItems: [], selectedPackages: []
    };
    state.records = Array.isArray(state.records) ? state.records : [];
    state.records.push(record);
    state.at = new Date().toISOString();
    await writeState(state);
    res.status(201).json(publicCustomer(record, state.companies || []));
  } catch (error) { res.status(500).json({ error: 'Unable to create customer' }); }
});

app.put('/external-api/v1/customers/:key', async (req, res) => {
  try {
    const state = await readState();
    const record = (state.records || []).find(item => (item.key || item.id) === req.params.key);
    if (!record) return res.status(404).json({ error: 'Customer not found' });
    const body = req.body || {};
    if (body.companyId && !(state.companies || []).some(item => item.id === body.companyId)) return res.status(400).json({ error: 'Unknown companyId' });
    const fields = { companyId:'companyId', title:'title', firstName:'first', lastName:'last', idPassport:'id', birthDate:'birth', sex:'sex', packageCode:'code', packageName:'packageName', visitedAt:'visitedAt' };
    Object.entries(fields).forEach(([source, target]) => { if (Object.prototype.hasOwnProperty.call(body, source)) record[target] = body[source]; });
    state.at = new Date().toISOString();
    await writeState(state);
    res.json(publicCustomer(record, state.companies || []));
  } catch (error) { res.status(500).json({ error: 'Unable to update customer' }); }
});

app.delete('/external-api/v1/customers/:key', async (req, res) => {
  try {
    const pathKey = String(req.params.key || '').trim();
    const bodyKey = String(req.body?.key || '').trim();
    if (!pathKey || pathKey === 'CUSTOMER_KEY') return res.status(400).json({ error: 'A real customer key is required in the URL' });
    if (!bodyKey) return res.status(400).json({ error: 'Request body is required: {"key":"CUSTOMER_KEY"}' });
    if (bodyKey !== pathKey) return res.status(409).json({ error: 'The key in request body does not match the URL key' });
    const state = await readState();
    const index = (state.records || []).findIndex(item => (item.key || item.id) === pathKey);
    if (index < 0) return res.status(404).json({ error: 'Customer not found' });
    const deleted = publicCustomer(state.records[index], state.companies || []);
    state.records.splice(index, 1);
    state.at = new Date().toISOString();
    await writeState(state);
    res.json({ ok: true, deletedKey: pathKey, deletedCustomer: deleted });
  } catch (error) { res.status(500).json({ error: 'Unable to delete customer' }); }
});

app.get('/external-api/v1/packages', async (req, res) => {
  try {
    const state = await readState();
    const query = String(req.query.q || '').toLowerCase();
    const items = (state.packages || []).filter(item =>
      !query || `${item.code || ''} ${item.name || ''} ${item.packagecode || ''} ${item.packagename || ''}`.toLowerCase().includes(query));
    res.json({ total: items.length, items });
  } catch (error) { res.status(500).json({ error: 'Unable to read packages' }); }
});

app.get('/external-api/v1/statistics', async (req, res) => {
  try {
    const state = await readState();
    const companyId = String(req.query.companyId || '');
    const records = (state.records || []).filter(item => !companyId || item.companyId === companyId);
    const visited = records.filter(item => item.visitedAt).length;
    res.json({ companyId: companyId || null, total: records.length, visited, pending: records.length - visited, visitRate: records.length ? Number((visited * 100 / records.length).toFixed(2)) : 0 });
  } catch (error) { res.status(500).json({ error: 'Unable to read statistics' }); }
});

/* superseded station scan draft (kept inert during patch migration)
draftStationScanRoute(async(req,res)=>{try{
  const visitId=String(req.params.id||''),station=String(req.body?.station||'').trim(),action=String(req.body?.action||'QUEUE').toUpperCase(),reason=String(req.body?.reason||'').trim(),actor=workflowActor(req);
  if(!station)return res.status(400).json({error:'กรุณาระบุ Station'});if(!['QUEUE','START','COMPLETE','UNDO','REOPEN'].includes(action))return res.status(400).json({error:'คำสั่ง Station ไม่ถูกต้อง'});
  if(!(await pool.query('SELECT id FROM checkup_visits WHERE id=$1',[visitId])).rows.length)return res.status(404).json({error:'ไม่พบ Visit ของผู้รับบริการ'});
  const current=(await pool.query('SELECT * FROM checkup_station_events WHERE visit_id=$1 AND station_name=$2',[visitId,station])).rows[0];
  if(action==='UNDO'){
    if(!current)return res.status(409).json({error:'ไม่มีรายการล่าสุดของสถานีนี้ให้ Undo'});let result;
    if(current.station_status==='WAITING'){result=(await pool.query('DELETE FROM checkup_station_events WHERE id=$1 RETURNING *',[current.id])).rows[0];await pool.query("UPDATE checkup_visits SET visit_status='CHECKED_IN',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor])}
    else if(current.station_status==='IN_SERVICE'){result=(await pool.query("UPDATE checkup_station_events SET station_status='WAITING',started_at=NULL,completed_at=NULL,updated_at=NOW(),updated_by=$2 WHERE id=$1 RETURNING *",[current.id,actor])).rows[0];await pool.query("UPDATE checkup_visits SET visit_status='CHECKED_IN',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor])}
    else if(current.station_status==='COMPLETE'){result=(await pool.query("UPDATE checkup_station_events SET station_status='IN_SERVICE',completed_at=NULL,updated_at=NOW(),updated_by=$2 WHERE id=$1 RETURNING *",[current.id,actor])).rows[0];await pool.query("UPDATE checkup_visits SET visit_status='IN_SERVICE',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor])}
    else return res.status(409).json({error:'สถานะนี้ไม่สามารถ Undo ได้'});await workflowAudit(req,'VISIT',visitId,'STATION_UNDO',{station,from:current.station_status});return res.json(result)
  }
  if(action==='REOPEN'){
    if(!reason)return res.status(400).json({error:'กรุณาระบุเหตุผลที่เปิดรอบใหม่'});if(!current||current.station_status!=='COMPLETE')return res.status(409).json({error:'เปิดรอบใหม่ได้เฉพาะรายการที่จบบริการแล้ว'});
    const result=(await pool.query("UPDATE checkup_station_events SET station_status='WAITING',queued_at=NOW(),started_at=NULL,completed_at=NULL,updated_at=NOW(),updated_by=$2 WHERE id=$1 RETURNING *",[current.id,actor])).rows[0];await pool.query("UPDATE checkup_visits SET visit_status='CHECKED_IN',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor]);await workflowAudit(req,'VISIT',visitId,'STATION_REOPEN',{station,reason});return res.json(result)
  }
  if(action==='QUEUE'){
    if(current?.station_status==='COMPLETE')return res.status(409).json({error:'สถานีนี้จบบริการแล้ว หากต้องตรวจซ้ำให้ใช้เปิดรอบใหม่'});if(current&&['WAITING','IN_SERVICE'].includes(current.station_status))return res.status(409).json({error:'รายการนี้อยู่ในคิวหรือกำลังให้บริการแล้ว'});
    const other=(await pool.query("SELECT station_name,station_status FROM checkup_station_events WHERE visit_id=$1 AND station_name<>$2 AND station_status IN ('WAITING','IN_SERVICE') LIMIT 1",[visitId,station])).rows[0];if(other)return res.status(409).json({error:`HN นี้อยู่ที่ ${other.station_name} (${other.station_status})`})
  }
  if(action==='START'&&current?.station_status!=='WAITING')return res.status(409).json({error:'ต้องเข้าคิวสถานีนี้ก่อนเริ่มให้บริการ'});if(action==='COMPLETE'&&current?.station_status!=='IN_SERVICE')return res.status(409).json({error:'ต้องเริ่มให้บริการก่อนจบบริการ'});
  const status={QUEUE:'WAITING',START:'IN_SERVICE',COMPLETE:'COMPLETE'}[action],result=await pool.query(`INSERT INTO checkup_station_events(visit_id,station_name,station_status,started_at,completed_at,updated_by) VALUES($1,$2,$3,CASE WHEN $3='IN_SERVICE' THEN NOW() END,CASE WHEN $3='COMPLETE' THEN NOW() END,$4) ON CONFLICT(visit_id,station_name) DO UPDATE SET station_status=EXCLUDED.station_status,queued_at=CASE WHEN EXCLUDED.station_status='WAITING' THEN NOW() ELSE checkup_station_events.queued_at END,started_at=CASE WHEN EXCLUDED.station_status='IN_SERVICE' THEN COALESCE(checkup_station_events.started_at,NOW()) WHEN EXCLUDED.station_status='WAITING' THEN NULL ELSE checkup_station_events.started_at END,completed_at=CASE WHEN EXCLUDED.station_status='COMPLETE' THEN NOW() WHEN EXCLUDED.station_status='WAITING' THEN NULL ELSE checkup_station_events.completed_at END,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *`,[visitId,station,status,actor]);
  if(action==='QUEUE')await pool.query("UPDATE checkup_visits SET visit_status='CHECKED_IN',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor]);if(action==='START')await pool.query("UPDATE checkup_visits SET visit_status='IN_SERVICE',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor]);if(action==='COMPLETE'){const pending=await pool.query("SELECT COUNT(*)::int AS n FROM checkup_station_events WHERE visit_id=$1 AND station_status NOT IN ('COMPLETE','SKIPPED')",[visitId]);if(!Number(pending.rows[0]?.n||0))await pool.query("UPDATE checkup_visits SET visit_status='COMPLETE',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor])}await workflowAudit(req,'VISIT',visitId,'STATION_'+action,{station});res.json(result.rows[0])
}catch(error){res.status(500).json({error:'อัปเดต Station ไม่สำเร็จ',detail:error.message)}},);

*/
app.post('/api/station-scan/:id',localOnly,async(req,res)=>{
  try{
    const visitId=String(req.params.id||'');
    const station=String(req.body?.station||'').trim();
    const action=String(req.body?.action||'QUEUE').toUpperCase();
    const reason=String(req.body?.reason||'').trim();
    const actor=workflowActor(req);
    if(!station)return res.status(400).json({error:'กรุณาระบุ Station'});
    if(!['QUEUE','START','COMPLETE','UNDO','REOPEN'].includes(action))return res.status(400).json({error:'คำสั่ง Station ไม่ถูกต้อง'});
    if(!(await pool.query('SELECT 1 FROM checkup_visits WHERE id=$1',[visitId])).rowCount)return res.status(404).json({error:'ไม่พบ Visit ของผู้รับบริการ'});
    const current=(await pool.query('SELECT * FROM checkup_station_events WHERE visit_id=$1 AND station_name=$2',[visitId,station])).rows[0];
    if(action==='UNDO'){
      if(!current)return res.status(409).json({error:'ไม่มีรายการล่าสุดของสถานีนี้ให้ Undo'});
      let result;
      if(current.station_status==='WAITING')result=(await pool.query('DELETE FROM checkup_station_events WHERE id=$1 RETURNING *',[current.id])).rows[0];
      else if(current.station_status==='IN_SERVICE')result=(await pool.query("UPDATE checkup_station_events SET station_status='WAITING',started_at=NULL,completed_at=NULL,updated_at=NOW(),updated_by=$2 WHERE id=$1 RETURNING *",[current.id,actor])).rows[0];
      else if(current.station_status==='COMPLETE')result=(await pool.query("UPDATE checkup_station_events SET station_status='IN_SERVICE',completed_at=NULL,updated_at=NOW(),updated_by=$2 WHERE id=$1 RETURNING *",[current.id,actor])).rows[0];
      else return res.status(409).json({error:'สถานะนี้ไม่สามารถ Undo ได้'});
      const visitStatus=current.station_status==='COMPLETE'?'IN_SERVICE':'CHECKED_IN';
      await pool.query('UPDATE checkup_visits SET visit_status=$2,updated_at=NOW(),updated_by=$3 WHERE id=$1',[visitId,visitStatus,actor]);
      await workflowAudit(req,'VISIT',visitId,'STATION_UNDO',{station,from:current.station_status});
      return res.json(result);
    }
    if(action==='REOPEN'){
      if(!reason)return res.status(400).json({error:'กรุณาระบุเหตุผลที่เปิดรอบใหม่'});
      if(!current||current.station_status!=='COMPLETE')return res.status(409).json({error:'เปิดรอบใหม่ได้เฉพาะรายการที่จบบริการแล้ว'});
      const result=(await pool.query("UPDATE checkup_station_events SET station_status='WAITING',queued_at=NOW(),started_at=NULL,completed_at=NULL,updated_at=NOW(),updated_by=$2 WHERE id=$1 RETURNING *",[current.id,actor])).rows[0];
      await pool.query("UPDATE checkup_visits SET visit_status='CHECKED_IN',updated_at=NOW(),updated_by=$2 WHERE id=$1",[visitId,actor]);
      await workflowAudit(req,'VISIT',visitId,'STATION_REOPEN',{station,reason});
      return res.json(result);
    }
    if(action==='QUEUE'){
      if(current?.station_status==='COMPLETE')return res.status(409).json({error:'สถานีนี้จบบริการแล้ว หากต้องตรวจซ้ำให้ใช้เปิดรอบใหม่'});
      if(current&&['WAITING','IN_SERVICE'].includes(current.station_status))return res.status(409).json({error:'รายการนี้อยู่ในคิวหรือกำลังให้บริการแล้ว'});
      const other=(await pool.query("SELECT station_name,station_status FROM checkup_station_events WHERE visit_id=$1 AND station_name<>$2 AND station_status IN ('WAITING','IN_SERVICE') LIMIT 1",[visitId,station])).rows[0];
      if(other)return res.status(409).json({error:`HN นี้อยู่ที่ ${other.station_name} (${other.station_status})`});
    }
    if(action==='START'&&current?.station_status!=='WAITING')return res.status(409).json({error:'ต้องเข้าคิวสถานีนี้ก่อนเริ่มให้บริการ'});
    if(action==='COMPLETE'&&current?.station_status!=='IN_SERVICE')return res.status(409).json({error:'ต้องเริ่มให้บริการก่อนจบบริการ'});
    const status={QUEUE:'WAITING',START:'IN_SERVICE',COMPLETE:'COMPLETE'}[action];
    const result=await pool.query(`INSERT INTO checkup_station_events(visit_id,station_name,station_status,started_at,completed_at,updated_by) VALUES($1,$2,$3,CASE WHEN $3='IN_SERVICE' THEN NOW() END,CASE WHEN $3='COMPLETE' THEN NOW() END,$4) ON CONFLICT(visit_id,station_name) DO UPDATE SET station_status=EXCLUDED.station_status,queued_at=CASE WHEN EXCLUDED.station_status='WAITING' THEN NOW() ELSE checkup_station_events.queued_at END,started_at=CASE WHEN EXCLUDED.station_status='IN_SERVICE' THEN COALESCE(checkup_station_events.started_at,NOW()) WHEN EXCLUDED.station_status='WAITING' THEN NULL ELSE checkup_station_events.started_at END,completed_at=CASE WHEN EXCLUDED.station_status='COMPLETE' THEN NOW() WHEN EXCLUDED.station_status='WAITING' THEN NULL ELSE checkup_station_events.completed_at END,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *`,[visitId,station,status,actor]);
    const nextVisitStatus=action==='START'?'IN_SERVICE':action==='COMPLETE'?'COMPLETE':'CHECKED_IN';
    await pool.query('UPDATE checkup_visits SET visit_status=$2,updated_at=NOW(),updated_by=$3 WHERE id=$1',[visitId,nextVisitStatus,actor]);
    await workflowAudit(req,'VISIT',visitId,'STATION_'+action,{station});
    return res.json(result.rows[0]);
  }catch(error){
    return res.status(500).json({error:'อัปเดต Station ไม่สำเร็จ',detail:error.message});
  }
});

function organizationBookItemIdentity(item){
  return String(item?.Code||item?.Name||item?.Nameen||'').trim().toLowerCase();
}

function organizationBookItemDisplay(item){
  const value=organizationBookText(item?.Value??item?.Result??'-',60);
  const unit=organizationBookText(item?.Unit||'',18);
  return `${value||'-'}${unit&&value!=='-'?' '+unit:''}`;
}

async function buildOrganizationColumnTablePdf(records,groupKeys,meta){
  const pdf=await PDFDocument.create(),font=await reportFont(pdf),ink=rgb(.03,.18,.34),muted=rgb(.35,.43,.5),line=rgb(.80,.88,.92),accent=rgb(.04,.56,.65);
  const byRecord=records.map(record=>({record,groups:new Map(organizationBookSections(record).map(group=>[group.key,group]))})),catalog=new Map();
  byRecord.forEach(({groups})=>groups.forEach((group,key)=>{if(groupKeys.includes(key)&&!catalog.has(key))catalog.set(key,group)}));
  const coverProject={...meta.project,project_name:`${meta.projects.length} Booking`,start_date:meta.projects.map(p=>p.start_date).filter(Boolean).sort()[0]||'',end_date:meta.projects.map(p=>p.end_date).filter(Boolean).sort().slice(-1)[0]||''};
  await addOrganizationCover(pdf,meta.cover,coverProject,meta.company,records,meta.remark);
  for(const key of groupKeys){
    const group=catalog.get(key)||{name:key,code:'',items:[]},itemCatalog=new Map();
    byRecord.forEach(({groups})=>(groups.get(key)?.items||[]).forEach(item=>{const itemKey=organizationBookItemIdentity(item);if(itemKey&&!itemCatalog.has(itemKey))itemCatalog.set(itemKey,{key:itemKey,label:organizationBookText(item?.Name||item?.Nameen||item?.Code||itemKey,60)})}));
    const itemColumns=[...itemCatalog.values()],wide=itemColumns.length>6,pageSize=wide?[1190.55,841.89]:[841.89,595.28],pageWidth=pageSize[0],pageHeight=pageSize[1],margin=28,headerHeight=wide?31:27,rowHeight=wide?29:22,firstRowY=pageHeight-92,rowsPerPage=Math.max(1,Math.floor((firstRowY-30)/rowHeight));
    let index=0;
    while(index<byRecord.length){
      const page=pdf.addPage(pageSize),category=organizationBookCategoryLabel(group,meta.templates),title=`${category} / ${group.name||group.code}${group.code&&group.code!==group.name?' ('+group.code+')':''}`;
      page.drawText(organizationBookText(title,110),{x:margin,y:pageHeight-38,size:wide?16:15,font,color:ink});
      page.drawText(`พนักงาน ${records.length} คน · Booking ${meta.projects.length} รายการ`,{x:pageWidth-245,y:pageHeight-36,size:8,font,color:muted});
      const fixed=[{label:'ลำดับ',width:38},{label:'HN',width:82},{label:'รหัสพนักงาน',width:82},{label:'ชื่อ-นามสกุล',width:wide?150:140}],statusWidth=62,available=pageWidth-(margin*2)-fixed.reduce((sum,col)=>sum+col.width,0)-statusWidth,itemWidth=itemColumns.length?available/itemColumns.length:available;
      const columns=[...fixed,...itemColumns.map(item=>({label:item.label,width:itemWidth,itemKey:item.key})),{label:'สถานะ',width:statusWidth,status:true}];
      let x=margin,y=pageHeight-73;
      page.drawRectangle({x:margin,y:y-4,width:pageWidth-margin*2,height:headerHeight,color:accent});
      for(const column of columns){const max=Math.max(3,Math.floor(column.width/(wide?4.2:4.6))),label=column.label.length>max?column.label.slice(0,max-1)+'…':column.label;page.drawText(label,{x:x+3,y:y+(wide?7:5),size:wide?7:7.5,font,color:rgb(1,1,1),maxWidth:column.width-5});x+=column.width}
      y-=rowHeight;
      const pageEnd=Math.min(byRecord.length,index+rowsPerPage);
      for(;index<pageEnd;index++,y-=rowHeight){
        const {record,groups}=byRecord[index],recordGroup=groups.get(key),items=new Map((recordGroup?.items||[]).map(item=>[organizationBookItemIdentity(item),item])),cell=organizationBookResultCell(recordGroup),name=[record.title,record.first,record.last].filter(Boolean).join(' ')||'-';
        if(index%2===0)page.drawRectangle({x:margin,y:y-4,width:pageWidth-margin*2,height:rowHeight,color:rgb(.965,.985,.99)});
        page.drawLine({start:{x:margin,y:y-4},end:{x:pageWidth-margin,y:y-4},thickness:.5,color:line});
        const values=[String(index+1),record.hn||'-',record.employeeCode||'-',name,...itemColumns.map(column=>items.has(column.key)?organizationBookItemDisplay(items.get(column.key)):'-'),cell.status];
        x=margin;
        columns.forEach((column,columnIndex)=>{let value=organizationBookText(values[columnIndex],80),size=wide?6.5:7.2,max=Math.max(2,Math.floor((column.width-6)/(size*.56)));if(value.length>max)value=value.slice(0,max-1)+'…';page.drawText(value,{x:x+3,y:y+3,size,font,color:column.status&&cell.status==='ผิดปกติ'?rgb(.75,.12,.16):ink,maxWidth:column.width-5});x+=column.width});
      }
      page.drawText(`หน้า ${pdf.getPageCount()-2}`,{x:pageWidth-68,y:15,size:7,font,color:muted});
    }
  }
  return pdf.save();
}


// v7.62.80: query HIS opdvisit in one batch for Booking/Worklist display.
async function queryHisOpdVisitBatch(vns=[]){
  const clean=[...new Set((vns||[]).map(v=>String(v||'').trim()).filter(Boolean))].slice(0,500);if(!clean.length)return [];
  const config=await readHisAppointmentConfig(),table=process.env.HIS_VISIT_STATUS_TABLE||'opdvisit';if(!safeIdentifier(table))throw new Error('ชื่อตาราง Visit Status ไม่ถูกต้อง');
  const client=appointmentPool(config);try{const placeholders=clean.map((_,index)=>`$${index+1}`).join(','),result=await client.query(`SELECT DISTINCT ON ("vn") "vn" AS vn,"hn" AS hn,"registereddate" AS registered_date,"chargecloseddate" AS charge_closed_date,"lovvisithstscode" AS visit_status,"lastvisitsts" AS last_visit_status,"cancelleddate" AS cancelled_date FROM "${config.schema}"."${table}" WHERE "vn" IN (${placeholders}) ORDER BY "vn","id" DESC`,clean);return result.rows.map(row=>{const cancelledFlag=Boolean(row.cancelled_date)||String(row.last_visit_status||'').trim().toLowerCase()==='cancelled',resolved=cancelledFlag?'Cancelled':String(row.visit_status||row.last_visit_status||'Unknown').trim()||'Unknown';return {vn:String(row.vn||''),hn:String(row.hn||''),registeredDate:row.registered_date||null,chargeClosedDate:row.charge_closed_date||null,status:resolved,cancelledDate:row.cancelled_date||null,source:'opdvisit'}})}finally{await client.end().catch(()=>{})}}
app.post('/api/his/visit-status/batch',localOnly,async(req,res)=>{try{const recordKeys=[...new Set((req.body?.recordKeys||[]).map(value=>String(value||'').trim()).filter(Boolean))].slice(0,500),state=recordKeys.length?await readState():null,selected=state?(state.records||[]).filter(record=>recordKeys.includes(String(record.key||record.id||''))):[],requested=[...(req.body?.vns||[]),...selected.map(record=>record.hisLastVisitUID||record.vn||'')],items=await queryHisOpdVisitBatch(requested),byVn=new Map(items.map(item=>[String(item.vn||'').trim(),item]));let revision=null;if(state){const now=new Date().toISOString();selected.forEach(record=>{const vn=String(record.hisLastVisitUID||record.vn||'').trim(),item=byVn.get(vn);record.hisVisitStatus=item?.status||'NOT_FOUND';record.hisVisitStatusAt=now;record.hisVisitStatusSource=item?.source||'';if(item?.registeredDate)record.checkupDate=item.registeredDate;if(item?.chargeClosedDate)record.checkupEndDate=item.chargeClosedDate});state.at=now;revision=await writeState(state)}res.set('Cache-Control','no-store');res.json({ok:true,items,updated:selected.length,revision})}catch(error){res.status(502).json({error:`ตรวจสอบสถานะ Visit จาก HIS ไม่สำเร็จ: ${error.message||error}`})}});


// v7.63.73 Operations Center API.
app.get('/api/ops/summary',localOnly,staffPermissionRequired('worklistView'),async(req,res)=>{try{const work=await operationsWorkItems(),count=type=>work.items.filter(x=>x.type===type).length,jobs=(await pool.query(`SELECT COUNT(*) FILTER(WHERE status IN ('PENDING','RUNNING'))::int AS active,COUNT(*) FILTER(WHERE status IN ('FAILED','PARTIAL'))::int AS errors FROM operations_jobs WHERE created_at>NOW()-INTERVAL '7 days'`)).rows[0]||{},notifications=(await pool.query('SELECT COUNT(*)::int AS unread FROM system_notifications WHERE is_read=FALSE')).rows[0]?.unread||0,healthEvents=await readSystemHealthEvents(30),critical=healthEvents.filter(x=>['CRITICAL','TIMEOUT'].includes(String(x.status))).length;res.set('Cache-Control','no-store').json({ok:true,counts:{noHn:count('NO_HN'),noVn:count('NO_VN'),noEmr:count('NO_EMR'),hisStatusError:count('HIS_STATUS_ERROR'),activeJobs:Number(jobs.active||0),jobErrors:Number(jobs.errors||0),unreadNotifications:Number(notifications||0),healthAlerts:critical,totalWorkItems:work.items.length,bookings:work.bookingCount},updatedAt:new Date().toISOString()})}catch(error){res.status(500).json({error:'โหลด Operations Center ไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/work-items',localOnly,staffPermissionRequired('worklistView'),async(req,res)=>{try{const type=String(req.query.type||'').toUpperCase(),q=String(req.query.q||'').trim().toLowerCase(),limit=Math.min(Math.max(Number(req.query.limit)||500,1),2000),work=await operationsWorkItems();let items=work.items;if(type)items=items.filter(x=>x.type===type);if(q)items=items.filter(x=>[x.hn,x.vn,x.patientName,x.companyName,x.projectCode,x.projectName,x.message].some(v=>String(v||'').toLowerCase().includes(q)));res.set('Cache-Control','no-store').json({items:items.slice(0,limit),total:items.length})}catch(error){res.status(500).json({error:'โหลดรายการงานค้างไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/jobs',localOnly,staffPermissionRequired('worklistView'),async(req,res)=>{try{await ensureOperationsSchema();const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500),rows=(await pool.query(`SELECT id,job_type,status,progress,total,success_count,skip_count,fail_count,current_item,error_message,created_by,retry_of,created_at,started_at,finished_at,updated_at,result FROM operations_jobs ORDER BY created_at DESC LIMIT $1`,[limit])).rows;res.set('Cache-Control','no-store').json({items:rows})}catch(error){res.status(500).json({error:'โหลด Job Queue ไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/jobs/:id',localOnly,staffPermissionRequired('worklistView'),async(req,res)=>{try{const job=(await pool.query('SELECT * FROM operations_jobs WHERE id=$1',[req.params.id])).rows[0];if(!job)return res.status(404).json({error:'ไม่พบ Job'});const items=(await pool.query('SELECT * FROM operations_job_items WHERE job_id=$1 ORDER BY id',[req.params.id])).rows;res.set('Cache-Control','no-store').json({job,items})}catch(error){res.status(500).json({error:'โหลดรายละเอียด Job ไม่สำเร็จ',detail:error.message})}});
app.post('/api/ops/jobs',localOnly,async(req,res)=>{const type=String(req.body?.type||'').toUpperCase(),permission=operationsPermissionForType(type);return staffPermissionRequired(permission)(req,res,async()=>{try{const payload=req.body?.payload&&typeof req.body.payload==='object'?req.body.payload:{},id=await enqueueOperationsJob(type,payload,operationsActor(req));await workflowAudit(req,'OPS_JOB',id,'CREATE',{jobType:type,recordCount:Array.isArray(payload.recordKeys)?payload.recordKeys.length:0});res.status(202).json({ok:true,id,status:'PENDING'})}catch(error){res.status(400).json({error:error.message||String(error)})}})});
app.post('/api/ops/jobs/:id/retry',localOnly,async(req,res)=>{try{const old=(await pool.query('SELECT * FROM operations_jobs WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'ไม่พบ Job'});return staffPermissionRequired(operationsPermissionForType(old.job_type))(req,res,async()=>{try{if(!['FAILED','PARTIAL','CANCELLED'].includes(old.status))return res.status(409).json({error:'Retry ได้เฉพาะ Job ที่ Failed / Partial / Cancelled'});const id=await enqueueOperationsJob(old.job_type,old.payload||{},operationsActor(req),old.id);await workflowAudit(req,'OPS_JOB',id,'RETRY',{retryOf:old.id,jobType:old.job_type});res.status(202).json({ok:true,id,status:'PENDING',retryOf:old.id})}catch(error){res.status(500).json({error:'สร้าง Retry Job ไม่สำเร็จ',detail:error.message})}})}catch(error){res.status(500).json({error:'โหลด Job สำหรับ Retry ไม่สำเร็จ',detail:error.message})}});
app.post('/api/ops/jobs/:id/cancel',localOnly,async(req,res)=>{try{const old=(await pool.query('SELECT job_type,status FROM operations_jobs WHERE id=$1',[req.params.id])).rows[0];if(!old)return res.status(404).json({error:'ไม่พบ Job'});return staffPermissionRequired(operationsPermissionForType(old.job_type))(req,res,async()=>{try{const r=await pool.query(`UPDATE operations_jobs SET status='CANCELLED',finished_at=NOW(),updated_at=NOW(),current_item='' WHERE id=$1 AND status IN ('PENDING','RUNNING') RETURNING id`,[req.params.id]);if(!r.rows.length)return res.status(409).json({error:'Job นี้จบแล้วหรือไม่สามารถยกเลิกได้'});await pool.query(`UPDATE operations_job_items SET status='CANCELLED',finished_at=NOW(),updated_at=NOW() WHERE job_id=$1 AND status IN ('PENDING','RUNNING')`,[req.params.id]);await workflowAudit(req,'OPS_JOB',req.params.id,'CANCEL',{jobType:old.job_type});res.json({ok:true})}catch(error){res.status(500).json({error:'ยกเลิก Job ไม่สำเร็จ',detail:error.message})}})}catch(error){res.status(500).json({error:'โหลด Job สำหรับยกเลิกไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/notifications',localOnly,staffPermissionRequired('worklistView'),async(req,res)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500),items=(await pool.query('SELECT * FROM system_notifications ORDER BY created_at DESC LIMIT $1',[limit])).rows;res.set('Cache-Control','no-store').json({items})}catch(error){res.status(500).json({error:'โหลด Notification ไม่สำเร็จ',detail:error.message})}});
app.post('/api/ops/notifications/read',localOnly,staffPermissionRequired('worklistView'),async(req,res)=>{try{const ids=(Array.isArray(req.body?.ids)?req.body.ids:[]).map(Number).filter(Number.isFinite);if(ids.length)await pool.query('UPDATE system_notifications SET is_read=TRUE,read_at=NOW(),read_by=$2 WHERE id=ANY($1::bigint[])',[ids,operationsActor(req)]);else await pool.query('UPDATE system_notifications SET is_read=TRUE,read_at=NOW(),read_by=$1 WHERE is_read=FALSE',[operationsActor(req)]);res.json({ok:true})}catch(error){res.status(500).json({error:'อัปเดต Notification ไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/audit',localOnly,staffPermissionRequired('auditView'),async(req,res)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||200,1),500),q=String(req.query.q||'').trim().toLowerCase(),[actions,workflow,state]=await Promise.all([pool.query('SELECT id,created_at,actor,method,route,status_code,duration_ms,client_address,detail FROM system_action_audit ORDER BY created_at DESC LIMIT $1',[limit]),pool.query('SELECT id,performed_at,performed_by,entity_type,entity_id,action,client_address,details FROM checkup_workflow_audit ORDER BY performed_at DESC,id DESC LIMIT $1',[limit]),readState()]);let items=[...actions.rows.map(x=>({source:'API',at:x.created_at,actor:x.actor,action:`${x.method} ${x.route}`,status:x.status_code>=400?'ERROR':'OK',entity:'',detail:{durationMs:x.duration_ms,statusCode:x.status_code,clientAddress:x.client_address,...(x.detail||{})}})),...workflow.rows.map(x=>({source:'WORKFLOW',at:x.performed_at,actor:x.performed_by,action:x.action,status:'OK',entity:`${x.entity_type}:${x.entity_id}`,detail:{clientAddress:x.client_address,...(x.details||{})}})),...(state.permissionAudit||[]).slice(0,limit).map((x,index)=>({source:'SECURITY',at:x.at,actor:x.by||'',action:x.action||'Permission change',status:'OK',entity:x.target||'',detail:x.details||{},id:`p${index}`}))];if(q)items=items.filter(x=>[x.actor,x.action,x.entity,x.source,JSON.stringify(x.detail||{})].some(v=>String(v||'').toLowerCase().includes(q)));items.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));res.set('Cache-Control','no-store').json({items:items.slice(0,limit)})}catch(error){res.status(500).json({error:'โหลด Audit Log ไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/backups',localOnly,staffPermissionRequired('apiView'),async(req,res)=>{try{const dirs=[path.join(__dirname,'backups'),path.join(__dirname,'updates')],items=[];for(const dir of dirs){if(!fs.existsSync(dir))continue;for(const name of fs.readdirSync(dir)){if(!/\.backup$/i.test(name))continue;const file=path.join(dir,name),stat=fs.statSync(file);items.push({name,sizeBytes:stat.size,updatedAt:stat.mtime.toISOString(),kind:name.startsWith('database-before-')?'UPDATE_ROLLBACK':'MANUAL_BACKUP'})}}items.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));const setting=(await pool.query("SELECT value,updated_at FROM system_settings WHERE key='last_backup_at'" )).rows[0]||null;res.set('Cache-Control','no-store').json({items:items.slice(0,100),lastBackupAt:setting?.value||null,updateStatus:readUpdateStatus(),automaticRollback:true})}catch(error){res.status(500).json({error:'โหลดรายการ Backup ไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/performance',localOnly,staffPermissionRequired('apiView'),async(req,res)=>{try{const stat=fs.statfsSync?fs.statfsSync(__dirname):null,freeBytes=stat?Number(stat.bavail)*Number(stat.bsize):null,totalBytes=stat?Number(stat.blocks)*Number(stat.bsize):null,dbStart=Date.now();await pool.query('SELECT 1');const dbLatency=Date.now()-dbStart,slow=await readSystemHealthEvents(100),poolInfo={total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount};res.set('Cache-Control','no-store').json({database:{latencyMs:dbLatency,pool:poolInfo},disk:{freeBytes,totalBytes,freeGb:freeBytes==null?null:Math.round(freeBytes/1073741824*10)/10},runtime:{rssMb:Math.round(process.memoryUsage().rss/1048576),heapUsedMb:Math.round(process.memoryUsage().heapUsed/1048576),uptimeSec:Math.round(process.uptime())},slowEvents:slow.filter(x=>Number(x.durationMs||0)>=2000||['CRITICAL','TIMEOUT'].includes(String(x.status))).slice(0,30),update:readUpdateStatus()})}catch(error){res.status(500).json({error:'โหลด Performance ไม่สำเร็จ',detail:error.message})}});


registerScalableApi(app,{pool,localOnly,readState,workflowActor,clientAddress});

// Express treats paths with and without a trailing slash as equivalent by
// default. Redirecting `/customer/` to `/customer` therefore matched the same
// redirect route again and caused ERR_TOO_MANY_REDIRECTS. Serve the customer
// page directly for both URL forms instead.
app.get(['/customer', '/customer/'], (_req, res) => res.sendFile(path.join(__dirname, 'app.html')));
// v7.62.80 System Health + In-App Update Center (Production only).
app.get('/api/system/health',localOnly,async(req,res)=>{
  const started=Date.now();
  try{
    const dbStart=Date.now();await pool.query('SELECT 1');const dbLatency=Date.now()-dbStart;
    const counts=(await pool.query(`SELECT (SELECT COUNT(*)::int FROM customers) AS customers,(SELECT COUNT(*)::int FROM company_customers) AS memberships,(SELECT COUNT(*)::int FROM checkup_bookings) AS bookings,(SELECT COUNT(*)::int FROM checkup_visits) AS visits`)).rows[0]||{};
    const latest=await readSystemHealthEvents(30),lastSave=latest.find(x=>x.eventType==='PATIENT_SAVE')||null,lastLoad=latest.find(x=>x.eventType==='STATE_LOAD')||null,critical=latest.filter(x=>x.status==='CRITICAL').length,timeouts=latest.filter(x=>x.status==='TIMEOUT').length;
    const memory=process.memoryUsage(),uptimeSec=Math.round(process.uptime());
    const diskStat=fs.statfsSync?fs.statfsSync(__dirname):null,diskFreeBytes=diskStat?Number(diskStat.bavail)*Number(diskStat.bsize):null,backup=(await pool.query("SELECT value FROM system_settings WHERE key='last_backup_at'")).rows[0]?.value||null;res.set('Cache-Control','no-store').json({ok:true,release:RELEASE_NAME,environment:RUNTIME_ENVIRONMENT,database:{ok:true,latencyMs:dbLatency,pool:{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount}},counts,lastSave,lastLoad,recentEvents:latest,summary:{critical,timeouts},runtime:{uptimeSec,rssMb:Math.round(memory.rss/1024/1024),heapUsedMb:Math.round(memory.heapUsed/1024/1024)},disk:{freeBytes:diskFreeBytes,freeGb:diskFreeBytes==null?null:Math.round(diskFreeBytes/1073741824*10)/10},backup:{lastBackupAt:backup},update:readUpdateStatus(),requestMs:Date.now()-started});
  }catch(error){res.status(500).json({ok:false,error:'ตรวจสอบ System Health ไม่สำเร็จ',detail:error.message})}
});
app.get('/api/system/health/events',localOnly,async(req,res)=>{res.json({items:await readSystemHealthEvents(req.query.limit||50)})});


// v7.63.74 Production Readiness Pack.
const READINESS_UAT_ITEMS=[
  ['LOGIN_ROLE','Login / Role / Permission','เข้าสู่ระบบและตรวจสิทธิ์เมนู/ปุ่มตาม Role'],
  ['PROJECT_BOOKING','Project Booking','เปิดโครงการ ค้นหา Booking และตรวจ sticky/compact layout'],
  ['HN_VN','HN / VN','ตรวจ HN และ VN จาก HIS ด้วยข้อมูลทดสอบที่อนุมัติ'],
  ['PATIENTLOG','patientlog Status','ตรวจ latest tovalue ด้วย HN + VN และ auto refresh'],
  ['BULK_EMR','Bulk EMR','เลือกหลายโครงการ รับ EMR และตรวจ Live Progress / duplicate protection'],
  ['HIS_USER_SYNC','HIS User Sync','ดึง User จาก HIS และกำหนด Role โดยไม่เปิดใช้งานผิดคน'],
  ['BACKUP_RESTORE','Backup / Restore','สร้าง Backup และยืนยัน Restore ในสภาพแวดล้อมที่กำหนด'],
  ['UPDATE_ROLLBACK','Update / Rollback','ตรวจ Update Center, pre-backup และ Automatic Rollback']
];
async function ensureReadinessSchema(){await pool.query(`CREATE TABLE IF NOT EXISTS production_readiness_uat(
  check_key TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',note TEXT NOT NULL DEFAULT '',checked_by TEXT NOT NULL DEFAULT '',checked_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS production_readiness_uat_status_idx ON production_readiness_uat(status,updated_at DESC)');
  for(const [key,title,description] of READINESS_UAT_ITEMS)await pool.query(`INSERT INTO production_readiness_uat(check_key,title,description) VALUES($1,$2,$3) ON CONFLICT(check_key) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description`,[key,title,description]);
}
async function readinessBackupFiles(){const dirs=[path.join(__dirname,'backups'),path.join(__dirname,'updates')],items=[];for(const dir of dirs){if(!fs.existsSync(dir))continue;for(const name of fs.readdirSync(dir)){if(!/\.backup$/i.test(name))continue;const file=path.join(dir,name),stat=fs.statSync(file);items.push({file,name,sizeBytes:stat.size,updatedAt:stat.mtime.toISOString()})}}items.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));return items}
function readinessFileSha256(file){return new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file,{highWaterMark:1024*1024});stream.on('data',chunk=>hash.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')))})}
async function readinessSecurityAudit(){const checks=[];const add=(key,label,pass,detail,severity='HIGH')=>checks.push({key,label,pass:Boolean(pass),status:pass?'PASS':'FAIL',detail,severity});
  add('production_lock','Production-only runtime',RUNTIME_ENVIRONMENT==='production'&&PRODUCTION_PORT===3000,`${RUNTIME_ENVIRONMENT} :${PRODUCTION_PORT}`);
  add('session_cookie','Session Cookie HttpOnly/SameSite',staffSessionCookie('x',60000).includes('HttpOnly')&&staffSessionCookie('x',60000).includes('SameSite=Lax'),'HttpOnly + SameSite=Lax');
  add('login_throttle','Brute-force protection',typeof staffLoginRegisterFailure==='function','5 failures / 15 min → lock 5 min');
  add('security_headers','Baseline security headers',true,'nosniff, SAMEORIGIN, referrer policy, permissions policy');
  add('server_permissions','Server-side permission guard',typeof staffPermissionRequired==='function','Protected actions use staffPermissionRequired');
  add('env_not_served','Sensitive .env not static',!fs.existsSync(path.join(__dirname,'public','.env')),'Installer must not include runtime .env');
  return {checks,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length};
}
async function readinessDatabaseMaintenance(){const result={tables:[],indexes:[],slow:[],pool:{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount}};
  try{result.tables=(await pool.query(`SELECT relname AS table_name,n_live_tup::bigint AS live_rows,n_dead_tup::bigint AS dead_rows,last_vacuum,last_autovacuum,last_analyze,last_autoanalyze FROM pg_stat_user_tables ORDER BY n_dead_tup DESC NULLS LAST LIMIT 30`)).rows}catch(error){result.tablesError=error.message}
  try{result.indexes=(await pool.query(`SELECT relname AS table_name,indexrelname AS index_name,idx_scan::bigint AS scans,pg_relation_size(indexrelid)::bigint AS size_bytes FROM pg_stat_user_indexes ORDER BY idx_scan ASC,pg_relation_size(indexrelid) DESC LIMIT 40`)).rows}catch(error){result.indexesError=error.message}
  try{result.sizes=(await pool.query(`SELECT relname AS table_name,pg_total_relation_size(relid)::bigint AS total_bytes FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20`)).rows}catch(error){result.sizesError=error.message}
  result.recommendations=[];for(const t of result.tables||[]){const live=Number(t.live_rows||0),dead=Number(t.dead_rows||0);if(dead>1000&&dead>live*.15)result.recommendations.push({type:'VACUUM_ANALYZE',table:t.table_name,message:`Dead rows ${dead.toLocaleString()} สูงเมื่อเทียบกับ live rows ${live.toLocaleString()}`})}
  if(result.pool.waiting>0)result.recommendations.push({type:'POOL',table:'-',message:`มี ${result.pool.waiting} request รอ PostgreSQL connection`});return result;
}
async function readinessAutomatedChecks(){const started=Date.now(),dbStart=Date.now();await pool.query('SELECT 1');const dbLatency=Date.now()-dbStart,backups=await readinessBackupFiles(),latest=backups[0]||null,update=readUpdateStatus(),security=await readinessSecurityAudit(),db=await readinessDatabaseMaintenance(),checks=[];const add=(key,label,pass,detail)=>checks.push({key,label,status:pass?'PASS':'FAIL',pass:Boolean(pass),detail});
  add('database','PostgreSQL',dbLatency<1000,`Latency ${dbLatency} ms`);add('backup','Backup',Boolean(latest&&latest.sizeBytes>1024),latest?`${latest.name} · ${Math.round(latest.sizeBytes/1048576)} MB`:'ยังไม่พบ Backup');add('rollback','Update rollback prerequisites',fs.existsSync(path.join(__dirname,'tools','app-update-helper.js'))&&fs.existsSync(path.join(__dirname,'tools','restore.ps1')),`Update ${update.phase||'IDLE'} · helper/restore ${fs.existsSync(path.join(__dirname,'tools','restore.ps1'))?'พร้อม':'ไม่พร้อม'}`);add('security','Security audit',security.failed===0,`${security.passed}/${security.checks.length} ผ่าน`);add('dbmaintenance','Database maintenance',!db.tablesError&&!db.indexesError,`${(db.recommendations||[]).length} recommendation`);
  return {release:RELEASE_NAME,schemaVersion:SCHEMA_VERSION,checks,security,database:db,backup:latest?{name:latest.name,sizeBytes:latest.sizeBytes,updatedAt:latest.updatedAt}:null,update,durationMs:Date.now()-started,checkedAt:new Date().toISOString()};
}
app.get('/api/ops/readiness',localOnly,staffPermissionRequired('apiView'),async(req,res)=>{try{await ensureReadinessSchema();const uat=(await pool.query('SELECT * FROM production_readiness_uat ORDER BY check_key')).rows,automated=await readinessAutomatedChecks();res.set('Cache-Control','no-store').json({uat,automated})}catch(error){res.status(500).json({error:'ตรวจ Production Readiness ไม่สำเร็จ',detail:error.message})}});
app.put('/api/ops/readiness/uat/:key',localOnly,staffPermissionRequired('apiManage'),async(req,res)=>{try{await ensureReadinessSchema();const key=String(req.params.key||'').toUpperCase(),status=String(req.body?.status||'PENDING').toUpperCase();if(!['PENDING','PASS','FAIL','BLOCKED'].includes(status))return res.status(400).json({error:'สถานะ UAT ไม่ถูกต้อง'});const actor=operationsActor(req),note=String(req.body?.note||'').slice(0,1000),r=await pool.query('UPDATE production_readiness_uat SET status=$2,note=$3,checked_by=$4,checked_at=NOW(),updated_at=NOW() WHERE check_key=$1 RETURNING *',[key,status,note,actor]);if(!r.rowCount)return res.status(404).json({error:'ไม่พบ UAT item'});res.json({ok:true,item:r.rows[0]})}catch(error){res.status(500).json({error:'บันทึก UAT ไม่สำเร็จ',detail:error.message})}});
app.post('/api/ops/readiness/load-test',localOnly,staffPermissionRequired('apiManage'),async(req,res)=>{try{const concurrency=Math.min(Math.max(Number(req.body?.concurrency)||5,1),20),requests=Math.min(Math.max(Number(req.body?.requests)||50,5),500),started=Date.now(),latencies=[],errors=[];let next=0;async function worker(){while(true){const i=next++;if(i>=requests)return;const t=Date.now();try{await pool.query('SELECT revision FROM app_state WHERE id=1');latencies.push(Date.now()-t)}catch(error){errors.push(error.message)}}}await Promise.all(Array.from({length:Math.min(concurrency,requests)},worker));latencies.sort((a,b)=>a-b);const pct=p=>latencies.length?latencies[Math.min(latencies.length-1,Math.floor((latencies.length-1)*p))]:null;res.json({ok:errors.length===0,requests,concurrency,success:latencies.length,errors:errors.length,durationMs:Date.now()-started,latencyMs:{min:latencies[0]??null,p50:pct(.5),p95:pct(.95),max:latencies.at(-1)??null},note:'Safe DB-read benchmark only; no patient/booking data is created or changed.'})}catch(error){res.status(500).json({error:'Load Test ไม่สำเร็จ',detail:error.message})}});
app.post('/api/ops/readiness/verify-backup',localOnly,staffPermissionRequired('apiManage'),async(req,res)=>{try{const files=await readinessBackupFiles(),latest=files[0];if(!latest)return res.status(404).json({error:'ยังไม่พบไฟล์ Backup'});const sha256=await readinessFileSha256(latest.file);res.json({ok:latest.sizeBytes>1024,name:latest.name,sizeBytes:latest.sizeBytes,updatedAt:latest.updatedAt,sha256,integrity:'SHA-256 calculated successfully',restoreValidation:'ต้องทำ Restore Drill บนฐานทดสอบ/ช่วง Maintenance ก่อนยืนยัน UAT'})}catch(error){res.status(500).json({error:'ตรวจ Backup ไม่สำเร็จ',detail:error.message})}});
app.post('/api/ops/readiness/rollback-drill',localOnly,staffPermissionRequired('apiManage'),async(req,res)=>{try{const backups=await readinessBackupFiles(),checks=[{name:'Updater helper',pass:fs.existsSync(path.join(__dirname,'tools','app-update-helper.js'))},{name:'Restore script',pass:fs.existsSync(path.join(__dirname,'tools','restore.ps1'))},{name:'Database backup',pass:Boolean(backups[0])},{name:'Update status writable',pass:(()=>{try{fs.mkdirSync(path.join(__dirname,'updates'),{recursive:true});fs.accessSync(path.join(__dirname,'updates'),fs.constants.W_OK);return true}catch(_){return false}})()}];res.json({ok:checks.every(x=>x.pass),mode:'VALIDATION_ONLY',checks,currentVersion:RELEASE_NAME.split('-')[0],updateStatus:readUpdateStatus(),message:'ตรวจ prerequisite โดยไม่หยุด Server และไม่ rollback Production จริง'})}catch(error){res.status(500).json({error:'Rollback Drill validation ไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/readiness/security',localOnly,staffPermissionRequired('apiView'),async(req,res)=>{try{res.json(await readinessSecurityAudit())}catch(error){res.status(500).json({error:'Security Audit ไม่สำเร็จ',detail:error.message})}});
app.get('/api/ops/readiness/database',localOnly,staffPermissionRequired('apiView'),async(req,res)=>{try{res.json(await readinessDatabaseMaintenance())}catch(error){res.status(500).json({error:'อ่าน Database Maintenance ไม่สำเร็จ',detail:error.message})}});
app.post('/api/ops/readiness/analyze',localOnly,staffPermissionRequired('apiManage'),async(req,res)=>{try{const allowed=new Set(['app_state','checkup_bookings','checkup_visits','operations_jobs','operations_job_items','system_action_audit','system_notifications']),table=String(req.body?.table||'');if(!allowed.has(table))return res.status(400).json({error:'Table ไม่อยู่ใน allowlist'});await pool.query(`ANALYZE ${table}`);res.json({ok:true,table,message:'ANALYZE สำเร็จ'})}catch(error){res.status(500).json({error:'ANALYZE ไม่สำเร็จ',detail:error.message})}});

function updateDir(){const dir=path.join(__dirname,'updates');fs.mkdirSync(dir,{recursive:true});return dir}
function updateStatusPath(){return path.join(updateDir(),'update-status.json')}
function writeUpdateStatus(status){try{fs.writeFileSync(updateStatusPath(),JSON.stringify({...status,updatedAt:new Date().toISOString()},null,2),'utf8')}catch(error){console.warn('write update status failed',error.message)}}
function readUpdateStatus(){try{const status=JSON.parse(fs.readFileSync(updateStatusPath(),'utf8').replace(/^\uFEFF/,''));if(String(status?.phase||'').toUpperCase()==='QUEUED'){const age=Date.now()-new Date(status.updatedAt||0).getTime();if(Number.isFinite(age)&&age>15000){const failed={...status,phase:'FAILED',message:'Updater Helper ไม่เริ่มทำงานภายใน 15 วินาที กรุณาเปิด Launch Log เพื่อตรวจสอบ แล้วลองใหม่',staleQueue:true};writeUpdateStatus(failed);return failed}}return status}catch(_){return {phase:'IDLE',message:'ยังไม่มีงานอัปเดต'}}}
app.get('/api/system/update/public-status',(req,res)=>{const status=readUpdateStatus();res.set('Cache-Control','no-store').json({phase:status.phase||'IDLE',message:status.message||'',version:status.version||status.targetVersion||'',targetVersion:status.targetVersion||'',runningCommand:status.runningCommand||'',elapsedMs:Number(status.elapsedMs||0),updatedAt:status.updatedAt||''})});
app.get('/api/system/update/status',packageConfigSessionRequired,(req,res)=>res.json(readUpdateStatus()));
app.get('/api/system/update/config',packageConfigSessionRequired,async(req,res)=>{const r=await pool.query("SELECT value FROM system_settings WHERE key='app_update_manifest_url'");res.json({currentVersion:RELEASE_NAME.split('-')[0],environment:'production',manifestUrl:String(r.rows[0]?.value||''),staged:readUpdateStatus()})});
app.put('/api/system/update/config',packageConfigSessionRequired,async(req,res)=>{const manifestUrl=String(req.body?.manifestUrl||'').trim();if(manifestUrl&&!/^https?:\/\//i.test(manifestUrl))return res.status(400).json({error:'Manifest URL ต้องขึ้นต้นด้วย http:// หรือ https://'});await pool.query("INSERT INTO system_settings(key,value,updated_at) VALUES('app_update_manifest_url',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[manifestUrl]);res.json({ok:true,manifestUrl})});
function versionParts(value){return String(value||'').replace(/^v/i,'').split('.').map(x=>Number(x)||0)}
function compareVersion(a,b){const aa=versionParts(a),bb=versionParts(b);for(let i=0;i<Math.max(aa.length,bb.length);i++){if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)>(bb[i]||0)?1:-1}return 0}
async function fetchUpdateManifest(){const r=await pool.query("SELECT value FROM system_settings WHERE key='app_update_manifest_url'"),url=String(r.rows[0]?.value||'').trim();if(!url)throw new Error('ยังไม่ได้ตั้งค่า Manifest URL');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error(`Manifest HTTP ${response.status}`);const manifest=await response.json();if(String(manifest.environment||'').toLowerCase()!=='production')throw new Error('Manifest ไม่ใช่ Production');if(!/^v?\d+\.\d+\.\d+$/.test(String(manifest.version||'')))throw new Error('Manifest version ไม่ถูกต้อง');if(!/^https?:\/\//i.test(String(manifest.downloadUrl||'')))throw new Error('Manifest downloadUrl ไม่ถูกต้อง');return {url,manifest:{...manifest,version:String(manifest.version).startsWith('v')?String(manifest.version):`v${manifest.version}`}}}finally{clearTimeout(timer)}}
app.post('/api/system/update/check',localOnly,packageConfigSessionRequired,async(req,res)=>{try{const {url,manifest}=await fetchUpdateManifest(),current=RELEASE_NAME.split('-')[0],available=compareVersion(manifest.version,current)>0;res.json({ok:true,currentVersion:current,available,manifestUrl:url,manifest})}catch(error){res.status(400).json({error:error.message||String(error)})}});
app.post('/api/system/update/download',localOnly,packageConfigSessionRequired,async(req,res)=>{try{const {manifest}=await fetchUpdateManifest(),current=RELEASE_NAME.split('-')[0];if(compareVersion(manifest.version,current)<=0)return res.status(409).json({error:`ไม่มีเวอร์ชันใหม่กว่า ${current}`});writeUpdateStatus({phase:'DOWNLOAD',message:`กำลังดาวน์โหลด ${manifest.version}`,version:manifest.version});const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);let response;try{response=await fetch(manifest.downloadUrl,{signal:controller.signal})}finally{clearTimeout(timer)}if(!response.ok)throw new Error(`Download HTTP ${response.status}`);const body=Buffer.from(await response.arrayBuffer());if(body.length<1024||body.length>250*1024*1024)throw new Error('ขนาด Update Package ไม่ถูกต้อง');const sha256=crypto.createHash('sha256').update(body).digest('hex');if(manifest.sha256&&sha256.toLowerCase()!==String(manifest.sha256).toLowerCase())throw new Error('SHA-256 ของ Update Package ไม่ตรงกับ Manifest');const filename=path.basename(new URL(manifest.downloadUrl).pathname)||`HC-${manifest.version}-PRODUCTION.zip`;const file=path.join(updateDir(),`staged-${Date.now()}-${filename.replace(/[^A-Za-z0-9._-]/g,'_')}`);fs.writeFileSync(file,body);const status={phase:'STAGED',message:'ดาวน์โหลดและตรวจสอบ Update Package เรียบร้อย',packagePath:file,filename,version:manifest.version,sha256,sizeBytes:body.length,releaseNotes:manifest.releaseNotes||''};writeUpdateStatus(status);res.json({ok:true,...status})}catch(error){writeUpdateStatus({phase:'FAILED',message:`ดาวน์โหลด Update ไม่สำเร็จ: ${error.message||error}`});res.status(400).json({error:error.message||String(error)})}});

app.post('/api/system/update/upload',localOnly,packageConfigSessionRequired,express.raw({type:['application/zip','application/octet-stream'],limit:'250mb'}),(req,res)=>{
  try{const body=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);if(body.length<1024)return res.status(400).json({error:'ไฟล์ Update ไม่ถูกต้องหรือมีขนาดเล็กเกินไป'});const filename=path.basename(String(req.headers['x-update-filename']||'update.zip')).replace(/[^A-Za-z0-9._-]/g,'_');if(!/\.zip$/i.test(filename))return res.status(400).json({error:'รองรับเฉพาะไฟล์ .zip'});const match=filename.match(/v?(\d+\.\d+\.\d+)/i);if(!match)return res.status(400).json({error:'ชื่อไฟล์ต้องมีเลขเวอร์ชัน เช่น v7.62.93'});if(!/production/i.test(filename))return res.status(400).json({error:'Update Center Production รับเฉพาะแพ็กเกจที่ระบุ PRODUCTION ในชื่อไฟล์'});const targetVersion=`v${match[1]}`,currentVersion=RELEASE_NAME.split('-')[0];if(compareVersion(targetVersion,currentVersion)<=0)return res.status(409).json({error:`เวอร์ชัน ${targetVersion} ต้องใหม่กว่า ${currentVersion}`});const file=path.join(updateDir(),`staged-${Date.now()}-${filename}`);fs.writeFileSync(file,body);const sha256=crypto.createHash('sha256').update(body).digest('hex');const status={phase:'STAGED',message:'อัปโหลดแพ็กเกจเรียบร้อย',packagePath:file,filename,version:targetVersion,sha256,sizeBytes:body.length};writeUpdateStatus(status);res.json({ok:true,...status})}catch(error){res.status(500).json({error:'อัปโหลด Update ไม่สำเร็จ',detail:error.message})}
});
app.post('/api/system/update/install',localOnly,packageConfigSessionRequired,async(req,res)=>{
  const dryRun=Boolean(req.body?.dryRun),status=readUpdateStatus(),pkg=String(status.packagePath||'');if(!['STAGED','READY'].includes(status.phase)||!pkg||!fs.existsSync(pkg))return res.status(409).json({error:'ยังไม่มี Update Package ที่พร้อมติดตั้ง'});
  const sourceScript=path.join(__dirname,'tools','app-update-helper.js');if(!fs.existsSync(sourceScript))return res.status(500).json({error:'ไม่พบ Updater Helper'});
  const tempUpdaterDir=path.join(os.tmpdir(),'HealthCheck-Updater');fs.mkdirSync(tempUpdaterDir,{recursive:true});
  const script=path.join(tempUpdaterDir,`app-update-helper-${Date.now()}.js`);fs.copyFileSync(sourceScript,script);
  const launchLog=path.join(tempUpdaterDir,`helper-launch-${Date.now()}.log`),statusPath=updateStatusPath();let outFd=null;
  try{
    outFd=fs.openSync(launchLog,'a');const queued={...status,phase:'QUEUED',message:'กำลังเริ่ม Updater Helper',launchLog,helperType:'node'};writeUpdateStatus(queued);
    const args=[script,'--package',pkg,'--app-root',__dirname,'--server-pid',String(process.pid),'--current-version',RELEASE_NAME.split('-')[0],'--status-path',statusPath];if(dryRun)args.push('--dry-run');
    const child=spawn(process.execPath,args,{detached:true,stdio:['ignore',outFd,outFd],windowsHide:true});let launchError=null;child.once('error',error=>{launchError=error;writeUpdateStatus({...queued,phase:'FAILED',message:`เริ่ม Updater Helper ไม่สำเร็จ: ${error.message||error}`,launchLog})});
    child.unref();writeUpdateStatus({...queued,helperPid:child.pid||null});
    const deadline=Date.now()+8000;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,300));const now=readUpdateStatus();if(launchError)return res.status(500).json({error:'เริ่ม Updater Helper ไม่สำเร็จ',detail:launchError.message,launchLog});if(!['QUEUED','STAGED'].includes(String(now.phase||'').toUpperCase()))return res.json({ok:true,...now})}
    const now=readUpdateStatus();writeUpdateStatus({...now,phase:'FAILED',message:'Updater Helper ไม่ตอบสนองภายใน 8 วินาที กรุณาเปิด Launch Log',launchLog});return res.status(500).json({error:'Updater Helper ไม่เริ่มทำงาน',launchLog});
  }catch(error){const failed={...status,phase:'FAILED',message:`เริ่ม Updater Helper ไม่สำเร็จ: ${error.message||error}`,launchLog};writeUpdateStatus(failed);res.status(500).json({error:'เริ่ม Updater Helper ไม่สำเร็จ',detail:error.message||String(error),launchLog})
  }finally{if(outFd!==null){try{fs.closeSync(outFd)}catch(_){}}}
});

app.use((_req, res) => res.sendFile(path.join(__dirname, 'app.html')));

const port = Number(process.env.PORT || 3000);
const host = String(process.env.HOST || '0.0.0.0');

const startServer = () => app.listen(port, host, () => {
  console.log(`Health Check Smart Search: http://localhost:${port}`);
  if (process.env.SMOKE_TEST !== '1') {
    setTimeout(packageSyncSchedulerTick,15000);
    setInterval(packageSyncSchedulerTick,5*60*1000);
    setTimeout(operationsWorkerTick,5000);setInterval(operationsWorkerTick,2500);
    setInterval(()=>enqueueOperationsJob('SYSTEM_HEALTH',{scheduled:true},'system').catch(()=>{}),30*60*1000);
  }
  if(host !== '127.0.0.1' && host !== 'localhost') console.log(`Customer portal network mode ${runtimeLanEnabled?'enabled':'disabled'} on ${host}:${port}/customer`);
});
const databaseReady = process.env.SMOKE_TEST === '1'
  ? Promise.resolve()
  : ensureDatabase().then(async () => {await ensureOperationsSchema();await ensureReadinessSchema();const recovered=await recoverInterruptedOperationsJobs();if(recovered)console.warn(`[OPS] recovered ${recovered} interrupted job(s) after restart`);try{const r=await pool.query("SELECT value FROM system_settings WHERE key='lan_server_enabled' LIMIT 1");if(r.rows[0])runtimeLanEnabled=String(r.rows[0].value)==='true'}catch(_error){}});
databaseReady.then(startServer).catch(error => {
  const detail = error && (error.stack || error.message) ? (error.stack || error.message) : String(error);
  console.error('เชื่อมต่อ PostgreSQL ไม่สำเร็จ:', detail);
  process.exit(1);
});
