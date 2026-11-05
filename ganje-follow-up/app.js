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
  threshold:$('threshold'), analyzeBtn:$('analyzeBtn'), exportBtn:$('exportBtn'), copyTableBtn:$('copyTableBtn'), status:$('status'),
  reportSection:$('reportSection'), thresholdLabel:$('thresholdLabel'), reportBody:$('reportBody'), emptyState:$('emptyState')
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
    return {...r,centerId:ref?.id||key,centerName:ref?.name||'یافت نشد در دیتاست'};
  });
  return {...result,report,unresolved};
}

function render(r){
  const reportDate=persianReportDate(); lastAnalysis={...r,reportDate};
  els.reportSection.classList.remove('hidden'); els.thresholdLabel.textContent=`بالاتر از ${r.threshold}%`; els.reportBody.innerHTML='';
  r.report.forEach((x,index)=>{
    const tr=document.createElement('tr');
    const prev=x.previousPercent==null?'—':`${x.previousPercent.toFixed(2)}%`;
    const delta=x.deltaPercent==null?'—':`${x.deltaPercent>0?'+':''}${x.deltaPercent.toFixed(2)}`;
    const cells=[index+1,reportDate,x.centerId,x.centerName,x.total,x.mismatch,`${x.mismatchPercent.toFixed(2)}%`,prev,delta,x.trend];
    cells.forEach((v,i)=>{
      const td=document.createElement('td'); td.textContent=v;
      if([0,2,4,5,6,7,8].includes(i))td.classList.add('num');
      if(i===9&&x.trendClass)td.classList.add(x.trendClass);
      tr.appendChild(td);
    });
    els.reportBody.appendChild(tr);
  });
  els.emptyState.classList.toggle('hidden',r.report.length>0);
  els.exportBtn.disabled=false; els.copyTableBtn.disabled=r.report.length===0;
}

function stopWorker(){if(worker){worker.terminate();worker=null;}}

els.analyzeBtn.addEventListener('click',async()=>{
  if(!selectedFile)return;
  let threshold=Number(els.threshold.value); if(!Number.isFinite(threshold))threshold=50;
  threshold=Math.max(0,Math.min(100,threshold)); els.threshold.value=threshold;
  stopWorker(); els.analyzeBtn.disabled=true; els.exportBtn.disabled=true; els.copyTableBtn.disabled=true;
  try{
    const centerMap=await loadDistributionCenters();
    worker=new Worker('worker.js?v=489');
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
    worker.postMessage({file:selectedFile,previousFile,threshold,centerLookup});
  }catch(err){ lastAnalysis=null; els.reportSection.classList.add('hidden'); setStatus(err?.message||'خطا در دریافت دیتاست Distribution Centers.',true); els.analyzeBtn.disabled=false; }
});

function reportRows(){
  if(!lastAnalysis)return [];
  return lastAnalysis.report.map((r,i)=>[
    i+1,lastAnalysis.reportDate,r.centerId,r.centerName,r.total,r.mismatch,Number(r.mismatchPercent.toFixed(2)),
    r.previousPercent==null?'':Number(r.previousPercent.toFixed(2)),r.deltaPercent==null?'':Number(r.deltaPercent.toFixed(2)),r.trend
  ]);
}
const reportHeaders=['ردیف','تاریخ','شناسه مرکز','نام مرکز','تعداد کل','تعداد تغییر DC','درصد تغییر DC','درصد تغییر DC دوره قبل','تغییر نسبت به دوره قبل (واحد درصد)','روند'];

els.exportBtn.addEventListener('click',()=>{
  if(!lastAnalysis)return;
  const rows=[reportHeaders,...reportRows()];
  const blob=window.GanjeXlsx.buildXlsx(rows),url=URL.createObjectURL(blob),a=document.createElement('a');
  const safeDate=latinDigits(lastAnalysis.reportDate).replace(/[^0-9]+/g,'-');
  a.href=url;a.download=`GANJE-Follow-up-${safeDate}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
});

els.copyTableBtn.addEventListener('click',async()=>{
  if(!lastAnalysis)return;
  const tsv=[reportHeaders,...reportRows()].map(row=>row.map(v=>String(v??'').replace(/\t|\r?\n/g,' ')).join('\t')).join('\n');
  try{await navigator.clipboard.writeText(tsv);setStatus('جدول در Clipboard کپی شد.');}
  catch{setStatus('امکان کپی جدول در Clipboard وجود ندارد.',true);}
});

(function syncDigiExpressTheme(){
  const apply=()=>{const q=new URLSearchParams(location.search).get('theme');document.documentElement.dataset.theme=q==='dark'?'dark':q==='light'?'light':(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');};
  apply(); addEventListener('message',e=>{if(e?.data?.type==='DX_THEME'&&/^(light|dark)$/.test(e.data.theme))document.documentElement.dataset.theme=e.data.theme;});
})();
