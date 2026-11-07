# v504
- Fixed GANJE Follow-up analysis hang by restoring and synchronizing its runtime files.
- Replaced outdated app.js render path that referenced removed KPI DOM nodes.
- Added current streaming worker support for distribution_center_id_cap, distribution_center_cap, Persian_Promised_Date, 50% threshold, minimum mismatch count, optional previous-period comparison, and IATA sorting.
- Added Distribution Centers (LG) lookup by id in the app runtime with fallback to distribution_center_cap.
- Added a 180-second no-progress watchdog so the UI cannot remain stuck indefinitely.
- Restored missing GANJE Follow-up app.css, app.js, worker.js and xlsx-writer.js in the Full package.
- Restored ui/platform-client.js and ui/design-system.css required by the app.
- Host unchanged: 13.0.19.
