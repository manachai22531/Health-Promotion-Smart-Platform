# Header level and EXP popover (draft after v7.64.87)

Moves the existing EXP shield from the floating bottom corner to immediately before the signed-in user name. The header button opens a popover with the user's shield, level, role, total EXP, progress to the next level, activity reward and today's EXP. Clicking the button again, Close, outside the panel or Escape dismisses it. Personal Appearance and EXP panels close one another. The panel stays inside the viewport and scrolls internally on short screens.

Server-owned EXP calculations, collection permissions and authenticated API remain unchanged. Changing users/logging out closes the panel and clears previous progress. Awards update the badge without opening the panel. This change is included in the v7.64.87 installer.

This draft also preserves the search action button alignment fix from /workspace/healthcheck-search-button-align. Use this directory as the source for the next requested release, rather than rebuilding the already published v7.64.87 directory.

Validation: JavaScript syntax check and Chromium using the actual HTML/CSS/modules with a mocked authenticated EXP API. Verified header placement, initial closed state, open/close and Escape focus return, outside click, mutual exclusion with Personal Appearance, awards while closed, logout/disabled role visibility, and bounds at widths 1360/1100/780/390 including a 320px-high viewport. No browser script errors. This is UI validation; server EXP calculations were not changed.

Follow-up: the header shows only the shield, which already includes the level number. Removed the duplicate LV text beside it and reduced the button minimum width. The current level remains in its accessible label and tooltip.
