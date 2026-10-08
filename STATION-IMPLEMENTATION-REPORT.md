# v7.62.75 Package Station Implementation

## Existing structure found
- Package master/detail is stored in `his_packages`.
- Package item rows are **not** a separate relational table; they are stored in `his_packages.detail_items` (JSONB).
- Existing Station feature existed as `app_state.orderStations` / `orderItemSettings` and the Order & Station UI, not as a relational Station Master table.
- Existing RBAC is permission-based (`roles[].permissions`) using camelCase keys.
- Existing generic relational audit table: `audit_logs`.

## Implemented
- New relational `station_master`.
- New `item_type_station_mapping` for configurable defaults.
- New `package_item_station_assignments` keyed by `package_id + item_key`, preserving package-specific overrides.
- Existing legacy `orderStations` are synchronized into `station_master` so the current Station setup is reused rather than discarded.
- Permissions: `packageStationView`, `packageStationEdit`.
- Read: `GET /api/stations?active=1` (one request, cached in the page session).
- Save: `PATCH /api/package-item-stations/batch` (one batch request for all edited rows).
- Compatibility endpoint: `PATCH /api/packages/:packageId/items/stations`.
- Backend validates login identity, permission, package item membership, Station existence and active state.
- Batch saves are transactional and write to existing `audit_logs`.
- Frontend dropdown changes only a local draft; no UPDATE is sent until the existing **บันทึกแพ็กเกจ** button is pressed.
- Dirty rows are highlighted and labeled `แก้ไขแล้ว`.
- Users without edit permission see plain Station text.
- Default mappings are seeded for LAB, Xray/X-Ray, BME, DoctorFee/Doctor and Vital signs, while manual per-item overrides remain possible.

## Migration
- `migrations/0140_package_station.up.sql`
- `migrations/0140_package_station.down.sql`
- Idempotent creation/index/seed statements.
- Production installer runs migration 0140 after existing 0110/0120 migrations.

## Backup locations
- Source backup: `D:\HealthCheck\Backups\PRODUCTION-source-before-v7.62.75-<timestamp>.zip`
- Database backup: `D:\HealthCheck\Production\backups\before-update-v7.62.75-<timestamp>.backup`
- `.env` backup: `D:\HealthCheck\Production\backups\.env-before-v7.62.75-<timestamp>.txt`

## Source files changed
- `payload/assets/app.js`
- `payload/assets/style.css`
- `payload/server.js`
- `payload/migrations/0140_package_station.up.sql`
- `payload/migrations/0140_package_station.down.sql`
- `payload/tools/install.ps1`
- version labels in Production installer/runtime scripts and README.

## Regression/static checks run
1. `packageStationEdit` role sees editable dropdown logic: PASS
2. Non-edit role renders plain text branch: PASS
3. Direct update API requires backend permission and returns 403 path: PASS
4. Single item can be included in batch: PASS (static/API validation path)
5. Multiple items use one batch request: PASS
6. Reload reads assignments from DB and annotates package detail: PASS (static path)
7. Inactive/nonexistent Station rejected by API: PASS
8. NULL/unassigned item supported: PASS
9. Existing A4 hide/show code preserved: PASS
10. Station master loaded once; no per-row Station request/query path: PASS
11. `node --check server.js`: PASS
12. `node --check assets/app.js`: PASS

Note: database integration/load testing requires running against the target PostgreSQL instance after backup; the package itself does not contain the Production database.
