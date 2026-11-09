# PlanningExtension v513

- Pickup polygon activity status is now loaded from Google Sheet `1Lmi-6SgJdC2O91KDeqrobPHq_jIKvdDSlZ3_NLgFVJg`, tab `Pickup Capacity`.
- Status is matched by `Hub Coverage Polygon ID` and resolved from the latest `Creation Date` per polygon.
- `Active=0` is inactive; `Active=1` is active.
- Coverage Polygons:
  - inactive Pickup polygons are drawn in red;
  - Pickup status is shown in popup/table;
  - red is reserved for inactive Pickup polygons in Pickup mode.
- Point Distribution:
  - adds Delivery/Pickup polygon service switch;
  - inactive Pickup polygons are drawn in red;
  - Pickup status is shown in popup/result table.
- Parent Determination:
  - inactive Pickup polygons are excluded from all parent matching (single and Excel modes);
  - if Pickup Capacity cannot be loaded, Pickup parent calculation is blocked rather than using stale/unknown activity state.
- Restored required polygon runtime assets into the Full package so these apps no longer depend on missing files from older GitHub deploys.
- Host remains 13.0.19; no Host change was required because Stable Host already provides generic `sheets.readRows`.
