# Selected Booking validation repair

Discovery can match checkup_bookings via HN/ID or another legacy membership record_key. The OpenVisit endpoint previously accepted only b.record_key = the current record, so an explicitly selected Booking could be visible but rejected as missing.

For an explicit selected Booking not linked to the exact current record_key, resolve it using the authoritative current customer/company-year row. Require project company/year scope, uncancelled Booking/project, and matching canonical customer, ID/passport or normalized HN without known identity/birth conflicts. Keep exact Booking payor/agreement/office constraints and all clinical/HIS guards. Never relink or rewrite the Booking merely to satisfy this validation.

The frontend now validates the actual selected Booking and its payor options rather than a global hasBooking flag. Missing/stale selections, missing payer configuration and another patient's loaded state have separate messages. A late lookup response cannot replace another patient's Booking state.

Validation: unit tests for identity, company/year, passport, cancellation SQL and actual frontend validator; PostgreSQL + actual OpenVisit endpoint regression where discovery returns a Booking with an old record_key while the original strict query returns no rows. Correct selected identity passes Booking/payor validation up to subsequent clinical/required-field guards. Wrong payer/identity, cancelled Booking, and different year remain rejected. No live HIS request was made. Full release suite and TypeScript build also checked.

Source draft only; runtime remains v7.64.87 until packaged. No installer or production database change made for this draft.
