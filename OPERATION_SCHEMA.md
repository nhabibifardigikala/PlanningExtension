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
