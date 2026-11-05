# v7.65.18

- Package detail lookup selects only order item settings instead of hydrating all customers, companies and packages.
- Legacy station compatibility sync shares concurrent work and skips repeat runs for 30 seconds after success. Failures remain retryable. Live station assignment and item type queries still execute for each package request.
- Navigation preview/PDF moves checkup format into Register and removes obsolete Package/contract/insurance selection boxes. Other certificate/details and vaccine/other fields use dedicated rows.
- Doctor certificate output uses a full-width label/value row with one selected certificate per line. Purpose and Book report details also use full-width rows.
- Includes previous Chrome-style left workspace tabs, combined footer save for summary/navigation, preview refresh, package origin grouping, reporting delivery display and DataCenter filters.

Validation: release suite, TypeScript build, navigation browser suites, focused sync tests and actual A4 PDF generation. Production timing still requires measurement on the hospital server; Windows GUI/UAC, HIS and physical printer were not exercised here.
