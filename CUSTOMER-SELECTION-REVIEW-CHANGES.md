# Customer-submitted package review — v7.64.87

Implements the approved mockup in the actual application:
- Replace the always-expanded customer pending panel with an alert/count beside the package heading. Open a three-column billing/cash/contract dialog on demand.
- “ตรวจสอบและรับรายการ” opens a review table above the personal-note area in the existing editor. Support selecting a subset, current-price changes, unavailable items, customer note and received status.
- Explicitly save the reviewed extras through an authenticated scoped endpoint. Merge accepted items with already-saved extras; preserve previous items, primary packages, identity, contacts and unrelated company/year memberships. Do not issue HIS orders or re-confirm the visit.
- The save requires the dedicated customerSelectionApply permission. Read-only users may view. Missing permission, not-confirmed, historical lock and active Order/ChargeClose are clearly reported.
- Canonical prices and eligibility come from the server. Reject stale submissions/bindings, changed prices, unknown items, duplicate keys and conflicting existing prices. Repeating a completed identical review is a no-op.
- Coordinate with customer submission and HIS via the existing operation lease and clinical locks. Write membership extras, receipt, app revision and audit atomically. An audit failure rolls back the entire review.
- Refresh saved selections/A4 and show an accepted badge after success. An uncertain save requires explicit latest-data read-back before another attempt.
- General customer edits and confirmations preserve the pending customer request. Only this explicit review clears it.

Validation: unit review/version/merge cases and actual PostgreSQL/Chromium tests using a customer-service role with neither customerEdit nor receiveEdit permission, six submitted items, subset support, price/stale/unknown-item/auth rejection, clinical locks, idempotence, audit rollback, no customer identity or unrelated membership writes, modal→review→save→A4→receipt after reload.

No new database schema; uses existing JSONB, audit and guard tables.
