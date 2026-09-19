const WEEKLY_PLANNING_SPREADSHEET_ID = '1t1rX8DEIIhPztSrxcRQIuZCwy5cYxRFomZWKdp6sHNg';
const WEEKLY_PLANNING_SHEET = 'Tasks';
const WEEKLY_HEADERS = ['L1','L2','L3','Task Name','Group','Priority','Time','Status','Responsible','Add Date','Due Date','Planned Date','Completion Date'];
const WEEKLY_EDITABLE = new Set(['Priority','Time','Responsible','Planned Date','Completion Date','Status','Due Date']);

function doGet() {
  return json_({ok:true, service:'Weekly Planning', spreadsheetId:WEEKLY_PLANNING_SPREADSHEET_ID, sheetName:WEEKLY_PLANNING_SHEET});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').trim();
    assertTarget_(body);
    if (action === 'ping') return json_({ok:true, message:'Weekly Planning Web App connected.'});
    if (action === 'updateTask') return json_(updateTask_(body));
    if (action === 'appendTask') return json_(appendTask_(body));
    throw new Error('Unsupported Weekly Planning action: ' + action);
  } catch (err) {
    return json_({ok:false, error:String(err && err.message || err)});
  }
}

function assertTarget_(body) {
  const requestedId = String(body.spreadsheetId || WEEKLY_PLANNING_SPREADSHEET_ID).trim();
  const requestedSheet = String(body.sheetName || WEEKLY_PLANNING_SHEET).trim();
  if (requestedId !== WEEKLY_PLANNING_SPREADSHEET_ID) throw new Error('Spreadsheet is not allowed.');
  if (requestedSheet !== WEEKLY_PLANNING_SHEET) throw new Error('Sheet is not allowed.');
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(WEEKLY_PLANNING_SPREADSHEET_ID);
  const sh = ss.getSheetByName(WEEKLY_PLANNING_SHEET);
  if (!sh) throw new Error('Tasks sheet was not found.');
  return sh;
}

function headerMap_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), WEEKLY_HEADERS.length);
  const headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(v => String(v || '').trim());
  const map = {};
  headers.forEach((h, i) => { if (h) map[norm_(h)] = i + 1; });
  const missing = WEEKLY_HEADERS.filter(h => !map[norm_(h)]);
  if (missing.length) throw new Error('Missing Tasks columns: ' + missing.join(', '));
  return {headers, map};
}

function norm_(v) {
  return String(v || '').trim().toLowerCase().replace(/[\s_\-]+/g, '');
}

function cleanValue_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function resolveRow_(sh, rowNumber, identity, hm) {
  const lastRow = sh.getLastRow();
  let row = Number(rowNumber || 0);
  if (row >= 2 && row <= lastRow && identityMatches_(sh, row, identity, hm)) return row;
  if (!identity || !Object.keys(identity).length) throw new Error('Task row is no longer available. Refresh Weekly Planning and try again.');
  const cols = ['L1','L2','L3','Task Name'];
  const values = sh.getRange(2, 1, Math.max(0, lastRow - 1), sh.getLastColumn()).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    let ok = true;
    for (const key of cols) {
      const col = hm.map[norm_(key)];
      if (!col) continue;
      if (cleanValue_(values[i][col - 1]) !== cleanValue_(identity[key])) { ok = false; break; }
    }
    if (ok) return i + 2;
  }
  throw new Error('Task could not be found. Refresh Weekly Planning and try again.');
}

function identityMatches_(sh, row, identity, hm) {
  if (!identity || !Object.keys(identity).length) return true;
  for (const key of ['L1','L2','L3','Task Name']) {
    if (!(key in identity)) continue;
    const col = hm.map[norm_(key)];
    if (!col) continue;
    const current = cleanValue_(sh.getRange(row, col).getDisplayValue());
    if (current !== cleanValue_(identity[key])) return false;
  }
  return true;
}

function updateTask_(body) {
  const sh = getSheet_();
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const hm = headerMap_(sh);
    const row = resolveRow_(sh, body.rowNumber, body.identity || {}, hm);
    const values = body.values && typeof body.values === 'object' ? body.values : {};
    const keys = Object.keys(values);
    if (!keys.length) throw new Error('No task values were provided.');
    keys.forEach(key => {
      if (!WEEKLY_EDITABLE.has(key)) throw new Error('Column is not editable: ' + key);
      const col = hm.map[norm_(key)];
      if (!col) throw new Error('Tasks column was not found: ' + key);
      sh.getRange(row, col).setValue(cleanValue_(values[key]));
    });
    SpreadsheetApp.flush();
    return {ok:true, rowNumber:row, updated:Object.keys(values)};
  } finally {
    lock.releaseLock();
  }
}

function appendTask_(body) {
  const sh = getSheet_();
  const task = body.task && typeof body.task === 'object' ? body.task : {};
  if (!cleanValue_(task['Task Name'])) throw new Error('Task Name is required.');
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const hm = headerMap_(sh);
    const row = Math.max(2, sh.getLastRow() + 1);
    WEEKLY_HEADERS.forEach(header => {
      const col = hm.map[norm_(header)];
      sh.getRange(row, col).setValue(cleanValue_(task[header]));
    });
    SpreadsheetApp.flush();
    return {ok:true, rowNumber:row};
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
