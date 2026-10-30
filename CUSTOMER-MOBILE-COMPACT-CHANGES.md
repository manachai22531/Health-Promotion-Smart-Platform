Mobile customer layout v7.64.87

Removed the numbered identity introduction and its explanatory paragraph from actual customer app markup and standalone setup preview markup. Verification still requires the existing ID/name and birth-date flow; visible field labels and screen-reader verification label remain. Removed obsolete intro text inputs from marketing settings; their stored values remain compatible and are preserved when saving other settings.

Mobile header uses smaller logo/type and compact language buttons. Form input font stays 16px to avoid iOS focus zoom; input height 42px, primary form controls remain touchable. Tightened margins/panels/tabs while preserving package/calendar behavior. Preview applies the same mobile padding.

Verified Chromium preview 320/390/430 widths, EN text, settings save without missing controls, no overflow or browser errors. Header height measured at mobile preview: 278px -> 123px. Full running-server test verified mobile login and actual customer profile update, desktop/mobile previous flows, and no numbered header.

Included in installer v7.64.87.
