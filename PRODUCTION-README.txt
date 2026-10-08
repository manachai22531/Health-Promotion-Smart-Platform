HEALTH CHECK UP SMART SEARCH - PRODUCTION ONLY
Version v7.63.96

Runtime lock:
- Environment: production only
- Install folder: D:\HealthCheck\Production
- Port: 3000 only
- PostgreSQL database: health_check_smart_search only
- /api/version always reports environment=production and productionOnly=true
- Server refuses to start when APP_ENV, PORT or PGDATABASE points to another environment
- Update Center rejects packages that do not include the Production-only runtime lock
- HIS/API settings reject URLs containing non-production environment markers
- GetPackageList has no bundled fallback URL; configure the correct Production endpoint explicitly in System & API

This package contains no alternate-environment installer, bootstrap, icon, reset script, or environment-selection mode.
