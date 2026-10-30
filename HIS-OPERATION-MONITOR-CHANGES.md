# HIS operation monitor (v7.64.87)

Adds a shared authenticated status dialog for OpenVisit, OrderHIS, CancelOrder,
CancelVisit and ChargeClose. It displays persistent operation ID, status, stage,
server elapsed time and the latest ten attempts. Slow requests open the dialog;
OpenVisit errors open it instead of a blocking browser alert. The case status
strip also has a "สถานะคำสั่ง HIS" button. A pending VisitStatusHIS button opens
this monitor. Closing it does not cancel or resubmit a request.

Status checks poll at ten-second intervals while the dialog is open and a command
is pending. A safely failed command offers return to confirmation (OpenVisit) or
the existing case editor (other commands); it never replays a saved payload.
Normal permissions, booking validation and duplicate guards still run on every
new submission. An existing VN suppresses the OpenVisit retry action.

OpenVisit recovery accepts only the VN in a positively acknowledged response
stored for that exact operation, then verifies the HN and explicit Location in a
fresh GET_VISIT response. Wrong patient, missing/wrong location, cancelled/closed
visit, missing VN or an unacknowledged response never triggers linking or retry.
The original validated booking is retained and updated idempotently; a changed
booking identity or conflicting VN blocks recovery. No HN/date-only matching.
If the response was lost entirely and there is no trustworthy operation-to-VN
correlation, the command stays unresolved. HIS must provide such correlation or
idempotency support before automatic replay can be added safely.

A stale PREPARED command can be revoked after five minutes if not locally active.
Revocation uses operation ID and stage compare-and-set. The existing transport
also checks the same token before dispatch, preventing a delayed request from
sending after revocation. DISPATCHED/UNKNOWN commands do not become retryable
because of age, a timeout, or a missing visit search result.

The new support action records a review request and reference in the case audit;
it explicitly tells staff to give that reference to an administrator. It does not
send an external message or promise an administrator notification. Existing HIS
status/ChargeClose reconciliation is preserved. The new monitor provides status
visibility for the other commands; it does not infer order acceptance, financial
completion or cancellation success from unrelated Visit status.

Schema is additive: his_operation_attempts with case/time index. It persists the
selected booking reference plus status history. Raw HIS request/response and
patient identification are not returned by monitor endpoints. Existing guard
rows from older versions remain visible even without history rows.

Validation:
- npm run build: passed.
- npm run test:release: 102 tests passed, zero failures.
- 17 existing clinical status/reader tests passed.
- Real PostgreSQL plus full application and local mocked HIS: duplicate blocked,
  exact acknowledged VN recovery, wrong HN remains unresolved, booking/visit not
  duplicated, stale unsent release, existing-VN retry suppression, dispatched
  unknown remains blocked, support audit, unauthenticated request rejected.
- Authenticated Chromium application: monitor asset loads, real endpoint status
  displays, unknown has no retry, mobile no horizontal overflow, no page errors.
- Isolated Chromium: confirmation path, close/reopen, support reference and mobile.

No live hospital HIS was contacted. The Windows installer has been packaged separately; the running hospital
application has not been updated.
