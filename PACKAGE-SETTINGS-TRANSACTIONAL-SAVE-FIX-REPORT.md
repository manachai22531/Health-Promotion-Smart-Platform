# v7.62.75 Package Type + Station Transactional Save Fix

- Root cause fixed: Package Type previously wrote through `persistStateNow()` while Station used a separate endpoint. The two save paths could diverge and the UI could reload old values.
- New relational API: `PATCH /api/package-item-settings/batch`.
- Type + Station are now persisted in one PostgreSQL transaction.
- `package_item_station_assignments` now also stores `item_type`.
- No `PUT /api/state` is used for Package Type/Station save.
- Backend validates package item membership, active Station and permissions.
- Audit uses `PACKAGE_ITEM_SETTINGS`.
- Migration: `0160_package_item_settings.up.sql`.
- After save, package detail is re-read from PostgreSQL and rendered again.
