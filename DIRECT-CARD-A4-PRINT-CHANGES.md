# Print A4 directly from customer search card — v7.64.87

- Capture the card's Print A4 action before legacy card-click/edit handlers.
- Prepare the existing saved-data A4 summary off screen; suppress legacy summary/editor opening during this preparation, and restore the prior hidden summary and pending draft afterwards.
- Resolve package details, coverage names and QR using the existing functions, then use the same shared A4 HTML template and native iframe print action used by the editor.
- Do not open the customer editor, save records, confirm visits or send orders. Preserve summaryPrint permission and ID masking. A user without customerEdit can print if summaryPrint is granted.
- Guard repeated clicks and keep button/progress cleanup on success, cancel and rendering failure. Check that the user/permission still matches before printing.

Validation: actual temporary PostgreSQL fixture + Chromium, printer role with summaryPrint and no customerEdit. Check the native print call, correct saved patient/company/package, absence of any editor opening, unchanged record/draft and no record writes. Repeated print after cancel, error cleanup and the existing editor print are tested. Physical Windows printer dialog/printer not tested. Included in installer v7.64.87.
