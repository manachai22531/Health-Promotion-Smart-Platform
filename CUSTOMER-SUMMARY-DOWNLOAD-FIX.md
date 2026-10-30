# Customer selection summary and download — v7.64.87

- Replace the single-line equation in the PNG footer with three aligned label/amount rows: primary package, additional examinations and grand total.
- Give the waiting-for-staff status and help text their own lines. Compute extra footer height and constrain each amount to its own column.
- Correct the card-top height used in overall canvas sizing to match its drawn position.
- Remove the download handler that forcibly reloaded the page after 300 ms. The existing native PNG download now keeps the page, dialog, selected items and in-memory customer session.
- Keep normal session expiry, server access checks and explicit logout unchanged.

Validation: actual Chromium at 390 px, authenticated against a temporary PostgreSQL database; six selected items with long names and note, primary 6,000 plus add-ons 37,230 = 43,230. Check drawn label/amount bounds and distinct status baselines; download completes with no page navigation, same customer token, visible customer panel and authenticated /me still returning 200. No physical phone test. Included in installer v7.64.87.
