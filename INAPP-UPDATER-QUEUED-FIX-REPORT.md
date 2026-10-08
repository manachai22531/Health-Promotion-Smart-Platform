# v7.62.75 In-App Updater QUEUED Fix

- Fixed helper launch path so the server waits for a PRECHECK heartbeat instead of returning success immediately.
- Captures helper stdout/stderr to `updates/helper-launch-*.log`.
- Marks launch as FAILED when PowerShell cannot start or exits before PRECHECK.
- Adds a 3.5 second server-side launch handshake and 15 second stale QUEUED guard.
- Adds a 20 second UI guard so the screen cannot spin forever at QUEUED.
- Important upgrade note: systems already running v7.62.73/v7.62.74 with the broken updater must install this release once via `INSTALL-PRODUCTION.cmd`; subsequent in-app updates can use Update Center.
