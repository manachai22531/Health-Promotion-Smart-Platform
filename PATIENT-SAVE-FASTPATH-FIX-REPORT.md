# v7.62.75 Patient Save Fast Path Fix

## Root cause
`persistRecordNow()` previously fell back to `persistStateNow()` whenever a debounced autosave (`saveTimer`) existed. That full-state PUT re-synchronized every customer row, so saving one patient could touch all customer/company_customer rows.

## Fix
- Single-patient save never calls `persistStateNow()` or `PUT /api/state`.
- Any not-yet-started full-state autosave timer is cancelled before the patient PATCH.
- The save always uses `PATCH /api/state/records/:recordKey`.
- Browser request timeout: 20 seconds using `AbortController`.
- Server transaction lock timeout: 5 seconds.
- Server statement timeout: 15 seconds.
- Lock/query timeout returns HTTP 503 with a retryable message instead of spinning forever.
- Missing record key now fails explicitly instead of falling back to a full-state write.

## Expected behavior
Saving one patient updates only that patient/customer membership plus the app_state revision marker. It must not update timestamps for every customer in the database.
