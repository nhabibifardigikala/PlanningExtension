# GANJE Network Management — Remote v379

این نسخه فقط عملیات جدید **GANJE Network Management** را به Remote اضافه می‌کند و Host 13.0.5 بدون تغییر می‌ماند.

## کنترل دسترسی
نمایش و اجرای عملیات با ستون `GANJE Network Management` در Google Sheet دسترسی‌ها کنترل می‌شود. Worker داخلی نیز همان access header را دارد.

## قابلیت‌ها
- ایجاد Shipping Network از Excel
- غیرفعال‌سازی قدیمی‌ترین یا همه Networkهای فعال، با گزینه حفظ تنها Network فعال
- فعال‌سازی قدیمی‌ترین، جدیدترین یا همه Networkهای غیرفعال با تطبیق مرکز/پرنت
- ایجاد Mid-mile Capacity با Start Hub / End Hub و تاریخ‌ها
- غیرفعال‌سازی Time Distance به‌صورت مستقل یا پس از غیرفعال‌سازی Network
- توقف، Progress، Log و خروجی Excel

## Excel
ستون‌ها: `نام مرکز`، `نام پرنت`، `کد پرنت`، `تاریخ شروع`، `تاریخ پایان`.

هیچ فایل Host تغییر نکرده است.
