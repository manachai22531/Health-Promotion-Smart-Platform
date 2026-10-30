# PDF preview browser recovery (v7.64.87)

The A4 PDF route previously picked the first installed browser (often Edge on Windows) and returned raw Playwright launch logs to the user if that process exited.

Changes:
- Try configured HEALTHCHECK_PDF_BROWSER, an installed Playwright Chromium if present, then system Chrome and Edge. No automatic browser downloads during a patient request.
- Windows launches use explicit new headless mode. A failed launch or browser crash during rendering tries another installed executable within a 45-second operation budget. Each launch has a maximum 12-second timeout.
- Keep A4 template/fonts/QR/print settings and request permission checks unchanged. Close each opened browser and release the concurrent-render slot after success or failure.
- Return a concise Thai 503 and stable error code; diagnostic detail is logged only on the server. Missing browser and other PDF errors are separately reported.
- The existing Print A4 action prints the same HTML in the user's browser and can be used with Save as PDF while server-side preview is unavailable.

Validation: Windows candidate/headless options tested with mocks; launch and rendering-crash fallback, close, missing browser and safe error tests. Actual Chromium renderer test uses a deliberately dead first executable and verifies a valid A4 PDF from the fallback. This does not establish the cause of the reported Windows Edge crash or constitute a physical Windows test.

Included in installer v7.64.87.
