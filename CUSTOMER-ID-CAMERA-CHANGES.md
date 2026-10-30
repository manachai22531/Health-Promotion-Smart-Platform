Customer ID-card camera v7.64.87

The real customer page Read Thai ID button opens a rear-facing camera dialog. Capture reads the card front locally with pinned/bundled Tesseract.js 5.1.1, core 5.1.1 and eng/tha tessdata_fast. No image, recognized full text, or card-file data is uploaded or stored; canvas/review state and camera/worker resources are cleared on close/logout/visibility changes. The existing staff scanner implementation and endpoints are retained.

Review step permits correction, validates a 13-digit Thai ID checksum and a real birth date, converts Buddhist year when needed, and fills only the existing login inputs after explicit confirmation. It never logs in automatically or skips the server identity checks. Date extraction requires a birth-date label, avoids issue/expiry labels, and refuses ambiguous candidates.

Live camera requires browser secure context (HTTPS or localhost), with camera permission. JPG/PNG/WebP photo capture/selection fallback is available; file size <=10 MB and decoded size <=40MP. Engine load/init/recognition are bounded and can be cancelled by closing. Source files/licenses are recorded in assets/vendor/id-camera-ocr/SOURCES.txt. Setup iframe remains a disabled static preview.

Verified real bundled OCR end-to-end in Chromium using a fictional raster card: ID/DOB recognized, reviewed and filled; no external OCR/CDN requests, image uploads or auto-login. Fake camera device verifies rear/front switch, capture, stop-on-close/logout, state clearing, mobile dialog and denied permission fallback. Five parser tests cover checksum, Thai digits/months/BE year, invalid/ambiguous dates and multiple IDs. Physical Android/iPhone camera accuracy has not been tested.

Not packaged into a new installer yet.
