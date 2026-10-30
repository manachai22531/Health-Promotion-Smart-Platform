Draft: automatic customer appointment type

Customer selects project and optional date only; the redundant slot type selector is removed. Project billing_type Mobile maps to OUTREACH for the active company/year; Inhouse maps to shared HOSPITAL slots. The backend enforces this mapping for both listing and booking/rescheduling, rejecting mismatched client filters or slot IDs. Unconfigured legacy project types return a clear message to contact staff rather than guessing. No migration or slot changes.

Verified: isolated PostgreSQL/API listing, valid bookings, wrong type and company denial, reschedule rollback/preserved slot, unknown type error; Chromium project changes/date filtering/no type parameter and no browser errors.
