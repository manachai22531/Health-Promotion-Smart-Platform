'use strict';

const crypto = require('crypto');

const text = v => String(v == null ? '' : v).trim();
const clampPageSize = value => Math.min(100, Math.max(1, Number(value) || 50));
const clampPage = value => Math.max(1, Number(value) || 1);
const json = value => JSON.stringify(value == null ? {} : value);

async function ensureScalableSchema(db) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  const release = typeof client.release === 'function';
  try {
    await client.query('BEGIN');
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => null);

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS hn TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS passport_number TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS vn TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1`);
    await client.query(`CREATE INDEX IF NOT EXISTS customers_identification_normalized_idx ON customers ((regexp_replace(LOWER(BTRIM(COALESCE(identification_number,''))),'[^a-z0-9]','','g')))`);
    await client.query(`CREATE INDEX IF NOT EXISTS customers_passport_normalized_idx ON customers ((regexp_replace(LOWER(BTRIM(COALESCE(passport_number,''))),'[^a-z0-9]','','g')))`);
    await client.query(`ALTER TABLE company_customers ADD COLUMN IF NOT EXISTS screening_year TEXT NOT NULL DEFAULT ''`);
    await client.query(`ALTER TABLE company_customers ADD COLUMN IF NOT EXISTS booking_status TEXT NOT NULL DEFAULT ''`);

    await client.query(`CREATE TABLE IF NOT EXISTS emr_cases (
      id TEXT PRIMARY KEY,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      company_customer_id TEXT REFERENCES company_customers(id) ON DELETE SET NULL,
      booking_id TEXT REFERENCES checkup_bookings(id) ON DELETE SET NULL,
      visit_id TEXT REFERENCES checkup_visits(id) ON DELETE SET NULL,
      legacy_record_key TEXT NOT NULL DEFAULT '',
      hn TEXT NOT NULL DEFAULT '', vn TEXT NOT NULL DEFAULT '', visit_uid TEXT NOT NULL DEFAULT '',
      visit_date DATE, case_status TEXT NOT NULL DEFAULT 'RECEIVED',
      raw_his_response JSONB NOT NULL DEFAULT '{}'::jsonb,
      revision BIGINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(legacy_record_key, visit_uid)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS emr_result_groups (
      id BIGSERIAL PRIMARY KEY, emr_case_id TEXT NOT NULL REFERENCES emr_cases(id) ON DELETE CASCADE,
      group_code TEXT NOT NULL DEFAULT '', group_name TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
      revision BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(emr_case_id, group_code, group_name)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS emr_result_items (
      id BIGSERIAL PRIMARY KEY, emr_case_id TEXT NOT NULL REFERENCES emr_cases(id) ON DELETE CASCADE,
      group_id BIGINT NOT NULL REFERENCES emr_result_groups(id) ON DELETE CASCADE,
      visit_id TEXT NOT NULL DEFAULT '', group_code TEXT NOT NULL DEFAULT '', group_name TEXT NOT NULL DEFAULT '',
      item_code TEXT NOT NULL DEFAULT '', item_name TEXT NOT NULL DEFAULT '', result_value TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '', normal_range TEXT NOT NULL DEFAULT '', result_status TEXT NOT NULL DEFAULT '',
      interpret_text TEXT NOT NULL DEFAULT '', suggestion_text TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
      revision BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(emr_case_id, group_id, item_code, item_name)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS interpret_templates (
      id BIGSERIAL PRIMARY KEY, group_code TEXT NOT NULL DEFAULT '', item_code TEXT NOT NULL DEFAULT '', template_name TEXT NOT NULL,
      interpret_text TEXT NOT NULL DEFAULT '', suggestion_text TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
      revision BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(group_code,item_code,template_name)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS organization_book_drafts (
      id BIGSERIAL PRIMARY KEY, company_id TEXT NOT NULL DEFAULT '', screening_year TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '',
      draft_key TEXT NOT NULL DEFAULT 'default', draft_data JSONB NOT NULL DEFAULT '{}'::jsonb, cover_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      revision BIGINT NOT NULL DEFAULT 1, updated_by TEXT NOT NULL DEFAULT 'system',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id,screening_year,project_id,draft_key)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
      before_data JSONB NOT NULL DEFAULT '{}'::jsonb, after_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb, performed_by TEXT NOT NULL DEFAULT 'system',
      client_address TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS background_jobs (
      id BIGSERIAL PRIMARY KEY, job_type TEXT NOT NULL, job_key TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PENDING',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb, progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
      attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, last_error TEXT NOT NULL DEFAULT '',
      locked_at TIMESTAMPTZ, locked_by TEXT NOT NULL DEFAULT '', run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ
    )`);

    const indexes = [
      `CREATE INDEX IF NOT EXISTS customers_hn_idx ON customers(hn) WHERE hn<>''`,
      `CREATE INDEX IF NOT EXISTS customers_hn_lower_idx ON customers(LOWER(hn)) WHERE hn<>''`,
      `CREATE INDEX IF NOT EXISTS customers_vn_idx ON customers(vn) WHERE vn<>''`,
      `CREATE INDEX IF NOT EXISTS customers_vn_lower_idx ON customers(LOWER(vn)) WHERE vn<>''`,
      `CREATE INDEX IF NOT EXISTS customers_identification_idx ON customers(identification_number) WHERE identification_number<>''`,
      `CREATE INDEX IF NOT EXISTS customers_identification_lower_idx ON customers(LOWER(identification_number)) WHERE identification_number<>''`,
      `CREATE INDEX IF NOT EXISTS customers_passport_idx ON customers(passport_number) WHERE passport_number<>''`,
      `CREATE INDEX IF NOT EXISTS customers_passport_lower_idx ON customers(LOWER(passport_number)) WHERE passport_number<>''`,
      `CREATE INDEX IF NOT EXISTS customers_updated_at_idx ON customers(updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS company_customers_company_year_idx ON company_customers(company_year_id,screening_year)`,
      `CREATE INDEX IF NOT EXISTS company_customers_employee_lower_idx ON company_customers(LOWER(employee_code)) WHERE employee_code<>''`,
      `CREATE INDEX IF NOT EXISTS company_customers_updated_at_idx ON company_customers(updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS checkup_bookings_project_status_idx ON checkup_bookings(project_id,booking_status)`,
      `CREATE INDEX IF NOT EXISTS checkup_bookings_hn_idx ON checkup_bookings(hn) WHERE hn<>''`,
      `CREATE INDEX IF NOT EXISTS checkup_visits_date_status_idx ON checkup_visits(visit_date DESC,visit_status)`,
      `CREATE INDEX IF NOT EXISTS checkup_visits_vn_idx ON checkup_visits(vn) WHERE vn<>''`,
      `CREATE INDEX IF NOT EXISTS emr_cases_record_visit_idx ON emr_cases(legacy_record_key,visit_uid)`,
      `CREATE INDEX IF NOT EXISTS emr_cases_updated_at_idx ON emr_cases(updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS emr_items_group_item_idx ON emr_result_items(group_code,item_code)`,
      `CREATE INDEX IF NOT EXISTS emr_items_updated_at_idx ON emr_result_items(updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS background_jobs_status_run_idx ON background_jobs(status,run_after)`,
      `CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type,entity_id,created_at DESC)`
    ];
    for (const sql of indexes) await client.query(sql);
    // Trigram indexes are conditional so the application can still run on restricted PostgreSQL installations.
    const trgm = [
      `CREATE INDEX IF NOT EXISTS customers_first_name_trgm_idx ON customers USING gin (LOWER(first_name) gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS customers_last_name_trgm_idx ON customers USING gin (LOWER(last_name) gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS customers_full_name_trgm_idx ON customers USING gin ((LOWER(first_name||' '||last_name)) gin_trgm_ops)`
    ];
    for (const sql of trgm) await client.query(sql).catch(() => null);

    await client.query(`UPDATE customers SET
      hn=COALESCE(NULLIF(hn,''),source_data->>'hn',''),
      vn=COALESCE(NULLIF(vn,''),source_data->>'vn',source_data->>'hisLastVisitUID',''),
      passport_number=COALESCE(NULLIF(passport_number,''),CASE WHEN LOWER(COALESCE(source_data->>'identificationType','')) LIKE '%passport%' THEN source_data->>'id' ELSE '' END,'')
      WHERE hn='' OR vn='' OR passport_number=''`);
    await client.query(`UPDATE company_customers cc SET screening_year=COALESCE(NULLIF(cc.screening_year,''),cy.screening_year,'')
      FROM company_years cy WHERE cy.id=cc.company_year_id AND cc.screening_year=''`);
    await client.query(`INSERT INTO schema_migrations(version,description) VALUES('0110','Scalable relational customer + normalized EMR schema') ON CONFLICT(version) DO NOTHING`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally { if (release) client.release(); }
}

function flattenEmrGroups(payload) {
  const root = Array.isArray(payload) ? payload[0] : (payload || {});
  const lineItems = Array.isArray(root.LineItem) ? root.LineItem : Array.isArray(root.lineItem) ? root.lineItem : [];
  const groups = [];
  for (let gi=0; gi<lineItems.length; gi++) {
    const group = lineItems[gi] || {};
    const groupName = text(group.GroupName || group.groupName || group.Name || group.name || `Group ${gi+1}`);
    const groupCode = text(group.GroupCode || group.groupCode || group.Code || group.code || groupName);
    let rawItems = group.Items || group.items || group.Result || group.Results || group.result || group.results || [];
    if (!Array.isArray(rawItems)) rawItems = rawItems && typeof rawItems === 'object' ? Object.entries(rawItems).map(([k,v]) => ({ItemName:k,ResultValue:v})) : [];
    if (!rawItems.length && (group.ItemName || group.itemName || group.Value || group.value || group.ResultValue)) rawItems=[group];
    groups.push({groupCode,groupName,sortOrder:gi,items:rawItems.map((item,ii)=>({
      itemCode:text(item.ItemCode||item.itemCode||item.Code||item.code||item.ItemName||item.itemName),
      itemName:text(item.ItemName||item.itemName||item.Name||item.name||item.ItemCode||item.itemCode),
      resultValue:text(item.ResultValue??item.resultValue??item.Value??item.value??item.Result??item.result),
      unit:text(item.Unit||item.unit), normalRange:text(item.NormalRange||item.normalRange||item.ReferenceRange||item.referenceRange),
      resultStatus:text(item.ResultStatus||item.resultStatus||item.Status||item.status||item.Flag||item.flag),
      interpretText:text(item.InterpretText||item.interpretText||item.Interpretation||item.interpretation),
      suggestionText:text(item.SuggestionText||item.suggestionText||item.Suggestion||item.suggestion), sortOrder:ii
    }))});
  }
  return groups;
}

async function persistEmrPayload(db, {recordKey='', hn='', visitUid='', visitId='', bookingId='', visitDate=null, payload={}, rawPayload=null}={}) {
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const membership=(await client.query(`SELECT cc.id company_customer_id,c.id customer_id,c.hn,c.vn FROM company_customers cc JOIN customers c ON c.id=cc.customer_id WHERE cc.legacy_record_key=$1 LIMIT 1`,[recordKey])).rows[0]||{};
    const id=`emr_${crypto.createHash('sha256').update(`${recordKey}|${visitUid||visitId||hn}`).digest('hex').slice(0,24)}`;
    const result=await client.query(`INSERT INTO emr_cases(id,customer_id,company_customer_id,booking_id,visit_id,legacy_record_key,hn,vn,visit_uid,visit_date,raw_his_response,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,NOW()) ON CONFLICT(legacy_record_key,visit_uid) DO UPDATE SET
      customer_id=EXCLUDED.customer_id,company_customer_id=EXCLUDED.company_customer_id,booking_id=COALESCE(EXCLUDED.booking_id,emr_cases.booking_id),
      visit_id=COALESCE(EXCLUDED.visit_id,emr_cases.visit_id),hn=EXCLUDED.hn,vn=EXCLUDED.vn,visit_date=COALESCE(EXCLUDED.visit_date,emr_cases.visit_date),
      raw_his_response=EXCLUDED.raw_his_response,revision=emr_cases.revision+1,updated_at=NOW() RETURNING id`,[
      id,membership.customer_id||null,membership.company_customer_id||null,bookingId||null,visitId||null,recordKey,text(hn||membership.hn),text(visitUid||membership.vn),text(visitUid),visitDate||null,json(rawPayload==null?payload:rawPayload)
    ]);
    const caseId=result.rows[0].id;
    await client.query('DELETE FROM emr_result_groups WHERE emr_case_id=$1',[caseId]);
    const groups=flattenEmrGroups(payload);
    for(const group of groups){
      const g=await client.query(`INSERT INTO emr_result_groups(emr_case_id,group_code,group_name,sort_order) VALUES($1,$2,$3,$4) RETURNING id`,[caseId,group.groupCode,group.groupName,group.sortOrder]);
      for(const item of group.items) await client.query(`INSERT INTO emr_result_items(emr_case_id,group_id,visit_id,group_code,group_name,item_code,item_name,result_value,unit,normal_range,result_status,interpret_text,suggestion_text,sort_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[caseId,g.rows[0].id,text(visitId||visitUid),group.groupCode,group.groupName,item.itemCode,item.itemName,item.resultValue,item.unit,item.normalRange,item.resultStatus,item.interpretText,item.suggestionText,item.sortOrder]);
    }
    await client.query('COMMIT');
    return {caseId,groupCount:groups.length,itemCount:groups.reduce((n,g)=>n+g.items.length,0)};
  }catch(error){await client.query('ROLLBACK').catch(()=>null);throw error}finally{client.release()}
}

function recordFromRows(row){
  const legacy={...(row.source_data||{}),...(row.membership_data||{})};
  return {...legacy,
    key:text(legacy.key||legacy.id||row.record_key),companyId:text(row.company_year_id||legacy.companyId),
    hn:text(row.hn||legacy.hn),vn:text(row.vn||legacy.vn||legacy.hisLastVisitUID),hisLastVisitUID:text(row.vn||legacy.hisLastVisitUID||legacy.vn),
    id:text(row.identification_number||legacy.id),title:text(row.title||legacy.title),first:text(row.first_name||legacy.first),last:text(row.last_name||legacy.last),
    birth:text(row.birth_date||legacy.birth),sex:text(row.sex||legacy.sex),phone:text(row.phone||legacy.phone),email:text(row.email||legacy.email),
    employeeCode:text(row.employee_code||legacy.employeeCode),code:text(row.package_code||legacy.code),packageName:text(row.package_name||legacy.packageName),
    _relRevision:Number(row.customer_revision||row.revision||legacy._relRevision||1)
  };
}

function registerScalableApi(app,{pool,localOnly,readState,workflowActor=()=> 'system',clientAddress=()=>''}){
  app.get('/api/v2/ui-state',localOnly,async(_req,res)=>{try{
    const state=await readState(),thin={...state,records:[]};
    const companyRows=await pool.query(`SELECT cy.id,cy.screening_year,cy.note,cy.source_data,c.company_code,c.company_name
      FROM company_years cy JOIN companies c ON c.id=cy.company_id ORDER BY c.company_name,cy.screening_year DESC`);
    thin.companies=companyRows.rows.map(row=>({...row.source_data,id:row.id,code:row.company_code,name:row.company_name,year:row.screening_year,note:row.note}));
    delete thin.emrQueue; delete thin.organizationBookDrafts;
    res.set('Cache-Control','no-store');res.json(thin);
  }catch(e){res.status(500).json({error:'โหลด UI state แบบย่อไม่สำเร็จ',detail:e.message})}});

  app.post('/api/v2/customers/by-record-keys',localOnly,async(req,res)=>{try{
    const keys=[...new Set((Array.isArray(req.body?.recordKeys)?req.body.recordKeys:[]).map(text).filter(Boolean))].slice(0,2000);
    if(!keys.length)return res.json({items:[]});
    const result=await pool.query(`SELECT cc.legacy_record_key record_key,cc.company_year_id,cc.employee_code,cc.package_code,cc.package_name,cc.source_data membership_data,
      c.identification_number,c.title,c.first_name,c.last_name,c.birth_date,c.sex,c.phone,c.email,c.hn,c.vn,c.source_data,c.revision customer_revision
      FROM company_customers cc JOIN customers c ON c.id=cc.customer_id WHERE cc.legacy_record_key=ANY($1::text[])`,[keys]);
    res.set('Cache-Control','no-store');res.json({items:result.rows.map(recordFromRows)});
  }catch(e){res.status(500).json({error:'โหลดข้อมูลลูกค้าตามรายการไม่สำเร็จ',detail:e.message})}});

  app.get('/api/v2/company-customers',localOnly,async(req,res)=>{try{
    const page=clampPage(req.query.page),pageSize=clampPageSize(req.query.pageSize),off=(page-1)*pageSize,companyYearId=text(req.query.companyYearId),q=text(req.query.q);
    if(!companyYearId)return res.status(400).json({error:'companyYearId is required'});
    const params=[companyYearId,q,pageSize,off],where=`cc.company_year_id=$1 AND ($2='' OR c.hn ILIKE '%'||$2||'%' OR c.vn ILIKE '%'||$2||'%' OR c.identification_number ILIKE '%'||$2||'%' OR c.first_name ILIKE '%'||$2||'%' OR c.last_name ILIKE '%'||$2||'%' OR cc.employee_code ILIKE '%'||$2||'%' OR cc.package_code ILIKE '%'||$2||'%' OR cc.package_name ILIKE '%'||$2||'%')`;
    const result=await pool.query(`SELECT cc.legacy_record_key record_key,cc.company_year_id,cc.employee_code,cc.package_code,cc.package_name,cc.source_data membership_data,
      c.identification_number,c.title,c.first_name,c.last_name,c.birth_date,c.sex,c.phone,c.email,c.hn,c.vn,c.source_data,c.revision customer_revision
      FROM company_customers cc JOIN customers c ON c.id=cc.customer_id WHERE ${where} ORDER BY cc.updated_at DESC,c.first_name,c.last_name LIMIT $3 OFFSET $4`,params);
    const count=await pool.query(`SELECT COUNT(*)::int total FROM company_customers cc JOIN customers c ON c.id=cc.customer_id WHERE ${where}`,params.slice(0,2));
    res.set('Cache-Control','no-store');res.json({page,pageSize,total:count.rows[0].total,items:result.rows.map(recordFromRows)});
  }catch(e){res.status(500).json({error:'อ่านรายชื่อลูกค้าบริษัทไม่สำเร็จ',detail:e.message})}});

  app.get('/api/v2/bootstrap',localOnly,async(_req,res)=>{try{
    const state=await readState(),settings={...state};
    for(const key of ['records','companies','emrQueue','organizationBookDrafts']) delete settings[key];
    const counts=await pool.query(`SELECT (SELECT COUNT(*)::int FROM customers) customers,(SELECT COUNT(*)::int FROM companies) companies,(SELECT COUNT(*)::int FROM checkup_bookings) bookings,(SELECT COUNT(*)::int FROM emr_cases) emr_cases`);
    res.set('Cache-Control','no-store');res.json({revision:Number(state._revision||0),settings,counts:counts.rows[0],mode:'relational-primary'});
  }catch(e){res.status(500).json({error:'โหลด Bootstrap ไม่สำเร็จ',detail:e.message})}});

  app.get('/api/v2/companies',localOnly,async(req,res)=>{try{
    const page=clampPage(req.query.page),pageSize=clampPageSize(req.query.pageSize),q=text(req.query.q),off=(page-1)*pageSize,params=[q,pageSize,off];
    const result=await pool.query(`SELECT c.id,c.company_code,c.company_name,c.revision,c.updated_at,COUNT(cy.id)::int year_count
      FROM companies c LEFT JOIN company_years cy ON cy.company_id=c.id WHERE $1='' OR c.company_code ILIKE '%'||$1||'%' OR c.company_name ILIKE '%'||$1||'%'
      GROUP BY c.id ORDER BY c.company_name LIMIT $2 OFFSET $3`,params);
    const count=await pool.query(`SELECT COUNT(*)::int total FROM companies c WHERE $1='' OR c.company_code ILIKE '%'||$1||'%' OR c.company_name ILIKE '%'||$1||'%'`,[q]);
    res.json({page,pageSize,total:count.rows[0].total,items:result.rows});
  }catch(e){res.status(500).json({error:'อ่านรายชื่อบริษัทไม่สำเร็จ',detail:e.message})}});

  app.get('/api/v2/customers',localOnly,async(req,res)=>{try{
    const page=clampPage(req.query.page),pageSize=clampPageSize(req.query.pageSize),off=(page-1)*pageSize,q=text(req.query.q),companyId=text(req.query.companyId),year=text(req.query.year);
    const params=[q,companyId,year,pageSize,off];
    const where=`($1='' OR c.hn ILIKE '%'||$1||'%' OR c.vn ILIKE '%'||$1||'%' OR c.identification_number ILIKE '%'||$1||'%' OR c.passport_number ILIKE '%'||$1||'%' OR c.first_name ILIKE '%'||$1||'%' OR c.last_name ILIKE '%'||$1||'%' OR (c.first_name||' '||c.last_name) ILIKE '%'||$1||'%') AND ($2='' OR co.id=$2) AND ($3='' OR cy.screening_year=$3)`;
    const from=`FROM company_customers cc JOIN customers c ON c.id=cc.customer_id JOIN company_years cy ON cy.id=cc.company_year_id JOIN companies co ON co.id=cy.company_id`;
    const result=await pool.query(`SELECT cc.legacy_record_key record_key,c.id customer_id,c.hn,c.vn,c.identification_number id_passport,c.title,c.first_name,c.last_name,c.birth_date,c.sex,c.phone,c.email,c.revision,cc.employee_code,cc.package_code,cc.package_name,cc.screening_year,co.id company_id,co.company_name,cc.updated_at ${from} WHERE ${where} ORDER BY cc.updated_at DESC,c.first_name,c.last_name LIMIT $4 OFFSET $5`,params);
    const count=await pool.query(`SELECT COUNT(*)::int total ${from} WHERE ${where}`,params.slice(0,3));
    res.set('Cache-Control','no-store');res.json({page,pageSize,total:count.rows[0].total,items:result.rows});
  }catch(e){res.status(500).json({error:'ค้นหาลูกค้าไม่สำเร็จ',detail:e.message})}});

  app.get('/api/v2/customers/:recordKey',localOnly,async(req,res)=>{try{
    const result=await pool.query(`SELECT cc.legacy_record_key record_key,c.*,cc.id company_customer_id,cc.employee_code,cc.package_code,cc.package_name,cc.screening_year,cc.source_data membership_data,cy.company_id,co.company_name FROM company_customers cc JOIN customers c ON c.id=cc.customer_id JOIN company_years cy ON cy.id=cc.company_year_id JOIN companies co ON co.id=cy.company_id WHERE cc.legacy_record_key=$1 LIMIT 1`,[text(req.params.recordKey)]);
    if(!result.rows.length)return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'});
    const row=result.rows[0],legacy={...(row.source_data||{}),...(row.membership_data||{})};
    delete row.source_data;delete row.membership_data;res.set('Cache-Control','no-store');res.json({item:{...legacy,...row}});
  }catch(e){res.status(500).json({error:'อ่านรายละเอียดลูกค้าไม่สำเร็จ',detail:e.message})}});

  app.patch('/api/v2/customers/:recordKey',localOnly,async(req,res)=>{
    const client=await pool.connect();try{
      const recordKey=text(req.params.recordKey),expected=Number(req.body?.revision),changes=req.body?.changes;
      if(!Number.isInteger(expected)||expected<1)return res.status(428).json({error:'ต้องส่ง revision เพื่อป้องกันข้อมูลถูกบันทึกทับ'});
      if(!changes||typeof changes!=='object'||Array.isArray(changes))return res.status(400).json({error:'changes ไม่ถูกต้อง'});
      await client.query('BEGIN');
      const found=await client.query(`SELECT c.*,cc.id company_customer_id,cc.employee_code,cc.package_code,cc.package_name,cc.source_data membership_data FROM company_customers cc JOIN customers c ON c.id=cc.customer_id WHERE cc.legacy_record_key=$1 FOR UPDATE OF c,cc`,[recordKey]);
      if(!found.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'ไม่พบข้อมูลลูกค้า'})}
      const before=found.rows[0];if(Number(before.revision)!==expected){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลถูกแก้ไขจากผู้ใช้อื่น กรุณาโหลดใหม่',conflict:true,currentRevision:Number(before.revision)})}
      const map={hn:'hn',vn:'vn',id:'identification_number',idPassport:'identification_number',passportNumber:'passport_number',title:'title',first:'first_name',firstName:'first_name',last:'last_name',lastName:'last_name',birth:'birth_date',birthDate:'birth_date',sex:'sex',phone:'phone',email:'email'};
      const sets=[],values=[];for(const [key,column] of Object.entries(map)){if(Object.prototype.hasOwnProperty.call(changes,key)){values.push(text(changes[key]));sets.push(`${column}=$${values.length}`)}}
      const source={...(before.source_data||{}),...changes};values.push(json(source),before.id,expected);sets.push(`source_data=$${values.length-2}::jsonb`,`revision=revision+1`,`updated_at=NOW()`);
      const updated=await client.query(`UPDATE customers SET ${sets.join(',')} WHERE id=$${values.length-1} AND revision=$${values.length} RETURNING revision,updated_at`,values);
      if(!updated.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'ข้อมูลถูกแก้ไขจากผู้ใช้อื่น',conflict:true})}
      const msets=[],mvalues=[];for(const [key,column] of [['employeeCode','employee_code'],['code','package_code'],['packageCode','package_code'],['packageName','package_name']])if(Object.prototype.hasOwnProperty.call(changes,key)){mvalues.push(text(changes[key]));msets.push(`${column}=$${mvalues.length}`)}
      if(msets.length){mvalues.push(json({...before.membership_data,...changes}),before.company_customer_id);msets.push(`source_data=$${mvalues.length-1}::jsonb`,`revision=revision+1`,`updated_at=NOW()`);await client.query(`UPDATE company_customers SET ${msets.join(',')} WHERE id=$${mvalues.length}`,mvalues)}
      const changedFields=Object.keys(changes);await client.query(`INSERT INTO audit_logs(entity_type,entity_id,action,before_data,after_data,changed_fields,performed_by,client_address) VALUES('CUSTOMER',$1,'PATCH',$2::jsonb,$3::jsonb,$4::jsonb,$5,$6)`,[recordKey,json(before),json(changes),json(changedFields),workflowActor(req),clientAddress(req)]);
      await client.query('COMMIT');res.json({ok:true,recordKey,revision:Number(updated.rows[0].revision),updatedAt:updated.rows[0].updated_at,changedFields});
    }catch(e){await client.query('ROLLBACK').catch(()=>null);res.status(500).json({error:'บันทึกลูกค้าไม่สำเร็จ',detail:e.message})}finally{client.release()}
  });

  app.get('/api/v2/worklist',localOnly,async(req,res)=>{try{
    const page=clampPage(req.query.page),pageSize=clampPageSize(req.query.pageSize),off=(page-1)*pageSize,date=text(req.query.date)||new Date().toISOString().slice(0,10),q=text(req.query.q),companyId=text(req.query.companyId),status=text(req.query.status);
    const params=[date,q,companyId,status,pageSize,off],where=`v.visit_date=$1::date AND ($2='' OR b.hn ILIKE '%'||$2||'%' OR b.patient_name ILIKE '%'||$2||'%' OR b.employee_code ILIKE '%'||$2||'%' OR b.id_passport ILIKE '%'||$2||'%') AND ($3='' OR b.company_id=$3) AND ($4='' OR v.visit_status=$4)`;
    const from=`FROM checkup_visits v JOIN checkup_bookings b ON b.id=v.booking_id JOIN checkup_projects p ON p.id=b.project_id`;
    const result=await pool.query(`SELECT v.id visit_id,v.visit_date,v.checkin_at,v.vn,v.location,v.visit_status,v.result_status,b.id booking_id,b.record_key,b.hn,b.employee_code,b.patient_name,b.company_id,b.company_name,b.package_code,b.package_name,p.id project_id,p.project_code,p.project_name ${from} WHERE ${where} ORDER BY v.updated_at DESC LIMIT $5 OFFSET $6`,params);
    const count=await pool.query(`SELECT COUNT(*)::int total ${from} WHERE ${where}`,params.slice(0,4));res.json({page,pageSize,total:count.rows[0].total,items:result.rows});
  }catch(e){res.status(500).json({error:'อ่าน Worklist ไม่สำเร็จ',detail:e.message})}});

  app.get('/api/v2/emr-cases',localOnly,async(req,res)=>{try{
    const page=clampPage(req.query.page),pageSize=clampPageSize(req.query.pageSize),off=(page-1)*pageSize,recordKey=text(req.query.recordKey),q=text(req.query.q);
    const result=await pool.query(`SELECT id,legacy_record_key,hn,vn,visit_uid,visit_date,case_status,revision,created_at,updated_at FROM emr_cases WHERE ($1='' OR legacy_record_key=$1) AND ($2='' OR hn ILIKE '%'||$2||'%' OR vn ILIKE '%'||$2||'%' OR visit_uid ILIKE '%'||$2||'%') ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,[recordKey,q,pageSize,off]);
    const count=await pool.query(`SELECT COUNT(*)::int total FROM emr_cases WHERE ($1='' OR legacy_record_key=$1) AND ($2='' OR hn ILIKE '%'||$2||'%' OR vn ILIKE '%'||$2||'%' OR visit_uid ILIKE '%'||$2||'%')`,[recordKey,q]);res.json({page,pageSize,total:count.rows[0].total,items:result.rows});
  }catch(e){res.status(500).json({error:'อ่านรายการ EMR ไม่สำเร็จ',detail:e.message})}});

  app.get('/api/v2/emr-cases/:id',localOnly,async(req,res)=>{try{
    const c=(await pool.query(`SELECT id,legacy_record_key,hn,vn,visit_uid,visit_date,case_status,revision,created_at,updated_at FROM emr_cases WHERE id=$1`,[req.params.id])).rows[0];if(!c)return res.status(404).json({error:'ไม่พบ EMR case'});
    const groups=await pool.query(`SELECT g.id,g.group_code,g.group_name,g.sort_order,COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'itemCode',i.item_code,'itemName',i.item_name,'resultValue',i.result_value,'unit',i.unit,'normalRange',i.normal_range,'resultStatus',i.result_status,'interpretText',i.interpret_text,'suggestionText',i.suggestion_text,'updatedAt',i.updated_at) ORDER BY i.sort_order,i.id) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) items FROM emr_result_groups g LEFT JOIN emr_result_items i ON i.group_id=g.id WHERE g.emr_case_id=$1 GROUP BY g.id ORDER BY g.sort_order,g.id`,[req.params.id]);
    res.set('Cache-Control','no-store');res.json({item:{...c,groups:groups.rows}});
  }catch(e){res.status(500).json({error:'อ่านรายละเอียด EMR ไม่สำเร็จ',detail:e.message})}});
}

module.exports={ensureScalableSchema,registerScalableApi,persistEmrPayload,flattenEmrGroups};
