# Rejected Shipments Destination — v374

نسخه v374 مسیر Destination را مطابق مراحل واقعی بازطراحی می‌کند.

1. Worker جدیدترین ردیف Rejected Shipments با Destination خالی را claim می‌کند؛ baseline قدیمی حذف شده تا هیچ ردیف جاافتاده‌ای برای همیشه نادیده گرفته نشود.
2. صفحه `/shipment/` باز می‌شود و `id` در `input[name="id"]` قرار می‌گیرد.
3. به جای شبیه‌سازی صرف کلید Enter، خود فرم با `submitNearestForm` ارسال می‌شود و پایان navigation صبر می‌شود.
4. لینک Routes با `shipment_id` باز می‌شود و تا ظاهر شدن لینک Steps صبر می‌کند.
5. Steps باز می‌شود و جدول route-step منتظر می‌ماند.
6. لینک موجود در ستون `shipping network capacity id` با selectorهای URL/data-code سازگار پیدا و باز می‌شود.
7. در صفحه بعد، لینک ستون `shipping network` از اولین ردیف پیدا و باز می‌شود.
8. جدول صفحه Shipping Network استخراج می‌شود و Apps Script مقدار ستون `coverage polygon id` را در Destination همان ID می‌نویسد.

Apps Script باید همان deployment قبلی را به New version ارتقا دهد. پس از Deploy، `/exec` باید `apiVersion: 374-destination-v2` را گزارش کند.
