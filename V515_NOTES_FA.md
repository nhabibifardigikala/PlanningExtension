# PlanningExtension v515 — Shipping Network TD Extractor

- Agent: Shipping Network TD Extractor, visible under Agents and gated by existing Agents permissions.
- Source: drop-shipping.digikala.com/shipping-network/time-distance-config/; page=1 to final page, per_page=1000.
- Filters: id empty; shipping_network_id=0; time_scope_id=0; active empty; crud_tab_id empty.
- Destination: existing Agents Google Sheets connection, worksheet Shipping Network TD.
- Job output type=sheet uses Stable Jobs postJson(action=replaceDataset). App Script is expected to implement clearContents() before writing.
- Publishing happens only after extraction operation reports success and returns headers; on an extraction failure, no replacement is attempted.
- Scheduling is disabled by default until approved; user can run manually and turn on scheduler.
- Host remains 13.0.20. No offline package was requested.
- LIVE LIMITATION: Authentication, pagination selector, full page counts, Google Apps Script destination and end-to-end behavior require runtime verification in the logged-in environment.
