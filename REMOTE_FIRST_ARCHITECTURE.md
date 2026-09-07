# Remote-first architecture (v202)

Remote owns all business behavior. Host 12.0.0 is treated as a security-only runtime.

## Remote-owned
- app catalog and operation definitions
- URLs/selectors and workflow ordering
- retries, waits, assertions, verification
- matching/normalization pipelines such as `stripTrailingBrackets`
- Excel input mapping and output reports
- live-report definitions
- feature pages and UI (Planner, Note, Pomodoro, Work Healthy, etc.)
- theme, labels, icons and settings

## Host-owned fixed capabilities
- access/credential security boundary
- tabs/scripting/download/storage/notifications permissions
- generic declarative workflow interpreter
- generic DOM primitives and normalization transforms
- generic XLSX export and browser bridges
- remote caching/rollback and compatibility checks

## Update rule
For normal product changes, publish Remote only. Keep `minimumRuntimeVersion` at `12.0.0`. A Host release is justified only by a security/browser-runtime issue or a truly new privileged primitive that cannot be represented by the existing capability contract.


## Permanent release rule (Config 259+)

The deployed Host baseline is 12.2.9 and must not be incremented for normal feature releases. New operations, UI, workflows, selectors, data sources, transformations, caches, labels, reports, and business rules are Remote-only. A Host update is permitted only when the requested behavior cannot be implemented with the existing Remote/web capabilities or the existing generic Host contract, or when required for a security or Chrome/Manifest platform fix.


## Host 12.3.1 justified exception
Config 269 requires a Host update only for generic platform behavior that cannot be delivered by Remote HTML/JSON alone: seven-day credential freshness with automatic validation on open, reusable raw-value support in multi-autocomplete controls, and local Home/Back view history. Capacity selectors, submission rules, icons, and UI remain Remote-owned.
