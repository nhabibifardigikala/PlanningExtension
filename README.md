# PlanningExtension Remote Application v18

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
