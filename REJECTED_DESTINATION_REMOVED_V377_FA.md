# حذف کامل Destination enrichment — v377

قابلیت جدید Destination به طور کامل از Rejected Shipments Synchronizer حذف شده است.

- Worker با نام `Rejected Shipments Destination Worker` حذف شد.
- sub-operation با شناسه `resolve-destination` حذف شد.
- endpointهای Apps Script مربوط به claim/update/complete Destination دیگر وجود ندارند.
- ستون `Destination` دیگر جزو schema شیت `Rejected Shipments` نیست.
- در اولین درخواست عادی Rejected Shipments بعد از Deploy v377، اگر ستون قدیمی با نام دقیق `Destination` در Google Sheet وجود داشته باشد، Apps Script همان ستون را حذف می‌کند.
- ستون‌های اصلی `destination_address` و `destination_shipping_point` حذف نشده‌اند؛ این دو جزو داده اصلی Rejected Shipments هستند.
- منطق اصلی Synchronizer (watermark بر پایه maxId، استخراج رکوردهای جدید و append) حفظ شده است.
- Dashboard و منطق refresh نسخه v372 حفظ شده و فقط API version به `377-core-v1` تغییر کرده است.
- Host همچنان 13.0.5 و بدون تغییر است.
