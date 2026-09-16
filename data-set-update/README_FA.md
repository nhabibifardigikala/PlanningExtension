# Data Set Update v306

## Data sets

### Distribution Centers
- Runs DC User Assignment first and assigns 300 DCs to the configured Digiexpress user.
- Runs the existing Extract Distribution Centers workflow.
- Replaces the contents of `Distribution Centers (LG)` in the configured Google Sheet.

### Pick-up Polygons
- Opens `https://flex.digikala.com/hubs/coverage-polygons/`.
- Ensures the `coordinates` column is enabled from Columns.
- Clicks outside the Columns menu and waits up to the workflow's 10 second settling period.
- Reloads the list with `per_page=1000` and extracts every page via Next.
- Before publishing, keeps only rows whose name contains `FBM` or `SBS`.
- Converts `shipping size id` values such as `متوسط (2)` to numeric `2`.
- Clears and replaces the `Pick-up Polygons` sheet.

## Scheduling
Each data set has independent Manual Update, Cancel, Daily/Hourly schedule, immediate retries and deferred retries managed by the existing Data Set Update scheduler in Host 12.5.3+.

## Google Apps Script
Update the existing Data Set Update Apps Script deployment with the included `appsscript/Code.gs`, then deploy a new version of the same Web App. The same connection URL can continue to be used if the deployment is updated in place.


## Delivery Polygons
- منبع پایه: تب `Distribution Centers (LG)` در DataSets.
- ردیف‌های گنجه/گنجدار و DCهای غیرفعال حذف می‌شوند.
- جدول `admin.digikala.com/shipping/dc-polygons/` با ستون `coordinates` و `per_page=1000` استخراج می‌شود.
- Join بر اساس نام DC انجام می‌شود (`Distribution Centers.name` ↔ `dc-polygons.distribution center id`).
- خروجی نهایی: `Name`, `coordinates`, `distribution center id`, `IATA`, `district`, `time scope`, `shipping nature id`.
- shipping nature: عادی=1، متوسط=2، سنگین=3؛ نام‌های باربری=4، بیزنس=5، تحویل فوری=6.
- ردیف‌های بدون coordinates حذف می‌شوند و تب `Delivery Polygons` قبل از جایگزینی پاک می‌شود.
