let selectedFile = null;
let previousFile = null;
let lastAnalysis = null;
let worker = null;

const $ = id => document.getElementById(id);
const els = {
  fileInput:$('fileInput'), dropZone:$('dropZone'), fileName:$('fileName'),
  previousFileInput:$('previousFileInput'), previousDropZone:$('previousDropZone'), previousFileName:$('previousFileName'),
  threshold:$('threshold'), analyzeBtn:$('analyzeBtn'), exportBtn:$('exportBtn'), status:$('status'),
  summarySection:$('summarySection'), reportSection:$('reportSection'), relevantCount:$('relevantCount'),
  mismatchCount:$('mismatchCount'), centerCount:$('centerCount'), reportDate:$('reportDate'),
  thresholdLabel:$('thresholdLabel'), reportBody:$('reportBody'), emptyState:$('emptyState')
};

function setStatus(message, error=false){
  els.status.textContent = message;
  els.status.classList.toggle('error', error);
}
function formatSize(file){ return `${file.name} — ${(file.size/1024/1024).toFixed(1)} MB`; }
function validFile(file){ return file && /\.(xlsx|csv)$/i.test(file.name); }
function chooseCurrentFile(file){
  if(!file) return;
  if(!validFile(file)){
    selectedFile=null; els.analyzeBtn.disabled=true;
    setStatus('فقط فایل XLSX یا CSV پشتیبانی می‌شود.', true); return;
  }
  selectedFile=file; els.fileName.textContent=formatSize(file);
  els.analyzeBtn.disabled=false; els.exportBtn.disabled=true;
  setStatus('فایل داده‌های جاری آماده تحلیل است.');
}
function choosePreviousFile(file){
  if(!file) return;
  if(!validFile(file)){
    previousFile=null; els.previousFileName.textContent='گزارش قبلی انتخاب نشده';
    setStatus('گزارش دوره قبل باید XLSX یا CSV باشد.', true); return;
  }
  previousFile=file; els.previousFileName.textContent=formatSize(file);
  els.exportBtn.disabled=true;
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
  try{
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }catch{
    return new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }
}
function latinDigits(s){
  const p='۰۱۲۳۴۵۶۷۸۹', a='٠١٢٣٤٥٦٧٨٩';
  return String(s).replace(/[۰-۹]/g,d=>p.indexOf(d)).replace(/[٠-٩]/g,d=>a.indexOf(d));
}
function render(r){
  const reportDate=persianReportDate();
  lastAnalysis={...r,reportDate};
  els.summarySection.classList.remove('hidden'); els.reportSection.classList.remove('hidden');
  els.relevantCount.textContent=r.relevantCount.toLocaleString('fa-IR');
  els.mismatchCount.textContent=r.mismatchCount.toLocaleString('fa-IR');
  els.centerCount.textContent=r.report.length.toLocaleString('fa-IR');
  els.reportDate.textContent=reportDate;
  els.thresholdLabel.textContent=`بالاتر از ${r.threshold}%`;
  els.reportBody.innerHTML='';
  for(const x of r.report){
    const tr=document.createElement('tr');
    const prev=x.previousPercent==null?'—':`${x.previousPercent.toFixed(2)}%`;
    const delta=x.deltaPercent==null?'—':`${x.deltaPercent>0?'+':''}${x.deltaPercent.toFixed(2)}`;
    const cells=[reportDate,x.center,x.total,x.mismatch,`${x.mismatchPercent.toFixed(2)}%`,prev,delta,x.trend];
    cells.forEach((v,i)=>{
      const td=document.createElement('td'); td.textContent=v;
      if(i>=2 && i<=6) td.className='num';
      if(i===7 && x.trendClass) td.classList.add(x.trendClass);
      tr.appendChild(td);
    });
    els.reportBody.appendChild(tr);
  }
  els.emptyState.classList.toggle('hidden',r.report.length>0); els.exportBtn.disabled=false;
}
function stopWorker(){ if(worker){ worker.terminate(); worker=null; } }

els.analyzeBtn.addEventListener('click',()=>{
  if(!selectedFile) return;
  let threshold=Number(els.threshold.value); if(!Number.isFinite(threshold)) threshold=0;
  threshold=Math.max(0,Math.min(100,threshold)); els.threshold.value=threshold;
  stopWorker(); worker=new Worker('worker.js');
  els.analyzeBtn.disabled=true; els.exportBtn.disabled=true;
  setStatus(previousFile?'در حال تحلیل داده‌ها و گزارش دوره قبل...':'در حال تحلیل کم‌حافظه فایل...');
  worker.onmessage=e=>{
    const msg=e.data||{};
    if(msg.type==='progress') setStatus(msg.message);
    if(msg.type==='done'){
      render(msg.result);
      setStatus(`تحلیل انجام شد: ${msg.result.report.length} مرکز بالاتر از آستانه قرار دارد${previousFile?' و روند دوره‌ای محاسبه شد':''}.`);
      els.analyzeBtn.disabled=false; stopWorker();
    }
    if(msg.type==='error'){
      lastAnalysis=null; els.summarySection.classList.add('hidden'); els.reportSection.classList.add('hidden');
      setStatus(msg.message||'خطا در تحلیل فایل.',true); els.analyzeBtn.disabled=false; stopWorker();
    }
  };
  worker.onerror=e=>{ lastAnalysis=null; setStatus(e.message||'خطا در پردازش فایل.',true); els.analyzeBtn.disabled=false; stopWorker(); };
  worker.postMessage({file:selectedFile,previousFile,threshold});
});

els.exportBtn.addEventListener('click',()=>{
  if(!lastAnalysis) return;
  const headers=['تاریخ','نام مرکز','تعداد کل','تعداد تغییر DC','درصد تغییر DC','درصد تغییر DC دوره قبل','تغییر نسبت به دوره قبل (واحد درصد)','روند'];
  const rows=[headers,...lastAnalysis.report.map(r=>[
    lastAnalysis.reportDate,r.center,r.total,r.mismatch,Number(r.mismatchPercent.toFixed(2)),
    r.previousPercent==null?'':Number(r.previousPercent.toFixed(2)),
    r.deltaPercent==null?'':Number(r.deltaPercent.toFixed(2)),r.trend
  ])];
  const blob=window.GanjeXlsx.buildXlsx(rows), url=URL.createObjectURL(blob), a=document.createElement('a');
  const safeDate=latinDigits(lastAnalysis.reportDate).replace(/[^0-9]+/g,'-');
  a.href=url; a.download=`GANJE-Follow-up-${safeDate}.xlsx`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
});

(function syncDigiExpressTheme(){
  const apply=()=>{
    const q=new URLSearchParams(location.search).get('theme');
    const theme=q==='dark'?'dark':q==='light'?'light':(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
    document.documentElement.dataset.theme=theme;
  };
  apply();
  addEventListener('message',e=>{ if(e?.data?.type==='DX_THEME' && /^(light|dark)$/.test(e.data.theme)){ document.documentElement.dataset.theme=e.data.theme; } });
})();
