/* DigiExpress v465: shared Excel dataset reader and last-export helper. */
(()=>{
'use strict';
const dbName='DXExcelDatasetsV465',store='files',key='dataSets';
let workbook=null, excelMode=false, name='', initialized=false;let selectedKey=key;
let readyPromise=Promise.resolve();
const icon='<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true" fill="none"><rect x="8" y="2" width="13" height="20" rx="2" fill="#16834A"/><path d="M8 7h13M8 12h13M8 17h13M14 2v20" stroke="#C7F5D8" stroke-width="1"/><rect x="2" y="6" width="12" height="13" rx="1.5" fill="#0D6138"/><path d="m5 9 5 7m0-7-5 7" stroke="white" stroke-width="1.8"/></svg>';
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>req.result.createObjectStore(store);req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result)})}
async function dbGet(k=selectedKey){const db=await openDb();return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).get(k);req.onsuccess=()=>{db.close();resolve(req.result)};req.onerror=()=>{db.close();reject(req.error)}})}
async function dbSet(value,k=selectedKey){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,k);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function requireXlsx(){if(globalThis.XLSX)return globalThis.XLSX;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Excel parser unavailable: check connection to the XLSX library'));document.head.appendChild(s)});if(!globalThis.XLSX)throw Error('Excel parser could not initialize');return globalThis.XLSX}
async function loadFile(file){await readyPromise;const x=await requireXlsx(),bytes=await file.arrayBuffer();workbook=x.read(bytes,{type:'array',cellDates:false});name=file.name;await dbSet({name,bytes},'workbook:'+name);await dbSet({name,bytes},key);selectedKey='workbook:'+name;excelMode=true;localStorage.setItem('dx-excel-source','excel');localStorage.setItem('dx-excel-workbook',selectedKey);updateIcon();document.dispatchEvent(new CustomEvent('dx-excel-source-changed',{detail:{source:'excel',name}}))}
function sheetData(sheetName){
 if(!workbook)throw new Error('No Excel workbook selected in Settings');
 const normalize=x=>String(x??'').trim().toLowerCase().replace(/[\u200c\u200f\s_-]+/g,'');
 const wanted=normalize(sheetName);
 const actual=workbook.SheetNames.find(x=>normalize(x)===wanted);
 if(!actual)throw Error('Excel sheet missing: '+sheetName+' (file: '+name+')');
 const ws=workbook.Sheets[actual];
 // XLSX worksheets may retain a formatted !ref without any actual cell values.
 // Avoid interpreting the formatted range as real records.
 const rows=globalThis.XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:false});
 const filled=rows.filter(r=>Array.isArray(r)&&r.some(v=>v!==''&&v!==null&&v!==undefined));
 if(filled.length<2)throw Error('Excel worksheet has no data rows: '+sheetName+' in '+name+'. Check the saved .xlsx values; formatting alone is not data.');
 // Permit a title/description line before the actual header row.
 let headerAt=0;
 for(let i=0;i<Math.min(12,filled.length);i++){
   const r=filled[i].map(v=>normalize(v));
   if(r.filter(Boolean).length>=2 && r.some(v=>['id','date','distributioncenter','hubid','dcid','name'].includes(v))){headerAt=i;break}
 }
 const headers=filled[headerAt].map(v=>String(v??'').trim());
 const body=filled.slice(headerAt+1).filter(r=>r.some(v=>v!==''&&v!==null&&v!==undefined));
 if(!body.length)throw Error('Excel sheet contains headers but no records: '+sheetName);
 return {headers,rows:body.map(r=>headers.map((_,i)=>r[i]??'')),sheetName:actual,source:'Excel',filename:name};
}
function updateIcon(){for(const b of document.querySelectorAll('[data-dx-excel-upload]')){b.title=(excelMode?'Excel source active: ':'Online source; click to choose Excel: ')+(name||'DataSets.xlsx');b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(excelMode));b.style.opacity=excelMode?'1':'.48';b.style.borderColor=excelMode?'#16834A':'transparent';b.style.background=excelMode?'rgba(22,131,74,.12)':'transparent'}}
async function chooseWorkbook(k){const saved=await dbGet(k);if(!saved?.bytes)throw Error('Workbook not found');const x=await requireXlsx();workbook=x.read(saved.bytes,{type:'array'});name=saved.name;selectedKey=k;excelMode=true;localStorage.setItem('dx-excel-workbook',k);localStorage.setItem('dx-excel-source','excel');updateIcon();document.dispatchEvent(new CustomEvent('dx-excel-source-changed',{detail:{source:'excel',name}}))}
function setMode(value){excelMode=!!value&&!!workbook;localStorage.setItem('dx-excel-source',excelMode?'excel':'online');updateIcon();document.dispatchEvent(new CustomEvent('dx-excel-source-changed',{detail:{source:excelMode?'excel':'online',name}}))}
async function exportRows(data,filename){const x=await requireXlsx();const wb=x.utils.book_new(),aoa=[data.headers,...data.rows];x.utils.book_append_sheet(wb,x.utils.aoa_to_sheet(aoa),String(data.sheetName||'Data').replace(/[\\/?*\[\]:]/g,'').slice(0,31));x.writeFile(wb,filename||'latest_output.xlsx')}
let latest=null;
const appId=(()=>{const parts=location.pathname.split('/').filter(Boolean);return parts.length>1?parts[parts.length-2]:'main'})();
function normalizeResult(d,sheet){
 const value=d?.result||d;
 if(Array.isArray(value?.headers)&&Array.isArray(value?.rows))return {headers:value.headers,rows:value.rows,sheetName:sheet||value.sheetName||'Data'};
 return null;
}
async function recordLatest(d,tag='read'){
 const t=normalizeResult(d);if(!t||!t.rows.length)return;
 latest=t;
 try{await dbSet({name:appId,kind:tag,createdAt:new Date().toISOString(),data:t},'latest:'+appId)}catch(e){console.warn('Could not persist last dataset:',e)}
}
async function downloadLatest(){
 const item=await dbGet('latest:'+appId);
 if(!item?.data?.rows?.length)throw Error('No dataset recorded for this program yet');
 await exportRows(item.data,appId+'_latest.xlsx');
}

function toolbar(){
  if(document.querySelector('[data-dx-excel-upload]'))return;
  const btn=document.createElement('button');
  btn.type='button'; btn.setAttribute('data-dx-excel-upload','1'); btn.setAttribute('aria-pressed','false');
  btn.innerHTML=icon;
  btn.style.cssText='width:36px;height:36px;min-width:36px;padding:0;border:1px solid transparent;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:transparent;cursor:pointer;box-sizing:border-box;line-height:1;flex:0 0 36px;';
  btn.querySelector('svg')?.setAttribute('style','display:block;margin:auto;width:19px;height:19px');
  const title=document.querySelector('h1.title');
  const processTop=document.querySelector('.controls-top');
  const app=document.querySelector('main.app,#app,.app-shell,.app,main');
  if(title&&title.parentElement){
    const row=document.createElement('div'); row.className='dx-excel-title-row'; row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;';
    title.parentElement.insertBefore(row,title); row.appendChild(title); row.appendChild(btn);
  }else if(processTop){ const full=processTop.querySelector('#openFullBtn'); if(full)processTop.insertBefore(btn,full); else processTop.appendChild(btn); }
  else if(app){ const row=document.createElement('div');row.style.cssText='display:flex;justify-content:flex-end;align-items:center;margin:0 0 8px 0;';row.appendChild(btn);app.insertBefore(row,app.firstChild); }
  else document.body.appendChild(btn);
  btn.addEventListener('click',async()=>{
    try{
      if(workbook){ setMode(!excelMode); return; }
      const f=document.createElement('input');f.type='file';f.accept='.xlsx,.xls';f.onchange=async()=>{if(f.files?.[0])await loadFile(f.files[0])};f.click();
    }catch(e){console.warn('Excel source change failed',e)}
  });
  btn.addEventListener('contextmenu',e=>{e.preventDefault();const f=document.createElement('input');f.type='file';f.accept='.xlsx,.xls';f.onchange=async()=>{try{if(f.files?.[0])await loadFile(f.files[0])}catch(err){console.warn(err)}};f.click();});
  updateIcon();
}
function settingsPanel(){const holder=document.querySelector('#settingsView')||document.querySelector('[data-settings-section="data-cache"]');if(!holder||document.querySelector('#dx-excel-settings'))return;const section=document.createElement('section');section.id='dx-excel-settings';section.className='settings-card dx-setting-section';section.innerHTML='<h2>Excel Data Sources</h2><p class="settings-help">Choose a workbook once. Programs can reuse its worksheets without uploading again.</p><div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap"><button type="button" id="dx-excel-settings-upload" class="secondary-button small">Choose Excel file</button><select id="dx-excel-settings-files" style="max-width:250px;min-width:130px"></select><label style="display:flex;gap:5px;align-items:center"><input id="dx-excel-settings-mode" type="checkbox"> Read from Excel</label></div><div id="dx-excel-settings-status" class="settings-help"></div>';holder.appendChild(section);const select=section.querySelector('select'),label=section.querySelector('#dx-excel-settings-status');async function refresh(){let files=[];const db=await openDb();files=await new Promise((resolve,reject)=>{const q=db.transaction(store,'readonly').objectStore(store).getAllKeys();q.onsuccess=()=>resolve(q.result.filter(x=>String(x).startsWith('workbook:')));q.onerror=()=>reject(q.error)});db.close();select.innerHTML='';for(const k of files){const opt=document.createElement('option');opt.value=k;opt.textContent=String(k).slice(9);select.appendChild(opt)}select.value=selectedKey;section.querySelector('#dx-excel-settings-mode').checked=excelMode;label.textContent=name?('Selected: '+name):'No workbook selected'};section.querySelector('#dx-excel-settings-upload').onclick=()=>{const f=document.createElement('input');f.type='file';f.accept='.xlsx,.xls';f.onchange=async()=>{try{if(f.files?.[0])await loadFile(f.files[0]);await refresh()}catch(e){label.textContent=e.message}};f.click()};select.onchange=async()=>{try{await chooseWorkbook(select.value);await refresh()}catch(e){label.textContent=e.message}};section.querySelector('#dx-excel-settings-mode').onchange=e=>{setMode(e.target.checked);refresh()};refresh().catch(e=>label.textContent=e.message)}
const originalCall=globalThis.DigiExpressPlatform?.call;
if(originalCall){globalThis.DigiExpressPlatform.call=async function(method,args={}){if(method==='sheets.readRows'||method==='dspace.readSheet')await readyPromise;if((method==='sheets.readRows'||method==='dspace.readSheet')&&excelMode){const d=sheetData(args.sheetName);await recordLatest(d,'excel-read');return d}const result=await originalCall.call(this,method,args);if(method==='sheets.readRows'||method==='dspace.readSheet'){const d=normalizeResult(result,args.sheetName);if(d)await recordLatest(d,'online-read');}return result}}
async function init(){try{selectedKey=localStorage.getItem('dx-excel-workbook')||key;let saved=await dbGet(selectedKey);if(!saved?.bytes)saved=await dbGet(key);if(saved?.bytes){await requireXlsx();workbook=globalThis.XLSX.read(saved.bytes,{type:'array'});name=saved.name;excelMode=localStorage.getItem('dx-excel-source')==='excel'}}catch(e){console.warn('Excel restore failed:',e)}initialized=true;toolbar();updateIcon()}
globalThis.DXExcelDatasets={sheetData,loadFile,exportRows,chooseWorkbook,setMode,downloadLatest,get enabled(){return excelMode},get ready(){return initialized},get whenReady(){return readyPromise}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{settingsPanel();toolbar()});else{settingsPanel();toolbar()}readyPromise=init();
})();
