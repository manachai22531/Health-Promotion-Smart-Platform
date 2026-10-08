# v7.62.75 Production Installer Port Owner Fix

## Problem
The Production upgrade stopped during Preflight when port 3000 was already used by the currently-running Health Check Production server. Older launchers can start Node with a relative `server.js` command line, so the previous path-only ownership check misclassified the existing Production process as an unrelated application.

## Fix
- Preflight now checks `http://127.0.0.1:3000/api/version` first.
- If the listener identifies itself as `environment=production`, the occupied port is accepted as the existing Production server.
- Unknown processes on port 3000 are still rejected.
- Deployment shutdown uses the same environment verification as a safe fallback so a relative `node server.js` process can be stopped before backup/deploy.
- Production-only target remains `D:\HealthCheck\Production`, port 3000, DB `health_check_smart_search`.

## Safety
The installer does not kill an arbitrary process merely because it uses port 3000. The fallback PID is stopped only when `/api/version` confirms the expected Health Check environment, or the original command-line path check proves it belongs to the Production root.
