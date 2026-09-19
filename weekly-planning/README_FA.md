# Weekly Planning

این برنامه داده‌ها را از Google Sheet زیر می‌خواند:

- Spreadsheet ID: `1t1rX8DEIIhPztSrxcRQIuZCwy5cYxRFomZWKdp6sHNg`
- Sheet: `Tasks`

## ستون‌های مورد انتظار

`L1`, `L2`, `L3`, `Task Name`, `Group`, `Priority`, `Time`, `Status`, `Responsible`, `Add Date`, `Due Date`, `Planned Date`, `Completion Date`

خواندن اطلاعات مستقیماً با Stable Host و حساب Google لاگین‌شده در Chrome انجام می‌شود.

## فعال‌کردن ویرایش

برای ثبت تغییرات در Google Sheet، فایل `appsscript/Code.gs` را در یک Google Apps Script Project قرار دهید و Web App را Deploy کنید.

پیشنهاد تنظیم Deployment:

- Execute as: Me
- Who has access: کاربران مجاز سازمان / یا تنظیمی که با سیاست داخلی شما سازگار است

پس از Deploy، URL نهایی `/exec` را در **Weekly Planning → Settings → Google Apps Script Web App URL** وارد کنید.

این Web App فقط Spreadsheet و Sheet مشخص‌شده در کد را قبول می‌کند و فقط عملیات‌های زیر را انجام می‌دهد:

- ویرایش Priority / Time / Responsible / Planned Date / Completion Date / Status / Due Date
- افزودن Task جدید

## Responsible

لیست Responsible از Settings خود Weekly Planning خوانده می‌شود. هر نام را در یک خط وارد کنید. این لیست در `chrome.storage.local` ذخیره می‌شود و در Dropdownهای Tasks، Plan و New Task استفاده می‌شود.
