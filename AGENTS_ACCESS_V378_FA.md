# کنترل دسترسی Agents — v378

در v378 همه Jobهای زیرمجموعه **Agents** قبل از هر اجرای دستی یا زمان‌بندی‌شده از یک Gate داخلی با شناسه `agents-access-gate` عبور می‌کنند. این Gate فقط از ستون **Agents** در Google Sheet دسترسی‌ها استفاده می‌کند.

اگر ایمیل کاربر در ستون Agents مجاز نباشد، عملیات اصلی Agent و pre-operationهای آن اجرا نمی‌شوند. این کنترل در خود مسیر اجرای Stable Jobs قرار گرفته است، بنابراین فقط مخفی‌کردن UI نیست.

برای سازگاری با Host 13.0.5، Gate به‌صورت Remote operation پیاده‌سازی شده است و Host تغییر نکرده است. Scheduler ممکن است Alarm را بیدار کند، اما قبل از اجرای عملیات محافظت‌شده، access check انجام می‌شود و در صورت عدم دسترسی متوقف می‌شود.

Jobهای تحت پوشش:
- Distribution Centers Extractor
- Pickup Polygons Extractor
- Delivery Polygons Extractor
- IATA Code Synchronizer
- Rejected Shipments Synchronizer

در اجرای دستی و هنگام فعال‌کردن Automatic update نیز UI ابتدا دسترسی Agents را بررسی می‌کند.
