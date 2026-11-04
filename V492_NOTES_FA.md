# v492

## Shared Design System
- `ui/design-system.css` upgraded to the shared v492 foundation and is loaded by every standalone Planning app.
- Standardized design tokens for surfaces, typography, spacing, borders, controls, buttons, status states, dark mode and focus states.
- Existing app-specific CSS remains supported; the shared layer is loaded after legacy CSS so the common foundation stays authoritative.
- Shell keeps its inline fallback, while the shared stylesheet is now the authoritative layer.

## Standard Table Component
- Added `ui/table-component.js` and enabled it across all standalone apps plus the main shell.
- Existing and dynamically-created tables are progressively enhanced without changing app business logic.
- Common capabilities: sticky headers, centered cells/headers, search, sorting, Copy, CSV export, row counts, zebra/hover states, bounded scrolling, responsive toolbar and dark-mode styling.
- Apps may opt out per-table with `data-dx-table="off"` or keep styling without the toolbar using `data-dx-table-toolbar="off"`.

## Diagnostics / Health Check
- Settings > Diagnostics is upgraded to `Diagnostics & Health Check`.
- One-click checks cover: Stable Host, Remote configuration, Google Sheet access, LG/ProcessMaker, core datasets and diagnostic storage.
- Each check renders its own status card and detail.
- Export now includes both the last health-check result and local diagnostic events.
- Existing detailed Diagnostic Mode and LG-only test are preserved.

## Packaging / Version
- Config version: 492.
- Embedded standalone app URLs cache-busted to v492.
- Recommended Host remains 13.0.18; no Host change is required for this release.
- Removed the accidental nested `v487_check2/` duplicate from the Full package.
