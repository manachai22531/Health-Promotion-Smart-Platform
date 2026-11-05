# Consult Location & Order

Open Order & Station → Consult Location & Order. Locations come from the existing HIS Location master (his_location_settings); no example locations are installed. Enable locations, set display order and attach one or more Order codes. The trial checks the unsaved mapping before saving. Master locations not explicitly configured remain visible when active, with no automatic selection.

The patient Navigation sheet shows every active enabled location next to its mapped orders and optional notes. Exact matching uses confirmed package items, includes billing/cash/selected packages, deduplicates orders and reevaluates when items change. Only matching rows are automatically selected. Manual selections and notes are saved per customer with optimistic revision checks; Reset automatic restores derived selections while retaining notes. This config selects navigation destinations; it does not send any HIS orders.

Setup uses orderView / orderItemManage permissions, a transaction/advisory lock/revision guard and a workflow audit. Stored under system_settings.consult_locations_v1; no new database table is needed. Patient edits retain receiveCreate permission, case lock and per-customer revision checks. Closed cases are read-only.

Certificate options come from active MEDICAL_CERTIFICATE entries on the existing Documents page. Other certificate details, extra tubes, insurance measurements and Book report details appear only when enabled. Wait result and Book report use mutually exclusive choices. The print/PDF endpoint retains the saved A4 navigation layout and prints selected consult rows with their actual order names, plus notes. Disabled fields do not appear as active answers in the PDF.
