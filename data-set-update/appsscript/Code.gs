const SPREADSHEET_ID = '1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
const ALLOWED_SHEETS = new Set(['Distribution Centers (LG)', 'Pick-up Polygons']);

function doPost(e){
  try{
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    if(body.action!=='replaceDataset')throw new Error('Unsupported action.');
    const sheetName=String(body.sheetName||'');
    if(!ALLOWED_SHEETS.has(sheetName))throw new Error('Sheet is not allowed.');
    let headers=Array.isArray(body.headers)?body.headers.slice():[];
    let rows=Array.isArray(body.rows)?body.rows.map(r=>Array.isArray(r)?r.slice():[]):[];
    if(!headers.length)throw new Error('No headers received.');

    if(sheetName==='Pick-up Polygons'){
      const result=preparePickupPolygons_(headers,rows);
      headers=result.headers;rows=result.rows;
    }

    const width=headers.length;
    const normalized=rows.map(r=>Array.from({length:width},(_,i)=>r[i]??''));
    const ss=SpreadsheetApp.openById(SPREADSHEET_ID),sheet=ss.getSheetByName(sheetName);
    if(!sheet)throw new Error('Target sheet not found: '+sheetName);
    sheet.clearContents();
    sheet.getRange(1,1,1,width).setValues([headers]);
    if(normalized.length)sheet.getRange(2,1,normalized.length,width).setValues(normalized);
    SpreadsheetApp.flush();
    return json_({ok:true,sheetName,rows:normalized.length,columns:width,updatedAt:new Date().toISOString()});
  }catch(err){return json_({ok:false,error:String(err&&err.message||err)});}
}

function preparePickupPolygons_(headers,rows){
  const norm=s=>String(s||'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const hs=headers.map(norm);
  let nameIdx=hs.findIndex(h=>h==='name');
  if(nameIdx<0)nameIdx=hs.findIndex(h=>h==='coverage polygon'||h==='coverage polygon name');
  if(nameIdx<0)throw new Error('Pick-up Polygons: name column was not found.');
  const shipIdx=hs.findIndex(h=>h==='shipping size id'||h==='shipping size ids');
  if(shipIdx<0)throw new Error('Pick-up Polygons: shipping size id column was not found.');
  const coordIdx=hs.findIndex(h=>h==='coordinates'||h.endsWith(' coordinates'));
  if(coordIdx<0)throw new Error('Pick-up Polygons: coordinates column was not found after column selection.');
  const out=[];
  for(const row of rows){
    const name=String(row[nameIdx]||'');
    if(!/(FBM|SBS)/i.test(name))continue;
    const copy=row.slice();
    copy[shipIdx]=shippingSizeNumber_(copy[shipIdx]);
    out.push(copy);
  }
  return {headers,rows:out};
}

function shippingSizeNumber_(value){
  const fa='۰۱۲۳۴۵۶۷۸۹',ar='٠١٢٣٤٥٦٧٨٩';
  const s=String(value??'').replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/[٠-٩]/g,c=>String(ar.indexOf(c)));
  const paren=s.match(/\((\d+)\)/);if(paren)return Number(paren[1]);
  const any=s.match(/\d+/);return any?Number(any[0]):'';
}

function doGet(){return json_({ok:true,service:'Digiexpress Data Set Update'});}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
