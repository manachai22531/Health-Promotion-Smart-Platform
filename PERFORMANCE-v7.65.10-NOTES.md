# Performance work in v7.65.10

The supplied 2026-11-03 export contains 277 server measurements spanning v7.65.08 and v7.65.09. The v7.65.09 subset contains 167 events. These are server timings, not browser rendering or end-to-end network timings.

Observed v7.65.09 baseline: customer search 24–519 ms (median 40 ms, n=13); Operations summary 235–641 ms (median 477 ms, n=43); state load 1,475 ms (n=1). Some initial document/profile reads waited about 514–521 ms for a pool connection. The export does not establish sustained CPU saturation or a required increase in pool size.

Changes:
- Operations reads a lightweight relational projection containing identity and EMR-presence flags instead of hydrating all application state, package metadata, users and large EMR payloads.
- Health schema/index initialization is shared between concurrent callers and retained after success for the process lifetime; a failure clears the promise so subsequent calls can retry.
- Avoid duplicate 30-second summary polling while the Operations screen already has its own poll; suspend these polls in hidden tabs.
- Existing-primary customer profiles skip unnecessary primary-choice queries. The all-package catalog is lazy loaded only when its tab opens.
- State response preparation now records two existing-format render spans, for compacting/serializing data and gzip. No patient values or SQL are added to diagnostics.

Validation: release tests cover shared schema initialization, retry after failure, sanitized spans, user settings isolation and Booking/price guards. The real PostgreSQL temporary-table check covers all six sort fields/four directions, numeric ordering, NULLS LAST and six EMR-presence cases. Browser tests cover the updated flows.

No production speedup percentage is claimed. Repeat a comparable performance export on the hospital deployment to measure the effect. Session/QR expiry protection remains enabled; HTTP 401/410 in the original export were not disabled to improve reported results.
