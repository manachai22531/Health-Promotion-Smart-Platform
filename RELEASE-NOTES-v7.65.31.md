# v7.65.31 — HR Connect online login and backup workspace

- Require password login for online HR and employees. Invitation links alone cannot access employee data. Initial setup uses a separate six-digit verification code; HR invitations are single-use. Existing password accounts keep their passwords.
- Both roles can change their own password after confirming the current password. Other sessions are revoked. Hospital staff can reset HR passwords; HR can explicitly reset an employee password. A replacement employee link alone does not overwrite an existing password.
- Migration 0223 revokes old passwordless invitations and legacy sessions. Existing employee data and company/year grants remain. HR needs a new secure invitation if no password has been set. All migrations remain transactional.
- HR Excel follows the supplied customer-template-blank-2569.xlsx with all ten black columns removed (25 remain). Includes reference sheets, text identifiers and dropdowns. New personal fields are preserved in imports and exports. Hospital export continues to fill company/year for the existing importer.
- Replace template preparation with HR Connect backup: list, import, edit, distribute clean employee forms, and return Excel/HTML. Offline HTML remains file-based without online login or file encryption, as requested. Download beforehand for server outages; no automatic sync or email delivery.
- Retain v7.65.30 installer fixes: no VBS payloads; readable mandatory backup before stopping Production; optional Windows restart after verified success and explicit confirmation only.

Validation: TypeScript build; release test suite; real temporary PostgreSQL/browser HR workflow and password revocation; browser backup import/export and clean employee distribution; PowerShell parser/installer regressions; package migration and manifest checks. Windows installation/UAC, external HTTPS routing and Defender scanning cannot be reproduced in this Linux workspace.
