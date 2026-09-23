# Rejected Destination v376

در v376 خالی بودن نتیجه در هر مرحله از مسیر Destination یک نتیجه معتبر است، نه خطای Agent.

اگر Shipment نتیجه نداشته باشد، Routes یا Steps موجود نباشد، جدول میانی خالی باشد، Shipping Network Capacity پیدا نشود، اولین Shipping Network وجود نداشته باشد یا جدول نهایی Coverage Polygon خالی باشد، Workflow ادامه نمی‌دهد و بدون Failure به Apps Script برمی‌گردد. Apps Script مقدار `یافت نشد` را در ستون `Destination` همان ردیف می‌نویسد و Claim آزاد می‌شود؛ اجرای بعدی Worker سراغ ردیف بعدی می‌رود.

خطاهای زیرساختی واقعی مانند عدم Login، خطای شبکه یا عدم امکان Submit فرم همچنان Failure باقی می‌مانند.

Host بدون تغییر روی 13.0.5 باقی می‌ماند.
