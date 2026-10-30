Draft customer personal-profile save performance fix

Found: PUT /customer-api/me/profile used readState() -> full relational hydration, then writeState() -> syncStateToRelational for every company/customer/package. Audit happened after commit. Frontend also rerendered the whole customer shop and loaded contexts after a contact change.

Changed: authenticated scoped personal-profile transaction, bounded database lock/statement waits, indexed customer membership lookup, same lock order as full saver; update only this person's master and linked membership personal fields; preserve per-membership clinical/package/note fields and identity/visits. Audit and revisions/sync marker commit atomically. QR/confirmed/order-locked records cannot edit. Optional expectedProfile detects concurrent edits. No-op does not write a new revision/audit. Compact response preserves current catalogue/prices/cart and avoids store/context reload.

Client save has a 15-second deadline. Ambiguous network/conflict failures require lightweight read-back before another PUT; lost-response save confirmation never blindly retries. User can keep typed values and reconcile latest server state.

Measured in isolated PostgreSQL with 20,001 customers / 20,002 memberships: 21ms for a contact update, without changing unrelated row revisions. This is a local test result, not a production latency guarantee. Tested: no-op, stale expected values, QR/expired session, confirmed lock, audit-failure rollback, 3-second lock timeout, clearing shared person contact data, compact and legacy snapshot/revision synchronization.

Full-server Chromium regression verifies actual contact save/persistence/cancel/Escape/context/logout, previous appointment/calendar and note/card/theme workflows. Focused UI verifies package state preservation, no full rerender, conflict check preserving input, timeout read-back without duplicate PUT and logout clearing.

Included in installer v7.64.87; deployment still requires running the installer.
