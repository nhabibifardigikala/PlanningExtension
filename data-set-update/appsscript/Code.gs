const DIGIEXPRESS_DATASETS_API_VERSION = '376-destination-v4';
const SPREADSHEET_ID = '1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
const ALLOWED_SHEETS = new Set(['Distribution Centers (LG)', 'Pick-up Polygons', 'Delivery Polygons', 'Rejected Shipments']);
const REJECTED_SOURCE_HEADERS = ['id','reference_id','user_id','ready_date','status','created_at','service_level','shipping_size_id','destination_address','destination_shipping_point','parcel_ids','promise_date'];
const REJECTED_HEADERS = [...REJECTED_SOURCE_HEADERS,'extracted_at','destination'];
const REJECTED_FIELD_ALIASES = {
  id: ['id'],
  reference_id: ['reference_id','reference id'],
  user_id: ['user_id','user id'],
  ready_date: ['ready_date','ready date'],
  status: ['status'],
  created_at: ['created_at','created at'],
  service_level: ['service_level','service level'],
  shipping_size_id: ['shipping_size_id','shipping size id'],
  destination_address: ['destination_address','destination address'],
  destination_shipping_point: ['destination_shipping_point','destination shipping point'],
  parcel_ids: ['parcel_ids','parcel ids'],
  promise_date: ['promise_date','promise date'],
  extracted_at: ['extracted_at','extracted at'],
  destination: ['destination','coverage polygon id','coverage_polygon_id']
};

function doPost(e){
  try{
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    const action=String(body.action||'');
    if(action==='replaceDataset')return replaceDataset_(body);
    if(action==='readDataset')return readDataset_(body);
    if(action==='rejectedState')return rejectedState_(body);
    if(action==='readRejectedDashboardSnapshot')return readRejectedDashboardSnapshot_(body);
    if(action==='readRejectedDashboardDelta')return readRejectedDashboardDelta_(body);
    if(action==='appendRejected')return appendRejected_(body);
    if(action==='getRejectedDestinationPending')return getRejectedDestinationPending_(body);
    if(action==='updateRejectedDestination')return updateRejectedDestination_(body);
    if(action==='claimRejectedDestination')return claimRejectedDestination_(body);
    if(action==='completeRejectedDestination')return completeRejectedDestination_(body);
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

function ensureRejectedDestinationColumn_(sheet){
  if(!sheet)throw new Error('Rejected Shipments: target sheet is unavailable.');
  let lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
  if(lastRow<1||lastCol<1){
    const headers=REJECTED_HEADERS.map(h=>h==='destination'?'Destination':h);
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    return headers.length-1;
  }
  const headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0].map(v=>String(v||'').trim());
  const canonical=headers.map(canonicalRejectedField_);
  const existing=canonical.indexOf('destination');
  if(existing>=0)return existing;
  sheet.getRange(1,lastCol+1).setValue('Destination');
  return lastCol;
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
  if(lastRow<1||lastCol<1)return json_({ok:true,spreadsheetId:SPREADSHEET_ID,sheetName,headers:[],rows:[],totalRows:0,updatedAt:new Date().toISOString()});
  const headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0];
  const totalRows=Math.max(0,lastRow-1);
  const limit=Math.max(1,Math.min(50000,Number(body.limit)||20000));
  const take=Math.min(totalRows,limit);
  const startRow=take?Math.max(2,lastRow-take+1):2;
  const rows=take?sheet.getRange(startRow,1,take,lastCol).getDisplayValues():[];
  return json_({ok:true,spreadsheetId:SPREADSHEET_ID,sheetName,headers,rows,totalRows,updatedAt:new Date().toISOString()});
}

function rejectedMetaPropertyKey_(sheetName){
  return 'rejected.meta.'+String(sheetName||'Rejected Shipments');
}

function rejectedSheetInfo_(sheet){
  const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
  if(lastRow<1||lastCol<1)return {headers:[],canonical:[],idIdx:-1,lastRow,lastCol,totalRows:0,maxId:0};
  const headers=sheet.getRange(1,1,1,lastCol).getDisplayValues()[0].map(v=>String(v||'').trim());
  const canonical=headers.map(canonicalRejectedField_);
  const idIdx=canonical.indexOf('id');
  if(idIdx<0)throw new Error('Rejected Shipments: id column was not found.');
  const totalRows=Math.max(0,lastRow-1);
  // Do not assume the physical last row always has the highest/non-empty ID.
  // Read only a tiny tail of the ID column and take the maximum numeric value.
  let maxId=0;
  if(totalRows){
    const probe=Math.min(50,totalRows);
    const ids=sheet.getRange(lastRow-probe+1,idIdx+1,probe,1).getDisplayValues();
    for(const r of ids){const n=numericId_(r[0]);if(n>maxId)maxId=n;}
  }
  return {headers,canonical,idIdx,lastRow,lastCol,totalRows,maxId};
}

function storeRejectedMeta_(sheetName,meta){
  try{
    PropertiesService.getScriptProperties().setProperty(rejectedMetaPropertyKey_(sheetName),JSON.stringify({
      maxId:Number(meta.maxId)||0,
      totalRows:Number(meta.totalRows)||0,
      updatedAt:meta.updatedAt||new Date().toISOString()
    }));
  }catch(_){ }
}

function rejectedState_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  const info=rejectedSheetInfo_(sheet);
  return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,spreadsheetId:SPREADSHEET_ID,sheetName,maxId:info.maxId,totalRows:info.totalRows,updatedAt:new Date().toISOString(),mode:'tail-metadata'});
}

function readRejectedDashboardSnapshot_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  const info=rejectedSheetInfo_(sheet);
  const limit=Math.max(1,Math.min(300,Number(body.limit)||120));
  const take=Math.min(info.totalRows,limit);
  const startDataRow=take?info.totalRows-take+1:1;
  const startSheetRow=take?startDataRow+1:info.lastRow+1;
  const rows=take?sheet.getRange(startSheetRow,1,take,info.lastCol).getDisplayValues():[];
  return json_({
    ok:true,
    apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,
    spreadsheetId:SPREADSHEET_ID,
    sheetName,
    headers:info.headers,
    rows,
    totalRows:info.totalRows,
    maxId:info.maxId,
    startDataRow,
    endDataRow:info.totalRows,
    updatedAt:new Date().toISOString(),
    mode:'tail-snapshot'
  });
}

function readRejectedDashboardDelta_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  const info=rejectedSheetInfo_(sheet);
  const limit=Math.max(1,Math.min(300,Number(body.limit)||80));
  const rawAfter=Number(body.afterRow);
  const hasCursor=Number.isFinite(rawAfter)&&rawAfter>=0;
  const afterRow=hasCursor?Math.min(info.totalRows,Math.floor(rawAfter)):Math.max(0,info.totalRows-limit);
  const available=Math.max(0,info.totalRows-afterRow);
  const take=Math.min(available,limit);
  const startDataRow=take?afterRow+1:info.totalRows+1;
  const startSheetRow=take?startDataRow+1:info.lastRow+1;
  const rows=take?sheet.getRange(startSheetRow,1,take,info.lastCol).getDisplayValues():[];
  const cursorRow=take?afterRow+take:afterRow;
  const truncated=available>take;
  return json_({
    ok:true,
    apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,
    spreadsheetId:SPREADSHEET_ID,
    sheetName,
    headers:info.headers,
    rows,
    totalRows:info.totalRows,
    maxId:info.maxId,
    cursorRow,
    startDataRow,
    truncated,
    remainingRows:Math.max(0,info.totalRows-cursorRow),
    updatedAt:new Date().toISOString(),
    mode:hasCursor?'delta':'tail-seed'
  });
}


function getRejectedDestinationPending_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  ensureRejectedDestinationColumn_(sheet);
  const info=rejectedSheetInfo_(sheet);
  const destinationIdx=info.canonical.indexOf('destination');
  const idIdx=info.idIdx;
  if(destinationIdx<0)throw new Error('Rejected Shipments: Destination column was not found.');
  const limit=Math.max(1,Math.min(100,Number(body.limit)||25));
  const pending=[];
  let endRow=info.lastRow;
  const chunkSize=250;
  // Read newest rows first. This guarantees newly appended rejected shipments are enriched first,
  // while older blank Destination cells are also gradually backfilled instead of being hidden by a baseline.
  while(endRow>=2&&pending.length<limit){
    const startRow=Math.max(2,endRow-chunkSize+1);
    const count=endRow-startRow+1;
    const minCol=Math.min(idIdx,destinationIdx)+1;
    const maxCol=Math.max(idIdx,destinationIdx)+1;
    const values=sheet.getRange(startRow,minCol,count,maxCol-minCol+1).getDisplayValues();
    const idOff=idIdx-(minCol-1),destOff=destinationIdx-(minCol-1);
    for(let i=values.length-1;i>=0&&pending.length<limit;i--){
      const id=numericId_(values[i][idOff]);
      if(!id)continue;
      const destination=String(values[i][destOff]||'').trim();
      if(!destination)pending.push({id,rowNumber:startRow+i});
    }
    endRow=startRow-1;
  }
  return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,spreadsheetId:SPREADSHEET_ID,sheetName,maxId:info.maxId,pending,count:pending.length,updatedAt:new Date().toISOString()});
}

function rejectedDestinationClaimKey_(sheetName){
  return 'rejected.destination.claim.'+String(sheetName||'Rejected Shipments');
}

function claimRejectedDestination_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  ensureRejectedDestinationColumn_(sheet);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const info=rejectedSheetInfo_(sheet);
    const destinationIdx=info.canonical.indexOf('destination');
    if(destinationIdx<0)throw new Error('Rejected Shipments: Destination column was not found.');
    const props=PropertiesService.getScriptProperties(),claimKey=rejectedDestinationClaimKey_(sheetName);
    let claim=null;try{claim=JSON.parse(props.getProperty(claimKey)||'null');}catch(_){claim=null;}
    if(claim&&Date.now()-Number(claim.claimedAt||0)<15*60*1000){
      const rowNumber=Number(claim.rowNumber)||0;
      if(rowNumber>=2&&rowNumber<=sheet.getLastRow()){
        const rowId=numericId_(sheet.getRange(rowNumber,info.idIdx+1).getDisplayValue());
        const destination=String(sheet.getRange(rowNumber,destinationIdx+1).getDisplayValue()||'').trim();
        if(rowId===Number(claim.id)&&!destination)return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,shipmentId:Number(claim.id),rowNumber,claimed:true,reused:true});
      }
    }
    props.deleteProperty(claimKey);
    let endRow=info.lastRow,found=null;const chunkSize=250;
    // Claim the newest row with an empty Destination. No baseline is used: missed rows remain recoverable.
    while(endRow>=2&&!found){
      const startRow=Math.max(2,endRow-chunkSize+1),count=endRow-startRow+1;
      const minCol=Math.min(info.idIdx,destinationIdx)+1,maxCol=Math.max(info.idIdx,destinationIdx)+1;
      const values=sheet.getRange(startRow,minCol,count,maxCol-minCol+1).getDisplayValues();
      const idOff=info.idIdx-(minCol-1),destOff=destinationIdx-(minCol-1);
      for(let i=values.length-1;i>=0;i--){
        const id=numericId_(values[i][idOff]);
        if(!id)continue;
        const destination=String(values[i][destOff]||'').trim();
        if(!destination){found={id,rowNumber:startRow+i};break;}
      }
      endRow=startRow-1;
    }
    if(!found)return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,shipmentId:0,rowNumber:0,claimed:false});
    props.setProperty(claimKey,JSON.stringify({id:Number(found.id),rowNumber:Number(found.rowNumber),claimedAt:Date.now()}));
    return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,shipmentId:Number(found.id),rowNumber:Number(found.rowNumber),claimed:true});
  }finally{lock.releaseLock();}
}

function findCoveragePolygonIdFromTable_(headers,rows){
  const normalized=(headers||[]).map(normalizeHeaderKey_);
  let idx=normalized.findIndex(h=>h==='coverage polygon id');
  if(idx<0)idx=normalized.findIndex(h=>h.includes('coverage polygon')&&h.includes('id'));
  if(idx<0)return '';
  for(const row of rows||[]){const value=String(row?.[idx]??'').trim();if(value)return value;}
  return '';
}

function completeRejectedDestination_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const id=numericId_(body.id);
  if(!id)return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,skipped:true,reason:'no-pending-destination'});
  const headers=Array.isArray(body.headers)?body.headers:[];
  const rows=Array.isArray(body.rows)?body.rows:[];
  const resolvedDestination=findCoveragePolygonIdFromTable_(headers,rows);
  // A valid navigation path can legitimately end with no rows/result. Mark it and continue.
  const destination=resolvedDestination || 'یافت نشد';
  const sheet=requireSheet_(sheetName);
  ensureRejectedDestinationColumn_(sheet);
  const info=rejectedSheetInfo_(sheet),destinationIdx=info.canonical.indexOf('destination');
  if(destinationIdx<0)throw new Error('Rejected Shipments: Destination column was not found.');
  const total=Math.max(0,sheet.getLastRow()-1),probe=Math.min(total,3000),start=Math.max(2,sheet.getLastRow()-probe+1);
  const ids=probe?sheet.getRange(start,info.idIdx+1,probe,1).getDisplayValues():[];
  const hit=ids.findIndex(r=>numericId_(r[0])===id);
  if(hit<0)throw new Error('Rejected Shipments: could not locate id '+id+' for Destination update.');
  const rowNumber=start+hit;
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    sheet.getRange(rowNumber,destinationIdx+1).setValue(destination);
    const props=PropertiesService.getScriptProperties(),key=rejectedDestinationClaimKey_(sheetName);
    let claim=null;try{claim=JSON.parse(props.getProperty(key)||'null');}catch(_){claim=null;}
    if(Number(claim?.id)===id)props.deleteProperty(key);
  }finally{lock.releaseLock();}
  return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,sheetName,id,rowNumber,destination,found:!!resolvedDestination,updatedAt:new Date().toISOString()});
}

function updateRejectedDestination_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  ensureRejectedDestinationColumn_(sheet);
  const info=rejectedSheetInfo_(sheet);
  const destinationIdx=info.canonical.indexOf('destination');
  if(destinationIdx<0)throw new Error('Rejected Shipments: Destination column was not found.');
  const id=numericId_(body.id);
  const destination=String(body.destination??'').trim();
  let rowNumber=Math.floor(Number(body.rowNumber)||0);
  if(!id)throw new Error('Rejected Shipments: destination update requires a valid id.');
  if(!destination)throw new Error('Rejected Shipments: Destination value is empty.');
  const rowMatches=()=>rowNumber>=2&&rowNumber<=sheet.getLastRow()&&numericId_(sheet.getRange(rowNumber,info.idIdx+1).getDisplayValue())===id;
  if(!rowMatches()){
    const total=Math.max(0,sheet.getLastRow()-1),probe=Math.min(total,2000),start=Math.max(2,sheet.getLastRow()-probe+1);
    const ids=probe?sheet.getRange(start,info.idIdx+1,probe,1).getDisplayValues():[];
    const hit=ids.findIndex(r=>numericId_(r[0])===id);
    if(hit<0)throw new Error('Rejected Shipments: could not locate id '+id+' for Destination update.');
    rowNumber=start+hit;
  }
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{sheet.getRange(rowNumber,destinationIdx+1).setValue(destination);}finally{lock.releaseLock();}
  return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,sheetName,id,rowNumber,destination,updatedAt:new Date().toISOString()});
}

function appendRejected_(body){
  const sheetName=String(body.sheetName||'Rejected Shipments');
  const sheet=requireSheet_(sheetName);
  ensureRejectedDestinationColumn_(sheet);
  const preAppendInfo=rejectedSheetInfo_(sheet);
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

  // The target Sheet schema is canonical and fixed. Validate by canonical header name,
  // not by physical position, so existing DataSets tabs remain safe to append to.
  const sheetCanonical=headers.map(canonicalRejectedField_);
  for(const required of REJECTED_HEADERS){
    if(!sheetCanonical.includes(required))throw new Error('Rejected Shipments: missing target sheet column '+required);
  }
  const idIdx=sheetCanonical.indexOf('id');

  // Convert the extracted table objects to the exact Rejected Shipments schema.
  // Stable Host deliberately preserves the website's visible header labels (for example
  // "Reference ID"), therefore the Apps Script receiver owns this Remote schema mapping.
  const canonicalIncoming=[];
  const seenIncomingFields=new Set();
  for(const item of incoming){
    if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const mapped={};
    for(const [sourceKey,value] of Object.entries(item)){
      const key=canonicalRejectedField_(sourceKey);
      if(!key)continue;
      seenIncomingFields.add(key);
      if(!Object.prototype.hasOwnProperty.call(mapped,key)||mapped[key]==='')mapped[key]=value;
    }
    if(!Object.prototype.hasOwnProperty.call(mapped,'extracted_at')||!String(mapped.extracted_at||'').trim()){
      mapped.extracted_at=new Date().toISOString();
      seenIncomingFields.add('extracted_at');
    }
    canonicalIncoming.push(mapped);
  }

  // Never silently publish a partial schema. Empty cell values are allowed, but the
  // extracted table must expose every requested field. This prevents the previous
  // failure mode where only id/status were written while the other columns stayed blank.
  if(canonicalIncoming.length){
    const requiredSourceFields=REJECTED_SOURCE_HEADERS;
    const missing=requiredSourceFields.filter(h=>!seenIncomingFields.has(h));
    if(missing.length){
      const received=[...new Set(incoming.flatMap(item=>item&&typeof item==='object'&&!Array.isArray(item)?Object.keys(item):[]))];
      throw new Error('Rejected Shipments: extracted table is missing required columns: '+missing.join(', ')+'. Received fields: '+received.join(' | '));
    }
  }

  // IDs are monotonically increasing in the source and this synchronizer only asks for IDs
  // greater than the current watermark. Read just the final ID instead of scanning the full ID column.
  // This removes the largest quota consumer from every scheduled synchronization.
  const currentInfo=rejectedSheetInfo_(sheet);
  let maxId=currentInfo.maxId;
  const rows=[];
  const seenBatch=new Set();
  for(const item of canonicalIncoming){
    const id=numericId_(item.id);
    if(!id||id<=maxId||seenBatch.has(String(id)))continue;
    seenBatch.add(String(id));
    rows.push(headers.map((_,i)=>cellValue_(item[sheetCanonical[i]]??'')));
  }
  rows.sort((a,b)=>numericId_(a[idIdx])-numericId_(b[idIdx]));
  let appendedCount=0;
  let appendedIds=[];
  if(rows.length){
    const lock=LockService.getScriptLock();
    lock.waitLock(15000);
    try{
      const latestInfo=rejectedSheetInfo_(sheet);
      maxId=latestInfo.maxId;
      const safeRows=rows.filter(r=>numericId_(r[idIdx])>maxId);
      if(safeRows.length){
        sheet.getRange(sheet.getLastRow()+1,1,safeRows.length,headers.length).setValues(safeRows);
        appendedCount=safeRows.length;
        appendedIds=safeRows.map(r=>numericId_(r[idIdx])).filter(Boolean);
        maxId=numericId_(safeRows[safeRows.length-1][idIdx]);
      }
    }finally{
      lock.releaseLock();
    }
  }
  const finalTotalRows=Math.max(0,sheet.getLastRow()-1);
  storeRejectedMeta_(sheetName,{maxId,totalRows:finalTotalRows});
  return json_({ok:true,apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,spreadsheetId:SPREADSHEET_ID,sheetName,appendedCount,appendedIds,maxId,totalRows:finalTotalRows,updatedAt:new Date().toISOString()});
}

function rejectedHeaderToken_(value){
  return String(value??'').toLowerCase()
    .replace(/^show\s+/,'')
    .replace(/\s+column$/,'')
    .replace(/[^a-z0-9]+/g,'');
}

function canonicalRejectedField_(value){
  const token=rejectedHeaderToken_(value);
  if(!token)return '';
  for(const key of REJECTED_HEADERS){
    const aliases=[key].concat(REJECTED_FIELD_ALIASES[key]||[]);
    if(aliases.some(alias=>rejectedHeaderToken_(alias)===token))return key;
  }
  return '';
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

function normalizeHeaderKey_(value){
  return normalizeText_(value).toLowerCase()
    .replace(/[()\[\]{}:;,.\/\\|]+/g,' ')
    .replace(/[_\-–—]+/g,' ')
    .replace(/\s+/g,' ').trim();
}

function findColumn_(headers, aliases){
  const normalized=headers.map(normalizeHeaderKey_);
  const wanted=(aliases||[]).map(normalizeHeaderKey_).filter(Boolean);
  for(const alias of wanted){
    const exact=normalized.indexOf(alias);if(exact>=0)return exact;
  }
  for(let i=0;i<normalized.length;i++){
    const h=normalized[i];
    for(const alias of wanted){
      if(alias.length>=3&&(h.includes(alias)||alias.includes(h)))return i;
    }
  }
  return -1;
}

function inferColumnByScore_(rows, scorer){
  const width=Math.max(0,...rows.map(r=>Array.isArray(r)?r.length:0));
  let best=-1,bestScore=0;
  for(let c=0;c<width;c++){
    let score=0,seen=0;
    for(let r=0;r<Math.min(rows.length,250);r++){
      const v=rows[r]?.[c];if(v===null||v===undefined||String(v).trim()==='')continue;
      seen++;score+=Number(scorer(v)||0);
    }
    if(seen&&score>bestScore){bestScore=score;best=c;}
  }
  return bestScore>0?best:-1;
}

function preparePickupPolygons_(headers,rows){
  let nameIdx=findColumn_(headers,['name','coverage polygon','coverage polygon name','polygon name','polygon','title','hub','hub name']);
  if(nameIdx<0)nameIdx=inferColumnByScore_(rows,v=>/(FBM|SBS)/i.test(String(v))?5:0);
  if(nameIdx<0)throw new Error('Pick-up Polygons: name column was not found. Received headers: '+headers.join(' | '));

  let shipIdx=findColumn_(headers,['shipping size id','shipping size ids','shipping size','size id','size']);
  if(shipIdx<0)shipIdx=inferColumnByScore_(rows,v=>/(عادی|عادي|متوسط|سنگین|سنگين|\([123]\)|\b[123]\b)/i.test(normalizeText_(v))?2:0);
  if(shipIdx<0)throw new Error('Pick-up Polygons: shipping size id column was not found. Received headers: '+headers.join(' | '));

  let coordIdx=findColumn_(headers,['coordinates','coordinate','polygon coordinates','coverage polygon coordinates','مختصات']);
  if(coordIdx<0)coordIdx=inferColumnByScore_(rows,v=>{
    const x=String(v||'').trim();
    if(!x)return 0;
    if(/^\s*[\[{]/.test(x)&&/\d/.test(x)&&(/,/.test(x)||/:/.test(x)))return 3;
    if(/-?\d{1,3}(?:\.\d+)?\s*[,،]\s*-?\d{1,3}(?:\.\d+)?/.test(x))return 2;
    return 0;
  });
  if(coordIdx<0)throw new Error('Pick-up Polygons: coordinates column was not found after column selection. Received headers: '+headers.join(' | '));

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

  const dcHeaders=values[0].map(normalizeHeaderKey_), dcRows=values.slice(1);
  const idx=(arr,names)=>{for(const name of names){const n=normalizeHeaderKey_(name);let i=arr.indexOf(n);if(i>=0)return i;for(i=0;i<arr.length;i++){if(arr[i].includes(n)||n.includes(arr[i]))return i;}}return -1;};
  const dcName=idx(dcHeaders,['name','distribution center','distribution center name']);
  const dcId=idx(dcHeaders,['id','distribution center id']);
  const dcIata=idx(dcHeaders,['iata','iata code']);
  const dcDistrict=idx(dcHeaders,['district']);
  const dcActive=idx(dcHeaders,['active','is active']);
  if([dcName,dcId,dcIata,dcDistrict,dcActive].some(i=>i<0))throw new Error('Delivery Polygons: required Distribution Centers columns were not found. Headers: '+values[0].join(' | '));

  const baseByName=new Map(),baseById=new Map(),dcNames=new Set();
  for(const r of dcRows){
    const name=String(r[dcName]??'').trim(),id=String(r[dcId]??'').trim();
    if(!name&&!id)continue;
    if(/گنجه|گنجدار/.test(normalizeText_(name)))continue;
    const active=String(r[dcActive]??'').trim();
    if(active==='0'||active.toLowerCase()==='false')continue;
    const base={name,id:r[dcId]??'',iata:r[dcIata]??'',district:r[dcDistrict]??''};
    if(name){const key=normalizeNameKey_(name);dcNames.add(key);baseByName.set(key,base);}
    if(id)baseById.set(String(numericId_(id)||id),base);
  }

  let polyDc=findColumn_(polygonHeaders,['distribution center id','distribution center','distribution center name','dc id','dc','dc name','center','center name']);
  if(polyDc<0)polyDc=inferColumnByScore_(polygonRows,v=>{
    const raw=String(v??'').trim(),nid=String(numericId_(raw)||raw);
    return baseById.has(nid)?6:(dcNames.has(normalizeNameKey_(raw))?5:0);
  });
  let polyCoord=findColumn_(polygonHeaders,['coordinates','coordinate','polygon coordinates','مختصات']);
  if(polyCoord<0)polyCoord=inferColumnByScore_(polygonRows,v=>{const x=String(v||'').trim();return ((/^\s*[\[{]/.test(x)&&/\d/.test(x)&&(/,/.test(x)||/:/.test(x)))||/-?\d{1,3}(?:\.\d+)?\s*[,،]\s*-?\d{1,3}(?:\.\d+)?/.test(x))?3:0;});
  let polyTime=findColumn_(polygonHeaders,['time scope','timescope','time slot','time range','working time','working hours']);
  if(polyTime<0)polyTime=inferColumnByScore_(polygonRows,v=>/(\d{1,2}\s*(?:h)?\s*[-–—]\s*\d{1,2}\s*(?:h)?|\d{1,2}:\d{2})/i.test(String(v))?2:0);
  let polyNature=findColumn_(polygonHeaders,['shipping nature id','shipping nature','nature id','nature','shipping type']);
  if(polyNature<0)polyNature=inferColumnByScore_(polygonRows,v=>/(عادی|عادي|متوسط|سنگین|سنگين|\([123]\)|\b[123]\b)/i.test(normalizeText_(v))?2:0);
  if([polyDc,polyCoord,polyNature].some(i=>i<0))throw new Error('Delivery Polygons: required dc-polygons columns were not found. Received headers: '+polygonHeaders.join(' | '));

  const out=[];
  for(const r of polygonRows){
    const coordinates=String(r[polyCoord]??'').trim();
    if(!coordinates)continue;
    const rawDc=String(r[polyDc]??'').trim();
    if(!rawDc)continue;
    const idKey=String(numericId_(rawDc)||rawDc);
    const base=baseById.get(idKey)||baseByName.get(normalizeNameKey_(rawDc));
    if(!base)continue;
    const nature=deliveryNatureNumber_(base.name,r[polyNature]);
    const timeScope=polyTime>=0?(r[polyTime]??''):'';
    out.push([base.name,coordinates,base.id,base.iata,base.district,timeScope,nature]);
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

function doGet(){return json_({ok:true,service:'Digiexpress Agents',apiVersion:DIGIEXPRESS_DATASETS_API_VERSION,spreadsheetId:SPREADSHEET_ID});}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
