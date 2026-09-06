const CONFIG = Object.freeze({
  spreadsheetId: '1V3f1IGEzP5Pafrs-8ww9CiZUBI-a9CNnXOB0KbOFb0w',
  sheetName: 'Process',
  gid: '1145346179',
  cacheKey: 'systemsMethodsProcessesCacheV1'
});

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit#gid=${CONFIG.gid}`;
const CSV_URL = `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/gviz/tq?tqx=out:csv&gid=${CONFIG.gid}`;

const FALLBACK_ROWS = [
  ['گنجه','تغییر ساعت کاری گنجدارها','1','بررسی پرنت گنجه','فایل تایم دیستنس',''],
  ['گنجه','تغییر ساعت کاری گنجدارها','2','محاسبه تایم دیستنس جدید','فایل تایم دیستنس',''],
  ['گنجه','تغییر ساعت کاری گنجدارها','3','تکمیل تمپلیت دیجی کالا','تمپلیت دیجی کالا',''],
  ['گنجه','تغییر ساعت کاری گنجدارها','4','ارسال تمپلیت به دیجی کالا','ایمیل','نیلوفر، لیلا، علیرضا، امیررضا'],
  ['گنجه','تغییر نام/ آدرس مرکز گنجه','1','تغییر نام در فایل تایم دیستنس','فایل تایم دیستنس',''],
  ['گنجه','تغییر نام/ آدرس مرکز گنجه','2','تکمیل تمپلیت دیجی کالا','تمپلیت دیجی کالا',''],
  ['گنجه','تغییر نام مرکز گنجه','3','ارسال تمپلیت به دیجی کالا','ایمیل','علیرضا، امیررضا'],
  ['گنجه','تعیین پرنت مرکز گنجه','1','ایجاد اکسل از لت و لانگ مراکز جدید','',''],
  ['گنجه','تعیین پرنت مرکز گنجه','2','استفاده از عملیات تعیین پرنت در اکستنشن','',''],
  ['گنجه','محاسبه تایم دیستنس مراکز','1','تعیین پرنت مرکز','',''],
  ['گنجه','محاسبه تایم دیستنس مراکز','2','تعیین ساعت شروع مرکز','',''],
  ['گنجه','محاسبه تایم دیستنس مراکز','3','محاسبه تایم دیستنس','فایل تایم دیستنس','']
];



const state = {
  rows: [],
  processes: [],
  selectedCategory: 'همه',
  query: '',
  source: 'loading'
};

const els = {
  processList: document.getElementById('processList'),
  categoryFilters: document.getElementById('categoryFilters'),
  searchInput: document.getElementById('searchInput'),
  clearSearch: document.getElementById('clearSearch'),
  refreshBtn: document.getElementById('refreshBtn'),
  retryBtn: document.getElementById('retryBtn'),
  openSheetBtn: document.getElementById('openSheetBtn'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  emptyState: document.getElementById('emptyState'),
  errorMessage: document.getElementById('errorMessage'),
  processCount: document.getElementById('processCount'),
  statusPill: document.getElementById('statusPill'),
  statusText: document.getElementById('statusText')
};

function normalize(value) {
  return String(value ?? '')
    .replace(/\u200c/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => String(value).trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  if (row.some(value => String(value).trim() !== '')) rows.push(row);
  return rows;
}

function rowsFromCSV(csvText) {
  const parsed = parseCSV(csvText);
  if (parsed.length < 2) return [];

  const headers = parsed[0].map(normalize);
  const aliases = {
    category: ['کتگوری', 'دسته بندی', 'دسته‌بندی'],
    process: ['نام فرآیند', 'نام فرایند'],
    stepNumber: ['شماره مرحله'],
    stepTitle: ['عنوان مرحله'],
    source: ['لینک / منبع', 'لینک/منبع', 'لینک', 'منبع'],
    description: ['توضیحات', 'توضیح']
  };

  const findIndex = keys => headers.findIndex(header => keys.some(key => normalize(key) === header));
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, keys]) => [key, findIndex(keys)]));

  if (indexes.category < 0 || indexes.process < 0 || indexes.stepTitle < 0) {
    throw new Error('ساختار ستون‌های Google Sheet با قالب مورد انتظار مطابقت ندارد.');
  }

  return parsed.slice(1).map(cells => [
    cells[indexes.category] ?? '',
    cells[indexes.process] ?? '',
    indexes.stepNumber >= 0 ? cells[indexes.stepNumber] ?? '' : '',
    cells[indexes.stepTitle] ?? '',
    indexes.source >= 0 ? cells[indexes.source] ?? '' : '',
    indexes.description >= 0 ? cells[indexes.description] ?? '' : ''
  ]).filter(row => row.some(value => String(value).trim()));
}

function toObjects(rows) {
  return rows.map((row, index) => ({
    category: String(row[0] ?? '').trim() || 'بدون کتگوری',
    process: String(row[1] ?? '').trim() || 'فرآیند بدون نام',
    stepNumber: String(row[2] ?? '').trim() || String(index + 1),
    stepTitle: String(row[3] ?? '').trim() || 'مرحله بدون عنوان',
    source: String(row[4] ?? '').trim(),
    description: String(row[5] ?? '').trim()
  }));
}

function groupProcesses(rows) {
  const grouped = new Map();
  toObjects(rows).forEach(item => {
    const key = `${item.category}|||${item.process}`;
    if (!grouped.has(key)) {
      grouped.set(key, { key, category: item.category, name: item.process, steps: [] });
    }
    grouped.get(key).steps.push(item);
  });

  return [...grouped.values()].map(process => ({
    ...process,
    steps: process.steps.sort((a, b) => {
      const an = Number.parseFloat(a.stepNumber);
      const bn = Number.parseFloat(b.stepNumber);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.stepNumber.localeCompare(b.stepNumber, 'fa');
    })
  }));
}

function extractUrl(value) {
  if (!value) return null;
  const match = String(value).match(/https?:\/\/[^\s<>()]+/i);
  if (!match) return null;
  return match[0].replace(/[،,.;]+$/, '');
}

function setStatus(type, text) {
  state.source = type;
  els.statusPill?.classList.remove('live', 'cached', 'error');
  if (type !== 'loading') els.statusPill?.classList.add(type);
  if (els.statusText) els.statusText.textContent = text;
}

function setLoading(isLoading) {
  els.loadingState.hidden = !isLoading;
  els.refreshBtn.classList.toggle('spinning', isLoading);
  els.refreshBtn.disabled = isLoading;
}

function getCache() {
  try {
    const raw = localStorage.getItem(CONFIG.cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.rows) || !parsed.rows.length) return null;
    return { rows: parsed.rows, savedAt: Number(parsed.savedAt || 0) || Date.now() };
  } catch (_) {
    return null;
  }
}

function saveCache(rows) {
  try {
    localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ rows, savedAt: Date.now() }));
  } catch (_) {}
}

function rowsFromGviz(payload) {
  const table = payload?.table;
  const cols = Array.isArray(table?.cols) ? table.cols : [];
  const dataRows = Array.isArray(table?.rows) ? table.rows : [];
  if (!cols.length || !dataRows.length) return [];

  const headers = cols.map(col => normalize(col?.label || col?.id || ''));
  const aliases = {
    category: ['کتگوری', 'دسته بندی', 'دسته‌بندی'],
    process: ['نام فرآیند', 'نام فرایند'],
    stepNumber: ['شماره مرحله'],
    stepTitle: ['عنوان مرحله'],
    source: ['لینک / منبع', 'لینک/منبع', 'لینک', 'منبع'],
    description: ['توضیحات', 'توضیح']
  };

  const findIndex = keys => headers.findIndex(header => keys.some(key => normalize(key) === header));
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, keys]) => [key, findIndex(keys)]));
  if (indexes.category < 0 || indexes.process < 0 || indexes.stepTitle < 0) {
    throw new Error('ساختار ستون‌های Google Sheet با قالب مورد انتظار مطابقت ندارد.');
  }

  const cellValue = (row, index) => {
    if (index < 0) return '';
    const cell = row?.c?.[index];
    if (!cell) return '';
    if (cell.f !== undefined && cell.f !== null) return String(cell.f);
    return cell.v === undefined || cell.v === null ? '' : String(cell.v);
  };

  return dataRows.map(row => [
    cellValue(row, indexes.category),
    cellValue(row, indexes.process),
    cellValue(row, indexes.stepNumber),
    cellValue(row, indexes.stepTitle),
    cellValue(row, indexes.source),
    cellValue(row, indexes.description)
  ]).filter(row => row.some(value => String(value).trim()));
}

function fetchSheetViaJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = `__dxProcessLearning_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('زمان دریافت Google Sheet به پایان رسید.')), 15000);
    let settled = false;

    function cleanup() {
      clearTimeout(timer);
      script.remove();
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
    }

    function finish(error, value) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(value);
    }

    window[callbackName] = payload => {
      try {
        if (payload?.status === 'error') {
          const detail = payload?.errors?.[0]?.detailed_message || payload?.errors?.[0]?.message || 'Google Sheet پاسخ نامعتبر داد.';
          finish(new Error(detail));
          return;
        }
        const rows = rowsFromGviz(payload);
        if (!rows.length) throw new Error('Google Sheet داده قابل نمایش ندارد.');
        finish(null, rows);
      } catch (error) {
        finish(error);
      }
    };

    script.async = true;
    script.onerror = () => finish(new Error('اتصال به Google Sheet برقرار نشد.'));
    const tqx = encodeURIComponent(`out:json;responseHandler:${callbackName}`);
    script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/gviz/tq?gid=${CONFIG.gid}&tqx=${tqx}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

async function fetchRows() {
  try {
    const rows = await fetchSheetViaJsonp();
    saveCache(rows);
    return { rows, source: 'live', savedAt: Date.now(), warning: '' };
  } catch (error) {
    const cached = getCache();
    if (cached?.rows?.length) {
      return {
        rows: cached.rows,
        source: 'cached',
        savedAt: cached.savedAt,
        warning: `${error.message || 'دریافت داده زنده ناموفق بود.'}؛ آخرین نسخه ذخیره‌شده نمایش داده می‌شود.`
      };
    }
    throw error;
  }
}

async function loadData({ force = false } = {}) {
  setLoading(true);
  els.errorState.hidden = true;
  setStatus('loading', 'در حال دریافت داده…');

  try {
    const result = await fetchRows();
    state.rows = result.rows;
    state.processes = groupProcesses(result.rows);
    if (result.source === 'cached') {
      const ageMinutes = Math.max(1, Math.round((Date.now() - result.savedAt) / 60000));
      setStatus('cached', `نسخه ذخیره‌شده · ${ageMinutes} دقیقه قبل`);
    } else {
      setStatus('live', 'داده زنده');
    }
    renderAll();
    if (result.warning && force) {
      els.errorState.hidden = false;
      els.errorMessage.textContent = result.warning;
    }
  } catch (error) {
    if (FALLBACK_ROWS.length) {
      state.rows = FALLBACK_ROWS;
      state.processes = groupProcesses(FALLBACK_ROWS);
      setStatus('cached', 'نمونه داخلی');
      renderAll();
      if (force) {
        els.errorState.hidden = false;
        els.errorMessage.textContent = `${error.message}؛ داده نمونه فعلی نمایش داده شده است.`;
      }
    } else {
      state.rows = [];
      state.processes = [];
      setStatus('error', 'خطا در دریافت');
      els.errorState.hidden = false;
      els.errorMessage.textContent = error.message || 'اتصال به Google Sheet برقرار نشد.';
      renderAll();
    }
  } finally {
    setLoading(false);
  }
}

function getFilteredProcesses() {
  const q = normalize(state.query);
  return state.processes.filter(process => {
    const categoryMatch = state.selectedCategory === 'همه' || process.category === state.selectedCategory;
    if (!categoryMatch) return false;
    if (!q) return true;

    const searchable = [
      process.category,
      process.name,
      ...process.steps.flatMap(step => [step.stepNumber, step.stepTitle, step.source, step.description])
    ].map(normalize).join(' ');

    return searchable.includes(q);
  });
}

function renderFilters() {
  const categories = ['همه', ...new Set(state.processes.map(process => process.category))];
  if (!categories.includes(state.selectedCategory)) state.selectedCategory = 'همه';
  els.categoryFilters.replaceChildren();

  categories.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-chip${state.selectedCategory === category ? ' active' : ''}`;
    button.textContent = category;
    button.setAttribute('role', 'listitem');
    button.addEventListener('click', () => {
      state.selectedCategory = category;
      renderAll();
    });
    els.categoryFilters.appendChild(button);
  });
}

function createDetailRow(label, value, isSource = false) {
  const row = document.createElement('div');
  row.className = 'detail-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'detail-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'detail-value';

  if (isSource) {
    const tag = document.createElement('span');
    tag.className = 'source-tag';
    tag.textContent = value || '—';
    valueEl.appendChild(tag);
  } else {
    valueEl.textContent = value || 'توضیحی ثبت نشده است.';
  }

  row.append(labelEl, valueEl);
  return row;
}

function createStep(step) {
  const item = document.createElement('div');
  item.className = 'step-item';

  const number = document.createElement('div');
  number.className = 'step-number';
  number.textContent = step.stepNumber;

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'step-card';

  const top = document.createElement('div');
  top.className = 'step-top';

  const title = document.createElement('span');
  title.className = 'step-title';
  title.textContent = step.stepTitle;

  const url = extractUrl(step.source);
  const action = document.createElement('span');
  action.className = 'step-action';
  action.textContent = url ? '↗' : '⌄';
  action.setAttribute('aria-hidden', 'true');
  top.append(title, action);

  const subline = document.createElement('div');
  subline.className = 'step-subline';
  subline.textContent = url ? 'لینک این مرحله در تب جدید باز می‌شود' : (step.source ? `منبع: ${step.source}` : 'مشاهده جزئیات مرحله');

  const detail = document.createElement('div');
  detail.className = 'step-detail';
  if (step.source) detail.appendChild(createDetailRow('منبع', step.source, true));
  detail.appendChild(createDetailRow('توضیحات', step.description));

  card.append(top, subline, detail);
  card.addEventListener('click', event => {
    event.stopPropagation();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    card.classList.toggle('expanded');
    action.textContent = card.classList.contains('expanded') ? '⌃' : '⌄';
  });

  item.append(number, card);
  return item;
}

function getProcessIcon(process) {
  const text = normalize(`${process.name} ${process.category}`);

  if (text.includes('پرنت') || text.includes('ساختار') || text.includes('والد')) {
    return {
      className: 'icon-hierarchy',
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="5" rx="1.5"></rect><rect x="3" y="16" width="6" height="5" rx="1.5"></rect><rect x="15" y="16" width="6" height="5" rx="1.5"></rect><path d="M12 8v4M6 16v-4h12v4"></path></svg>'
    };
  }

  if (text.includes('محاسبه') || text.includes('فاصله') || text.includes('دیستنس')) {
    return {
      className: 'icon-calculator',
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.2"></rect><path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01"></path></svg>'
    };
  }

  if (text.includes('آدرس') || text.includes('نام')) {
    return {
      className: 'icon-location',
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"></path><circle cx="12" cy="10" r="2.3"></circle></svg>'
    };
  }

  if (text.includes('ساعت') || text.includes('تایم') || text.includes('زمان')) {
    return {
      className: 'icon-clock',
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5l3.5 2"></path></svg>'
    };
  }

  return {
    className: 'icon-checklist',
    svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2"></rect><path d="m8.5 9 1.2 1.2L12 8M13.5 10H16M8.5 14l1.2 1.2L12 13M13.5 15H16"></path></svg>'
  };
}

function createProcessCard(process, autoOpen = false) {
  const article = document.createElement('article');
  article.className = `process-card${autoOpen ? ' open' : ''}`;

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'process-header';
  header.setAttribute('aria-expanded', String(autoOpen));

  const icon = document.createElement('div');
  const iconData = getProcessIcon(process);
  icon.className = `process-icon ${iconData.className}`;
  icon.innerHTML = iconData.svg;
  icon.setAttribute('aria-hidden', 'true');

  const main = document.createElement('div');
  main.className = 'process-main';
  const title = document.createElement('h2');
  title.textContent = process.name;

  const meta = document.createElement('div');
  meta.className = 'process-meta';
  const category = document.createElement('span');
  category.className = 'category-badge';
  category.textContent = process.category;
  const count = document.createElement('span');
  count.className = 'step-count';
  count.textContent = `${process.steps.length} مرحله`;
  meta.append(category, count);
  main.append(title, meta);

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = '⌄';
  chevron.setAttribute('aria-hidden', 'true');
  header.append(icon, main, chevron);

  const stepsWrap = document.createElement('div');
  stepsWrap.className = 'steps-wrap';
  const timeline = document.createElement('div');
  timeline.className = 'timeline';
  process.steps.forEach(step => timeline.appendChild(createStep(step)));
  stepsWrap.appendChild(timeline);

  header.addEventListener('click', () => {
    const isOpen = article.classList.toggle('open');
    header.setAttribute('aria-expanded', String(isOpen));
  });

  article.append(header, stepsWrap);
  return article;
}

function renderProcesses() {
  const filtered = getFilteredProcesses();
  els.processList.replaceChildren();
  els.emptyState.hidden = filtered.length > 0 || state.processes.length === 0;

  const autoOpen = normalize(state.query).length > 0;
  filtered.forEach(process => els.processList.appendChild(createProcessCard(process, autoOpen)));
}

function renderAll() {
  renderFilters();
  renderProcesses();
  if (els.processCount) els.processCount.textContent = String(state.processes.length);
  els.clearSearch.hidden = !state.query;
  if (state.processes.length > 0) els.errorState.hidden = true;
}

els.searchInput.addEventListener('input', event => {
  state.query = event.target.value;
  renderAll();
});

els.clearSearch.addEventListener('click', () => {
  state.query = '';
  els.searchInput.value = '';
  els.searchInput.focus();
  renderAll();
});

els.refreshBtn.addEventListener('click', () => loadData({ force: true }));
els.retryBtn.addEventListener('click', () => loadData({ force: true }));
els.openSheetBtn.addEventListener('click', () => window.open(SHEET_URL, '_blank', 'noopener,noreferrer'));

loadData();
