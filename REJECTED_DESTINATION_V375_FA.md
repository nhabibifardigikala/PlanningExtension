# Rejected Shipments Destination — v375

این نسخه خطای `ensureRejectedDestinationColumn_ is not defined` را اصلاح می‌کند.

علت: در v374 توابع `claimRejectedDestination_`، `completeRejectedDestination_` و `appendRejected_` تابع کمکی `ensureRejectedDestinationColumn_` را فراخوانی می‌کردند، اما تعریف آن به فایل Apps Script نهایی وارد نشده بود.

در v375 تابع اضافه شده و این رفتار را دارد:
- اگر شیت خالی باشد، Headerهای استاندارد Rejected Shipments را همراه ستون `Destination` ایجاد می‌کند.
- اگر ستون `Destination` از قبل وجود داشته باشد، هیچ تغییری ایجاد نمی‌کند.
- اگر ستون وجود نداشته باشد، آن را در انتهای Header اضافه می‌کند.

API version: `375-destination-v3`

پس از جایگزینی Code.gs، همان Web App deployment قبلی را از Manage deployments با New version به‌روزرسانی کنید تا URL ثابت بماند.
