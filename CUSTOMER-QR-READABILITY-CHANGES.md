# Customer package QR readability — v7.64.87

- Enlarge only the customer package QR beside expense totals from 22 mm to 40 mm in the shared HTML/PDF/print template. Keep HN QR dimensions unchanged.
- Reserve a 44 mm white column; keep the QR and expense totals together across page breaks, with a clear scan caption.
- Generate opaque black-on-white PNG at integer scale 8, with a six-module quiet zone (formerly four). Retain error correction M to avoid unnecessary density.
- Keep the exact original customer access link, signed token, expiry, identity binding and access checks. No new public URLs or shorter security tokens.
- HTML image uses pixelated resampling to keep module edges sharp when preview is scaled.

Validation: unit checks of pixel colors/opacity, integer module dimensions and quiet zone. Independent jsQR decoder tested two link lengths against generated images, actual Chromium HTML image screenshots at 100% and 80%, and actual PDF rasterized at 150 dpi. Both decode to the exact link; sample totals/signature fit on one A4 page. This is a software test, not a physical camera/printer test.

Includes the PDF browser-recovery work already pending in this draft. Included in installer v7.64.87.
