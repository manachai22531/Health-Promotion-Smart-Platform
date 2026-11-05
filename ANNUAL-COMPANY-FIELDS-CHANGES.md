# Annual company fields — 2026-11-05

The annual-company form accepts a four-digit screening year only, retaining the existing 2000–2700 range and default Buddhist calendar year. It uses a numeric keyboard hint and rejects letters/exponents, decimals, full dates and incomplete years. Create, section-00 save and PDF/save flows validate before saving. Server annual-year, full-save/PDF and full-state entry points reject invalid new/changed years. Unrelated existing legacy year values are preserved during other edits.

Company Thai/English names and year now use fixed-height caption rows, with the required asterisk inline. Payor Code, Payor Plan and Tax ID align with their corresponding left-hand inputs at the existing uniform control height.

Topic 09 Reporting has independent multi-select choices: SELF (รับเอง), COMPANY (ส่ง Company), EMAIL (Email), POSTAL (ไปรษณีย์ — ยืนยันที่อยู่จัดส่ง). They persist as reportDelivery in the existing circular JSON, separately from reportConditions/reporting text. Section save, full save, loading and PDF generation preserve the choices. The annual PDF prints selected channels beside the original reporting conditions. No choice is assumed for old circulars, and existing reporting text is unchanged. No database migration is needed.

Validation covers numeric-year edge cases and unchanged legacy rows, normalization/round-trip of selected channels, actual PDF text output, Desktop input baseline/height equality, invalid-year save blocking, reporting-section save/reload and Tablet accessibility. No installer/version was created for these pending changes; the prior pending API log feature remains included in the working tree.
