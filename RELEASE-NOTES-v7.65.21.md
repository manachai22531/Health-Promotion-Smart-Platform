# v7.65.21 — manifest-driven deployment repair

The reported v7.65.20 installation stopped on a deployed VERSION.txt checksum mismatch after Robocopy. The failed recovery launch was secondary; core dependency/database installation had not started.

- Application deployment now copies every source-manifest file directly with .NET File.Copy(overwrite=true), independent of size, timestamp and Robocopy classification.
- Validate the entire source payload before writes. Preflight every destination and protected runtime file, then copy and verify each destination hash immediately, followed by full target verification.
- Keep existing .env, credentials, database configuration, node_modules, logs and backups; reject payload entries attempting to overwrite protected runtime paths.
- Log primary copy failures immediately and leave unverified code stopped. Do not launch a partially copied application as a recovery attempt.
- Launcher captures separate timestamped stdout/stderr logs, detects early process exit and avoids blocking message boxes/browser launch during unattended installation.
- Preserve source/database backups, downgrade protection and exact version/PostgreSQL health checks.
- Includes every v7.65.19 navigation/PDF and prior performance change.

Validation: PowerShell source/target regression with identical-size/time version files, corrupt source rejection before writes, configuration preservation, and missing/traversal/empty manifest rejection; PowerShell parsing; full payload byte-copy test; release suite and TypeScript build. Windows UAC, physical Robocopy and full installer remain untested here.
