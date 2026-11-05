# v494
- GANJE Follow-up now uses `distribution_center_id_cap` as the required input center ID column.
- Center ID/name are resolved from Distribution Centers (LG); when an ID is missing from the dataset, the input ID is preserved and `distribution_center_cap` is used as the center-name fallback.
- Added minimum mismatch count filter, default 5.
- Minimum percentage remains 50%; both minimum conditions use >= semantics.
- Redesigned GANJE Follow-up workspace to 15% right-side input/parameter panel and 85% report table area on desktop.
- Copy Table now writes rich HTML with Yekan Bakh FaNum font preference, borders, navy headers, centered cells, and content-aware column widths; plain-text fallback remains available.
- Host unchanged at 13.0.18.
