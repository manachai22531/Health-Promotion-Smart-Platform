# v7.65.30 Production

Add optional Windows reboot to the successful installer result. A success requires worker exit 0 plus Health Check SUCCESS and Complete SUCCESS records with no failed stage. Show Restart now / Later; request a second confirmation defaulting to No, and only then invoke shutdown.exe /r /t 0 without forced application closure. Never reboot on failure, during deployment, on window close, or from the unattended worker.

An actual v7.65.29 log identified Source backup read failure while Defender quarantined an obsolete INSTALL-REPAIR.vbs in the old Production directory. Probe source-file readability before stopping the app and include the exact filename in failures. Do not skip blocked files or bypass backup/security checks. Defender/IT remediation is still required before a blocked file can be backed up or is removed by the security product. No quarantine restore, exclusion, antivirus setting change or automatic legacy-file deletion is performed.

Includes all previous business features and the no-VBScript payload. The new package has no Defender clearance result from this environment.

Validation: executable PowerShell tests of success/consent/worker-running gates with inert restart mocks (no actual shutdown), backup readability rejection and complete backup creation; script/XAML parsing, build/release tests and final archive/manifest checks. Actual Windows restart/UAC and endpoint-security behaviour require target-side validation.
