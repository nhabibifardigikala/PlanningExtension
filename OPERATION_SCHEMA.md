# Remote workflow actions supported by Engine 6.0

Operations are defined in `operations/*.json` and executed sequentially.

Supported actions:
- `open`: open a URL in a Chrome tab.
- `ensureLogin`: use the locally stored validated credential if LG redirects to authentication.
- `navigate`: navigate the current operation tab.
- `wait`: cancellable wait in milliseconds.
- `waitFor`: wait for a CSS selector.
- `fill`: set a normal input value.
- `autocomplete`: click, type character-by-character, optionally press Enter, click outside, and verify the field.
- `jalaliDate`: convert an 8-digit Jalali date to slash format, fill the picker, wait, press Shift, and click outside.
- `click`: robustly click an element.
- `clickAndWait`: click/retry and continuously monitor a success selector.
- `extractPaginatedTable`: extract all table rows, follow Next-page links, wait for stable rows, and optionally deduplicate.
- `calculateStats`: calculate Jalali report-day count and min/average/max for named table columns.
- `exportExcel`: export the extracted table to XLSX.
- `closeTab`: close the operation tab.

Navigation retry behavior is controlled remotely with `navigation.retryCount`, `navigation.retryDelayMs`, and `navigation.completeTimeoutMs`.

If a future operation requires a capability not listed here, only then is a Core Engine update needed.


Engine 6.2 additions:
- `selectPagedCheckboxes`: frame-aware selection of a select-all checkbox across enough paginated pages to satisfy a requested item count, then clicks a Choose button.
- Remote input type `checkbox` with `defaultChecked` and `hideFields`.
- `inputRules` can copy the locally stored credential username/email into an operation input when a checkbox is enabled.


### Duplicate selectors
For autocomplete actions, `options.selectorIndex` selects among all matching elements. `0` is first and `-1` is last.
