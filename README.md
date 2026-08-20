# Remote architecture status

**Remote v210 — remote-first product layer.** Normal releases must not require a Host update.

# PlanningExtension Remote Application v18

## Remote App v103
- Daily Planner task cards are now compact and keep both checkboxes on the title row.
- Bulk-selection and completion checkboxes use distinct blue and green colors.
- Long task titles stay on one line and truncate with an ellipsis.
- The task list expands responsively from one to two, three, and four columns.

Upload the contents of this package to the root of the PlanningExtension GitHub Pages repository.

This repository is the application definition. Almost all future changes should happen here, without redistributing the extension.

Remote-managed areas include app.json, runtime.json, theme.json, settings.json, messages.json, ui/app.html, ui/app.css, operation definitions, forms, workflows, selectors, URLs, timeout/retry rules, icons and public data files.

The local Runtime v8.0 only contains security enforcement and generic browser/data primitives. Do not place passwords, tokens, cookies or other secrets in this public repository.

The runtime fetches the latest remote bundle every time the side panel opens. If GitHub is temporarily unavailable it falls back to the last known good version stored locally.


## v19 Sync IATA
Sync IATA now opens a Remote form with dataset selection and comma-separated exception IDs. Shipping Point/Polygon Columns menus are closed with an outside click and the table is allowed to reload before extraction. Requires stable runtime 8.1+ for generic step `when` and reconciliation `excludeIds`.


## v21
- Sync IATA target selectors are segmented orange buttons.
- Shipping Point code column is committed with a center-page click, reload wait, second confirmation, and explicit header assertion before extraction.
- Compatible with Stable Runtime v8.1; no runtime update required.


## v22
Forced remote UI/CSS cache bust to v22 and strengthened Sync IATA target button styling. No Runtime update required.


## v24
Shipping Polygon Columns sequence: click Columns, wait 1s, select code, click center, wait for reload, then verify code header.


## v25 Columns behavior
Distribution Centers are extracted without opening Columns. Shipping Points and Shipping Polygons open Columns, wait 1 second, ensure code is checked without toggling an already-checked checkbox, click the center of the page, wait for the table to settle, then verify the code header before extraction.


## v26 resilience
- All remote operations declare a 3-attempt step retry policy. The stable runtime retries transient page/network/frame failures unless the user cancels.
- Sync IATA uses state-aware `ensureTableColumn`: checks headers first, opens Columns only when needed, waits 1 second, only checks `code` when not already checked, clicks viewport center, and polls up to 30 seconds for the header.
- Capacity Report remote autocomplete reads the exact database `id` column.


## v27 - Capacity Report database rate-limit mitigation
- Capacity center source switched from Sheets export endpoint to gviz CSV.
- Search starts after 2 characters with 500 ms debounce.
- In-session source cache increased to 1 hour.
- Distribution Center ID continues to use the exact `id` column.


## v28
- Sync IATA Shipping Points now maps `title fa` / `title_fa` to Distribution Center `name`.
- Shipping Point `code` is compared with Distribution Center `iata`.


## v29
- Capacity Report DC autocomplete uses Google Visualization with headers=3 and only id/name columns to correctly preserve each center ID.
- Sync IATA update flow uses exact Details links and code/save selectors with shorter waits; platform retries remain enabled.


## v30 Sync IATA update flow
Shipping Point and Shipping Polygon corrections now use the exact list -> ID search -> Enter -> Details -> input[name="code"] -> button.admin-submit-button -> return-to-list flow, with ~1s waits matching the reference Playwright scripts.


## v32 additions
- Parent Determination map visualization with polygon overlay.
- Capacity Report multi-center selector, Persian date picker, per-center trend charts, and interactive dashboard tab.
- Unified orange accent controlled from theme.json.
- Keyboard support: arrows/Enter in autocomplete, Tab navigation, Esc close/back, Ctrl/Cmd+Enter run.


## v33 Capacity refinements
- One combined Excel for all selected centers, downloaded only on user click.
- No per-center automatic Excel export.
- Capacity and Capacity Reserved statistics shown in separate blocks.
- Selected center chips show names only.
- Larger Persian date picker month navigation controls.
- Capacity chart point spacing reduced to 29px and configurable from Remote Config.


## Remote App v35
- Sync target label changed to **Sync Polygons**.
- Extract Distribution Centers now opens a form screen with **Run Extraction**.
- Extraction no longer auto-downloads Excel; after completion a **Download Excel** button is shown.


## v36 Capacity fixes
- Multiple selected DC IDs are submitted once, joined by a single space.
- Added deliberate pacing before/after filling the Distribution Center field.
- Dashboard button label is `Open dashboard`.
- Dashboard data is opened through a robust background-tab launcher in Runtime 9.3.1.

## v38
Capacity Report now groups each center by `time scope` and renders separate KPIs and trend chart for every Time Scope.


## v48 - Extract Distribution Centers
Remote workflow aligned with the supplied Playwright reference: configured columns, 10s apply wait, refresh + 15s wait, 1000-row readiness check, 90s timeout, and paginated extraction.

## v50 - Extract Distribution Centers center apply
After all COLUMN_CONFIG checkboxes are set, the workflow clicks the exact center of the viewport, waits for the table reload/apply cycle, then continues the reference refresh/readiness/pagination flow.

## v52 - Extract Distribution Centers Columns commit
After applying the full COLUMN_CONFIG at 20% zoom, the workflow explicitly clicks the center of the viewport, waits for the table to reload, verifies the table is available again, then starts paginated extraction. The previous explicit navigate/refresh cycle after Columns selection was removed.


## v53
Extract Distribution Centers now follows the supplied reference flow for table preparation and keeps implementation details out of the operation description.


## v54
Extract Distribution Centers now performs an explicit viewport-center click immediately after the full column configuration step, before waiting for the table reload/apply cycle.

## Remote App v56
Adds Flex Capacity Definition as an Excel-driven batch operation with remote template download, validation, retries, per-row results, and downloadable result workbook.


## v57
Flex Capacity Definition now always opens its internal operation form first. The remote operation config includes the Download Template and Upload Excel fields so the detailed config cannot overwrite the app-level form with an empty inputs array. No Flex website tab opens until the user presses Run.

## v60
Flex Capacity Definition now treats `Existing capacity slot` as the final success confirmation. A row is repeated until that confirmation is observed, unless the user pauses or cancels.

## Remote App v62 / Stable Host 11
This package targets Stable Host 11. Product behavior is remote-owned. See `PLATFORM_CONTRACT.md` and `UNIVERSAL_DSL.md`.


## Daily Planner (v63)
Daily Planner is a fully remote, local-first planner page under `planner/`. The Stable Host is unchanged at v11.0.0. Personal data is stored in the browser on the user's machine. Team/database sync is remote-config ready and activates only when a database endpoint is configured in `planner/config.json`.


## Remote App v67
Daily Planner was redesigned as an embedded planner inside the extension operation view. It no longer opens a separate browser tab. Planner UI and logic remain remote-hosted and require no Stable Host update.


## v70
- Daily Planner: native browser-backed date picker bridge and Delete all tasks control.
- Added embedded Note operation with color/category/checklist/image support and JSON import/export.


## Remote App v71
- Note navigation moved to an icon bottom bar matching Daily Planner.
- Note settings now include Persian/English language selection and Planner-style category management.
- Note save/edit flow rebuilt; all note properties are editable after creation.
- Access rule documented: a literal `All` cell in an operation column marks it public. Enforcement is implemented in Stable Host 11.0.2 because access verification is a security-boundary responsibility.


## v72
- Note theme aligned with Digiexpress light/dark palette.
- Note Save action is sticky at the top of the editor.
- Checklist spacing reduced and title/text search added.
- Note iframe is strictly isolated from non-Note operations.
- Home operation cards use fixed-size responsive auto-fill grid.


## Remote v74
- Note search and category filter share one row; duplicate host title removed.
- Home operation grid is elastic and adds columns as width permits.
- Added embedded Paste Assistant (snippets, shortcuts while focused, region screenshot, import/export).


## v74 Paste Assistant global shortcuts
Paste Assistant publishes its user-defined shortcuts declaratively to Stable Host 11.1. Future snippet/shortcut edits are stored as data and do not require Host updates.


## Remote v75
Paste Assistant screenshot is now instant: visible tab -> clipboard, with no screen picker or crop step.


2026-08-13: v76 / Host 11.2 adds reliable clipboard screenshots, concurrent operation run isolation, Planner date picker parity, Capacity ID commit verification, and generic batch-report support used by Parcel Log.

## Remote App v80 - Time Study
Adds the embedded Time Study operation. The complete UI and logic live under `time-study/` and are loaded remotely; no Stable Host change is required. It supports reusable project definitions, tasks, one custom field, piece/worker/performance controls, pause/continue, time-per-piece and standard-time calculations, local autosave, and XLSX export/import.


## v88
- Added Coverage Polygons using the built-in DX_Polygons dataset.
- Added Point Distribution with Excel point upload and polygon overlay.


## v203 PUDO field targeting fix
PUDO now targets the first and second `.uk-select.es-input` controls by index instead of relying on the unstable `title` attribute. Center exact matching still ignores bracketed IDs. This is Remote-only and requires no Host update.


## v204 PUDO autocomplete commit and version synchronization
- PUDO Center selection now relies on the site autocomplete ranking and Enter commit after typing the complete center name. This avoids brittle suggestion-DOM matching when the visible label contains a bracketed ID.
- All visible/config/cache-buster version references are synchronized to Config 225.


## v206 PUDO confirmation, Parent Code and template
- PUDO now selects the Parent autocomplete using `کد پرنت` / Parent Code rather than Parent Name.
- After Add Batch Config, the workflow samples the page immediately and during the next 700 ms for the transient `Done!!!!` confirmation. If it is not observed, the Excel batch processor retries the entire row (up to 3 total attempts).
- A downloadable `PUDO_Auto_Config_Template.xlsx` is included with five columns: نام مرکز، نام پرنت، کد پرنت، تاریخ شروع، تاریخ پایان.
- Host 12.0.0 remains unchanged.


## v206
PUDO live batch progress is enabled through the generic Host 12.0.1 batch-observability capability. The progress bar reports processed centers across the full workbook, and the live result table auto-scrolls to the latest center. PUDO selectors, success rules, columns and workflow remain Remote-owned.

## v210 Role Assignment background-safe execution

Role Assignment now submits the parsed user list to the Host background batch controller in one request. User/AD searches use native form submission where available, and role chooser result polling allows longer hidden-tab rendering without moving product logic into the Host.


## Remote v213
- Legacy v212 note: `DX_Polygons.json` was synchronized once. From v213 onward polygon consumers read `DX_Polygons.xlsx` directly and the JSON file is not part of the runtime data path.
- Updated local cache-busters to v213 so map pages do not reuse stale polygon JSON.
- Legacy v212 role hardening was insufficient for minimized tabs. v213 uses native framed-form navigation with Host 12.0.5 so role search no longer depends on keyboard/render events inside the chooser.
- No Host update is required.


## v213
- DX_Polygons.xlsx is the single runtime source for Coverage Polygons, Point Distribution, and Parent Determination.
- Parent Determination is now a Remote embedded tool and reads the workbook directly.
- Role Assignment uses native form navigation inside the chooser; Host 12.0.5 adds only this generic frame-form primitive.
- Role Assignment requests generic iframe wake-up before chooser discovery; the Runtime does not activate or focus the tab.

## v216 Role Assignment first-row fix

- Fixed the case where a requested Role is the first row in the chooser and is checked, then immediately unchecked.
- The `chosen` filter selector now explicitly excludes row checkboxes that carry `data-target`, so the Runtime cannot mistake the first Role checkbox for the chooser filter.
- Role state changes use direct checked-state assignment plus a single input/change notification instead of toggle-style click behavior.
- The verification pass remains enabled, but already-checked Roles are read-only during verification and are not toggled again.
- Fast login detection from v215 is retained.
- Remote-only change; Host 12.0.5 remains unchanged.

## v217 Role Assignment sub-operations
Role Assignment now contains three bottom-tab tools: Assign / Revoke, Copy Roles, and User Access Diff. Copy Roles reads all currently assigned role IDs from User A and adds them to User B without deleting User B's existing roles. Access Diff reads both users and reports Both / Only User A / Only User B. These behaviors are Remote-owned; Host 12.0.6 only provides generic sub-operation rendering and generic frame checkbox collection.


## v219 Authenticator
Adds the Authenticator feature shell. The actual secret-entry UI and TOTP vault are Host-owned for security; Remote only controls catalog placement and non-secret feature exposure.

## v221 Authenticator + Role navigation UX
Authenticator menu icon is monochrome. Role Assignment suboperations use a fixed icon-only bottom navigation.

## v222 Authenticator + Role navigation
- Authenticator catalog icon is now a monochrome `2FA` badge.
- Role Assignment sub-operation navigation now follows the same fixed icon + small label layout as Daily Planner.


## v225
- Voice Typing full-height responsive UI, extension-theme matching and explicit microphone permission preflight.
- Authenticator remote contract uses a 2FA shield icon, battery countdown, simplified Add UI and visible Cancel.
- Work Healthy uses professional ergonomic motion guides and registers a generic host reminder schedule so reminders can surface as a centered window even when Chrome is minimized.
