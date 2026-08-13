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


Engine 7.1 additions:
- `pagedBatchSubmit`: performs a paginated chooser + autocomplete + submit flow in bounded batches so selected IDs do not create oversized pagination URLs.
- `pagesPerBatch` controls the maximum selected pages carried in one request and is fully remote-configurable.
- `terminalSuccessTexts` can classify known server messages as a successful terminal outcome instead of an error.


### Terminal success after submit
For batch submit operations, use `terminalSuccessSelector` plus `terminalSuccessTextContains` to detect a terminal success message in any frame. Example: `p[error-path="0"]` with text `User and DC relation already exists`.

## Remote form field types added in Engine 7.4
- `radio-group`: `options`, `default`
- `checkbox-group`: `options`, `default`
- `file`: `accept`
- `showWhen`: `{ "field": "...", "equals": "..." }`
- `requiredWhen`: `{ "field": "...", "equals": "..." }`

## Client point-in-polygon processor
`clientProcessor.type = "point-in-polygon"` loads a remote JSON polygon dataset and supports single coordinate lookup or two-column XLSX input. The dataset path, nature mapping, field names, and output behavior are remote-configured.


## remote-autocomplete input
Use `type: remote-autocomplete` for searchable public CSV data sources. The runtime filters rows whose name contains the typed phrase, ranks closest matches first, and returns the selected row ID as the field value. Configure `source.url`, `source.nameColumns`, `source.idColumns`, and optional cache/debounce settings.


## Cross-dataset synchronization actions (Engine 7.6+)
- `enableColumns`: opens a Columns menu and enables named checkbox columns.
- `extractPaginatedTable.storeAs`: stores a table as a named in-memory dataset without downloading it.
- `extractSearchVariants`: repeats a search for configured values and combines all paginated results into one named dataset.
- `reconcileCodeByName`: joins one master dataset to one or more source datasets by normalized name and creates code corrections when source code differs from the master code.
- `applyFieldCorrections`: searches each mismatched record by ID, opens Details, fills a configured field, and saves. All URLs, selectors, aliases and waits are remote-configured.


## Runtime v8 generic principles

Operation files must be declarative. Supported generic interaction primitives include open, ensureLogin, navigate, wait, waitFor, fill, autocomplete, jalaliDate, click, clickAndWait, press, setChecked, clickOutside, read, setContext, assert, enableColumns, extractPaginatedTable, extractSearchVariants, pagedBatchSubmit, selectPagedCheckboxes, calculateStats, exportExcel and closeTab, plus the generic dataset reconciliation/update primitives already used by Sync IATA.

All selectors, selector indexes, timeouts, retry policies, URLs and user-facing progress text belong in remote operation JSON.

For a future external HTTPS host, add `requiredHosts` to the operation metadata. Runtime v8 can request that host permission at execution time without an extension update.


### Conditional workflow steps
Any workflow step may include `when` with `left`, `operator`, and `right`. Supported operators use the runtime condition matcher (for example `contains`, `equals`, `truthy`).

### Reconciliation exclusions
Each `reconcileCodeByName.sources[]` entry may contain `excludeIds`, a comma-separated string (including a template such as `{{pointExceptions}}`). Matching IDs are skipped entirely.


### UI primitives added in Runtime 9.1
- `remote-multi-autocomplete`: repeatable remote selection rendered as chips.
- `jalali-date`: text input plus Persian calendar picker.
- `clientProcessor.type = multi-capacity-report`: sequential per-center execution and interactive result rendering.
- `clientProcessor.map`: map visualization for point-in-polygon single-location results.


## Stable Host 10.1 generic primitive
- `setPageZoom`: sets the current page CSS zoom from remote JSON, e.g. `{ "action": "setPageZoom", "zoom": 0.2 }`.
- `clientProcessor.presentation.hideDashboardButton`: hides the generic dashboard action for download-only operations.

### Paginated table parser selectors
`extractPaginatedTable.parser` may define `tableSelector`, `headerSelector`, and `rowSelector`. This allows operations to extract only primary records from pages that contain nested/subtables.
