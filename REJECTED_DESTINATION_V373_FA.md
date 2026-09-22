# Rejected Shipments Destination — v373

این نسخه یک ستون `Destination` به شیت `Rejected Shipments` اضافه می‌کند و مقدار آن را برای ردیف‌های جدید با استفاده از Session لاگین‌شده مرورگر در Drop Shipping استخراج می‌کند.

## جریان

1. Rejected Shipments Synchronizer مانند قبل فقط IDهای جدیدتر از watermark شیت را استخراج و append می‌کند.
2. Apps Script در اولین اجرای v373 ستون `Destination` را در انتهای شیت ایجاد می‌کند.
3. یک Worker پس‌زمینه با فاصله 1 دقیقه، اولین ردیف جدیدی را که Destination خالی دارد claim می‌کند.
4. Worker با Host 13.0.5 و Remote workflow وارد `https://drop-shipping.digikala.com/shipment/` می‌شود، shipment ID را جستجو می‌کند، Routes → Steps → Shipping Network Capacity → اولین Shipping Network را باز می‌کند و جدول صفحه نهایی را می‌خواند.
5. Apps Script ستون `coverage polygon id` را از جدول نتیجه پیدا می‌کند و مقدار آن را در ستون `Destination` همان shipment می‌نویسد.
6. اگر مرحله‌ای خطا دهد، claim بعد از 15 دقیقه منقضی می‌شود و Job در اجرای بعدی دوباره تلاش می‌کند.

## نکته مهاجرت

برای جلوگیری از پردازش کل تاریخچه، اولین بار که v373 فعال می‌شود بزرگ‌ترین ID فعلی شیت به‌عنوان baseline ذخیره می‌شود. بنابراین Destination فقط برای ردیف‌هایی که بعد از فعال شدن v373 اضافه می‌شوند پر می‌شود.

## Deploy Apps Script

فایل `data-set-update/appsscript/Code.gs` را در Apps Script فعلی جایگزین کنید و از `Deploy → Manage deployments → Edit → New version → Deploy` همان Deployment قبلی را به‌روزرسانی کنید. URL `/exec` تغییر نمی‌کند.

بعد از Deploy، باز کردن `/exec` باید `apiVersion: 373-destination-v1` را برگرداند.
