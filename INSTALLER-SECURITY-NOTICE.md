# Installer security review note — v7.65.29

## Reported detection

Windows Defender reported `Trojan:Script/Wacatac.H!ml` for `INSTALL-REPAIR.vbs` in the v7.65.28 ZIP and the extracted copy. The reported archive URL matches the published installer branch. The copy downloaded back from Git has SHA256:

`caff2dbf0fcc8f16ec0dfb4c7b725c5eed46089a0f323915f709746779401efa`

The archived `INSTALL-REPAIR.vbs` matches the repository file reviewed here, with SHA256:

`521f2191a92412c8fc05df7bcefe9b93f559941bec347996acf0b6bc27fd4e70`

This establishes consistency with the published source, NOT a malware-free result or a false-positive determination. The reviewed VBScript entry points forwarded execution to local PowerShell scripts, including elevation/hidden-window wrappers. No antivirus engine or Microsoft Defender is available in the cloud execution environment to classify the package. There is no claim of Microsoft clearance, antivirus clearance or Authenticode signing.

## Changes in this release

- Remove all four VBScript files from the new source/payload: INSTALL-REPAIR.vbs, REPAIR-UPDATE-CENTER.vbs, tools/start-production-installer.vbs and tools/launch.vbs.
- INSTALL-REPAIR.bat starts an ordinary readable PowerShell bootstrap, which requests UAC if needed and opens the installer as a visible process. No encoded command or hidden VBScript wrapper is used.
- Desktop/start-after-install targets the existing PowerShell run.ps1 directly. Windows scheduled startup continues to run Node directly.
- REPAIR-UPDATE-CENTER.bat replaces the old optional VBScript repair entry; repair payload SHA256 remains verified.
- Preserve every mandatory payload SHA256 check, source/database backup and health/version check. No integrity check is bypassed to avoid reading a blocked file.
- No Defender service, real-time protection, AMSI, antivirus exclusion, quarantine or Windows policy is changed. The installer retains its existing process-scoped PowerShell execution-policy argument; this does not disable Defender/AMSI or override organization Group Policy.
- Package builds fail if a .vbs file is present in the payload. This only verifies packaging contents; it does not predict an antivirus verdict.

## Before using a package flagged by security software

Keep the detected v7.65.28 files quarantined. Do not restore/allow them, disable protection, add exclusions or remove Mark-of-the-Web to make them run. Have the organization's security team review the affected files and submit a sample to Microsoft if it is believed to be an incorrect detection:

https://www.microsoft.com/en-us/wdsi/filesubmission

The new v7.65.29 artifact has NOT been scanned by Defender in this environment. Extract a new package into a new folder, keep endpoint protection enabled, and follow the organization's normal scan/review process. If protection blocks it, stop and preserve the threat name, affected filename and log for IT/Microsoft review; do not force execution. Existing quarantined files are not restored or altered by this release.
