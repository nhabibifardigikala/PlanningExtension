/* Minimal XLSX reader for the first worksheet. Supports ordinary .xlsx/.xlsm files
   whose ZIP entries use STORE or DEFLATE. No external libraries are required. */
(function (global) {
  'use strict';

  function u16(a, o) { return a[o] | (a[o + 1] << 8); }
  function u32(a, o) { return (a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24)) >>> 0; }
  function text(bytes) { return new TextDecoder('utf-8').decode(bytes); }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('مرورگر از DecompressionStream پشتیبانی نمی‌کند. Chrome را به‌روز کنید.');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const a = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = a.length - 22; i >= Math.max(0, a.length - 65557); i--) {
      if (u32(a, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ساختار ZIP فایل Excel معتبر نیست.');
    const entries = u16(a, eocd + 10);
    const cdOffset = u32(a, eocd + 16);
    let p = cdOffset;
    const files = new Map();

    for (let n = 0; n < entries; n++) {
      if (u32(a, p) !== 0x02014b50) throw new Error('Central Directory فایل Excel نامعتبر است.');
      const method = u16(a, p + 10);
      const compSize = u32(a, p + 20);
      const nameLen = u16(a, p + 28);
      const extraLen = u16(a, p + 30);
      const commentLen = u16(a, p + 32);
      const localOffset = u32(a, p + 42);
      const name = text(a.slice(p + 46, p + 46 + nameLen));

      if (u32(a, localOffset) !== 0x04034b50) throw new Error('Local ZIP header نامعتبر است.');
      const localNameLen = u16(a, localOffset + 26);
      const localExtraLen = u16(a, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = a.slice(dataStart, dataStart + compSize);
      let content;
      if (method === 0) content = compressed;
      else if (method === 8) content = await inflateRaw(compressed);
      else throw new Error('روش فشرده‌سازی Excel پشتیبانی نمی‌شود: ' + method);
      files.set(name, content);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function xmlDoc(bytes) {
    const doc = new DOMParser().parseFromString(text(bytes), 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('خطا در خواندن XML داخل Excel.');
    return doc;
  }

  function colIndex(ref) {
    const m = String(ref || '').match(/^([A-Z]+)/i);
    if (!m) return 0;
    let n = 0;
    for (const ch of m[1].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n - 1;
  }

  function nodeText(node) { return node ? node.textContent || '' : ''; }

  async function read(file) {
    const files = await unzip(await file.arrayBuffer());
    const workbook = files.get('xl/workbook.xml');
    const rels = files.get('xl/_rels/workbook.xml.rels');
    if (!workbook || !rels) throw new Error('ساختار Workbook پیدا نشد.');

    const wb = xmlDoc(workbook);
    const relDoc = xmlDoc(rels);
    const firstSheet = wb.querySelector('sheets > sheet, sheet');
    if (!firstSheet) throw new Error('Sheet در فایل Excel پیدا نشد.');
    const relId = firstSheet.getAttribute('r:id') || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = Array.from(relDoc.querySelectorAll('Relationship')).find(x => x.getAttribute('Id') === relId);
    if (!rel) throw new Error('رابط Sheet پیدا نشد.');
    let target = rel.getAttribute('Target') || '';
    target = target.replace(/^\//, '');
    const sheetPath = target.startsWith('xl/') ? target : 'xl/' + target.replace(/^\.\//, '');
    const sheetBytes = files.get(sheetPath);
    if (!sheetBytes) throw new Error('فایل Sheet پیدا نشد: ' + sheetPath);

    let shared = [];
    const ss = files.get('xl/sharedStrings.xml');
    if (ss) {
      const sdoc = xmlDoc(ss);
      shared = Array.from(sdoc.querySelectorAll('si')).map(si => Array.from(si.querySelectorAll('t')).map(nodeText).join(''));
    }

    const sheet = xmlDoc(sheetBytes);
    const grid = [];
    for (const row of Array.from(sheet.querySelectorAll('sheetData > row, row'))) {
      const r = [];
      for (const c of Array.from(row.querySelectorAll(':scope > c'))) {
        const idx = colIndex(c.getAttribute('r'));
        const type = c.getAttribute('t');
        let val = '';
        if (type === 'inlineStr') val = Array.from(c.querySelectorAll('is t')).map(nodeText).join('');
        else {
          const raw = nodeText(c.querySelector('v'));
          if (type === 's') val = shared[Number(raw)] ?? '';
          else if (type === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
          else val = raw;
        }
        r[idx] = val;
      }
      grid.push(r);
    }
    if (!grid.length) throw new Error('Sheet خالی است.');

    const headers = grid[0].map(v => String(v || '').trim());
    return grid.slice(1).filter(r => r.some(v => String(v || '').trim() !== '')).map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = String(r[i] ?? '').trim(); });
      return obj;
    });
  }

  global.XLSXLite = { read };
})(globalThis);
