## Remote v359

Weekly Planning usability update: larger typography, full-width layout, project/group based task creation, plan-hour progress metrics, and duplicate shell title removal.

## v346
- Rejected Shipments: canonical 13-column publish mapping and direct 5-minute DataSets dashboard refresh.

# DigiExpress Remote v338

Config 338 is the Stable Host 13 migration release.

## Important architectural change
The main DigiExpress application now runs directly from Remote GitHub Pages. The Host no longer injects the application HTML/CSS and no longer owns the main application JavaScript.

`ui/platform-client.js` talks to Host 13 through a narrow trusted-origin bridge.

## Agents
Agents now use the generic Stable Jobs runtime. Agent IDs, schedules, retry policies, output destinations and optional Apps Script before/after requests are Remote configuration.

## Rejected Shipments
The dashboard is Remote-owned and reads DataSets through the generic HTTP bridge. Failed dashboard refreshes retry every minute until a successful fresh response, while the visible dashboard refreshes every five minutes.

## Host policy
Minimum Host is 13.0.0. Keep it at 13.0.0 for normal future Remote releases.


## v339 shell hardening
The main `ui/app.html` is now self-contained for its shell CSS and JavaScript. This prevents a partial GitHub upload, stale relative asset, or missing `ui/app.css` / `ui/app.js` from rendering DigiExpress as unstyled HTML. Host 13.0.0 remains unchanged. Product logic is still Remote-owned.


## v341 fixes
- Agent-owned tabs now close on success and on error.
- Rejected Shipments Synchronizer no longer uses unsupported setTabZoom.
- Delivery Polygons accepts current dc-polygons schema with distribution center id and optional time scope.
- Rejected dashboard uses robust DataSets connection fallback, longer hydration timeout, and the previous two-tone repeating alert sound.

## v341 — Rejected Shipments recovery
- Removed unsupported `validateTableColumns` from the Rejected Shipments workflow.
- The Rejected Agent no longer changes every column checkbox. It only ensures the 12 canonical Rejected_Raw columns are visible before extraction.
- Rejected Dashboard now searches all saved DataSets Web App endpoints and uses the first endpoint that successfully answers the `rejectedState` JSON request.
- Rejected manual runs probe the DataSets endpoint before starting, so a stale 401 URL is not silently reused when another valid saved endpoint exists.
- Agent extraction tabs remain configured to close after success, failure, or cancellation via Remote workflow ownership and `closeTabOnError`.


## v342 — Rejected Shipments reliability

- Dashboard reads DataSets → Rejected Shipments directly through Stable Host Google Sheets read capability, with Apps Script fallback.
- Synchronizer reads max(id) from the exact `id` column before extraction, applies rejected filter + Search, configures the exact 12 Rejected_Raw columns, sets 1000 rows/page, stops at the stored watermark, and appends de-duplicated IDs.
- Extraction tabs close on success, error, or cancellation.


## v343 fixes
- Authenticator opens the real Host-local secure application directly instead of showing a Remote placeholder card.
- Polygon applications read DataSets directly through Stable Host `sheets.readRows`; Apps Script/JSONP is no longer required for polygon dataset loading.


## v344
- Rejected Shipments Synchronizer now stops pagination at the exact maximum `id` already present in DataSets → Rejected Shipments.
- Authenticator no longer uses an intermediate Remote card; opening Authenticator launches the secure Host-local page directly, with an automatic fallback launcher only if the Remote route is opened explicitly.

## v345 fixes
- Rejected Shipments job definitions now migrate the authoritative Remote pipeline into stored Stable Jobs state, preventing stale jobs from losing the max-id cursor.
- Manual Rejected runs read the exact maximum `id` from DataSets before starting and inject it as `previousMaxId`.
- Authenticator no longer leaves the workspace routed to a Remote wrapper; it opens the secure Host page and immediately returns the workspace to Home.


## v347
- Prevented the hidden Authenticator iframe from loading on DigiExpress startup.
- The Remote Authenticator fallback no longer opens the secure local page automatically.

### Config 348 — operation-scoped Host compatibility

Opening DigiExpress is no longer gated by the newest Host version. The shell baseline remains Host 13.0.0. Operations that need newer Host primitives declare `minHostVersion` and are the only ones restricted when the installed Host is older.


## v351 Authenticator navigation
Authenticator opens in the current DigiExpress tab through the secure Host local-page primitive. It no longer creates an extra tab, and the Host-local page provides Back and Home controls while keeping 2FA secrets inside the Host boundary. Requires Host 13.0.3 for in-place navigation; older Hosts keep the workspace usable but this operation is version-gated.


## v352 Authenticator restoration
Authenticator again behaves like the pre-Remote-shell embedded implementation: it opens inside the DigiExpress operation view, while the actual page remains Host-local. Host 13.0.4 exposes only the allowlisted Authenticator resources to the trusted DigiExpress GitHub Pages origin and Remote obtains the URL through `localPage.getUrl`. No Authenticator page is loaded at workspace startup.


## v353
- Added **Gate Management** as a Remote-owned Network tool with its own lightweight WebP icon and embedded workspace.
- No Host update is required.


## v355
- Gate Management is a public Remote workspace and no longer depends on a Gate Management column in the access sheet just to appear in the launcher.

- Gate Management now uses the explicit `Gate Management` Access-sheet header and is no longer public.

## v357 — Weekly Planning

- Added `Weekly Planning` under Utilities with Access header `Weekly Planning`.
- Reads the `Tasks` sheet from spreadsheet `1t1rX8DEIIhPztSrxcRQIuZCwy5cYxRFomZWKdp6sHNg` through Stable Host `sheets.readRows`.
- Tasks view supports search/slicers, inline editing of Priority / Time / Responsible, and one-click Jalali `Planned Date` assignment using `YYYYMMDD`.
- Plan view filters by Responsible + Jalali date and marks a task Done by writing today's Jalali date to `Completion Date`.
- New Task modal supports L1/L2/L3 hierarchy, group, priority, time, status, responsible, due date and optional planned date; `Add Date` is generated automatically.
- Responsible and Priority dropdowns are configurable in Weekly Planning Settings and stored in Host-backed `chrome.storage.local`.
- Writes use the existing generic authenticated `REMOTE_HTTP_REQUEST` bridge to an included Google Apps Script Web App (`weekly-planning/appsscript/Code.gs`). No Host update is required.


## v357 visibility fix
Weekly Planning registration is included in `app.json`, `operations/weekly-planning.json`, its icon, embedded workspace, and the changed-files package. Access header is exactly `Weekly Planning`.


## v358 structural catalog fix
- Remote shell force-refreshes the Host catalog on every startup.
- GitHub packages are rooted at repository root (no extra wrapper directory).
- Gate Management and Weekly Planning are explicitly registered with Access-sheet column control.
- All catalog asset version parameters were normalized to v358.
