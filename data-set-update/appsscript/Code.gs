const SPREADSHEET_ID = '1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
const ALLOWED_SHEETS = new Set(['Distribution Centers (LG)', 'Pick-up Polygons', 'Delivery Polygons', 'Rejected Shipments']);
const REJECTED_HEADERS = ['id','reference_id','user_id','ready_date','status','created_at','service_level','shipping_size_id','destination_address','destination_shipping_point','parcel_ids','promise_date','extracted_at'];

function doPost(e){
  try{
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    const action=String(body.action||'');
    if(action==='replaceDataset')return replaceDataset_(body);
    if(action==='readDataset')return readDataset_(body);
    if(action==='rejectedState')return rejectedState_(body);
    if(action==='appendRejected')return appendRejected_(body);
    throw new Error('Unsupported action.');
  }catch(err){return json_({ok:false,error:String(err&&err.message||err)});}
}

function requireSheet_(sheetName){
  const name=String(sheetName||'');
  if(!ALLOWED_SHEETS.has(name))throw new Error('Sheet is not allowed.');
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID),sheet=ss.getSheetByName(name);
  if(!sheet)throw new Error('Target sheet not found: '+name);
  return sheet;
}

function replaceDataset_(body){
  const sheetName=String(body.sheetName||'');
  const sheet=requireSheet_(sheetName);
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
  sheet.clearContents();
  sheet.getRange(1,1,1,width).setValues([headers]);
  if(normalized.length)sheet.getRange(2,1,normalized.length,width).setValues(normalized);
  SpreadsheetApp.flush();
  return json_({ok:true,sheetName,rows:normalized.length,columns:width,updatedAt:new Date().toISOString()});
}

function readDataset_(body){
  const sheetName=String(body.sheetName||'');
  const sheet=requireSheet_(sheetName);
  const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
  if(lastRow<1||lastCol<1)return json_({ok:true,sheetName,headers:[],rows:[],totalRows:0,updatedAt:new Date().toISOString()});
  const headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0];
  const totalRows=Math.max(0,lastRow-1);
  const limit=Math.max(1,Math.min(50000,Number(body.limit)||20000));
  const take=Math.min(totalRows,limit);
  const startRow=take?Math.max(2,lastRow-take+1):2;
  const rows=take?sheet.getRange(startRow,1,take,lastCol).getDisplayValues():[];
  return json_({ok:true,sheetName,headers,rows,totalRows,updatedAt:new Date().toISOString()});
}

function rejectedState_(body){
  const sheet=requireSheet_(String(body.sheetName||'Rejected Shipments'));
  const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
  if(lastRow<1||lastCol<1)return json_({ok:true,maxId:0,totalRows:0});
  const headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0].map(h=>String(h||'').trim().toLowerCase());
  const idIdx=headers.indexOf('id');
  if(idIdx<0)throw new Error('Rejected Shipments: id column was not found.');
  if(lastRow<2)return json_({ok:true,maxId:0,totalRows:0});
  const ids=sheet.getRange(2,idIdx+1,lastRow-1,1).getDisplayValues();
  let maxId=0;
  for(const row of ids){const n=numericId_(row[0]);if(n>maxId)maxId=n;}
  return json_({ok:true,maxId,totalRows:lastRow-1});
}

function appendRejected_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  const incoming=Array.isArray(body.rows)?body.rows:[];
  let lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
  let headers=[];
  if(lastRow<1||lastCol<1){
    headers=REJECTED_HEADERS.slice();
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    lastRow=1;lastCol=headers.length;
  }else{
    headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0].map(v=>String(v||'').trim());
  }
  const normalizedHeaders=headers.map(h=>h.toLowerCase());
  for(const required of REJECTED_HEADERS){if(!normalizedHeaders.includes(required))throw new Error('Rejected Shipments: missing column '+required);}
  const idIdx=normalizedHeaders.indexOf('id');
  const existing=new Set();
  if(lastRow>1){for(const r of sheet.getRange(2,idIdx+1,lastRow-1,1).getDisplayValues()){const n=numericId_(r[0]);if(n)existing.add(String(n));}}
  const rows=[];
  for(const item of incoming){
    if(!item||typeof item!=='object')continue;
    const id=numericId_(item.id);if(!id||existing.has(String(id)))continue;
    existing.add(String(id));
    rows.push(headers.map(h=>cellValue_(item[h]??item[String(h).toLowerCase()]??'')));
  }
  rows.sort((a,b)=>numericId_(a[idIdx])-numericId_(b[idIdx]));
  if(rows.length)sheet.getRange(sheet.getLastRow()+1,1,rows.length,headers.length).setValues(rows);
  SpreadsheetApp.flush();
  let maxId=0;for(const id of existing){const n=Number(id)||0;if(n>maxId)maxId=n;}
  return json_({ok:true,sheetName,appendedCount:rows.length,maxId,totalRows:Math.max(0,sheet.getLastRow()-1),updatedAt:new Date().toISOString()});
}

function cellValue_(value){
  if(value===null||value===undefined)return '';
  if(Array.isArray(value))return JSON.stringify(value);
  if(typeof value==='object')return JSON.stringify(value);
  return value;
}

function numericId_(value){
  const fa='۰۱۲۳۴۵۶۷۸۹',ar='٠١٢٣٤٥٦٧٨٩';
  const s=String(value??'').replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/[٠-٩]/g,c=>String(ar.indexOf(c))).replace(/[٬,\s]/g,'');
  const m=s.match(/\d+/);return m?Number(m[0]):0;
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

function doGet(){return json_({ok:true,service:'Digiexpress Agents'});}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
