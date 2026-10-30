'use strict';
const outcomes=['SUCCESS','FAILED','PASSWORD_CHANGE_REQUIRED','RATE_LIMITED','ERROR','LEGACY'];
function authenticationAudit(req,status){
  if(req.path!=='/api/auth/login')return null;
  const info=req.loginAudit||{},clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,160);
  return {
    username:clean(info.username),displayName:clean(info.displayName),roleId:clean(info.roleId),roleName:clean(info.roleName),
    outcome:status>=500?'ERROR':status===429?'RATE_LIMITED':status>=400?'FAILED':outcomes.includes(info.outcome)?info.outcome:'LEGACY',
    reason:clean(info.reason)
  };
}
function registerLoginHistory({app,pool,localOnly,staffPermissionRequired}){
  app.get('/api/ops/login-history',localOnly,staffPermissionRequired('auditView'),async(req,res)=>{
    try{
      const q=String(req.query.q||'').trim().slice(0,200),outcome=String(req.query.outcome||''),from=String(req.query.from||''),to=String(req.query.to||'');
      const dateValid=s=>!s||/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
      if(!dateValid(from)||!dateValid(to)||from&&to&&from>to)return res.status(400).json({error:'ช่วงวันที่ไม่ถูกต้อง'});
      if(outcome&&!outcomes.includes(outcome))return res.status(400).json({error:'ผลการเข้าสู่ระบบไม่ถูกต้อง'});
      const integer=(value,fallback,min,max)=>Number.isSafeInteger(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback;
      const limit=integer(req.query.limit??50,50,1,200),offset=integer(req.query.offset??0,0,0,10000000);
      const resultSql=`CASE WHEN detail->'authentication'->>'outcome' IN ('SUCCESS','FAILED','PASSWORD_CHANGE_REQUIRED','RATE_LIMITED','ERROR') THEN detail->'authentication'->>'outcome' WHEN status_code>=400 THEN 'FAILED' ELSE 'LEGACY' END`;
      const where=["method='POST'","route='/api/auth/login'"],params=[];
      if(q){params.push('%'+q+'%');const p='$'+params.length;where.push(`(actor ILIKE ${p} OR client_address ILIKE ${p} OR detail->'authentication'->>'username' ILIKE ${p} OR detail->'authentication'->>'displayName' ILIKE ${p} OR detail->'authentication'->>'roleName' ILIKE ${p})`)}
      if(outcome){params.push(outcome);where.push(`(${resultSql})=$${params.length}`)}
      if(from){params.push(from);where.push(`created_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Bangkok')`)}
      if(to){params.push(to);where.push(`created_at < (($${params.length}::date+1)::timestamp AT TIME ZONE 'Asia/Bangkok')`)}
      const filter=where.join(' AND '),[count,rows]=await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total FROM system_action_audit WHERE ${filter}`,params),
        pool.query(`SELECT id,created_at,actor,client_address,status_code,detail->'authentication' AS authentication,${resultSql} AS outcome FROM system_action_audit WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,offset])
      ]);
      const items=rows.rows.map(row=>({id:String(row.id),at:row.created_at,username:row.authentication?.username||(row.actor==='anonymous'?'':row.actor),displayName:row.authentication?.displayName||'',role:row.authentication?.roleName||row.authentication?.roleId||'',outcome:row.outcome,reason:row.authentication?.reason||'',clientAddress:row.client_address,statusCode:row.status_code}));
      res.set('Cache-Control','no-store').json({items,total:count.rows[0]?.total||0,limit,offset,timeZone:'Asia/Bangkok'});
    }catch(error){console.error('[LOGIN HISTORY]',error.message);res.status(500).json({error:'อ่านประวัติการเข้าสู่ระบบไม่สำเร็จ'})}
  });
}
module.exports={authenticationAudit,registerLoginHistory};
