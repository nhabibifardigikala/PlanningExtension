# Remote v338 / Stable Host 13 migration

Remote v338 is the first release whose main shell runs from GitHub Pages instead of being injected into a Host-local popup.

From this release forward, normal DigiExpress product changes should be made in Remote only. Host 13.0.0 is treated as a stable platform runtime.

Remote owns UI, themes, navigation, operation definitions, Agents, job definitions, schedules, Apps Script data pipelines, dashboards and product behavior. Host owns Chrome privileges, security boundaries, generic workflow execution, generic scheduled-job execution and generic storage/network/browser primitives.
