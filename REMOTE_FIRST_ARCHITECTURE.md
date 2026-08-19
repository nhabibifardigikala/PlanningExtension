# Remote-first architecture (v201)

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
