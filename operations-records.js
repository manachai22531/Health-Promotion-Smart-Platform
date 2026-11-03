'use strict';
// The Operations list only needs identity and presence flags, not full EMR payloads,
// packages, roles or settings from readState(). Keep the same relational fallbacks.
const truthy=expression=>`(${expression} IS NOT NULL AND ${expression} NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb))`;
const sql=`SELECT cc.legacy_record_key AS key,
 COALESCE(NULLIF(c.hn,''),cc.source_data->>'hn','') AS hn,
 COALESCE(NULLIF(c.vn,''),cc.source_data->>'hisLastVisitUID','') AS "hisLastVisitUID",
 COALESCE(NULLIF(c.vn,''),cc.source_data->>'vn',cc.source_data->>'hisLastVisitUID','') AS vn,
 COALESCE(NULLIF(c.title,''),cc.source_data->>'title','') AS title,
 COALESCE(NULLIF(c.first_name,''),cc.source_data->>'first','') AS first,
 COALESCE(NULLIF(c.last_name,''),cc.source_data->>'last','') AS last,
 COALESCE(NULLIF(cc.package_code,''),cc.source_data->>'code','') AS code,
 COALESCE(NULLIF(cc.package_name,''),cc.source_data->>'packageName','') AS "packageName",
 cc.source_data->>'hisPatientLogStatus' AS "hisPatientLogStatus",
 (${truthy("cc.source_data->'hisLastResultAt'")} OR ${truthy("cc.source_data->'hisEmrResult'")} OR
 CASE jsonb_typeof(cc.source_data->'hisEmrResultsByVisit') WHEN 'object' THEN cc.source_data->'hisEmrResultsByVisit'<>'{}'::jsonb WHEN 'array' THEN cc.source_data->'hisEmrResultsByVisit'<>'[]'::jsonb WHEN 'string' THEN length(cc.source_data->>'hisEmrResultsByVisit')>0 ELSE false END) AS "hisLastResultAt"
 FROM company_customers cc JOIN customers c ON c.id=cc.customer_id ORDER BY cc.updated_at DESC,cc.id`;
async function load(pool){return (await pool.query(sql)).rows}
module.exports={load,sql};
