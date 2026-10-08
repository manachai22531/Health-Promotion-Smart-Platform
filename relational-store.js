'use strict';

const crypto = require('crypto');

const text = value => String(value == null ? '' : value).trim();
const json = value => JSON.stringify(value == null ? {} : value);
const stableId = (prefix, value) => {
  const source = text(value) || crypto.randomUUID();
  return `${prefix}_${crypto.createHash('sha256').update(source).digest('hex').slice(0, 24)}`;
};
const recordKey = record => text(record.key || record.customerId || record.id) || stableId('customer', json(record));
const canonicalIdentity = value => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');

async function preserveIncompatibleOrderTables(client) {
  const requirements = {
    order_types: ['id','type_name','sort_order'],
    order_stations: ['id','station_name','sort_order'],
    order_item_settings: ['order_key','order_type_id','hidden'],
    order_item_stations: ['order_key','station_id','sort_order']
  };
  const names = Object.keys(requirements);
  const result = await client.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=ANY($1::text[])`, [names]);
  const found = new Map();
  for (const row of result.rows) {
    if (!found.has(row.table_name)) found.set(row.table_name, new Set());
    found.get(row.table_name).add(row.column_name);
  }
  const incompatible = names.some(name => found.has(name) && requirements[name].some(column => !found.get(name).has(column)));
  if (!incompatible) return null;

  const legacySchema = `legacy_order_${Date.now().toString(36)}`;
  await client.query(`CREATE SCHEMA "${legacySchema}"`);
  for (const name of ['order_item_stations','order_item_settings','order_types','order_stations']) {
    if (found.has(name)) await client.query(`ALTER TABLE public."${name}" SET SCHEMA "${legacySchema}"`);
  }
  return legacySchema;
}

async function ensureRelationalSchema(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY, company_code TEXT NOT NULL DEFAULT '', company_name TEXT NOT NULL,
    source_data JSONB NOT NULL DEFAULT '{}'::jsonb, revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS companies_id_conflict_idx ON companies(id)');
  await client.query(`CREATE TABLE IF NOT EXISTS company_years (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    screening_year TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    source_data JSONB NOT NULL DEFAULT '{}'::jsonb, revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS company_years_id_conflict_idx ON company_years(id)');
  await client.query('CREATE INDEX IF NOT EXISTS company_years_lookup_idx ON company_years(company_id,screening_year)');
  await client.query(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, identification_number TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', birth_date TEXT NOT NULL DEFAULT '',
    sex TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    source_data JSONB NOT NULL DEFAULT '{}'::jsonb, revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS customers_id_conflict_idx ON customers(id)');
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS customers_identity_unique_idx
    ON customers(LOWER(identification_number)) WHERE identification_number <> ''`);
  await client.query(`CREATE INDEX IF NOT EXISTS customers_name_idx ON customers(LOWER(first_name), LOWER(last_name))`);
  await client.query(`CREATE TABLE IF NOT EXISTS company_customers (
    id TEXT PRIMARY KEY, company_year_id TEXT NOT NULL REFERENCES company_years(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    legacy_record_key TEXT NOT NULL DEFAULT '', employee_code TEXT NOT NULL DEFAULT '',
    package_code TEXT NOT NULL DEFAULT '', package_name TEXT NOT NULL DEFAULT '',
    visited_at TIMESTAMPTZ, source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    revision BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(company_year_id, customer_id)
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS company_customers_pair_conflict_idx ON company_customers(company_year_id,customer_id)');
  await client.query('CREATE INDEX IF NOT EXISTS company_customers_record_idx ON company_customers(legacy_record_key)');
  await client.query(`CREATE TABLE IF NOT EXISTS contract_packages (
    id TEXT PRIMARY KEY, package_code TEXT NOT NULL DEFAULT '', package_name TEXT NOT NULL DEFAULT '',
    price NUMERIC(14,2), usage_condition TEXT NOT NULL DEFAULT '', source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    revision BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS contract_packages_id_conflict_idx ON contract_packages(id)');
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS contract_packages_code_unique_idx
    ON contract_packages(LOWER(package_code)) WHERE package_code <> ''`);
  await client.query(`CREATE TABLE IF NOT EXISTS package_categories (
    id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS package_subcategories (
    id BIGSERIAL PRIMARY KEY, category_id BIGINT NOT NULL REFERENCES package_categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(category_id,name)
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS package_categories_code_conflict_idx ON package_categories(code)');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS package_subcategories_pair_conflict_idx ON package_subcategories(category_id,name)');
  const categorySeed={
    'LAB':['ตรวจเลือดทั่วไป','เบาหวาน / ไขมัน','ตรวจตับ / ไต','ตรวจมะเร็ง','ตรวจฮอร์โมน','ติดเชื้อ / ภูมิคุ้มกัน','ภูมิแพ้','วิตามิน / แร่ธาตุ','LAB อื่น ๆ'],
    'X-Ray & Imaging':['เอกซเรย์ / CT','เต้านม','กระดูก','Imaging อื่น ๆ'],
    'Ultrasound':['ช่องท้อง','หลอดเลือด','เต้านม','ไทรอยด์','อัลตราซาวด์อื่น ๆ'],
    'Cardio':['คลื่นไฟฟ้าหัวใจ','อัลตราซาวด์หัวใจ','สมรรถภาพหัวใจ','หลอดเลือด','Cardio อื่น ๆ'],
    'Vaccine':['วัคซีน','วัคซีนอื่น ๆ'],'Other':['อื่น ๆ']
  };
  const categoryLabels={'LAB':'LAB (ห้องปฏิบัติการ)','X-Ray & Imaging':'X-Ray & Imaging (เอกซเรย์และภาพรังสี)','Ultrasound':'Ultrasound (อัลตราซาวด์)','Cardio':'Cardio (หัวใจและหลอดเลือด)','Vaccine':'Vaccine (วัคซีน)','Other':'Other (อื่น ๆ)'};
  let categorySort=0;
  for(const [code,subs] of Object.entries(categorySeed)){
    const categoryResult=await client.query(`INSERT INTO package_categories(code,name,sort_order) VALUES($1,$2,$3)
      ON CONFLICT(code) DO NOTHING RETURNING id`,[code,categoryLabels[code]||code,categorySort++]);
    if(!categoryResult.rows.length){const existing=await client.query('SELECT id FROM package_categories WHERE code=$1',[code]);categoryResult.rows.push(existing.rows[0]);}
    const categoryId=categoryResult.rows[0].id;
    for(let subSort=0;subSort<subs.length;subSort++) await client.query(`INSERT INTO package_subcategories(category_id,name,sort_order)
      VALUES($1,$2,$3) ON CONFLICT(category_id,name) DO NOTHING`,[categoryId,subs[subSort],subSort]);
  }
  // Preserve categories/subcategories that already exist in package data.
  const legacyCategories=await client.query(`SELECT DISTINCT NULLIF(BTRIM(source_data->>'category'),'') category,
    NULLIF(BTRIM(source_data->>'subcategory'),'') subcategory FROM contract_packages
    WHERE NULLIF(BTRIM(source_data->>'category'),'') IS NOT NULL`);
  for(const row of legacyCategories.rows){
    const c=await client.query(`INSERT INTO package_categories(code,name,sort_order) VALUES($1,$1,999)
      ON CONFLICT(code) DO UPDATE SET name=package_categories.name RETURNING id`,[row.category]);
    if(row.subcategory) await client.query(`INSERT INTO package_subcategories(category_id,name,sort_order) VALUES($1,$2,999)
      ON CONFLICT(category_id,name) DO NOTHING`,[c.rows[0].id,row.subcategory]);
  }
  await client.query(`CREATE TABLE IF NOT EXISTS app_roles (
    id TEXT PRIMARY KEY, role_name TEXT NOT NULL, source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    revision BIGINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS app_roles_id_conflict_idx ON app_roles(id)');
  await client.query(`CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', display_name TEXT NOT NULL DEFAULT '',
    role_id TEXT, active BOOLEAN NOT NULL DEFAULT TRUE, source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    revision BIGINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS app_users_id_conflict_idx ON app_users(id)');
  const preservedSchema = await preserveIncompatibleOrderTables(client);
  if (preservedSchema) await client.query(`INSERT INTO system_settings(key,value,updated_at)
    VALUES('last_legacy_order_schema',$1,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[preservedSchema]);
  await client.query(`CREATE TABLE IF NOT EXISTS order_types (
    id TEXT PRIMARY KEY, type_name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS order_stations (
    id TEXT PRIMARY KEY, station_name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS order_item_settings (
    order_key TEXT PRIMARY KEY, order_type_id TEXT REFERENCES order_types(id) ON DELETE SET NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS order_item_stations (
    order_key TEXT NOT NULL REFERENCES order_item_settings(order_key) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES order_stations(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(order_key,station_id)
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_unique_idx
    ON app_users(LOWER(username)) WHERE username <> ''`);
  await client.query(`CREATE TABLE IF NOT EXISTS relational_sync_status (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1), app_state_revision BIGINT NOT NULL DEFAULT -1,
    synced_at TIMESTAMPTZ, company_count INTEGER NOT NULL DEFAULT 0,
    customer_count INTEGER NOT NULL DEFAULT 0, package_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT ''
  )`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS relational_sync_status_id_conflict_idx ON relational_sync_status(id)');
  await client.query('INSERT INTO relational_sync_status(id) VALUES(1) ON CONFLICT(id) DO NOTHING');
}

async function syncStateToRelational(client, state, stateRevision) {
  const companies = Array.isArray(state.companies) ? state.companies : [];
  const records = Array.isArray(state.records) ? state.records : [];
  const packages = Array.isArray(state.packages) ? state.packages : [];
  const roles = Array.isArray(state.roles) ? state.roles : [];
  const users = Array.isArray(state.users) ? state.users : [];
  const orderTypes = Array.isArray(state.orderTypes) ? state.orderTypes : [];
  const orderStations = Array.isArray(state.orderStations) ? state.orderStations : [];
  const orderSettings = state.orderItemSettings && typeof state.orderItemSettings === 'object' && !Array.isArray(state.orderItemSettings) ? state.orderItemSettings : {};
  const companyYearIds = new Set();
  const customerIds = new Set();
  const membershipIds = new Set();
  const customerIdentityCache = new Map();

  for (const item of companies) {
    const yearId = text(item.id) || stableId('company_year', `${item.code}|${item.name}|${item.year}`);
    const companyId = stableId('company', text(item.code) || text(item.name) || yearId);
    companyYearIds.add(yearId);
    await client.query(`INSERT INTO companies(id,company_code,company_name,source_data) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(id) DO UPDATE SET company_code=EXCLUDED.company_code,company_name=EXCLUDED.company_name,
      source_data=EXCLUDED.source_data,revision=companies.revision+1,updated_at=NOW()`,
      [companyId,text(item.code),text(item.name) || 'ไม่ระบุชื่อบริษัท',json(item)]);
    await client.query(`INSERT INTO company_years(id,company_id,screening_year,note,source_data) VALUES($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT(id) DO UPDATE SET company_id=EXCLUDED.company_id,screening_year=EXCLUDED.screening_year,
      note=EXCLUDED.note,source_data=EXCLUDED.source_data,revision=company_years.revision+1,updated_at=NOW()`,
      [yearId,companyId,text(item.year),text(item.note),json(item)]);
  }

  for (const item of records) {
    const legacyKey = recordKey(item);
    const rawIdentity = text(item.id || item.idPassport);
    const normalizedIdentity = canonicalIdentity(rawIdentity);
    const yearId = text(item.companyId);
    if (!companyYearIds.has(yearId)) continue;

    // Resolve identity before INSERT. app_state can still contain legacy records whose
    // customer ids were generated from differently formatted values (spaces/dashes/case).
    // Reuse the relational customer already owning the normalized identity so unrelated
    // settings saves cannot trip customers_identity_unique_idx.
    let customerId = '';
    let identityForStorage = rawIdentity;
    if (normalizedIdentity) {
      let resolved = customerIdentityCache.get(normalizedIdentity);
      if (!resolved) {
        const existing = await client.query(`SELECT id,identification_number FROM customers
          WHERE regexp_replace(LOWER(BTRIM(COALESCE(identification_number,''))),'[^a-z0-9]','','g')=$1
          ORDER BY updated_at DESC NULLS LAST,id LIMIT 1`, [normalizedIdentity]);
        resolved = existing.rows[0]
          ? { id:text(existing.rows[0].id), identity:text(existing.rows[0].identification_number) || rawIdentity }
          : { id:stableId('customer', normalizedIdentity), identity:normalizedIdentity };
        customerIdentityCache.set(normalizedIdentity, resolved);
      }
      customerId = resolved.id;
      identityForStorage = resolved.identity;
    } else {
      customerId = stableId('customer', legacyKey);
    }
    customerIds.add(customerId);

    await client.query(`INSERT INTO customers(id,identification_number,title,first_name,last_name,birth_date,sex,phone,email,source_data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(id) DO UPDATE SET
      identification_number=EXCLUDED.identification_number,title=EXCLUDED.title,first_name=EXCLUDED.first_name,
      last_name=EXCLUDED.last_name,birth_date=EXCLUDED.birth_date,sex=EXCLUDED.sex,phone=EXCLUDED.phone,
      email=EXCLUDED.email,source_data=EXCLUDED.source_data,revision=customers.revision+1,updated_at=NOW()`,
      [customerId,identityForStorage,text(item.title),text(item.first || item.firstName),text(item.last || item.lastName),
       text(item.birth || item.birthDate),text(item.sex),text(item.phone),text(item.email),json(item)]);

    // Preserve the actual membership id returned by PostgreSQL. Older rows may have a
    // legacy primary key even though the company/customer pair is already unique.
    const proposedMembershipId = stableId('membership', `${yearId}|${customerId}`);
    const membershipResult = await client.query(`INSERT INTO company_customers(id,company_year_id,customer_id,legacy_record_key,employee_code,
      package_code,package_name,visited_at,source_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT(company_year_id,customer_id) DO UPDATE SET legacy_record_key=EXCLUDED.legacy_record_key,
      employee_code=EXCLUDED.employee_code,
      package_code=EXCLUDED.package_code,package_name=EXCLUDED.package_name,visited_at=EXCLUDED.visited_at,
      source_data=EXCLUDED.source_data,revision=company_customers.revision+1,updated_at=NOW() RETURNING id`,
      [proposedMembershipId,yearId,customerId,legacyKey,text(item.employeeCode),text(item.code || item.packageCode),
       text(item.packageName),item.visitedAt || null,json(item)]);
    membershipIds.add(text(membershipResult.rows[0]?.id) || proposedMembershipId);
  }

  // Keep the normalized company/customer tables in sync with the complete
  // application state. Previously this routine only upserted rows, so a year
  // deleted in the UI remained in PostgreSQL and reappeared on the next load.
  await client.query('DELETE FROM company_customers WHERE NOT (id = ANY($1::text[]))', [[...membershipIds]]);
  await client.query('DELETE FROM company_years WHERE NOT (id = ANY($1::text[]))', [[...companyYearIds]]);
  await client.query('DELETE FROM customers c WHERE NOT EXISTS (SELECT 1 FROM company_customers cc WHERE cc.customer_id=c.id)');
  await client.query('DELETE FROM companies c WHERE NOT EXISTS (SELECT 1 FROM company_years cy WHERE cy.company_id=c.id)');

  for (const item of packages) {
    const id = text(item.code || item.packagecode)
      ? stableId('contract_package', text(item.code || item.packagecode).toLowerCase())
      : (text(item.id) || stableId('contract_package', json(item)));
    await client.query(`INSERT INTO contract_packages(id,package_code,package_name,price,usage_condition,source_data)
      VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO UPDATE SET package_code=EXCLUDED.package_code,
      package_name=EXCLUDED.package_name,price=EXCLUDED.price,usage_condition=EXCLUDED.usage_condition,
      source_data=EXCLUDED.source_data,revision=contract_packages.revision+1,updated_at=NOW()`,
      [id,text(item.code || item.packagecode),text(item.name || item.packagename),Number.isFinite(Number(item.price))?Number(item.price):null,
       text(item.usageCondition || state.packageUsageConditions),json(item)]);
  }
  for (const item of roles) {
    const id=text(item.id)||stableId('role',text(item.name)||json(item));
    await client.query(`INSERT INTO app_roles(id,role_name,source_data) VALUES($1,$2,$3::jsonb)
      ON CONFLICT(id) DO UPDATE SET role_name=EXCLUDED.role_name,source_data=EXCLUDED.source_data,
      revision=app_roles.revision+1,updated_at=NOW()`,[id,text(item.name)||id,json(item)]);
  }
  const mirroredUsernames=new Set();
  for (const item of users) {
    const username=text(item.username).trim(),usernameKey=username.toLowerCase();
    if(usernameKey&&mirroredUsernames.has(usernameKey)) continue;
    if(usernameKey) mirroredUsernames.add(usernameKey);
    const id=text(item.id)||stableId('user',username||json(item));
    const values=[id,username,text(item.displayName || item.name),text(item.roleId),item.active!==false,json(item)];
    // app_users is a relational mirror of app_state. Reconcile by normalized username first because legacy/state IDs can differ.
    // This keeps repeated HIS syncs idempotent and avoids app_users_username_unique_idx failures.
    if(username){
      const existingByUsername=await client.query(`SELECT id FROM app_users WHERE LOWER(BTRIM(username))=LOWER(BTRIM($1)) ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,[username]);
      const existingId=text(existingByUsername.rows[0]?.id);
      if(existingId){
        if(existingId!==id) await client.query('DELETE FROM app_users WHERE id=$1',[id]);
        await client.query(`UPDATE app_users SET username=$2,display_name=$3,role_id=$4,active=$5,source_data=$6::jsonb,revision=revision+1,updated_at=NOW() WHERE id=$1`,[existingId,...values.slice(1)]);
        continue;
      }
    }
    await client.query(`INSERT INTO app_users(id,username,display_name,role_id,active,source_data) VALUES($1,$2,$3,$4,$5,$6::jsonb)
      ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,
      role_id=EXCLUDED.role_id,active=EXCLUDED.active,source_data=EXCLUDED.source_data,
      revision=app_users.revision+1,updated_at=NOW()`, values);
  }

  await client.query('DELETE FROM order_item_stations');
  await client.query('DELETE FROM order_item_settings');
  await client.query('DELETE FROM order_types');
  await client.query('DELETE FROM order_stations');
  const typeIds=new Map(),stationIds=new Map();
  for(const [index,nameValue] of orderTypes.entries()){
    const name=text(nameValue),id=stableId('order_type',name.toLowerCase());if(!name)continue;typeIds.set(name,id);
    await client.query('INSERT INTO order_types(id,type_name,sort_order) VALUES($1,$2,$3)',[id,name,index]);
  }
  for(const [index,nameValue] of orderStations.entries()){
    const name=text(nameValue),id=stableId('order_station',name.toLowerCase());if(!name)continue;stationIds.set(name,id);
    await client.query('INSERT INTO order_stations(id,station_name,sort_order) VALUES($1,$2,$3)',[id,name,index]);
  }
  for(const [key,settingValue] of Object.entries(orderSettings)){
    const setting=settingValue&&typeof settingValue==='object'?settingValue:{},typeId=typeIds.get(text(setting.type))||null;
    await client.query('INSERT INTO order_item_settings(order_key,order_type_id,hidden) VALUES($1,$2,$3)',[text(key),typeId,Boolean(setting.hidden)]);
    const assigned=[...new Set(Array.isArray(setting.stations)?setting.stations.map(text).filter(Boolean):[])];
    for(const [index,stationName] of assigned.entries()){const stationId=stationIds.get(stationName);if(stationId)await client.query('INSERT INTO order_item_stations(order_key,station_id,sort_order) VALUES($1,$2,$3)',[text(key),stationId,index]);}
  }

  await client.query(`UPDATE relational_sync_status SET app_state_revision=$1,synced_at=NOW(),
    company_count=$2,customer_count=$3,package_count=$4,last_error='' WHERE id=1`,
    [stateRevision,companies.length,records.length,packages.length]);
}

module.exports = { ensureRelationalSchema, syncStateToRelational };
