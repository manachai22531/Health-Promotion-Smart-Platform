# v7.65.19

Includes all v7.65.18 functionality and package lookup performance changes.

- Navigation header shows Department from the customer's saved Location master; Room sits beside Department. Physician and allergies appear below.
- HN QR code embeds the literal HN, with a quiet zone and no external image requests; omitted when HN is absent.
- Company reporting delivery and conditions appear together above Station 1.
- Register certificate details, other notes and vaccine fields share aligned columns. Footer removes the word “อิง”.
- Assessment uses three matching groups in both editor and PDF: vital signs/allergies, vision/examiner/time, and medical history/lifestyle.
- All entered paper values have consistent underlines. Doctor certificate names use full-width rows.
- Station 7 has medication and vaccine boxes. Left form provides medication and vaccine choices; the doctor fee box is removed. Older stored fields remain accepted for compatibility.

Validation: release suite, TypeScript build, navigation browser suites, focused layout checks and actual A4 PDF generation. Windows GUI/UAC, live hospital HIS, and physical printer are not exercised in this environment.
