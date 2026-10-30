'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {checkProductionReadiness,request}=require('./tools/app-update-helper');
async function fixture(fn,{version={},health={},healthStatus=200}={}){
  const paths=[],server=http.createServer((req,res)=>{
    paths.push(req.url);res.setHeader('Content-Type','application/json');
    if(req.url==='/api/version')return res.end(JSON.stringify({version:'v7.64.68',release:'v7.64.68-production',environment:'production',productionOnly:true,...version}));
    if(req.url==='/api/health'){res.statusCode=healthStatus;return res.end(JSON.stringify({ok:true,database:'PostgreSQL',release:'v7.64.68-production',...health}))}
    res.statusCode=401;res.end(JSON.stringify({error:'login required'}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await fn('http://127.0.0.1:'+server.address().port,paths)}finally{await new Promise(r=>server.close(r))}
}
test('updater readiness works without a staff session and never requests protected system health',async()=>{
  await fixture(async(base,paths)=>{await checkProductionReadiness('v7.64.68',base);assert.deepEqual(paths.sort(),['/api/health','/api/version']);await assert.rejects(request(base+'/api/system/health'),/HTTP 401/)});
});
test('readiness rejects unavailable database and wrong versions or environment',async()=>{
  await fixture(base=>assert.rejects(checkProductionReadiness('v7.64.68',base),/HTTP 503/),{healthStatus:503});
  await fixture(base=>assert.rejects(checkProductionReadiness('v7.64.69',base),/version mismatch/));
  await fixture(base=>assert.rejects(checkProductionReadiness('v7.64.68',base),/version mismatch/),{version:{environment:'uat'}});
  await fixture(base=>assert.rejects(checkProductionReadiness('v7.64.68',base),/version mismatch/),{version:{productionOnly:false}});
});
test('HTTP 200 alone does not count as database readiness',async()=>{
  for(const health of [{ok:false},{database:'other'},{release:'v7.64.67-production'}])await fixture(base=>assert.rejects(checkProductionReadiness('v7.64.68',base),/database health failed/),{health});
});
