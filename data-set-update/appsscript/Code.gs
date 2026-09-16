const SPREADSHEET_ID = '1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
const ALLOWED_SHEETS = new Set(['Distribution Centers (LG)', 'Pick-up Polygons', 'Delivery Polygons']);

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
    if(sheetName==='Delivery Polygons'){
      const result=prepareDeliveryPolygons_(headers,rows);
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


function prepareDeliveryPolygons_(polygonHeaders,polygonRows){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const dcSheet=ss.getSheetByName('Distribution Centers (LG)');
  if(!dcSheet)throw new Error('Delivery Polygons: Distribution Centers (LG) sheet was not found.');
  const values=dcSheet.getDataRange().getValues();
  if(values.length<2)throw new Error('Delivery Polygons: Distribution Centers (LG) has no data.');

  const normHeader=s=>normalizeText_(s).toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const dcHeaders=values[0].map(normHeader), dcRows=values.slice(1);
  const idx=(arr,names)=>{for(const name of names){const i=arr.indexOf(name);if(i>=0)return i;}return -1;};
  const dcName=idx(dcHeaders,['name']);
  const dcId=idx(dcHeaders,['id','distribution center id']);
  const dcIata=idx(dcHeaders,['iata']);
  const dcDistrict=idx(dcHeaders,['district']);
  const dcActive=idx(dcHeaders,['active']);
  if([dcName,dcId,dcIata,dcDistrict,dcActive].some(i=>i<0))throw new Error('Delivery Polygons: required Distribution Centers columns were not found.');

  const ph=polygonHeaders.map(normHeader);
  const polyName=idx(ph,['distribution center id','distribution center','dc']);
  const polyCoord=idx(ph,['coordinates','coordinate']);
  const polyTime=idx(ph,['time scope','timescope']);
  const polyNature=idx(ph,['shipping nature id','shipping nature']);
  if([polyName,polyCoord,polyTime,polyNature].some(i=>i<0))throw new Error('Delivery Polygons: required dc-polygons columns were not found (distribution center id, coordinates, time scope, shipping nature id).');

  const baseByName=new Map();
  for(const r of dcRows){
    const name=String(r[dcName]??'').trim();
    if(!name)continue;
    if(/گنجه|گنجدار/.test(normalizeText_(name)))continue;
    const active=String(r[dcActive]??'').trim();
    if(active==='0'||active.toLowerCase()==='false')continue;
    baseByName.set(normalizeNameKey_(name),{name,id:r[dcId]??'',iata:r[dcIata]??'',district:r[dcDistrict]??''});
  }

  const out=[];
  for(const r of polygonRows){
    const coordinates=String(r[polyCoord]??'').trim();
    if(!coordinates)continue;
    const polygonDcName=String(r[polyName]??'').trim();
    if(!polygonDcName)continue;
    const base=baseByName.get(normalizeNameKey_(polygonDcName));
    if(!base)continue;
    const nature=deliveryNatureNumber_(base.name,r[polyNature]);
    out.push([base.name,coordinates,base.id,base.iata,base.district,r[polyTime]??'',nature]);
  }
  return {headers:['Name','coordinates','distribution center id','IATA','district','time scope','shipping nature id'],rows:out};
}

function deliveryNatureNumber_(name,value){
  const n=normalizeText_(name);
  if(n.includes('باربری'))return 4;
  if(n.includes('بیزنس')||n.includes('بيزنس'))return 5;
  if(n.includes('تحویل فوری')||n.includes('تحويل فوري'))return 6;
  const v=normalizeText_(value).toLowerCase();
  if(v.includes('عادی')||v.includes('عادي'))return 1;
  if(v.includes('متوسط'))return 2;
  if(v.includes('سنگین')||v.includes('سنگين'))return 3;
  const m=v.match(/\((\d+)\)/)||v.match(/\b([123])\b/);
  return m?Number(m[1]):'';
}

function normalizeText_(value){
  return String(value??'')
    .replace(/ي/g,'ی').replace(/ك/g,'ک')
    .replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function normalizeNameKey_(value){return normalizeText_(value).toLowerCase();}

function shippingSizeNumber_(value){
  const fa='۰۱۲۳۴۵۶۷۸۹',ar='٠١٢٣٤٥٦٧٨٩';
  const s=String(value??'').replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/[٠-٩]/g,c=>String(ar.indexOf(c)));
  const paren=s.match(/\((\d+)\)/);if(paren)return Number(paren[1]);
  const any=s.match(/\d+/);return any?Number(any[0]):'';
}

function doGet(){return json_({ok:true,service:'Digiexpress Data Set Update'});}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
