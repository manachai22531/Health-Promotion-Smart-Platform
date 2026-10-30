'use strict';

const MAX_LEVEL=100, CASE_EXP=10;
function levelCost(level){return 100+50*(level-1)}
function experienceProgress(value){
  const totalExp=Math.max(0,Math.floor(Number(value)||0));
  let level=1, floor=0;
  while(level<MAX_LEVEL&&totalExp>=floor+levelCost(level)){floor+=levelCost(level);level++}
  const capped=level===MAX_LEVEL,required=capped?0:levelCost(level),current=capped?0:totalExp-floor;
  return {level,maxLevel:MAX_LEVEL,totalExp,currentExp:current,requiredExp:required,remainingExp:capped?0:required-current,percent:capped?100:current/required*100,tier:Math.min(10,Math.floor((level-1)/10)+1),capped};
}
const schemaSql=`CREATE TABLE IF NOT EXISTS user_experience_events(
  record_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exp INTEGER NOT NULL DEFAULT 10 CHECK(exp=10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_experience_events_user_date_idx ON user_experience_events(user_id,created_at);
INSERT INTO schema_migrations(version,description) VALUES('0212','User experience ledger: one reward per confirmed case') ON CONFLICT(version) DO NOTHING;`;
const {ACTIVITIES,canActivity,defaultPolicy}=require('./experience-rules');
const roleSchemaSql=`CREATE TABLE IF NOT EXISTS user_experience_work_claims(activity TEXT NOT NULL,entity_key TEXT NOT NULL,completed_by TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(activity,entity_key));
CREATE TABLE IF NOT EXISTS role_experience_policies(role_id TEXT PRIMARY KEY,config JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS user_experience_activity_events(
 activity TEXT NOT NULL,entity_key TEXT NOT NULL,work_key TEXT NOT NULL,user_id TEXT NOT NULL,role_id TEXT NOT NULL DEFAULT '',exp INTEGER NOT NULL CHECK(exp BETWEEN 1 AND 1000),policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),revoked_at TIMESTAMPTZ,revoked_reason TEXT NOT NULL DEFAULT '',PRIMARY KEY(activity,entity_key));
CREATE INDEX IF NOT EXISTS user_experience_activity_user_idx ON user_experience_activity_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS user_experience_activity_work_idx ON user_experience_activity_events(work_key);
CREATE TABLE IF NOT EXISTS user_experience_history(id BIGSERIAL PRIMARY KEY,activity TEXT NOT NULL,entity_key TEXT NOT NULL,user_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,exp_delta INTEGER NOT NULL,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO user_experience_activity_events(activity,entity_key,work_key,user_id,exp,created_at,policy_snapshot) SELECT 'CONFIRM_CASE',record_key,record_key,user_id,exp,created_at,'{"legacy":true}'::jsonb FROM user_experience_events ON CONFLICT(activity,entity_key) DO NOTHING;
INSERT INTO user_experience_work_claims(activity,entity_key,completed_by,created_at) SELECT activity,entity_key,user_id,created_at FROM user_experience_activity_events ON CONFLICT(activity,entity_key) DO NOTHING;
INSERT INTO schema_migrations(version,description) VALUES('0213','Role-based work EXP with idempotent award/revocation history') ON CONFLICT(version) DO NOTHING;`;
async function ensureExperienceSchema(db){await db.query(schemaSql);await db.query(roleSchemaSql)}
async function readPolicy(db,role){const row=(await db.query('SELECT config,revision,updated_by,updated_at FROM role_experience_policies WHERE role_id=$1',[String(role?.id||'')])).rows[0];return {config:row?.config||defaultPolicy(role),revision:Number(row?.revision||0),updatedBy:row?.updated_by||'',updatedAt:row?.updated_at||null}}
async function readExperience(db,userId,role){
 const result=await db.query(`SELECT COALESCE(SUM(exp) FILTER(WHERE revoked_at IS NULL),0)::bigint AS total_exp,
 COUNT(*) FILTER(WHERE revoked_at IS NULL)::bigint AS total_activities,
 COUNT(DISTINCT work_key) FILTER(WHERE revoked_at IS NULL AND activity IN ('CONFIRM_CASE','WORKLIST_CHECKIN','HIS_ORDER','DOCTOR_HANDOFF','APPROVE_CASE'))::bigint AS total_cases,
 COALESCE(SUM(exp) FILTER(WHERE revoked_at IS NULL AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(NOW() AT TIME ZONE 'Asia/Bangkok')::date),0)::bigint AS today_exp,
 COUNT(*) FILTER(WHERE revoked_at IS NULL AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(NOW() AT TIME ZONE 'Asia/Bangkok')::date)::bigint AS today_activities,
 COUNT(DISTINCT work_key) FILTER(WHERE revoked_at IS NULL AND activity IN ('CONFIRM_CASE','WORKLIST_CHECKIN','HIS_ORDER','DOCTOR_HANDOFF','APPROVE_CASE') AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(NOW() AT TIME ZONE 'Asia/Bangkok')::date)::bigint AS today_cases FROM user_experience_activity_events WHERE user_id=$1`,[String(userId)]);
 const todayRows=(await db.query(`SELECT activity,COUNT(*)::int AS count,SUM(exp)::int AS exp FROM user_experience_activity_events WHERE user_id=$1 AND revoked_at IS NULL AND (created_at AT TIME ZONE 'Asia/Bangkok')::date=(NOW() AT TIME ZONE 'Asia/Bangkok')::date GROUP BY activity ORDER BY activity`,[String(userId)])).rows;
 const latest=(await db.query(`SELECT activity,exp,created_at FROM user_experience_activity_events WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC,activity,entity_key LIMIT 1`,[String(userId)])).rows[0];
 const activityName=id=>ACTIVITIES.find(a=>a.id===id)?.name||'งานที่สำเร็จ';
 const todayBreakdown=todayRows.map(item=>({activity:item.activity,name:activityName(item.activity),count:Number(item.count),exp:Number(item.exp)}));
 const latestAchievement=latest?{activity:latest.activity,name:activityName(latest.activity),exp:Number(latest.exp),createdAt:latest.created_at}:null;
 const row=result.rows[0]||{},policy=role?(await readPolicy(db,role)).config:null;
 const activities=role&&policy?.enabled?ACTIVITIES.filter(a=>canActivity(role,a)&&policy.activities[a.id]?.enabled).map(a=>({id:a.id,name:a.name,exp:policy.activities[a.id].exp,unit:a.unit})):[];
 return {...experienceProgress(row.total_exp),todayBreakdown,latestAchievement,totalCases:Number(row.total_cases||0),todayExp:Number(row.today_exp||0),todayCases:Number(row.today_cases||0),totalActivities:Number(row.total_activities||0),todayActivities:Number(row.today_activities||0),activities,roleName:role?.name||'',collectionEnabled:activities.length>0,caseExp:activities.find(a=>a.id==='CONFIRM_CASE')?.exp||0};
}
async function awardActivity(db,{activity,entityKey,workKey,user,role,eligible=true}){
 const definition=ACTIVITIES.find(a=>a.id===activity);if(!eligible||!entityKey||!user?.id||!canActivity(role,definition))return null;
 const claimed=await db.query('INSERT INTO user_experience_work_claims(activity,entity_key,completed_by) VALUES($1,$2,$3) ON CONFLICT(activity,entity_key) DO NOTHING RETURNING activity',[activity,String(entityKey),String(user.id)]);if(!claimed.rows.length)return null;
 const policy=(await readPolicy(db,role)).config,rule=policy.activities?.[activity];if(!policy.enabled||!rule?.enabled||!Number.isInteger(rule.exp)||rule.exp<1||rule.exp>1000)return null;
 const result=await db.query(`INSERT INTO user_experience_activity_events(activity,entity_key,work_key,user_id,role_id,exp,policy_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(activity,entity_key) DO NOTHING RETURNING *`,[activity,String(entityKey),String(workKey||entityKey),String(user.id),String(role.id),rule.exp,JSON.stringify({roleId:role.id,roleName:role.name,activity,exp:rule.exp,enabled:policy.enabled})]);
 const event=result.rows[0];if(!event)return null;
 await db.query("INSERT INTO user_experience_history(activity,entity_key,user_id,actor_id,action,exp_delta,details) VALUES($1,$2,$3,$3,'AWARD',$4,$5::jsonb)",[activity,String(entityKey),String(user.id),rule.exp,JSON.stringify(event.policy_snapshot)]);return event;
}
async function revokeActivities(db,{workKey,activities,userId,reason='งานถูกยกเลิก'}){
 const rows=(await db.query(`UPDATE user_experience_activity_events SET revoked_at=NOW(),revoked_reason=$3 WHERE work_key=$1 AND activity=ANY($2::text[]) AND revoked_at IS NULL RETURNING *`,[String(workKey),activities,String(reason)])).rows;
 for(const event of rows)await db.query("INSERT INTO user_experience_history(activity,entity_key,user_id,actor_id,action,exp_delta,details) VALUES($1,$2,$3,$4,'REVOKE',$5,$6::jsonb)",[event.activity,event.entity_key,event.user_id,String(userId||''),-event.exp,JSON.stringify({reason,policy:event.policy_snapshot})]);return rows;
}
async function activityResult(db,user,role,events=[]){if(!user?.id)return null;const result=await readExperience(db,user.id,role);const award=events.filter(Boolean).reduce((n,e)=>n+(String(e.user_id)===String(user.id)?(e.revoked_at?-Number(e.exp):Number(e.exp)):0),0);return {...result,award,previousLevel:experienceProgress(result.totalExp-award).level}}
async function awardConfirmation(db,{recordKey,userId,user,role,previousRecord,record}){
 if(previousRecord?.checkupConfirmedAt||previousRecord?.visitedAt||!record?.checkupConfirmedAt&&!record?.visitedAt)return null;
 const event=await awardActivity(db,{activity:'CONFIRM_CASE',entityKey:recordKey,workKey:recordKey,user:user||{id:userId},role,eligible:true});return event?activityResult(db,user||{id:userId},role,[event]):null;
}
module.exports={MAX_LEVEL,CASE_EXP,levelCost,experienceProgress,schemaSql,roleSchemaSql,ensureExperienceSchema,readExperience,readPolicy,awardActivity,revokeActivities,activityResult,awardConfirmation};
async function recordExperienceTransitions(db,{recordKey,before={},after={},user,role}){
 const events=[],confirmed=r=>Boolean(r.checkupConfirmedAt||r.visitedAt),approved=r=>Boolean(r.healthBookApprovedAt);
 if(!confirmed(before)&&confirmed(after))events.push(await awardActivity(db,{activity:'CONFIRM_CASE',entityKey:recordKey,workKey:recordKey,user,role}));
 if((canActivity(role,ACTIVITIES.find(a=>a.id==='CONFIRM_CASE'))||(role?.permissions||[]).includes('receiveEdit'))&&confirmed(before)&&!confirmed(after))events.push(...await revokeActivities(db,{workKey:recordKey,activities:['CONFIRM_CASE'],userId:user?.id,reason:'ยกเลิกการยืนยันเคส'}));
 const validApproval=Boolean(String(after.hn||'').trim()&&String(after.hisLastVisitUID||after.vn||'').trim()&&confirmed(after)&&Array.isArray(after.healthBookApprovedVisitUIDs)&&after.healthBookApprovedVisitUIDs.length);
 if(!approved(before)&&approved(after))events.push(await awardActivity(db,{activity:'APPROVE_CASE',entityKey:recordKey,workKey:recordKey,user,role,eligible:validApproval}));
 if(canActivity(role,ACTIVITIES.find(a=>a.id==='APPROVE_CASE'))&&approved(before)&&!approved(after))events.push(...await revokeActivities(db,{workKey:recordKey,activities:['APPROVE_CASE'],userId:user?.id,reason:'ยกเลิกการอนุมัติผล/เล่ม'}));
 return events.filter(Boolean);
}
module.exports.recordExperienceTransitions=recordExperienceTransitions;

async function seedExperienceWorkClaims(db){
 const exists=async name=>Boolean((await db.query('SELECT to_regclass($1) AS relation',[name])).rows[0]?.relation);
 if(await exists('company_customers'))for(const [activity,condition] of [['CONFIRM_CASE',"visited_at IS NOT NULL OR COALESCE(source_data->>'checkupConfirmedAt','')<>''"],['HIS_ORDER',"COALESCE(source_data->>'orderHisAt','')<>''"],['APPROVE_CASE',"COALESCE(source_data->>'healthBookApprovedAt','')<>''"]])await db.query(`INSERT INTO user_experience_work_claims(activity,entity_key) SELECT $1,legacy_record_key FROM company_customers WHERE COALESCE(legacy_record_key,'')<>'' AND (${condition}) ON CONFLICT(activity,entity_key) DO NOTHING`,[activity]);
 if(await exists('checkup_visits')&&await exists('checkup_bookings'))await db.query("INSERT INTO user_experience_work_claims(activity,entity_key) SELECT 'WORKLIST_CHECKIN',COALESCE(NULLIF(b.record_key,''),'booking:'||b.id) FROM checkup_visits v JOIN checkup_bookings b ON b.id=v.booking_id WHERE v.checkin_at IS NOT NULL ON CONFLICT(activity,entity_key) DO NOTHING");
 if(await exists('checkup_clinical_records')&&await exists('checkup_visits')&&await exists('checkup_bookings'))await db.query("INSERT INTO user_experience_work_claims(activity,entity_key) SELECT 'APPROVE_CASE',COALESCE(NULLIF(b.record_key,''),'visit:'||v.id) FROM checkup_clinical_records c JOIN checkup_visits v ON v.id=c.visit_id JOIN checkup_bookings b ON b.id=v.booking_id WHERE c.review_status='APPROVED' ON CONFLICT(activity,entity_key) DO NOTHING");
 if(await exists('app_state'))await db.query("INSERT INTO user_experience_work_claims(activity,entity_key) SELECT 'DOCTOR_HANDOFF',COALESCE(NULLIF(e->>'recordKey',''),e->>'id') FROM app_state a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.data->'emrQueue')='array' THEN a.data->'emrQueue' ELSE '[]'::jsonb END) e WHERE a.id=1 AND COALESCE(e->>'assignedUserId',e->>'sentAt','')<>'' AND COALESCE(NULLIF(e->>'recordKey',''),e->>'id','')<>'' ON CONFLICT(activity,entity_key) DO NOTHING");
 if(await exists('checkup_projects'))await db.query("INSERT INTO user_experience_work_claims(activity,entity_key) SELECT 'PROJECT_READY',id FROM checkup_projects WHERE status IN ('OPEN','IN_PROGRESS') AND COALESCE(company_id,'')<>'' AND COALESCE(project_name,'')<>'' AND COALESCE(default_package_code,'')<>'' AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date<=end_date ON CONFLICT(activity,entity_key) DO NOTHING");
}
module.exports.seedExperienceWorkClaims=seedExperienceWorkClaims;
