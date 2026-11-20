# PlanningExtension v517 — اصلاح Shipping Network TD

- هدر واقعی `shipping network id` در جدول Time Distance به‌عنوان ستون نام شبکه شناخته می‌شود.
- پس از استخراج صفحات، نام‌های یکتا از تب `Shipping Network` تطبیق داده می‌شوند.
- برای نام‌هایی که بیش از یک شناسه متفاوت دارند، Details در تب‌های مخفی باز و شناسه داخل براکت استخراج می‌شود.
- فایل Apps Script همراه بسته باید جایگزین و Web App به‌صورت نسخه جدید Deploy شود؛ نسخه قدیمی تب `Shipping Network TD` را رد می‌کند.
- حداقل Host همچنان `13.0.21` است و این نسخه تغییری در Host ندارد.
