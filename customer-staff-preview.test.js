'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {registerCustomerStaffPreview}=require('./customer-staff-preview');
test('staff preview requires search and sensitive permission, returns the real scoped profile without creating customer access',async t=>{
 const app=express(),calls=[];
 const profile={name:'Fixture Patient',choices:{billing:[],cash:[],contract:[]},maskedId:'*****1234'};
 registerCustomerStaffPreview({app,localOnly:(_req,_res,next)=>next(),staffPermissionRequired:permission=>(req,res,next)=>{if(!req.get('x-role'))return res.status(401).json({error:'Login required'});if(req.get('x-role')==='viewer'&&permission==='customerSensitiveView')return res.status(403).json({error:'Permission required'});next()},profileFor:async(key,qr)=>{calls.push([key,qr]);if(key==='missing')throw Object.assign(Error('missing'),{status:404});return profile}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port+'/api/customer-staff-preview/';
 assert.equal((await fetch(url+'A')).status,401);assert.equal((await fetch(url+'A',{headers:{'x-role':'viewer'}})).status,403);assert.equal(calls.length,0);
 const r=await fetch(url+'A',{headers:{'x-role':'staff'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{...profile,staffPreview:true});assert.deepEqual(calls,[['A',false]]);
 assert.equal((await fetch(url+'missing',{headers:{'x-role':'staff'}})).status,404);
 assert.equal((await fetch(url+'A',{method:'POST',headers:{'x-role':'staff'}})).status,404);
});
