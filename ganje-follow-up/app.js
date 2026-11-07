(() => {
  'use strict';
  const DATASETS_SPREADSHEET_ID='1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
  const DATASET_SHEET='Distribution Centers (LG)';
  const $=id=>document.getElementById(id);
  const els={
    fileInput:$('fileInput'), dropZone:$('dropZone'), fileName:$('fileName'),
    previousFileInput:$('previousFileInput'), previousDropZone:$('previousDropZone'), previousFileName:$('previousFileName'),
    threshold:$('threshold'), minMismatchCount:$('minMismatchCount'), analyzeBtn:$('analyzeBtn'), exportBtn:$('exportBtn'), status:$('status'),
    thresholdLabel:$('thresholdLabel'), trendLegend:$('trendLegend'), copyTableBtn:$('copyTableBtn'),
    reportHeadRow:$('reportHeadRow'), reportRangeTitle:$('reportRangeTitle'), reportBody:$('reportBody'), emptyState:$('emptyState')
  };
  let selectedFile=null, previousFile=null, worker=null, watchdog=null, lastAnalysis=null;

  const latinize=v=>String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const text=v=>String(v??'').trim();
  const normKey=v=>latinize(v).trim().toLowerCase().replace(/[\s_-]+/g,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function setStatus(msg,error=false){ if(!els.status) return; els.status.textContent=msg; els.status.classList.toggle('error',!!error); }
  function validFile(f){return !!f&&/\.(xlsx|csv)$/i.test(f.name||'');}
  function formatSize(f){return `${f.name} — ${(f.size/1024/1024).toFixed(1)} MB`;}
  function wireDrop(zone,input,handler){
    input?.addEventListener('change',e=>handler(e.target.files?.[0]));
    ['dragenter','dragover'].forEach(t=>zone?.addEventListener(t,e=>{e.preventDefault();zone.classList.add('dragover');}));
    ['dragleave','drop'].forEach(t=>zone?.addEventListener(t,e=>{e.preventDefault();zone.classList.remove('dragover');}));
    zone?.addEventListener('drop',e=>handler(e.dataTransfer?.files?.[0]));
  }
  function chooseCurrent(f){
    if(!f)return;
    if(!validFile(f)){selectedFile=null;els.analyzeBtn.disabled=true;setStatus('فقط فایل XLSX یا CSV پشتیبانی می‌شود.',true);return;}
    selectedFile=f;els.fileName.textContent=formatSize(f);els.analyzeBtn.disabled=false;els.exportBtn.disabled=true;els.copyTableBtn.disabled=true;setStatus('فایل جاری آماده تحلیل است.');
  }
  function choosePrevious(f){
    if(!f)return;
    if(!validFile(f)){previousFile=null;els.previousFileName.textContent='انتخاب نشده';setStatus('گزارش دوره قبل باید XLSX یا CSV باشد.',true);return;}
    previousFile=f;els.previousFileName.textContent=formatSize(f);els.exportBtn.disabled=true;els.copyTableBtn.disabled=true;setStatus('گزارش دوره قبل انتخاب شد.');
  }
  wireDrop(els.dropZone,els.fileInput,chooseCurrent);wireDrop(els.previousDropZone,els.previousFileInput,choosePrevious);

  async function loadDcLookup(){
    if(!globalThis.DigiExpressPlatform?.call) throw new Error('ارتباط با Platform برای خواندن دیتاست Distribution Centers آماده نیست.');
    setStatus('در حال دریافت دیتاست Distribution Centers...');
    const raw=await DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:DATASETS_SPREADSHEET_ID,sheetName:DATASET_SHEET,limit:100000});
    const rows=raw?.rows||raw?.data?.rows||raw?.values||raw?.data||[];
    const headers=(raw?.headers||raw?.data?.headers||[]).map(v=>text(v));
    if(!Array.isArray(rows)) throw new Error('پاسخ دیتاست Distribution Centers قابل خواندن نیست.');
    let records=[];
    if(headers.length&&Array.isArray(rows[0])) records=rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r?.[i]])));
    else if(rows.length&&Array.isArray(rows[0])){
      const h=rows[0].map(v=>text(v)); records=rows.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r?.[i]])));
    } else records=rows;
    const map=new Map();
    for(const r of records){
      if(!r||typeof r!=='object')continue;
      const by={}; for(const [k,v] of Object.entries(r)) by[normKey(k)]=v;
      const id=text(by.id??by.distributioncenterid??by.dc_id??by.dcid);
      const name=text(by.name??by.dcname??by.distributioncentername);
      if(id) map.set(normKey(id),{id,name});
    }
    return map;
  }

  function stopWorker(){if(watchdog){clearTimeout(watchdog);watchdog=null;}if(worker){worker.terminate();worker=null;}}
  function armWatchdog(){
    if(watchdog)clearTimeout(watchdog);
    watchdog=setTimeout(()=>{
      stopWorker(); els.analyzeBtn.disabled=false; setStatus('پردازش بیش از حد بدون پاسخ مانده و متوقف شد. لطفاً فایل را دوباره بررسی کنید.',true);
    },180000);
  }
  function makeHeaders(withPrev){
    const base=[['ردیف','row'],['شناسه مرکز','id'],['یاتاکد','iata'],['نام مرکز','name'],['تعداد کل','total'],['تعداد تغییر DC','mismatch'],['درصد تغییر DC','percent']];
    if(withPrev) base.push(['درصد تغییر DC<br>دوره قبل','previous'],['تغییر نسبت به<br>دوره قبل','delta'],['روند','trend']);
    return base;
  }
  function formatPercent(v){return Number.isFinite(v)?`${Number(v.toFixed(2))}%`:'—';}
  function render(result,lookup){
    const withPrev=!!previousFile;
    const report=result.report.map(r=>{
      const hit=lookup.get(normKey(r.id));
      const name=hit?.name||r.fallbackName||r.iata||'';
      return {...r,id:hit?.id||r.id,name};
    }).sort((a,b)=>text(a.iata).localeCompare(text(b.iata),'en',{numeric:true,sensitivity:'base'})||text(a.name).localeCompare(text(b.name),'fa'));
    lastAnalysis={...result,report,withPrev};
    const headers=makeHeaders(withPrev);
    els.reportHeadRow.innerHTML=headers.map(([label])=>`<th>${label}</th>`).join('');
    els.reportRangeTitle.colSpan=headers.length;
    const range=result.dateMin&&result.dateMax?`${result.dateMin} تا ${result.dateMax}`:'—';
    els.reportRangeTitle.textContent=`گزارش گنجه هایی که تغییر روش ارسال داشته اند. بازه پرامیس دیت: ${range}`;
    els.reportBody.innerHTML='';
    report.forEach((r,idx)=>{
      const cells=[idx+1,r.id,r.iata,r.name,r.total,r.mismatch,formatPercent(r.mismatchPercent)];
      if(withPrev) cells.push(r.previousPercent==null?'—':formatPercent(r.previousPercent),r.deltaPercent==null?'—':`${r.deltaPercent>0?'+':''}${Number(r.deltaPercent.toFixed(2))}`,r.trend||'—');
      const tr=document.createElement('tr');
      cells.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;td.setAttribute('align','center');td.style.textAlign='center';td.style.verticalAlign='middle';if(i===cells.length-1&&withPrev&&r.trendClass)td.classList.add(r.trendClass);tr.appendChild(td);});
      els.reportBody.appendChild(tr);
    });
    els.emptyState.classList.toggle('hidden',report.length>0);
    els.trendLegend?.classList.toggle('hidden',!withPrev);
    els.exportBtn.disabled=report.length===0; els.copyTableBtn.disabled=report.length===0;
    els.thresholdLabel.textContent=`حداقل ${result.threshold}% و حداقل ${result.minMismatchCount} تغییر`;
    return report.length;
  }

  els.analyzeBtn?.addEventListener('click',async()=>{
    if(!selectedFile)return;
    let threshold=Number(els.threshold.value);if(!Number.isFinite(threshold))threshold=50;threshold=Math.max(0,Math.min(100,threshold));els.threshold.value=threshold;
    let minMismatchCount=Math.floor(Number(els.minMismatchCount.value));if(!Number.isFinite(minMismatchCount)||minMismatchCount<0)minMismatchCount=5;els.minMismatchCount.value=minMismatchCount;
    stopWorker();lastAnalysis=null;els.analyzeBtn.disabled=true;els.exportBtn.disabled=true;els.copyTableBtn.disabled=true;
    try{
      const lookup=await loadDcLookup();
      setStatus(previousFile?'در حال تحلیل فایل جاری و مقایسه با دوره قبل...':'در حال تحلیل فایل جاری...');
      worker=new Worker(`worker.js?v=504`); armWatchdog();
      worker.onmessage=e=>{
        armWatchdog(); const msg=e.data||{};
        if(msg.type==='progress'){setStatus(msg.message||'در حال پردازش...');return;}
        if(msg.type==='error'){stopWorker();els.analyzeBtn.disabled=false;setStatus(msg.message||'خطا در تحلیل فایل.',true);return;}
        if(msg.type==='done'){
          try{const n=render(msg.result,lookup);setStatus(`تحلیل کامل شد: ${n.toLocaleString('fa-IR')} مرکز در گزارش قرار گرفت.`);}
          catch(err){setStatus(`تحلیل انجام شد اما نمایش گزارش خطا داد: ${err.message||err}`,true);}
          finally{els.analyzeBtn.disabled=false;stopWorker();}
        }
      };
      worker.onerror=e=>{stopWorker();els.analyzeBtn.disabled=false;setStatus(e.message||'Worker با خطا متوقف شد.',true);};
      worker.postMessage({file:selectedFile,previousFile,threshold,minMismatchCount});
    }catch(err){els.analyzeBtn.disabled=false;stopWorker();setStatus(err?.message||'شروع تحلیل ممکن نشد.',true);}
  });

  els.exportBtn?.addEventListener('click',()=>{
    if(!lastAnalysis?.report?.length||!window.GanjeXlsx?.buildXlsx)return;
    const headers=makeHeaders(lastAnalysis.withPrev).map(([label])=>label.replace(/<br>/g,' '));
    const rows=[headers,...lastAnalysis.report.map((r,idx)=>{
      const a=[idx+1,r.id,r.iata,r.name,r.total,r.mismatch,Number(r.mismatchPercent.toFixed(2))];
      if(lastAnalysis.withPrev)a.push(r.previousPercent==null?'':Number(r.previousPercent.toFixed(2)),r.deltaPercent==null?'':Number(r.deltaPercent.toFixed(2)),r.trend||'');
      return a;
    })];
    const blob=GanjeXlsx.buildXlsx(rows),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GANJE-Follow-up.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  });
})();
