'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {normalize,orderSql,register}=require('./customer-search-settings');
test('sort whitelist rejects injected fields and directions; numerical identifiers use numeric ordering',()=>{
 assert.deepEqual(normalize({view:'bad',field:'DROP TABLE customers',direction:'DESC;--'}),{view:'card',field:'updated',direction:'za'});
 assert.match(orderSql({sort:'hn',direction:'09'}),/::numeric ASC NULLS LAST/);
 assert.match(orderSql({sort:'id',direction:'90'}),/::numeric DESC NULLS LAST/);
 assert.match(orderSql({sort:'name',direction:'az'}),/LOWER\(concat_ws/);
 assert.doesNotMatch(orderSql({sort:'x;DELETE',direction:'x;DELETE'}),/DELETE/);
 assert.match(orderSql({}),/cc.updated_at DESC NULLS LAST,cc.legacy_record_key ASC/);
});
test('preferences are stored for the authenticated user; GET does not write and another user cannot overwrite them',async t=>{
 const app=express();app.use(express.json());const rows=new Map();let writes=0;
 const auth=()=> (req,res,next)=>{const id=req.get('x-user');if(!id)return res.sendStatus(401);req.staffUser={id};next()};
 register({app,localOnly:(_q,_r,n)=>n(),staffPermissionRequired:auth,pool:{query:async(sql,args)=>{if(sql.startsWith('INSERT')){rows.set(args[0],args[1]);writes++;return {rows:[]}}return {rows:rows.has(args[0])?[{value:rows.get(args[0])}]:[]}}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));const url='http://127.0.0.1:'+server.address().port+'/api/users/me/customer-search-settings';
 assert.equal((await fetch(url)).status,401);
 assert.deepEqual(await (await fetch(url,{headers:{'x-user':'A'}})).json(),{settings:null});assert.equal(writes,0);
 const settings={view:'table',field:'hn',direction:'09'};
 assert.equal((await fetch(url,{method:'PUT',headers:{'x-user':'A','Content-Type':'application/json'},body:JSON.stringify({...settings,userId:'B'})})).status,200);
 assert.deepEqual((await (await fetch(url,{headers:{'x-user':'A'}})).json()).settings,settings);
 assert.equal((await (await fetch(url,{headers:{'x-user':'B'}})).json()).settings,null);
 assert.equal(writes,1);
});
