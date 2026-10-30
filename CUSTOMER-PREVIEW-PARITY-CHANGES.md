Customer preview parity and device view v7.64.87

Preview now loads the real #customerPortalScreen template and production styles directly from app.html; uses shared summary markup and the same shop/services/profile-header/knowledge modules. Fictional in-memory services provide company/year options, health book groups and sample appointment choices without calling real customer APIs. Removed the simplified demo account and empty summary area.

Toolbar switches Desktop / Phone with real iframe viewport widths 320/390/430px; no CSS scaling. Desktop view remains available and hidden properly when Phone is selected. Fixture-only edit/cart/booking actions do not persist or send real requests.

Shared live/preview spacing: desktop panel inset 28px, mobile 16px, flex-safe full-width mobile context selector. Summary remains before service tabs on language rerender. Shared header/profile presentation preserves the real layout.

Verified: template/shared code, four summary sections/context and three service tabs, desktop >=24px inset and mobile16, all viewport widths/no overflow, cart/profile editor, book and appointment screens, no real API calls or browser errors. Full-server regression verifies shared summary in the actual patient UI.
Not packaged into a new installer yet.
