# v490 — Access Sheet is authoritative for the entire catalog

- نمایش تمام برنامه‌ها فقط بر اساس نتیجه `GET_VISIBLE_OPERATIONS` و ستون‌های Google Sheet دسترسی انجام می‌شود.
- استثناء UI برای `accessControl: public` حذف شد.
- برنامه‌هایی که قبلاً public بودند (`GANJE Follow-up`, `Drop Close Capacity`, `FBM Request`) اکنون مانند بقیه برنامه‌ها تحت کنترل ستون Access Sheet هستند.
- مقدار `All` در ستون مربوط به برنامه همچنان دسترسی عمومی واقعی ایجاد می‌کند؛ این تصمیم در Host/Access Sheet انجام می‌شود، نه در UI.
- عملیات External URL نیز قبل از باز شدن `CHECK_OPERATION_ACCESS` را اجرا می‌کند.
- Host تغییر نکرده و نسخه 13.0.18 باقی می‌ماند، چون Host از قبل Google Sheet را مرجع نهایی دسترسی قرار می‌دهد.
