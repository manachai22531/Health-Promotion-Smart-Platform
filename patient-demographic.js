'use strict';
const {Pool}=require('pg'),path=require('node:path');
const text=value=>String(value??'').normalize('NFKC').trim();
const token=value=>text(value).replace(/[\s-]/g,'').toUpperCase();
const name=value=>text(value).replace(/\s+/g,' ').toLocaleLowerCase('th-TH');
function gender(value){const key=token(value);return ['M','MALE','ชาย'].includes(key)?'M':['F','FEMALE','หญิง'].includes(key)?'F':['O','OTHER','อื่นๆ','อื่น'].includes(key)?'O':['U','UNKNOWN','ไม่ระบุ'].includes(key)?'U':''}
function dob(value){
 const raw=text(value);let year,month,day,m;
 if((m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))){[,year,month,day]=m}
 else if((m=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))){[,day,month,year]=m}else return '';
 year=Number(year);if(year>=2400)year-=543;month=Number(month);day=Number(day);
 const iso=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,date=new Date(iso+'T00:00:00Z');
 return year>=1850&&year<=new Date().getUTCFullYear()&&!Number.isNaN(+date)&&date.toISOString().slice(0,10)===iso?iso:'';
}
function normalizeRow(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('รูปแบบแถวไม่ถูกต้อง');
 const keys=['id','passport','firstName','lastName','dob','gender'];
 for(const key of keys)if(raw[key]!=null&&(typeof raw[key]==='object'||String(raw[key]).length>200))throw new Error('ข้อมูลในช่องยาวเกินกำหนดหรือรูปแบบไม่ถูกต้อง');
 return {rowNumber:Number.isInteger(raw.rowNumber)&&raw.rowNumber>0?raw.rowNumber:null,id:text(raw.id),passport:text(raw.passport),firstName:text(raw.firstName),lastName:text(raw.lastName),dob:dob(raw.dob),gender:gender(raw.gender),rawDob:text(raw.dob),rawGender:text(raw.gender)};
}
const quote=s=>'"'+s.replaceAll('"','""')+'"';
async function projection(db){
 const rows=(await db.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='patient'")).rows;
 if(!rows.length)throw new Error('ไม่พบตาราง patient หรือบัญชี HIS ไม่มีสิทธิ์อ่าน');
 const columns=new Map(rows.map(row=>[row.column_name.toLowerCase().replace(/_/g,''),row]));
 const pick=(...keys)=>keys.map(key=>columns.get(key.replace(/_/g,''))).find(Boolean)?.column_name;
 const many=(...keys)=>[...new Set(keys.map(key=>pick(key)).filter(Boolean))];
 const identity=many('identificationnumber','identificationno','identification','idcard','idcardno','citizenid','cid','nationalid','nationalidnumber');
 const passport=many('passportnumber','passportno','passport', 'identificationnumber','identificationno','identification');
 const c={patientId:pick('id','patientid'),hn:pick('hn','patienthn'),first:pick('firstname','fname','firstnameth'),last:pick('lastname','lname','surname','lastnameth'),firstEn:pick('firstnameen','firstnameeng','firstnameenglish','firsten'),lastEn:pick('lastnameen','lastnameeng','lastnameenglish','lasten'),dob:pick('birthdate','dateofbirth','dob','birthdt'),gender:pick('gender','sex','gendercode','lovgendercode'),sexId:pick('lovsexid'),deleted:pick('isdeleted'),identity,passport};
 if(!c.hn||!c.patientId)throw new Error('ตาราง patient ต้องมี HN และรหัสผู้ป่วย');
 const p=col=>'p.'+quote(col),value=col=>col?`${p(col)}::text`:'NULL::text';
 let joins='',genderValue=value(c.gender),genderValues=[genderValue];
 if(c.sexId){
  const lov=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='lov'")).rows.map(r=>r.column_name);
  if(lov.includes('id')&&(lov.includes('code')||lov.includes('name'))){joins=` LEFT JOIN public.lov g ON g.id::text=${p(c.sexId)}::text`;genderValues=[...genderValues,...['code','name'].filter(key=>lov.includes(key)).map(key=>`g.${quote(key)}::text`)];genderValue=`COALESCE(${genderValues.join(',')})`}
 }
 const groups={M:['M','MALE','ชาย'],F:['F','FEMALE','หญิง'],O:['O','OTHER','อื่น','อื่นๆ'],U:['U','UNKNOWN','ไม่ระบุ']};
 const normalizedGender='CASE '+Object.entries(groups).map(([key,values])=>`WHEN ${genderValues.map(expression=>`UPPER(BTRIM(COALESCE(${expression},''))) IN (${values.map(v=>`'${v}'`).join(',')})`).join(' OR ')} THEN '${key}'`).join(' ') +" ELSE '' END";
 const selected=[`${value(c.patientId)} AS patient_id`,`${value(c.hn)} AS hn`,`${value(c.first)} AS first_name`,`${value(c.last)} AS last_name`,`${value(c.firstEn)} AS first_name_en`,`${value(c.lastEn)} AS last_name_en`,c.dob?`TO_CHAR(${p(c.dob)}::date,'YYYY-MM-DD') AS birth_date`:'NULL::text AS birth_date',`${normalizedGender} AS gender`,`${genderValue} AS gender_label`,`${c.identity.length?`COALESCE(${c.identity.map(col=>`NULLIF(${value(col)},'')`).join(',')})`:'NULL::text'} AS identification_number`,`${c.passport.length?`COALESCE(${c.passport.map(col=>`NULLIF(${value(col)},'')`).join(',')})`:'NULL::text'} AS passport_number`].join(',');
 const base=`SELECT ${selected} FROM public.patient p${joins} WHERE ${c.deleted?`${p(c.deleted)} IS NOT TRUE`:'TRUE'}`;
 return {columns:c,base,p,normalizedGender,capabilities:{id:identity.length>0,passport:passport.length>0,nameOnly:!!(c.first&&c.last),gender:!!(c.gender||genderValues.length>1),nameDobGender:!!(c.first&&c.last&&c.dob&&(c.gender||genderValues.length>1))}};
}
function mismatches(input,patient){
 const out=[];
 if(input.id&&patient.identification_number&&token(input.id)!==token(patient.identification_number))out.push('ID');
 if(input.passport&&patient.passport_number&&token(input.passport)!==token(patient.passport_number))out.push('Passport');
 if(input.firstName&&![patient.first_name,patient.first_name_en].filter(Boolean).some(v=>name(v)===name(input.firstName)))out.push('ชื่อ');
 if(input.lastName&&![patient.last_name,patient.last_name_en].filter(Boolean).some(v=>name(v)===name(input.lastName)))out.push('นามสกุล');
 if(input.rawDob&&(!input.dob||input.dob!==patient.birth_date))out.push('วันเกิด');
 if(input.rawGender&&(!input.gender||input.gender!==patient.gender))out.push('Gender');
 return out;
}
async function matchRow(db,plan,raw){
 const input=normalizeRow(raw),attempts=[],warnings=[];
 const hasNames=!!(input.firstName&&input.lastName),invalidOptional=!!(input.rawDob&&!input.dob||input.rawGender&&!input.gender);
 const stages=[['ID',input.id,plan.columns.identity],['PASSPORT',input.passport,plan.columns.passport]];
 async function find(method,where,params){
  attempts.push(method);
  const rows=(await db.query(`${plan.base} AND (${where}) ORDER BY ${plan.p(plan.columns.patientId)} LIMIT 11`,params)).rows;
  if(!rows.length)return null;
  const candidates=rows.slice(0,10),different=rows.length===1?mismatches(input,rows[0]):[];
  return {input,status:rows.length>1?'MULTIPLE':different.length||['NAME_ONLY','NAME_PARTIAL'].includes(method)?'REVIEW':'MATCH',requiresSelection:rows.length>1||['NAME_ONLY','NAME_PARTIAL'].includes(method),message:['NAME_ONLY','NAME_PARTIAL'].includes(method)?'ค้นจากชื่อ–นามสกุล กรุณาตรวจและเลือกผู้ป่วยก่อนนำ HN ไปใช้':'',matchMethod:method,candidates,matchCount:rows.length,hasMore:rows.length>10,mismatches:different,attempts,warnings:[...warnings,...(rows.length>10?['พบอย่างน้อย 11 คน แสดงเฉพาะ 10 คนแรก กรุณาตรวจสอบกับ HIS']:[])]};
 }
 for(const [method,value,columns] of stages){
  if(!value)continue;
  if(!columns.length){warnings.push(`HIS ไม่มีคอลัมน์สำหรับ ${method}`);continue}
  const variants=[...new Set([text(value),token(value),token(value).toLowerCase()])];
  const result=await find(method,columns.map(col=>`UPPER(REGEXP_REPLACE(${plan.p(col)}::text,'[-[:space:]]','','g'))=ANY($1::text[])`).join(' OR '),[variants]);if(result)return result;
 }
 if(hasNames&&!invalidOptional){
  if(plan.columns.first&&plan.columns.last){
   const first=`LOWER(REGEXP_REPLACE(BTRIM(${plan.p(plan.columns.first)}::text),'[[:space:]]+',' ','g'))=$1`,last=`LOWER(REGEXP_REPLACE(BTRIM(${plan.p(plan.columns.last)}::text),'[[:space:]]+',' ','g'))=$2`;
   let names=`(${first} AND ${last})`;
   if(plan.columns.firstEn&&plan.columns.lastEn)names+=` OR (LOWER(REGEXP_REPLACE(BTRIM(${plan.p(plan.columns.firstEn)}::text),'[[:space:]]+',' ','g'))=$1 AND LOWER(REGEXP_REPLACE(BTRIM(${plan.p(plan.columns.lastEn)}::text),'[[:space:]]+',' ','g'))=$2)`;
   const params=[name(input.firstName),name(input.lastName)],conditions=[`(${names})`];let available=true;
   if(input.dob){if(plan.columns.dob){params.push(input.dob);const index=params.length;conditions.push(`${plan.p(plan.columns.dob)}>=$${index}::date AND ${plan.p(plan.columns.dob)}<($${index}::date+1)`)}else{warnings.push('HIS ไม่มีคอลัมน์วันเกิด จึงยังกรองตามวันเกิดที่ระบุไม่ได้');available=false}}
   if(input.gender){if(plan.capabilities.gender??plan.capabilities.nameDobGender){params.push(input.gender);conditions.push(`(${plan.normalizedGender})=$${params.length}`)}else{warnings.push('HIS ไม่มีคอลัมน์ Gender จึงยังกรองตามเพศที่ระบุไม่ได้');available=false}}
   if(available){const method=input.dob&&input.gender?'NAME_DOB_GENDER':input.dob||input.gender?'NAME_PARTIAL':'NAME_ONLY';const result=await find(method,conditions.join(' AND '),params);if(result)return result}
  }else warnings.push('HIS ไม่มีคอลัมน์ชื่อและนามสกุลครบ');
 }
 if(invalidOptional)warnings.push('วันเกิดหรือ Gender ที่ระบุไม่ถูกต้อง กรุณาแก้ไขก่อนค้นจากชื่อ');
 const incomplete=!hasNames||invalidOptional,missing=[];if(!input.firstName)missing.push('ชื่อ');if(!input.lastName)missing.push('นามสกุล');
 return {input,status:!attempts.length?'INSUFFICIENT_DATA':incomplete||warnings.length?'INCOMPLETE_SEARCH':'NOT_FOUND',matchMethod:'',candidates:[],matchCount:0,hasMore:false,mismatches:[],attempts,warnings,message:invalidOptional?'วันเกิดหรือ Gender ไม่ถูกต้อง':!hasNames?`ยังค้นขั้นชื่อ–นามสกุลไม่ได้: ${missing.join(', ')}`:warnings.join(' · ')};
}
function createHisPool(cfg){
 return new Pool({host:cfg.host,port:Number(cfg.port||5432),database:cfg.database,user:cfg.user,password:cfg.password,ssl:cfg.ssl?{rejectUnauthorized:true}:false,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,application_name:'HealthCheck-Patient-Demographic',options:'-c default_transaction_read_only=on -c statement_timeout=10000'});
}
function registerPatientDemographic({app,localOnly,rootDir,readConfig,staffPermissionRequired,makePool=createHisPool}){
 const guards=[localOnly,staffPermissionRequired('dataCenterView'),staffPermissionRequired('customerSensitiveView')];
 app.get('/datacenter/patient-demographic',...guards,(_req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(rootDir,'datacenter','patient-demographic.html'))});
 app.get('/api/datacenter/patient-demographic/status',...guards,async(_req,res)=>{try{const cfg=await readConfig();res.set('Cache-Control','no-store');res.json({ok:true,configured:!!(cfg?.host&&cfg?.database&&cfg?.user&&cfg?.password),connectionSource:'Patient Package / Radiology ใน System & API'})}catch(_){res.status(503).json({ok:false,error:'อ่านการตั้งค่า HIS ไม่สำเร็จ'})}});
 app.post('/api/datacenter/patient-demographic/search',...guards,async(req,res)=>{
  const rows=req.body?.rows;
  if(!Array.isArray(rows)||rows.length<1||rows.length>25)return res.status(400).json({ok:false,error:'ส่งข้อมูลครั้งละ 1–25 แถว'});
  try{rows.forEach(normalizeRow)}catch(error){return res.status(400).json({ok:false,error:error.message})}
  let pool;
  try{
   const cfg=await readConfig();if(!cfg?.host||!cfg.database||!cfg.user||!cfg.password)return res.status(400).json({ok:false,error:'กรุณาตั้งค่า HIS ของ Patient Package หรือ Radiology ใน System & API ก่อน'});
   pool=makePool(cfg);const plan=await projection(pool),results=Array(rows.length);let cursor=0;
   async function worker(){while(cursor<rows.length){const index=cursor++;if(req.aborted||res.destroyed)break;try{results[index]=await matchRow(pool,plan,rows[index])}catch(_){results[index]={input:normalizeRow(rows[index]),status:'ERROR',matchMethod:'',candidates:[],message:'ค้นหา HIS ไม่สำเร็จหรือเกินเวลารอ แถวนี้ยังไม่ได้ยืนยันผล'}}}}
   await Promise.all(Array.from({length:Math.min(3,rows.length)},worker));if(res.destroyed)return;
   res.set('Cache-Control','no-store');res.json({ok:true,capabilities:plan.capabilities,results});
  }catch(error){res.status(502).json({ok:false,error:'เชื่อมต่อ HIS หรือตรวจโครงสร้าง patient ไม่สำเร็จ กรุณาตรวจ System & API',code:error.code==='42703'?'SCHEMA_MISMATCH':'HIS_UNAVAILABLE'})}
  finally{if(pool)await pool.end().catch(()=>{})}
 });
}
module.exports={dob,gender,normalizeRow,projection,matchRow,mismatches,createHisPool,registerPatientDemographic};
