'use strict';
const {Client}=require('pg'),assert=require('node:assert/strict'),fs=require('node:fs');
const {registerClinicalLifecycle}=require('../clinical-lifecycle');
(async()=>{
 if(!process.env.PGHOST||!process.env.PGUSER)throw Error('Use an isolated development PostgreSQL cluster');
 const db=new Client();await db.connect();
 try{
 await db.query('BEGIN');
 // A private transactional schema models upgrading an existing installation without history.
 await db.query('CREATE SCHEMA history_test_'+process.pid);await db.query('SET LOCAL search_path TO history_test_'+process.pid);
 await db.query('CREATE TABLE schema_migrations(version text primary key,description text)');
 await db.query(require('../clinical-lifecycle').schemaSql.replace(require('../his-operation-monitor').schemaSql,''));
 const migration=fs.readFileSync(require('node:path').join(__dirname,'../migrations/0219_his_operation_attempts.up.sql'),'utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
 await db.query(migration);await db.query(migration);
 const app={get(){},post(){},use(){},put(){},patch(){}};
 const clinical=registerClinicalLifecycle({app,pool:db,staffPermissionRequired:()=>()=>{}});
 const id=await clinical.acquireCustomerSelection('case-a');
 assert.equal((await db.query('SELECT operation_id FROM his_operation_attempts WHERE record_key=$1',['case-a'])).rows[0].operation_id,id);
 await assert.rejects(()=>clinical.acquireCustomerSelection('case-a'),e=>e.status===423);
 assert.equal((await db.query('SELECT count(*)::int n FROM his_operation_attempts')).rows[0].n,1);
 await db.query("ALTER TABLE his_operation_attempts ADD CONSTRAINT fail_case CHECK(record_key <> 'case-b')");
 await db.query('SAVEPOINT failure');
 await assert.rejects(()=>clinical.acquireCustomerSelection('case-b'),e=>e.code==='23514');
 await db.query('ROLLBACK TO SAVEPOINT failure');
 assert.equal((await db.query("SELECT count(*)::int n FROM his_operation_guards WHERE record_key='case-b'")).rows[0].n,0,'failed history insert must not leave a stuck guard');
 console.log('PASS HIS history upgrade, idempotency, atomic acquisition and duplicate blocking');
 }finally{await db.query('ROLLBACK').catch(()=>{});await db.end()}
})().catch(e=>{console.error(e);process.exitCode=1});
