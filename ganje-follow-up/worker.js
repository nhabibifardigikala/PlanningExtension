const text = v => v==null ? '' : String(v).trim();
const isGanjeCap = v => /-\s*G(?:N|F)\s*-/i.test(text(v));
const normalizeForCompare = v => text(v).replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').toUpperCase();
const headerNorm = v => text(v).toLowerCase();
const dec = new TextDecoder('utf-8');
const u16=(d,o)=>d[o]|(d[o+1]<<8);
const u32=(d,o)=>(d[o]|(d[o+1]<<8)|(d[o+2]<<16)|(d[o+3]<<24))>>>0;

function unescapeXml(s){
  return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}
function getTagText(xml,tag){
  const re=new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i');
  const m=re.exec(xml); return m?unescapeXml(m[1].replace(/<[^>]+>/g,'')):'';
}
function getSiText(xml){
  let v=''; for(const t of xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)) v+=unescapeXml(t[1]);
  return v;
}
function colIndex(ref){
  const m=/^([A-Z]+)/i.exec(ref||''); if(!m) return -1;
  let n=0; for(const c of m[1].toUpperCase()) n=n*26+(c.charCodeAt(0)-64); return n-1;
}
function cellParts(cell){
  const open=/<c\b([^>]*)>/i.exec(cell); if(!open) return null;
  const attrs=open[1];
  const ref=(/\br="([^"]+)"/i.exec(attrs)||[])[1]||'';
  const type=(/\bt="([^"]+)"/i.exec(attrs)||[])[1]||'';
  const body=cell.slice(open.index+open[0].length, cell.lastIndexOf('</c>'));
  const raw=getTagText(body,'v');
  const inline=type==='inlineStr'?getTagText(body,'t'):'';
  return {col:colIndex(ref),type,raw,inline};
}
function forEachCell(rowXml, fn){
  const re=/<c\b[^>]*>[\s\S]*?<\/c>/gi; let m;
  while((m=re.exec(rowXml))) { const p=cellParts(m[0]); if(p) fn(p); }
}

async function readZipDirectory(file){
  const tailSize=Math.min(file.size,65557);
  const tail=new Uint8Array(await file.slice(file.size-tailSize).arrayBuffer());
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--){ if(u32(tail,i)===0x06054b50){eocd=i;break;} }
  if(eocd<0) throw new Error('ساختار فایل XLSX معتبر نیست.');
  const entries=u16(tail,eocd+10), cdSize=u32(tail,eocd+12), cdOffset=u32(tail,eocd+16);
  const d=new Uint8Array(await file.slice(cdOffset,cdOffset+cdSize).arrayBuffer());
  const out=[]; let p=0;
  for(let n=0;n<entries && p+46<=d.length;n++){
    if(u32(d,p)!==0x02014b50) break;
    const method=u16(d,p+10), compSize=u32(d,p+20), nameLen=u16(d,p+28), extraLen=u16(d,p+30), commentLen=u16(d,p+32), localOffset=u32(d,p+42);
    const name=dec.decode(d.slice(p+46,p+46+nameLen));
    out.push({name,method,compSize,localOffset});
    p+=46+nameLen+extraLen+commentLen;
  }
  return out;
}

async function entryStream(file,e){
  const h=new Uint8Array(await file.slice(e.localOffset,e.localOffset+30).arrayBuffer());
  if(u32(h,0)!==0x04034b50) throw new Error('ساختار داخلی XLSX قابل خواندن نیست.');
  const nameLen=u16(h,26), extraLen=u16(h,28), start=e.localOffset+30+nameLen+extraLen;
  let stream=file.slice(start,start+e.compSize).stream();
  if(e.method===8) stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));
  else if(e.method!==0) throw new Error('نوع فشرده‌سازی این XLSX پشتیبانی نمی‌شود.');
  return stream;
}

async function streamElements(file,entry,tag,callback){
  const reader=(await entryStream(file,entry)).getReader();
  const decoder=new TextDecoder('utf-8');
  const startRe=new RegExp(`<${tag}\\b`,'i');
  const endTag=`</${tag}>`;
  let buffer='';
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done) break;
      buffer+=decoder.decode(value,{stream:true});
      while(true){
        const sm=startRe.exec(buffer); const start=sm?sm.index:-1;
        if(start<0){ buffer=buffer.slice(-256); break; }
        const end=buffer.indexOf(endTag,start);
        if(end<0){ if(start>0) buffer=buffer.slice(start); break; }
        const el=buffer.slice(start,end+endTag.length);
        buffer=buffer.slice(end+endTag.length);
        const keep=await callback(el);
        if(keep===false){ await reader.cancel(); return; }
      }
    }
    buffer+=decoder.decode();
  } finally { try{ reader.releaseLock(); }catch{} }
}

async function findHeaderSharedIds(file,sharedEntry){
  const ids={dc:new Set(),cap:new Set(),dcId:new Set(),promised:new Set()};
  if(!sharedEntry) return ids;
  let idx=0;
  await streamElements(file,sharedEntry,'si',si=>{
    const v=headerNorm(getSiText(si));
    if(v==='dc_name') ids.dc.add(idx);
    if(v==='distribution_center_cap') ids.cap.add(idx);
    if(['distribution_center_id_cap','distribution center id cap'].includes(v)) ids.dcId.add(idx);
    if(['persian_promised_date','persian promised date'].includes(v)) ids.promised.add(idx);
    idx++;
  });
  return ids;
}

async function findTargetColumns(file,sheetEntry,headerIds){
  let result=null;
  await streamElements(file,sheetEntry,'row',row=>{
    let dc=-1,cap=-1,dcId=-1,promised=-1;
    forEachCell(row,c=>{
      let v='';
      if(c.type==='s'){
        const id=Number(c.raw);
        if(headerIds.dc.has(id)) v='dc_name';
        else if(headerIds.cap.has(id)) v='distribution_center_cap';
        else if(headerIds.dcId.has(id)) v='distribution_center_id_cap';
        else if(headerIds.promised.has(id)) v='persian_promised_date';
      } else v=headerNorm(c.type==='inlineStr'?c.inline:c.raw);
      if(v==='dc_name') dc=c.col;
      if(v==='distribution_center_cap') cap=c.col;
      if(['distribution_center_id_cap','distribution center id cap'].includes(v)) dcId=c.col;
      if(['persian_promised_date','persian promised date'].includes(v)) promised=c.col;
    });
    if(dc<0||cap<0||dcId<0){
      const missing=[dc<0?'DC_Name':null,cap<0?'distribution_center_cap':null,dcId<0?'distribution_center_id_cap':null].filter(Boolean).join(' و ');
      throw new Error(`ستون ${missing} پیدا نشد.`);
    }
    result={dc,cap,dcId,promised};
    return false;
  });
  if(!result) throw new Error('فایل فاقد داده است.');
  return result;
}

async function collectNeededSharedIds(file,sheetEntry,cols){
  const needed=new Set(); let rowNo=0;
  await streamElements(file,sheetEntry,'row',row=>{
    rowNo++; if(rowNo===1) return;
    forEachCell(row,c=>{
      if((c.col===cols.dc||c.col===cols.cap||c.col===cols.dcId||c.col===cols.promised) && c.type==='s' && c.raw!=='') needed.add(Number(c.raw));
    });
    if(rowNo%100000===0) postMessage({type:'progress',message:`در حال بررسی ردیف‌ها: ${rowNo.toLocaleString()} ردیف`});
  });
  return needed;
}

async function resolveSharedValues(file,sharedEntry,needed){
  const map=new Map(); if(!sharedEntry||needed.size===0) return map;
  let idx=0, remaining=needed.size;
  await streamElements(file,sharedEntry,'si',si=>{
    if(needed.has(idx)){ map.set(idx,getSiText(si)); remaining--; }
    idx++;
    if(remaining===0) return false;
  });
  return map;
}

function valueFromCell(c,shared){
  if(c.type==='s') return shared.get(Number(c.raw))??'';
  if(c.type==='inlineStr') return c.inline;
  return c.raw;
}
function cleanId(v){ return text(v).replace(/\.0$/,''); }

function promisedDateInfo(v){
  const raw=text(v); if(!raw)return null;
  const latin=raw.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const parts=latin.match(/\d+/g)||[];
  if(parts.length<3)return null;
  const y=parts[0].padStart(4,'0'),m=parts[1].padStart(2,'0'),d=parts[2].padStart(2,'0');
  return {key:`${y}${m}${d}`,display:`${y}/${m}/${d}`};
}
function updatePromisedRange(range,v){
  const x=promisedDateInfo(v); if(!x)return;
  if(!range.min||x.key<range.min.key)range.min=x;
  if(!range.max||x.key>range.max.key)range.max=x;
}

function finalizeGroups(groups,relevantCount,mismatchCount,threshold,minMismatchCount,promisedRange){
  const allCenters=[...groups.values()].map(g=>({...g,mismatchPercent:g.total?g.mismatch/g.total*100:0}))
    .sort((a,b)=>b.mismatchPercent-a.mismatchPercent||b.mismatch-a.mismatch||String(a.dcId).localeCompare(String(b.dcId),undefined,{numeric:true}));
  return {report:allCenters.filter(g=>g.mismatchPercent>=threshold&&g.mismatch>=minMismatchCount),relevantCount,mismatchCount,threshold,minMismatchCount,promisedMin:promisedRange?.min?.display||'',promisedMax:promisedRange?.max?.display||''};
}
function addRecord(groups,dcId,dc,cap,counters){
  dcId=cleanId(dcId); dc=text(dc); cap=text(cap); if(!isGanjeCap(cap)) return;
  counters.relevantCount++;
  const mismatch=normalizeForCompare(dc)!==normalizeForCompare(cap);
  if(mismatch)counters.mismatchCount++;
  const key=dcId||`UNRESOLVED:${normalizeForCompare(cap)}`;
  const g=groups.get(key)||{dcId,sourceCenterCap:cap,total:0,mismatch:0};
  if(!g.sourceCenterCap&&cap)g.sourceCenterCap=cap;
  g.total++; if(mismatch)g.mismatch++; groups.set(key,g);
}

async function analyzeXlsx(file,threshold,minMismatchCount){
  postMessage({type:'progress',message:'در حال خواندن ساختار XLSX...'});
  const entries=await readZipDirectory(file);
  const shared=entries.find(e=>e.name==='xl/sharedStrings.xml');
  const sheets=entries.filter(e=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name)).sort((a,b)=>{
    const na=Number((a.name.match(/sheet(\d+)/i)||[])[1]||0), nb=Number((b.name.match(/sheet(\d+)/i)||[])[1]||0); return na-nb;
  });
  const sheet=sheets[0]; if(!sheet) throw new Error('هیچ Sheet قابل خواندنی در فایل پیدا نشد.');

  postMessage({type:'progress',message:'در حال شناسایی ستون‌های موردنیاز...'});
  const headerIds=await findHeaderSharedIds(file,shared);
  const cols=await findTargetColumns(file,sheet,headerIds);

  postMessage({type:'progress',message:'در حال جمع‌آوری فقط مقادیر دو ستون موردنیاز...'});
  const needed=await collectNeededSharedIds(file,sheet,cols);
  const sharedValues=await resolveSharedValues(file,shared,needed);

  postMessage({type:'progress',message:'در حال محاسبه گزارش بدون بارگذاری کل شیت در حافظه...'});
  const groups=new Map(), counters={relevantCount:0,mismatchCount:0}, promisedRange={min:null,max:null}; let rowNo=0;
  await streamElements(file,sheet,'row',row=>{
    rowNo++; if(rowNo===1) return;
    let dcId='',dc='',cap='',promised='';
    forEachCell(row,c=>{
      if(c.col===cols.dcId) dcId=valueFromCell(c,sharedValues);
      else if(c.col===cols.dc) dc=valueFromCell(c,sharedValues);
      else if(c.col===cols.cap) cap=valueFromCell(c,sharedValues);
      else if(c.col===cols.promised) promised=valueFromCell(c,sharedValues);
    });
    updatePromisedRange(promisedRange,promised);
    addRecord(groups,dcId,dc,cap,counters);
    if(rowNo%100000===0) postMessage({type:'progress',message:`در حال محاسبه گزارش: ${rowNo.toLocaleString()} ردیف`});
  });
  return finalizeGroups(groups,counters.relevantCount,counters.mismatchCount,threshold,minMismatchCount,promisedRange);
}

async function analyzeCsv(file,threshold,minMismatchCount){
  const reader=file.stream().getReader(), decoder=new TextDecoder('utf-8');
  let field='', row=[], inQuotes=false, quoteSeen=false, skipLF=false, headers=null, dcIdIdx=-1,dcIdx=-1,capIdx=-1,promisedIdx=-1,rowNo=0;
  const groups=new Map(), counters={relevantCount:0,mismatchCount:0}, promisedRange={min:null,max:null};
  function emitField(){ row.push(field); field=''; }
  function emitRow(){
    if(row.length===1 && row[0]==='' && headers) { row=[]; return; }
    rowNo++;
    if(!headers){
      headers=row.map(v=>headerNorm(v.replace(/^\uFEFF/,'')));
      dcIdIdx=headers.findIndex(h=>['distribution_center_id_cap','distribution center id cap'].includes(h)); dcIdx=headers.indexOf('dc_name'); capIdx=headers.indexOf('distribution_center_cap'); promisedIdx=headers.findIndex(h=>['persian_promised_date','persian promised date'].includes(h));
      if(dcIdIdx<0||dcIdx<0||capIdx<0){
        const missing=[dcIdIdx<0?'distribution_center_id_cap':null,dcIdx<0?'DC_Name':null,capIdx<0?'distribution_center_cap':null].filter(Boolean).join(' و ');
        throw new Error(`ستون ${missing} پیدا نشد.`);
      }
    } else { updatePromisedRange(promisedRange,row[promisedIdx]??''); addRecord(groups,row[dcIdIdx]??'',row[dcIdx]??'',row[capIdx]??'',counters); }
    row=[];
    if(rowNo%100000===0) postMessage({type:'progress',message:`در حال تحلیل CSV: ${rowNo.toLocaleString()} ردیف`});
  }
  function processChar(c){
    if(skipLF){ skipLF=false; if(c==='\n') return; }
    if(inQuotes){
      if(quoteSeen){
        if(c==='"'){ field+='"'; quoteSeen=false; return; }
        inQuotes=false; quoteSeen=false;
      } else {
        if(c==='"'){ quoteSeen=true; return; }
        field+=c; return;
      }
    }
    if(c==='"'){ inQuotes=true; return; }
    if(c===','){ emitField(); return; }
    if(c==='\r'){ emitField(); emitRow(); skipLF=true; return; }
    if(c==='\n'){ emitField(); emitRow(); return; }
    field+=c;
  }
  while(true){
    const {value,done}=await reader.read(); if(done) break;
    const s=decoder.decode(value,{stream:true}); for(let i=0;i<s.length;i++) processChar(s[i]);
  }
  const tail=decoder.decode(); for(let i=0;i<tail.length;i++) processChar(tail[i]);
  if(quoteSeen){ inQuotes=false; quoteSeen=false; }
  if(field.length||row.length){ emitField(); emitRow(); }
  if(!headers) throw new Error('فایل فاقد داده است.');
  return finalizeGroups(groups,counters.relevantCount,counters.mismatchCount,threshold,minMismatchCount,promisedRange);
}



const previousCenterHeaders = new Set(['نام مرکز','center','distribution_center_cap']);
const previousIdHeaders = new Set(['شناسه مرکز','dc_id','dc id','dcid','id']);
const previousPercentHeaders = new Set(['درصد تغییر dc','درصد تغییر dc دوره جاری','درصد مغایرت','درصد مغایرت دوره جاری','mismatchpercent','mismatch_percent','mismatch percentage','mismatch percent']);
function latinizeDigits(v){
  const p='۰۱۲۳۴۵۶۷۸۹', a='٠١٢٣٤٥٦٧٨٩';
  return text(v).replace(/[۰-۹]/g,d=>p.indexOf(d)).replace(/[٠-٩]/g,d=>a.indexOf(d));
}
function parsePercentValue(v){
  const s=latinizeDigits(v).replace(/٪/g,'%').replace(/,/g,'').trim();
  if(!s) return null;
  const n=Number(s.replace('%',''));
  return Number.isFinite(n)?n:null;
}
function round2(n){ return Math.round((n+Number.EPSILON)*100)/100; }

async function findPreviousHeaderSharedIds(file,sharedEntry){
  const ids={center:new Set(),id:new Set(),percent:new Set()};
  if(!sharedEntry) return ids;
  let idx=0;
  await streamElements(file,sharedEntry,'si',si=>{
    const v=headerNorm(getSiText(si));
    if(previousCenterHeaders.has(v)) ids.center.add(idx);
    if(previousIdHeaders.has(v)) ids.id.add(idx);
    if(previousPercentHeaders.has(v)) ids.percent.add(idx);
    idx++;
  });
  return ids;
}
async function findPreviousColumns(file,sheetEntry,headerIds){
  let result=null;
  await streamElements(file,sheetEntry,'row',row=>{
    let center=-1,id=-1,percent=-1;
    forEachCell(row,c=>{
      let v='';
      if(c.type==='s'){
        const id=Number(c.raw);
        if(headerIds.center.has(id)) v='نام مرکز';
        else if(headerIds.id.has(id)) v='شناسه مرکز';
        else if(headerIds.percent.has(id)) v='درصد تغییر DC';
      } else v=headerNorm(c.type==='inlineStr'?c.inline:c.raw);
      if(previousCenterHeaders.has(v)) center=c.col;
      if(previousIdHeaders.has(v)) id=c.col;
      if(previousPercentHeaders.has(v)) percent=c.col;
    });
    if(center<0&&id<0) throw new Error('در گزارش دوره قبل ستون «شناسه مرکز» یا «نام مرکز» پیدا نشد.');
    if(percent<0) throw new Error('در گزارش دوره قبل ستون «درصد تغییر DC» پیدا نشد.');
    result={center,id,percent}; return false;
  });
  if(!result) throw new Error('گزارش دوره قبل فاقد داده است.');
  return result;
}
async function collectPreviousSharedIds(file,sheetEntry,cols){
  const needed=new Set(); let rowNo=0;
  await streamElements(file,sheetEntry,'row',row=>{
    rowNo++; if(rowNo===1) return;
    forEachCell(row,c=>{ if((c.col===cols.center||c.col===cols.id||c.col===cols.percent)&&c.type==='s'&&c.raw!=='') needed.add(Number(c.raw)); });
  });
  return needed;
}
async function parsePreviousXlsx(file){
  postMessage({type:'progress',message:'در حال خواندن گزارش دوره قبل...'});
  const entries=await readZipDirectory(file);
  const shared=entries.find(e=>e.name==='xl/sharedStrings.xml');
  const sheets=entries.filter(e=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name)).sort((a,b)=>{
    const na=Number((a.name.match(/sheet(\d+)/i)||[])[1]||0), nb=Number((b.name.match(/sheet(\d+)/i)||[])[1]||0); return na-nb;
  });
  const sheet=sheets[0]; if(!sheet) throw new Error('گزارش دوره قبل Sheet قابل خواندن ندارد.');
  const headerIds=await findPreviousHeaderSharedIds(file,shared);
  const cols=await findPreviousColumns(file,sheet,headerIds);
  const needed=await collectPreviousSharedIds(file,sheet,cols);
  const sharedValues=await resolveSharedValues(file,shared,needed);
  const map=new Map(); let rowNo=0;
  await streamElements(file,sheet,'row',row=>{
    rowNo++; if(rowNo===1) return;
    let center='',id='',percent='';
    forEachCell(row,c=>{
      if(c.col===cols.center) center=valueFromCell(c,sharedValues);
      else if(c.col===cols.id) id=valueFromCell(c,sharedValues);
      else if(c.col===cols.percent) percent=valueFromCell(c,sharedValues);
    });
    const pct=parsePercentValue(percent);
    if(pct!=null){ if(cleanId(id))map.set('ID:'+cleanId(id),pct); if(normalizeForCompare(center))map.set('NAME:'+normalizeForCompare(center),pct); }
  });
  return map;
}
function parseCsvLine(line){
  const out=[]; let field='',q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(q){
      if(c==='"'&&line[i+1]==='"'){ field+='"'; i++; }
      else if(c==='"') q=false;
      else field+=c;
    }else if(c==='"') q=true;
    else if(c===','){ out.push(field); field=''; }
    else field+=c;
  }
  out.push(field); return out;
}
async function parsePreviousCsv(file){
  postMessage({type:'progress',message:'در حال خواندن گزارش دوره قبل...'});
  const raw=await file.text(), lines=raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  if(!lines.length) throw new Error('گزارش دوره قبل فاقد داده است.');
  const headers=parseCsvLine(lines[0]).map(headerNorm);
  const idIdx=headers.findIndex(h=>previousIdHeaders.has(h));
  const centerIdx=headers.findIndex(h=>previousCenterHeaders.has(h));
  const percentIdx=headers.findIndex(h=>previousPercentHeaders.has(h));
  if(idIdx<0&&centerIdx<0) throw new Error('در گزارش دوره قبل ستون «شناسه مرکز» یا «نام مرکز» پیدا نشد.');
  if(percentIdx<0) throw new Error('در گزارش دوره قبل ستون «درصد تغییر DC» پیدا نشد.');
  const map=new Map();
  for(let i=1;i<lines.length;i++){
    const row=parseCsvLine(lines[i]), pct=parsePercentValue(row[percentIdx]??'');
    if(pct!=null){ const id=cleanId(row[idIdx]??''); const name=normalizeForCompare(row[centerIdx]??''); if(id)map.set('ID:'+id,pct); if(name)map.set('NAME:'+name,pct); }
  }
  return map;
}
async function parsePreviousReport(file){
  return /\.csv$/i.test(file.name)?parsePreviousCsv(file):parsePreviousXlsx(file);
}
function applyPreviousComparison(result,previousMap){
  result.report=result.report.map(r=>{
    const prev=previousMap?(previousMap.get('ID:'+cleanId(r.dcId))??previousMap.get('NAME:'+normalizeForCompare(r.center||''))):null;
    if(prev==null) return {...r,previousPercent:null,deltaPercent:null,trend:'فاقد داده دوره قبل',trendClass:'trend-na'};
    const current=round2(r.mismatchPercent), previous=round2(prev), delta=round2(current-previous);
    if(Math.abs(delta)<0.005) return {...r,previousPercent:previous,deltaPercent:0,trend:'بدون تغییر',trendClass:'trend-flat'};
    if(delta>0) return {...r,previousPercent:previous,deltaPercent:delta,trend:'افزایشی',trendClass:'trend-up'};
    return {...r,previousPercent:previous,deltaPercent:delta,trend:'کاهشی',trendClass:'trend-down'};
  });
  return result;
}

onmessage=async e=>{
  const {file,previousFile,threshold,minMismatchCount=5,centerLookup}=e.data||{};
  try{
    if(!file) throw new Error('فایلی انتخاب نشده است.');
    let result=/\.csv$/i.test(file.name)?await analyzeCsv(file,threshold,minMismatchCount):await analyzeXlsx(file,threshold,minMismatchCount);
    result.report=result.report.map(r=>({...r,center:centerLookup?.[cleanId(r.dcId)]?.name||r.sourceCenterCap||''}));
    if(previousFile){ const previousMap=await parsePreviousReport(previousFile); result=applyPreviousComparison(result,previousMap); result.hasPreviousComparison=true; } else result.hasPreviousComparison=false;
    postMessage({type:'done',result});
  }catch(err){ postMessage({type:'error',message:err?.message||'خطا در تحلیل فایل.'}); }
};
