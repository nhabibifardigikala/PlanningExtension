# v507
- GANJE Follow-up restored to the stable classic layout: report table on the left and compact file/settings panel on the right.
- Rebuilt the analysis runtime from the older streaming architecture instead of the v504-v506 runtime.
- XLSX is processed as streamed worksheet XML from inside the ZIP; the whole workbook is never loaded into memory.
- CSV is processed chunk-by-chunk with File.stream(); no file.text() on the whole input.
- Supports very large inputs (including near-GB files) subject to browser/device limits, with progress every 50,000 rows.
- Removed the 3-minute processing watchdog that could terminate valid large-file analyses.
- Dataset lookup now runs in parallel with file analysis so it does not block analysis startup.
- Preserved current requirements: distribution_center_id_cap, distribution_center_cap/IATA, Persian_Promised_Date range, 50% threshold, minimum 5 changes, optional previous-period comparison, dataset center-name resolution with fallback, IATA sorting, rich table copy and Excel export.
- Host unchanged at 13.0.19.
