# Standalone customer display setup for marketing

Included in v7.64.87 production source, based on v7.64.73.

Corrected scope: standalone /customer-setup page in a separate window, not an
embedded System & API editor. Main application shortcut: Company page →
ตั้งค่าหน้าลูกค้า ↗. The standalone page supports its own login using existing
staff credentials and automatically reuses an existing session in the same browser.
It does not load app_state or patient data. It shares the existing role-specific
password expiry, forced first-login password change, idle timeout and cross-window
activity tracking via assets/auth-session.js.

Dedicated permission: customerPageManage, registered as a separate customer-page
permission in Role management. Default marketing role includes it. A transaction
at startup grants it once to the existing exact admin/marketing role IDs, records
the permission change in checkup_workflow_audit, and increments state revision.
A system_settings migration marker prevents regranting after later revocation.
No apiManage or other additional privileges are granted to marketing. API-only
roles do not get display-setting access unless separately assigned this permission.

GET/PUT /api/customer-display-settings require customerPageManage; public read-only
/customer-api/display-settings exposes only settings/revision. Settings are shared
across companies and persist under system_settings.customer_display_settings.
Validated bounded plain text, six-digit colors, safe HTTPS support links and strict
boolean/enumeration values. Row locking + expectedRevision reject stale saves.
Before/after changes and actor are audited in the same transaction.

Five categories: appearance/language, Thai copy, English copy, visibility, help/contact.
Preview contains a cleared static login card only, excludes the patient profile,
disables controls and uses a sandbox without scripts/forms. Mobile/Thai/English
preview modes are independent from persisted configuration. Defaults/reset stay
in the form until explicitly saved. Identity checks and customer session duration
remain controlled by existing authentication code.

Validation: TypeScript build and 31 release tests passed. Real disposable PostgreSQL
and Chromium checks passed for exact-role migration/idempotence/revocation, other
role preservation, marketing save without API rights, API-only/unauthorized denial,
standalone login/logout/forced password change/session-expiry hook, main-company
shortcut opening an authenticated new window, safe preview/public text, language
and preferences, save/reload/audit/conflict and draft-only reset. Existing Worklist,
EMR, file and security checks use the existing integration runner; its main-role
editor check collapses the optional EXP footer to avoid pointer interception.

Runner: /workspace/.health-platform/marketing-customer-setup-integration.cjs
Results: /workspace/.health-platform/marketing-customer-setup-results.txt
Node results: /workspace/.health-platform/marketing-customer-setup-release-results.txt
Unit tests: customer-display-settings.test.js

EMR today/review/print is implemented in v7.64.87 using emr-book-actions.js and assets/emr-book-actions.js.
Future release packaging must regenerate version/cache IDs and source manifests.


Draft v7.64.87: customer advertising
- Marketing customer setup has separate login and shop banner controls, default off. Supply public HTTPS image URL, optional HTTPS destination, and accessible description. No arbitrary HTML/script is accepted.
- Banners sit below the customer header and above page content; each follows the login/profile hidden state, including logout. Images fit desktop/mobile without cropping.
- Existing display-settings permissions, optimistic revision and audit persist these new model fields without a schema change.
- Login iframe and separate shop demo reflect unsaved settings. Preview catalogue is fictional and does not call customer APIs.
- Browser verification: independent placement, editing/save request, language, demo cart, search, categories, desktop/mobile, safe new-tab links, defaults and HTTPS validation. API saving was mocked for this focused UI check; not installed on Windows.
