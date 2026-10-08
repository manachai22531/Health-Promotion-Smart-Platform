# v7.62.75 Production Installer npm stderr fix

## Root cause
Windows PowerShell 5.1 can surface native-process stderr as `NativeCommandError` while `$ErrorActionPreference = Stop`. `npm ci` writes benign `npm notice` and `npm warn` messages to stderr even when its process exit code is 0. The previous installer therefore stopped on `npm notice` although dependency installation had succeeded.

## Fix
- `npm ci --omit=dev` now runs through `System.Diagnostics.Process` / `cmd.exe`.
- stdout and stderr are captured as plain text.
- `npm notice` / `npm warn` are logged as informational diagnostics.
- install failure is determined only by npm process `ExitCode != 0`.
- all PowerShell files remain UTF-8 with BOM for Windows PowerShell 5.1 compatibility.
- Production-only target remains `D:\HealthCheck\Production`, port `3000`, database `health_check_smart_search`.

No database migration was added for this installer-only hotfix.
