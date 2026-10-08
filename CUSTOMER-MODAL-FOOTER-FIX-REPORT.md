# v7.62.75 Customer Modal Footer Fix

## Root cause
The CSS selector `#customerOverlay [data-close="customerOverlay"]` matched both the header X button and the footer Cancel button. Because `.modal-footer` is positioned/sticky, the footer Cancel button became absolutely positioned inside the footer and overlapped the Save button.

## Fix
- Scope absolute close-button styling to `.modal-header` only.
- Force the footer Cancel button back to normal static flow.
- Make the customer modal a flex column with a scrollable body and non-overlapping footer.
- Remove the stray `>` shown before Package Code in the form.

## Regression
`node release-candidate-v76273-customer-modal-footer.test.js`
Expected: PASS (6/6)
