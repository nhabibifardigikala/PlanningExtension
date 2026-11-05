let selectedFile = null;
let previousFile = null;
let lastAnalysis = null;
let worker = null;
let centersCache = null;

const DATASETS_SPREADSHEET_ID = '1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
const DISTRIBUTION_CENTERS_SHEET = 'Distribution Centers (LG)';
const $ = id => document.getElementById(id);
const els = {
  fileInput:$('fileInput'), dropZone:$('dropZone'), fileName:$('fileName'),
  previousFileInput:$('previousFileInput'), previousDropZone:$('previousDropZone'), previousFileName:$('previousFileName'),
  threshold:$('threshold'), minMismatchCount:$('minMismatchCount'), analyzeBtn:$('analyzeBtn'), exportBtn:$('exportBtn'), copyTableBtn:$('copyTableBtn'), status:$('status'),
  reportSection:$('reportSection'), thresholdLabel:$('thresholdLabel'), reportRangeTitle:$('reportRangeTitle'), reportHeadRow:$('reportHeadRow'), trendLegend:$('trendLegend'), copyToast:$('copyToast'), reportBody:$('reportBody'), emptyState:$('emptyState')
};

function setStatus(message, error=false){ els.status.textContent=message; els.status.classList.toggle('error',error); }
function formatSize(file){ return `${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`; }
function validFile(file){ return file && /\.(xlsx|csv)$/i.test(file.name); }
function chooseCurrentFile(file){
  if(!file)return;
  if(!validFile(file)){ selectedFile=null; els.analyzeBtn.disabled=true; setStatus('فقط فایل XLSX یا CSV پشتیبانی می‌شود.',true); return; }
  selectedFile=file; els.fileName.textContent=formatSize(file); els.analyzeBtn.disabled=false; els.exportBtn.disabled=true; els.copyTableBtn.disabled=true;
  setStatus('فایل داده‌های جاری آماده تحلیل است.');
}
function choosePreviousFile(file){
  if(!file)return;
  if(!validFile(file)){ previousFile=null; els.previousFileName.textContent='گزارش قبلی انتخاب نشده'; setStatus('گزارش دوره قبل باید XLSX یا CSV باشد.',true); return; }
  previousFile=file; els.previousFileName.textContent=formatSize(file); els.exportBtn.disabled=true; els.copyTableBtn.disabled=true;
  setStatus('گزارش دوره قبل برای مقایسه انتخاب شد.');
}
function wireDrop(zone,input,chooser){
  input.addEventListener('change',e=>chooser(e.target.files[0]));
  ['dragenter','dragover'].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.add('dragover');}));
  ['dragleave','drop'].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.remove('dragover');}));
  zone.addEventListener('drop',e=>chooser(e.dataTransfer.files[0]));
}
wireDrop(els.dropZone,els.fileInput,chooseCurrentFile);
wireDrop(els.previousDropZone,els.previousFileInput,choosePreviousFile);

function persianReportDate(){
  try{return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  catch{return new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
}
function latinDigits(s){
  const p='۰۱۲۳۴۵۶۷۸۹',a='٠١٢٣٤٥٦٧٨٩';
  return String(s).replace(/[۰-۹]/g,d=>p.indexOf(d)).replace(/[٠-٩]/g,d=>a.indexOf(d));
}
function normHeader(v){return String(v??'').trim().toLowerCase().replace(/[\u200c\u200f\u202a-\u202e]/g,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ');}
function normId(v){return latinDigits(v??'').replace(/\.0$/,'').trim();}
function findHeader(headers,aliases){const wanted=new Set(aliases.map(normHeader)); return headers.findIndex(h=>wanted.has(normHeader(h)));}

async function loadDistributionCenters(){
  if(centersCache)return centersCache;
  if(!window.DigiExpressPlatform?.call)throw new Error('ارتباط با دیتاست Distribution Centers در دسترس نیست. اکستنشن را Reload کنید.');
  setStatus('در حال دریافت دیتاست Distribution Centers...');
  const raw=await window.DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:DATASETS_SPREADSHEET_ID,sheetName:DISTRIBUTION_CENTERS_SHEET,limit:100000});
  const data=raw?.result??raw??{};
  const headers=Array.isArray(data.headers)?data.headers:[], rows=Array.isArray(data.rows)?data.rows:[];
  const ii=findHeader(headers,['id','distribution center id','distribution_center_id','dc id','dc_id']);
  const ni=findHeader(headers,['name','distribution center name','distribution center','dc name','dc_name']);
  if(ii<0||ni<0)throw new Error('دیتاست Distribution Centers ستون id یا name ندارد.');
  const byId=new Map();
  for(const row of rows){
    const id=normId(row?.[ii]); const name=String(row?.[ni]??'').trim();
    if(id&&!byId.has(id))byId.set(id,{id,name});
  }
  if(!byId.size)throw new Error('دیتاست Distribution Centers خالی است.');
  centersCache=byId; return byId;
}

function enrichWithCenters(result,centerMap){
  let unresolved=0;
  const report=result.report.map(r=>{
    const key=normId(r.dcId); const ref=centerMap.get(key);
    if(!ref)unresolved++;
    return {...r,centerId:ref?.id||key,centerName:ref?.name||String(r.sourceCenterCap||'').trim()||'یافت نشد در دیتاست'};
  });
  return {...result,report,unresolved};
}

function reportColumns(hasPrevious){
  const cols=[
    {key:'row',plain:'ردیف',html:'ردیف'},
    {key:'date',plain:'تاریخ',html:'تاریخ'},
    {key:'centerId',plain:'شناسه مرکز',html:'شناسه مرکز'},
    {key:'centerName',plain:'نام مرکز',html:'نام مرکز'},
    {key:'total',plain:'تعداد کل',html:'تعداد کل'},
    {key:'mismatch',plain:'تعداد تغییر DC',html:'تعداد تغییر DC'},
    {key:'mismatchPercent',plain:'درصد تغییر DC',html:'درصد تغییر DC'}
  ];
  if(hasPrevious) cols.push(
    {key:'previousPercent',plain:'درصد تغییر DC دوره قبل',html:'درصد تغییر DC<br>دوره قبل'},
    {key:'deltaPercent',plain:'تغییر نسبت به دوره قبل',html:'تغییر نسبت به<br>دوره قبل'},
    {key:'trend',plain:'روند',html:'روند'}
  );
  return cols;
}
function reportRangeText(r){
  const min=String(r.promisedMin||'').trim(),max=String(r.promisedMax||'').trim();
  const range=min&&max?(min===max?min:`${min} تا ${max}`):(min||max||'—');
  return `گزارش گنجه هایی که تغییر روش ارسال داشته اند. بازه پرامیس دیت: ${range}`;
}
function rowValues(x,index,hasPrevious,reportDate){
  const values=[index+1,reportDate,x.centerId,x.centerName,x.total,x.mismatch,`${x.mismatchPercent.toFixed(2)}%`];
  if(hasPrevious){
    const prev=x.previousPercent==null?'—':`${x.previousPercent.toFixed(2)}%`;
    const delta=x.deltaPercent==null?'—':`${x.deltaPercent>0?'+':''}${x.deltaPercent.toFixed(2)}`;
    values.push(prev,delta,x.trend);
  }
  return values;
}
function render(r){
  const reportDate=persianReportDate(),hasPrevious=!!r.hasPreviousComparison; lastAnalysis={...r,reportDate,hasPreviousComparison:hasPrevious};
  els.reportSection.classList.remove('hidden'); els.thresholdLabel.textContent=`حداقل ${r.threshold}% و حداقل ${r.minMismatchCount} تغییر`; els.reportRangeTitle.textContent=reportRangeText(r); els.reportBody.innerHTML='';
  const columns=reportColumns(hasPrevious); els.reportRangeTitle.colSpan=columns.length; els.reportHeadRow.innerHTML=columns.map(c=>`<th>${c.html}</th>`).join(''); els.trendLegend.classList.toggle('hidden',!hasPrevious);
  r.report.forEach((x,index)=>{
    const tr=document.createElement('tr'), cells=rowValues(x,index,hasPrevious,reportDate);
    cells.forEach((v,i)=>{
      const td=document.createElement('td'); td.textContent=v;
      if([0,2,4,5,6,7,8].includes(i))td.classList.add('num');
      if(hasPrevious&&i===9&&x.trendClass)td.classList.add(x.trendClass);
      tr.appendChild(td);
    });
    els.reportBody.appendChild(tr);
  });
  els.emptyState.textContent='هیچ مرکزی با شرایط انتخاب‌شده پیدا نشد.'; els.emptyState.classList.toggle('hidden',r.report.length>0);
  els.exportBtn.disabled=false; els.copyTableBtn.disabled=r.report.length===0;
}

function stopWorker(){if(worker){worker.terminate();worker=null;}}

els.analyzeBtn.addEventListener('click',async()=>{
  if(!selectedFile)return;
  let threshold=Number(els.threshold.value); if(!Number.isFinite(threshold))threshold=50;
  threshold=Math.max(0,Math.min(100,threshold)); els.threshold.value=threshold;
  let minMismatchCount=Math.trunc(Number(els.minMismatchCount.value)); if(!Number.isFinite(minMismatchCount))minMismatchCount=5;
  minMismatchCount=Math.max(0,minMismatchCount); els.minMismatchCount.value=minMismatchCount;
  stopWorker(); els.analyzeBtn.disabled=true; els.exportBtn.disabled=true; els.copyTableBtn.disabled=true;
  try{
    const centerMap=await loadDistributionCenters();
    worker=new Worker('worker.js?v=496');
    setStatus(previousFile?'در حال تحلیل داده‌ها و گزارش دوره قبل...':'در حال تحلیل کم‌حافظه فایل...');
    worker.onmessage=e=>{
      const msg=e.data||{};
      if(msg.type==='progress')setStatus(msg.message);
      if(msg.type==='done'){
        const enriched=enrichWithCenters(msg.result,centerMap); render(enriched);
        const missing=enriched.unresolved?`؛ ${enriched.unresolved} شناسه در دیتاست پیدا نشد`:'';
        setStatus(`تحلیل انجام شد: ${enriched.report.length} مرکز بالاتر از آستانه قرار دارد${previousFile?' و روند دوره‌ای محاسبه شد':''}${missing}.`,!!enriched.unresolved);
        els.analyzeBtn.disabled=false; stopWorker();
      }
      if(msg.type==='error'){
        lastAnalysis=null; els.reportSection.classList.add('hidden'); setStatus(msg.message||'خطا در تحلیل فایل.',true); els.analyzeBtn.disabled=false; stopWorker();
      }
    };
    worker.onerror=e=>{lastAnalysis=null;setStatus(e.message||'خطا در پردازش فایل.',true);els.analyzeBtn.disabled=false;stopWorker();};
    const centerLookup=Object.fromEntries([...centerMap.entries()].map(([id,v])=>[id,{id:v.id,name:v.name}]));
    worker.postMessage({file:selectedFile,previousFile,threshold,minMismatchCount,centerLookup});
  }catch(err){ lastAnalysis=null; els.reportBody.innerHTML=''; els.emptyState.textContent='گزارش ایجاد نشد.'; els.emptyState.classList.remove('hidden'); setStatus(err?.message||'خطا در دریافت دیتاست Distribution Centers.',true); els.analyzeBtn.disabled=false; }
});

function reportRows(){
  if(!lastAnalysis)return [];
  const hasPrevious=!!lastAnalysis.hasPreviousComparison;
  return lastAnalysis.report.map((r,i)=>{
    const row=[i+1,lastAnalysis.reportDate,r.centerId,r.centerName,r.total,r.mismatch,Number(r.mismatchPercent.toFixed(2))];
    if(hasPrevious)row.push(r.previousPercent==null?'':Number(r.previousPercent.toFixed(2)),r.deltaPercent==null?'':Number(r.deltaPercent.toFixed(2)),r.trend);
    return row;
  });
}
function currentHeaders(){return reportColumns(!!lastAnalysis?.hasPreviousComparison).map(c=>c.plain);}
function currentHeaderHtml(){return reportColumns(!!lastAnalysis?.hasPreviousComparison).map(c=>c.html);}

els.exportBtn.addEventListener('click',()=>{
  if(!lastAnalysis)return;
  const headers=currentHeaders(); const rows=[[reportRangeText(lastAnalysis),...Array(Math.max(0,headers.length-1)).fill('')],headers,...reportRows()];
  const blob=window.GanjeXlsx.buildXlsx(rows),url=URL.createObjectURL(blob),a=document.createElement('a');
  const safeDate=latinDigits(lastAnalysis.reportDate).replace(/[^0-9]+/g,'-');
  a.href=url;a.download=`GANJE-Follow-up-${safeDate}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
});

function escapeHtml(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function copyColumnWidths(rows,headers){
  return headers.map((h,i)=>{
    let max=String(h).replace(/<br\s*\/?>/gi,' ').length;
    for(const row of rows)max=Math.max(max,String(row[i]??'').length);
    const cap=i===3?240:(i>=7?130:170);
    return Math.max(58,Math.min(cap,22+max*7));
  });
}
function buildClipboardTableHtml(rows){
  const rich=currentHeaderHtml(), widths=copyColumnWidths(rows,rich);
  const colgroup=widths.map(w=>`<col style="width:${w}px">`).join('');
  const title=escapeHtml(reportRangeText(lastAnalysis||{}));
  const titleRow=`<tr><th colspan="${rich.length}" style="border:1px solid #8797ad;background:#ffffff;color:#12213f;font-family:'Yekan Bakh FaNum','Yekan Bakh',Tahoma,Arial,sans-serif;font-size:10pt;font-weight:700;text-align:center;vertical-align:middle;padding:7px 8px;white-space:normal;line-height:1.35;">${title}</th></tr>`;
  const head=`<tr>${rich.map(h=>`<th style="border:1px solid #8797ad;background:#132a52;color:#ffffff;font-family:'Yekan Bakh FaNum','Yekan Bakh',Tahoma,Arial,sans-serif;font-size:10pt;font-weight:700;text-align:center;vertical-align:middle;padding:6px 8px;white-space:normal;line-height:1.35;">${h}</th>`).join('')}</tr>`;
  const body=rows.map(row=>`<tr>${row.map(v=>`<td style="border:1px solid #9aa9bf;background:#ffffff;color:#12213f;font-family:'Yekan Bakh FaNum','Yekan Bakh',Tahoma,Arial,sans-serif;font-size:10pt;font-weight:400;text-align:center;vertical-align:middle;padding:6px 8px;white-space:nowrap;">${escapeHtml(v)}</td>`).join('')}</tr>`).join('');
  return `<table dir="rtl" style="border-collapse:collapse;table-layout:fixed;font-family:'Yekan Bakh FaNum','Yekan Bakh',Tahoma,Arial,sans-serif;font-size:10pt;"><colgroup>${colgroup}</colgroup><thead>${titleRow}${head}</thead><tbody>${body}</tbody></table>`;
}
function showCopyToast(){
  els.copyToast?.classList.add('show'); clearTimeout(showCopyToast.timer); showCopyToast.timer=setTimeout(()=>els.copyToast?.classList.remove('show'),1100);
}

els.copyTableBtn.addEventListener('click',async()=>{
  if(!lastAnalysis)return;
  const rows=reportRows(), html=buildClipboardTableHtml(rows);
  let holder=null, sel=null;
  try{
    // Primary path: copy a real styled DOM table. Chrome preserves the HTML table,
    // borders, fills, font, alignment and column widths when pasted into Excel/Sheets.
    holder=document.createElement('div');
    holder.setAttribute('aria-hidden','true');
    holder.style.cssText='position:fixed;left:-100000px;top:0;width:max-content;background:#fff;z-index:-1;';
    holder.innerHTML=html;
    document.body.appendChild(holder);
    const table=holder.querySelector('table');
    const range=document.createRange(); range.selectNode(table);
    sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const ok=document.execCommand('copy');
    sel.removeAllRanges(); holder.remove(); holder=null;
    if(ok){showCopyToast();return;}
  }catch(_){try{sel?.removeAllRanges()}catch{} try{holder?.remove()}catch{}}

  // Secondary rich path. Never degrade silently to plain text because that loses formatting.
  try{
    if(window.ClipboardItem&&navigator.clipboard?.write){
      const blob=new Blob([html],{type:'text/html'});
      await navigator.clipboard.write([new ClipboardItem({'text/html':blob})]);
      showCopyToast(); return;
    }
  }catch(_){ }
  setStatus('کپی با فرمت جدول در این محیط پشتیبانی نشد. لطفاً دسترسی Clipboard را بررسی کنید.',true);
});

(function syncDigiExpressTheme(){
  const apply=()=>{const q=new URLSearchParams(location.search).get('theme');document.documentElement.dataset.theme=q==='dark'?'dark':q==='light'?'light':(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');};
  apply(); addEventListener('message',e=>{if(e?.data?.type==='DX_THEME'&&/^(light|dark)$/.test(e.data.theme))document.documentElement.dataset.theme=e.data.theme;});
})();
