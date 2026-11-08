# v509
- Fixed shared table toolbar layout so Search, Copy, CSV and row count do not overlap on narrow cards.
- Search uses the flexible main column; Copy/CSV stay grouped; row count gets its own row.
- Responsive wrapping added for narrow widths.
- Apps with their own search continue to avoid a duplicate shared search.
- Restored `ui/table-component.js` into the Full package and cache-busted references to v509.
- Host unchanged (13.0.19).
