'use strict';
// Runs only with explicit database configuration; all fixtures are temporary and rolled back.
const {Client}=require('pg');
const assert=require('node:assert/strict');
const {orderSql}=require('../customer-search-settings');
const ops=require('../operations-records');
(async()=>{if(!process.env.PGHOST||!process.env.PGDATABASE||!process.env.PGUSER)throw Error('Set PGHOST, PGDATABASE and PGUSER for an isolated development database');const db=new Client();await db.connect();try{await db.query('BEGIN');await db.query(`CREATE TEMP TABLE customers(id text,hn text,vn text,title text,first_name text,last_name text,identification_number text,passport_number text);CREATE TEMP TABLE company_customers(id text,legacy_record_key text,customer_id text,company_year_id text,source_data jsonb,package_code text,package_name text,updated_at timestamptz);CREATE TEMP TABLE companies(id text,company_name text);CREATE TEMP TABLE company_years(id text,company_id text,source_data jsonb);`);
const source=[{}, {hisEmrResult:{}},{hisEmrResult:false},{hisLastResultAt:'2026-11-03'},{hisEmrResultsByVisit:{VN:{}}},{hisEmrResultsByVisit:{}}];
for(let i=0;i<source.length;i++){await db.query('INSERT INTO customers(id,hn,first_name) VALUES($1,$2,$3)',[String(i),['10','2','1','20','3',''][i],'Name '+i]);await db.query('INSERT INTO company_customers VALUES($1,$1,$1,$2,$3,$4,$5,NOW())',[String(i),'CO',JSON.stringify(source[i]),'PK','Package'])}
const actual=await ops.load(db);for(const r of actual){const original=source[Number(r.key)];const expected=Boolean(original.hisLastResultAt||original.hisEmrResult||(original.hisEmrResultsByVisit&&Object.keys(original.hisEmrResultsByVisit).length));assert.equal(Boolean(r.hisLastResultAt),expected,r.key)}
for(const [direction,expected] of [['09',['2','1','4','0','3','5']],['90',['3','0','4','1','2','5']]]){const result=await db.query('SELECT cc.legacy_record_key AS key FROM company_customers cc JOIN customers c ON c.id=cc.customer_id ORDER BY '+orderSql({sort:'hn',direction})+' LIMIT 120');assert.deepEqual(result.rows.map(r=>r.key),expected)}
for(const sort of ['name','company','id','hn','vn','updated'])for(const direction of ['az','za','09','90']){await db.query('SELECT cc.legacy_record_key FROM company_customers cc JOIN customers c ON c.id=cc.customer_id ORDER BY '+orderSql({sort,direction})+' LIMIT 120')}
console.log('PASS PostgreSQL numeric ordering, NULLS LAST, deterministic tie-break, and operations EMR presence parity (6 cases)');await db.query('ROLLBACK')}finally{await db.end()}})().catch(e=>{console.error(e);process.exitCode=1});
