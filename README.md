# PlanningExtension Remote Application v40

This repository is the application layer for Digiexpress Stable Host 10.0.

The remote application owns the visible UI, theme, settings metadata, operations, forms, selectors, waits/retries, data sources, data transformations, grouping, metrics, charts, dashboard configuration and Excel output definitions.

Capacity Report is the first operation migrated to the generic `data-pipeline` contract. It performs one combined query for all selected DC IDs, partitions results by DC, groups each DC by `time scope`, calculates metrics and creates one chart per group based only on remote JSON.

After publishing changes, use Refresh remote configuration or reopen the side panel. Runtime updates should not be used for normal operation/UI/report changes.
