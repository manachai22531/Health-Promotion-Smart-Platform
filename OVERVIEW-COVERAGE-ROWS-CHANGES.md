# Customer overview coverage rows

Remove Payor Office from the compact search-result customer overview. Keep Location in its own row. Payor and Agreement each have separate rows and display code - resolved name from the scoped master lookup. Existing copy controls retain visible code/name text. Missing master labels retain the code, and empty values use an em dash.

This is a presentation-only change. Stored Payor Office and its editor/OpenVisit/HIS behavior, PDF fields and QR remain unchanged. The overview avoids requesting Office labels it no longer displays.

Validation: JavaScript syntax; Chromium production overview renderer, scoped master-name resolver and actual copy decorator. Desktop/mobile row order, exact code/name values, missing-master fallback, empty Agreement, no Office label lookup, and unchanged stored Office verified.
