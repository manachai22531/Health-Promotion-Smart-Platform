v7.64.87: personal EXP panel

- Latest active awarded work appears as a medal card beside the user identity. This represents an existing earned EXP activity; no new reward rules or rank comparisons are introduced.
- Today section groups active awarded activities by type with counts and EXP, using Asia/Bangkok day boundaries. Empty accounts show a compact empty state.
- Own EXP history expands inside the panel, showing latest 100 awards/revocations with signed amounts and Bangkok date/time. No patient identifiers are rendered.
- Existing authenticated own-user history endpoint supplies activity names. Latest/today data use the same scoped experience ledger and exclude revoked awards.
- User changes/logout reset history and invalidate pending responses; no schema migration.

Verified using real PostgreSQL isolated fixtures: user isolation, latest active award, revoked and previous-day exclusions, totals, grouped today summary and empty accounts. Chromium checks: medal/history expansion and signed revoked amounts, logout cleanup, responsive 1360/1100/780/390 and short screens, popover toggle/Escape/outside/focus restoration and Appearance mutual exclusion; no browser errors.
Included in the v7.64.87 installer.
