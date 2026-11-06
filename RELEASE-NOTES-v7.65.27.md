# v7.65.27 Production

Customer QR/link generation now uses the current server origin automatically, including protocol and port, shared with HR Connect. Trusted reverse-proxy HTTPS metadata is honored for server PDF requests. Browser QR/PDF requests pass their current origin explicitly. Localhost falls back to the server hostname or per-machine environment override. Persisted customer base_url values are no longer used to create links, so copied databases do not send users to an old server.

Remove the Customer / Public URL category, form and obsolete settings script from System & API. The legacy config GET reports automatic origin; writes return 410 without mutating the stored rollback-compatible value. Existing signing keys, grants, identity verification, expiry and clinical access gates remain unchanged.

Includes all v7.65.26 automatic HR direct links, Location preferences and previous installer fixes. Network reachability still follows the server: internal hostnames/IPs require network/VPN access and are not made public by link generation.

Validation: actual PostgreSQL customer QR generation on multiple server origins, stale stored URL ignored, PDF request origin, retired settings, signed identity/session checks; shared origin unit tests; actual System & API browser removal/regression checks; HR end-to-end regressions; build/release tests and installer manifest checks. Windows GUI, printers and organization network routes require target validation.
