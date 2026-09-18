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
