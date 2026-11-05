# Navigation sheet and DataCenter theme

The clinical mockup theme applies to the three DataCenter modules and the scoped DataCenter shell. Search, other staff pages and customer setup retain their original theme. Previously approved search field order and bulk company/year selection remain.

Customer detail now has Summary and Navigation tabs in its existing right-hand pane. The Navigation tab implements seven stations based on the supplied FM-CHU-004 Rev.01 form, including registration, assessment/history, lab, imaging, cardio, physician/report delivery and discharge/consult. Identity/company/year come from the saved customer membership. Clinical values are blank until staff enter them; order-related flags can be derived from administrator mapping rules and actual selected package items; this does not import measurements from HIS or send orders.

Staff with receiveCreate can save the navigation form. Viewing requires search and PDF generation requires summaryPrint. Data live in customer_navigation_sheets, keyed by company_customers.id with cascading cleanup, separate from customer profile/packages. Startup creates the table idempotently. Saves lock the membership, check current closure/retrospective policy, require the loaded revision and write a workflow audit record in the same transaction. Audit metadata records field names and revision, not clinical values. Stale revisions return 409; closed cases return 423. The existing retrospective grant is respected.

Each tab now owns a separate action group in the same header position. Summary shows Refresh / PDF Preview / Open Customer. Navigation replaces that group with Save Navigation / Reset to Auto / PDF Preview. The screen editor uses a responsive station-card workspace with quick station navigation, selected-order counts and unmapped-item details. The paper layout is reserved for PDF output. The lower navigation row contains status text only. PDF is generated from saved data on the server using the same seven-station renderer and a locally embedded Thai font. A dirty form warns before refresh, closing, changing customer or requesting a saved PDF. Customer links and summary actions remain unchanged; The footer Print Navigation action always prints the current saved navigation PDF through an off-screen frame, including when the Summary tab is selected; it does not open an application preview. Record-card Print Navigation uses the same direct-print service. Native browser/system print controls remain available.

Validation performed: build, release tests, template validation/escaping, isolated PostgreSQL HTTP save/reload/permissions/concurrency/locks/audit/cascade, Chromium tab/edit/save/refresh/PDF and customer isolation at Desktop/Tablet, and a real one-page A4 PDF. No production database or HIS calls were used, and physical printer/Windows installation was not tested. Packaged in v7.65.12; see the release changes and validation report.

## Station tabs and conditional fields (2026-11-05)
- Seven independent accessible station tabs retain the active tab and unsaved draft through editing/save. Patient header and redundant package/company fields removed from the editor.
- Register shows the persisted health-check format, certificate group with gated other-certificate details, and vaccine/other group.
- Assessment/LAB/X-ray/Cardio examiner and time share their own two-column group.
- LAB details show names/codes of matched orders, also included in saved PDF output without persisting derived names as manual text.
- Doctor fields have independent enable checkboxes; insurance measurements and Book report details follow their controlling selections. Disabled values remain recoverable in the draft but are excluded from PDF output.
- Report delivery/conditions come from the customer's company-year circular; a blank source is displayed explicitly.
- Order & Station mapping now supports a Consult target. Matching orders select Consult and expose their names; otherwise Send program is selected. Manual selections remain overrides, and the two options are mutually exclusive in the editor. Obsolete discharge/medication/vaccine fields are omitted while legacy data remains accepted.
- Existing A4 PDF endpoint and direct-print flow retained. Verified one-page A4 output, station interactions/save/isolation in Chromium, dependency/order-name rendering, and actual PostgreSQL company-year reporting/consult mapping. No new installer was built for this edit.

## v7.65.14 — Approved mockup integration
The subsequent HTML mockup revisions are now implemented: conditional extra tubes, certificate list from real Documents catalog, mutually exclusive wait/Book report choices with inline details, all real Consult locations with paired order/detail rows, and persistent Order & Station setup. See CONSULT-LOCATION-SETUP.md. This release includes the station tabs and previous pending station form changes.

## Editor left / A4 preview right (2026-11-05)
- Selecting Navigation replaces the left customer form visually with the station editor, preserving the original customer form DOM and draft. Summary restores the customer form.
- The right pane renders the existing printable navigation document as a read-only A4 preview, fitted to pane width and updated from the navigation draft (120ms debounce for text input).
- Preview uses the same template and computed fields as PDF generation; it does not request a server PDF on each edit. PDF preview/direct print continue using saved data.
- Switching customer, closing, failed loading and reset clear both frames; current record guards, dirty confirmation and revision handling remain intact.
- Browser checks cover left/right geometry, noneditable paper preview, live changes, summary restoration, save/reload, case isolation, mapping reset, mobile layout and direct-print behavior.

## Package origin in unmapped orders (2026-11-05)
- Package expansion now retains selected-source category, package code and current package name for each order.
- The unmapped-orders panel shows paired columns for order and source package, grouped in order: primary, billing, cash, contract.
- A package selected in multiple categories appears in each corresponding group. Existing matching and automatic selections remain unchanged.
- Missing package details remain explicit; older responses without source metadata retain the text-list fallback.
- Verified shared-package provenance, category order, escaping and browser desktop/mobile display; real PostgreSQL package expansion and existing mapping integration pass.

## v7.65.16 — Chrome-style tabs and package synchronization
- Persistent Chrome-shaped left tabs switch customer/package input and the seven-station navigation editor, with keyboard switching and draft preservation; right document tabs remain synchronized.
- Selecting/removing primary packages now reloads the left detail panel from current form choices. Initial legacy package-code fallback is supported. Existing request sequence guards discard late responses.
- Unmapped-order details include source package code/name, grouped primary → billing → cash → contract.
- Navigation PDF generation now has a bounded in-memory cache (2 minutes, up to 20 PDFs / 16 MiB). The key includes the full freshly read model, including customer identity, saved data, package mappings, reporting rules and certificate catalog. Changed content generates a new file; every HTTP request still enforces permissions and reads current data. Concurrent identical generation is coalesced; at most two distinct jobs run. First generation remains required.
- Browser tests verify actual package detail loading/removal and response races, left-tab keyboard navigation and retained drafts. Real Chromium generation confirms cached bytes equal original A4 PDF output.

## Unified footer save and navigation refresh (2026-11-05)
- Replaced the upper navigation Save button with a secondary Refresh action, retaining dirty-discard confirmation and read-only reload behavior.
- The footer Save data action validates a navigation save plan before writing, persists the patient/checkup and package settings through the existing flow, then awaits the navigation write before refreshing the summary and reporting success.
- Navigation-only edits save even when the checkup payload has no changes. The footer can save from either editor tab. No confirmation, Visit or HIS Order is triggered by this save.
- Navigation requests retain customer/revision/permission checks. Failures retain the navigation draft and are propagated to the existing partial-save/error feedback; no combined success is reported after a failed navigation write.
- An unchanged navigation model is reloaded after the patient save to refresh identity and derived package mappings. PDF preview and printing still use saved data.
- Verified actual footer interaction with patient and navigation request capture, both tabs, Refresh producing no writes, failed navigation revision retaining draft, automatic/manual mapping reset, case isolation and direct-print regressions. Included in v7.65.17.
