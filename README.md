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
