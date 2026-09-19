# DigiExpress Remote-first architecture — v338 / Stable Host 13

v338 completes the Remote-first migration. Host 13.0.0 is intended to remain installed for normal future releases.

## What moved to Remote
- Full application shell HTML/CSS/JavaScript (`ui/app.html`, `ui/app.js`).
- Settings, theme, Favorites, navigation and URL state.
- Agents UI and Agent definitions.
- Agent schedules, retries and generic publishing pipelines.
- Rejected Shipments dashboard refresh behavior.
- Operation cards, forms, validation, reports, charts and embedded modules.

## Stable Host bridge
Remote pages use `ui/platform-client.js`. The Host injects `platform_bridge.js` only on the trusted PlanningExtension origin.

The bridge exposes generic capabilities, not operation-specific APIs.

## Stable Jobs
Agents are persisted and scheduled by the generic Host scheduler, but their definitions are supplied by Remote. This means adding/removing an Agent or changing its schedule/output pipeline is a Remote-only release.

## Minimum Host
`13.0.0`.

Future Remote configs should keep this minimum unchanged unless a new privileged browser primitive, Chrome/Manifest change, or security correction is truly required.


### v341 Rejected Shipments note
Rejected Shipments uses only stable Host 13 primitives (`ensureTableColumn`, `extractPaginatedTable`, `closeTab`) and no longer depends on ad-hoc validation actions. Endpoint discovery is Remote-owned.

## Config 348: non-blocking Host upgrades

The Remote workspace baseline is Stable Host 13.0.0. A newer Host release is a capability upgrade, not a reason to lock the whole application. Remote operations that truly depend on a newer privileged primitive declare `minHostVersion`; only those operations are blocked on an older Host, with a clear installed/required version message. All unrelated tools stay accessible.
