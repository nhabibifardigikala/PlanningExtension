# PlanningExtension v518 — کلید ترکیبی Shipping Network

- تب `Shipping Network` ستون نام مستقل ندارد؛ کلید شبکه از اتصال دقیق `From Shipping Point` و `To Shipping Point` ساخته می‌شود.
- نام ساخته‌شده با مقدار ستون `SHIPPING NETWORK ID` صفحه Time Distance مقایسه می‌شود.
- اگر کلید ترکیبی فقط یک ID داشته باشد، ID مستقیماً از Google Sheet گرفته می‌شود.
- اگر یک کلید ترکیبی چند ID متفاوت داشته باشد، Details در تب مخفی باز و ID داخل براکت خوانده می‌شود.
- کلید ترکیبی فقط در پاسخ خواندنی Apps Script ساخته می‌شود و خود تب `Shipping Network` تغییر نمی‌کند.
- Host همان نسخه `13.0.21` باقی می‌ماند و نیازی به به‌روزرسانی جدید Host نیست.
