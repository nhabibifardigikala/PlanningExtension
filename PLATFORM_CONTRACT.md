# Remote Application Contract for Stable Host 11

All product and operation behavior is remote-first. Use `runtime.json`, `app.json`, `settings.json`, `theme.json`, `messages.json`, `ui/*`, `operations/*`, `data/*`, `templates/*`, and `icons/*` for changes.

## Never require a Host release for
- adding/removing operations
- forms and validation
- URLs/selectors/waits/retries
- tab reuse/background behavior
- pause/resume/cancel behavior
- batch iteration and repeat-until conditions
- success/error interpretation
- data filtering/grouping/join/aggregation
- Excel input/output mapping and styling
- dashboards/charts/KPIs
- access aliases and user-facing text
- theme, icon, layout or labels

Stable Host 11 provides a generic declarative workflow runtime. New workflows should prefer `engineMode: "universal"` and the universal node set documented in `UNIVERSAL_DSL.md`.
