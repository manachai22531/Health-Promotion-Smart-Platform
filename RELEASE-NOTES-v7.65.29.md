# v7.65.29 Production

Replace chained VBScript installer/application entry points with a readable PowerShell/UAC bootstrap and direct PowerShell desktop startup. Remove all .vbs files from the distribution, add a normal batch entry for updater repair, and make package builds reject VBScript payloads. Preserve mandatory integrity checks, backups, migration validation and startup/readiness checks. Includes every v7.65.28 application feature and transaction fix.

This change follows a Defender Trojan:Script/Wacatac.H!ml quarantine report against v7.65.28 INSTALL-REPAIR.vbs. Source/archive hashes were compared, but this is not a false-positive determination. The new artifact is unsigned and has no Defender scan/clearance result from the cloud environment. Do not disable security protection, restore quarantined files or add exclusions. Follow IT review if any new artifact is blocked. See INSTALLER-SECURITY-NOTICE.md.

Validation: PowerShell launch-plan path quoting, missing-file rejection, safe working directory fallback, repair entry, script parsing, installer checks, build/release regressions, complete manifest copy and archive/hash verification. Windows UAC/GUI and actual Microsoft Defender verdict require target-side validation.
