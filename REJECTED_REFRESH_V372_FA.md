# Rejected Shipments Refresh v372

این نسخه Refresh داشبورد و Synchronizer را از هم تفکیک و بازطراحی می‌کند.

## علت‌های اصلی پیدا شده

1. Synchronizer قبل از هر اجرا از `sheets.maxNumericColumn` استفاده می‌کرد. در Host 13.0.5 این متد برای یافتن Max ID کل CSV شیت را از Google GViz می‌خواند. این کار برای Rejected Shipments بزرگ، درخواست سنگین و تکراری ایجاد می‌کرد.
2. Dashboard فقط به `afterRow/cursorRow` متکی بود. اگر Cache یا تعداد ردیف‌های شیت با Cursor مرورگر ناسازگار می‌شد، Refresh می‌توانست برای مدت طولانی هیچ داده جدیدی دریافت نکند.
3. Dashboard URL مربوط به Apps Script را از چند Storage مختلف پیدا می‌کرد و ممکن بود URL قدیمی را انتخاب کند.
4. Apps Script در هر Dashboard read متادیتا را در Script Properties می‌نوشت؛ این write برای خواندن Dashboard لازم نبود.
5. `maxId` فقط از ID ردیف فیزیکی آخر گرفته می‌شد.

## معماری v372

### Synchronizer

قبل از Scrape فقط یک درخواست کوچک `rejectedState` به Apps Script می‌زند و `maxId` را می‌گیرد. دیگر از `sheets.maxNumericColumn` برای Rejected Shipments استفاده نمی‌شود.

### Dashboard refresh

هر 5 دقیقه ابتدا `readRejectedDashboardSnapshot` اجرا می‌شود و 120 ردیف آخر + `totalRows` + `maxId` را می‌گیرد. بنابراین جدیدترین داده فوراً دیده می‌شود و Cursor قدیمی نمی‌تواند Dashboard را برای همیشه متوقف کند.

اگر بین Cursor و Sheet فاصله باشد، Dashboard در همان سیکل تا 10 بسته 80 ردیفی را با `readRejectedDashboardDelta` Catch-up می‌کند. اگر فاصله بزرگ‌تر باشد در سیکل‌های بعدی ادامه می‌دهد.

اگر Sheet truncate/rebuild شود، Cursor قدیمی Reset می‌شود.

### Endpoint

Endpoint رسمی v372:

`https://script.google.com/macros/s/AKfycbyEJOsDh6uIsypeg0DxQKRffFguskutZ05aP7o44jygV7ZAlCrVUkX2eA3__WYmc0WNGg/exec`

Dashboard و Rejected Shipments Agent این URL را به عنوان endpoint اصلی استفاده می‌کنند.

## Deploy Apps Script بدون تغییر URL

1. فایل `data-set-update/appsscript/Code.gs` نسخه v372 را در همان Apps Script Project جایگزین کنید.
2. Deploy > Manage deployments
3. Deployment فعلی که URL بالا را دارد انتخاب کنید.
4. Edit
5. Version > New version
6. Deploy

New deployment نسازید. با Edit کردن Deployment فعلی، URL `/exec` تغییر نمی‌کند.

## تست بعد از Deploy

باز کردن URL `/exec` باید JSON شامل موارد زیر برگرداند:

- `ok: true`
- `service: Digiexpress Agents`
- `apiVersion: 372-refresh-v2`
- Spreadsheet ID صحیح

سپس DigiExpress را Refresh کنید و در Agents یک بار Rejected Shipments Synchronizer را Run Now کنید.
