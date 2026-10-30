# Personal notes and compact overview — v7.64.87

The search overview now displays an escaped read-only note summary. All note editors and save actions remain inside patient details, opened using the explicit Open Details button in the identity area. Saving a note or clearing it inside details immediately refreshes the overview summary. The existing scoped note endpoint, permissions, audit, conflict detection, Excel import/export and restart-safe relational persistence are unchanged.

When notes or selected contract packages are empty, their headings and short empty labels remain visible without reserved large boxes. Compact spacing and natural content height reduce unnecessary scrolling. Explicit per-cell colors preserve main-package yellow, billing blue and self-pay green across appearance themes. The previous two-column selected-contract list remains in the package panel, and remains single-column on mobile.

All earlier features through v7.64.76 are included. See TEST-RESULTS-v7.64.87.txt for real PostgreSQL/Chromium, upgrade, source backup and repair validation.
