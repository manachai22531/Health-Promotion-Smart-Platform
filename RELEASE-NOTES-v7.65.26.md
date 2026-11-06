# v7.65.26 Production

Simplify HR sharing: remove required Public URL setup from the normal company-year drawer. Derive links from the currently used server origin, including protocol/port, with a per-server environment override or machine hostname fallback when the operator uses localhost. No network exposure is changed automatically.

The normal HR flow creates a scoped direct-access link, then copies/shares it. Opening it exchanges the opaque token for an HttpOnly session without signup/password/login. The link lasts seven days, is reusable while valid, and limits the session to that exact company/year even for accounts with broader grants. Regeneration, grant revocation and expiry invalidate both links and existing direct sessions. Existing password accounts/invitations remain compatible. Migration 0222 adds the direct-link kind and scoped session metadata idempotently. Native sharing/mail drafts require the operator to complete sending; no automatic email transmission.

Includes all v7.65.25 HR workflows, Location visibility preferences and prior installer fixes. A link only works where its server is reachable; LAN/localhost cannot become internet-accessible merely by generating a URL.

Validation: isolated PostgreSQL scoped direct-link access, expiry, replay/reopen, replacement and session invalidation, legacy account regressions; actual browser direct-entry/import/employee-return/review/accept/export workflow; build and release tests; manifest and package verification. Windows GUI/UAC and actual organization network reachability require target validation.
