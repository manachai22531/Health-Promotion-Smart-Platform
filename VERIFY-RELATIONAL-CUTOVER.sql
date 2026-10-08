SELECT version,description,applied_at
FROM schema_migrations
WHERE version IN ('0110','0120','0130')
ORDER BY version;

SELECT id,updated_at,revision,
       pg_size_pretty(pg_column_size(data)::bigint) AS app_state_size,
       (data ? 'records') AS stores_records,
       (data ? 'companies') AS stores_companies,
       (data ? 'packages') AS stores_packages
FROM app_state
WHERE id=1;

SELECT
  (SELECT COUNT(*) FROM customers) AS customers,
  (SELECT COUNT(*) FROM company_customers) AS company_customers,
  (SELECT COUNT(*) FROM companies) AS companies,
  (SELECT COUNT(*) FROM company_years) AS company_years,
  (SELECT COUNT(*) FROM contract_packages) AS contract_packages,
  (SELECT COUNT(*) FROM checkup_bookings) AS checkup_bookings,
  (SELECT COUNT(*) FROM checkup_visits) AS checkup_visits,
  (SELECT COUNT(*) FROM emr_cases) AS emr_cases;
