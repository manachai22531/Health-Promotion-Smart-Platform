# Draft v7.64.87 — identical front-card and editor A4 preparation

Problem: card printing serialized column widths while the original summary was hidden. Zero-sized DOM geometry produced invalid/equal column weights, wasting the row-number column and wrapping examination text. The editor also added primary-package prices through a separate preparation path.

Changes:
- Both saved print entry points use savedReportModel for compact summary preparation, primary-package prices, format band, and saved-data serialization.
- Report table widths use semantic column definitions from the shared template instead of DOM measurements. Clinical columns retain the existing editor proportions (7/15/46/13/19), and accepted billing/cash/contract rows use 5/75/20.
- Draft primary-package edits use the same clinical column definition.
- Card printing remains direct, retains summaryPrint permission and prior draft restoration, does not open the editor, and does not write customer records.
- No changes to QR signing, expiration, customer access, PDF browser selection, or database schema.
- app.html cache-busts the two changed scripts. Runtime version is v7.64.87.

Validation:
- npm run build: PASS.
- npm run test:release: 80 PASS (72 + 8), including three column-layout regressions.
- Actual PostgreSQL and Chromium integration: print-only role, 30 primary examination rows + 6 accepted add-ons, same saved report models, package prices and widths, same two-page A4 output. Rasterized PDF pages are pixel-identical after normalizing only the print timestamp.
- Direct print does not open the editor or write patient records; existing pending draft preserved; repeated print/cancel and forced rendering failure cleanup pass.
- Physical Windows print dialogs and physical printers were not exercised in this Linux test environment.

Included in the v7.64.87 production Windows installer.
