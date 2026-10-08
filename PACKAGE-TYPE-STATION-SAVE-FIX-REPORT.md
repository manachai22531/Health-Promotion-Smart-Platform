# v7.62.75 Package Type + Station Save Fix

- Existing `บันทึกแพ็กเกจ` button now commits Package Type and Station changes.
- Button is visible for users with customerEdit, packageStationEdit, orderItemManage, or orderTypeManage.
- Station master is explicitly loaded before rendering package detail.
- Dropdown changes remain draft-only until Save is pressed.
- Dirty count is shown on the existing Save button.
- Package Type is persisted to `orderItemSettings` through the existing state persistence path.
- Station changes are sent once via `PATCH /api/package-item-stations/batch`.
- Empty station is sent as NULL, non-empty station IDs are normalized to numbers.
- Save verifies the batch update count and reloads package details from the backend after success.
- Drafts are retained if save fails so the user can retry.
- No new migration is required for this hotfix.
