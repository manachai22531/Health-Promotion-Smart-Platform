# Source integration 7.65.00

Development source: installer v7.64.99 (commit 0b872c351399ef8e6a9167f0100414ff61909bb2, ZIP SHA256 bb20fafcf2673182592762907a0358ef0ca908d9b7dd7cad5b8e13a7b632f357), itself derived from installers/v7.64.92 plus all later hotfixes. No application code was restored from main v7.64.00 over the newer installer source.

Integrates complete runtime source, not a ZIP-only merge. Preserves the existing Render runtime port/version-health-probe compatibility and render.yaml deployment configuration and historical release documents. Removes four v7.64.00-only obsolete module/test files superseded by the later annual circular implementation in the v7.64.99 installer. Old release-specific checks in the installer remain historical, with test:release selecting the current validated suite.

Runtime enhancements: approved collapsible search/Booking sidebar and editable accepted customer selections; see RELEASE-v7.65.00-CHANGES.txt and TEST-RESULTS-v7.65.00.txt. Current source must match the installer SOURCE-MANIFEST-SHA256.txt.

GitHub API PR creation was attempted but returned Forbidden from api.github.com/graphql in this environment. Source integration uses a reviewed local release branch and a normal merge commit into main, in accordance with the previously authorized 7.65.00 milestone; no force push or history rewrite.
