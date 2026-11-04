'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {englishType,discover,enrich,passportWhere,nameWhere}=require('./patient-demographic-related');
test('English classification uses explicit lookup labels, never an unexplained numeric name type',()=>{
 assert.equal(englishType({lovptothnameid:4546,firstname:'Alice'}),false);
 assert.equal(englishType({name_type_code:'EN'}),true);assert.equal(englishType({name_type_name:'ชื่อภาษาอังกฤษ'}),true);assert.equal(englishType({name_type_name:'ชื่อเดิม'}),false);
});
test('missing optional tables preserve the patient and report missing enrichment instead of fabricating values',async()=>{
 const tables=await discover({query:async()=>({rows:[]})});const patients=await enrich({query:async()=>{throw Error('Must not query missing tables')}},[{patient_id:'1',hn:'H1'}],tables);assert.equal(patients.length,1);assert.equal(patients[0].first_name_en,'');assert.deepEqual(patients[0].patient_details,[]);assert.equal(patients[0].related_warnings.length,2);assert.equal(passportWhere(tables,'p.id'),null);assert.equal(nameWhere(tables,'p.id'),null);
});

const {mismatches}=require('./patient-demographic');
test('a name composed from different aliases is flagged for review',()=>{assert.deepEqual(mismatches({firstName:'Alice',lastName:'Previous'},{first_name:'Thai',last_name:'Name',alternate_names:[{first_name:'Alice',last_name:'Tester'},{first_name:'Alias',last_name:'Previous'}]}),['ชื่อ–นามสกุลไม่ใช่ชุดเดียวกัน'])});
