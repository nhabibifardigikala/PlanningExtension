(()=>{
  const params=new URLSearchParams(location.search);
  const explicitTheme=params.get('theme');
  document.documentElement.dataset.theme=explicitTheme==='dark'?'dark':'light';

  const ORIGIN=location.origin;
  const REJECTED_DATASETS_SPREADSHEET_ID='1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
  const REJECTED_DATASETS_SHEET='Rejected Shipments';
  const REJECTED_DATASETS_WEB_APP_URL='https://script.google.com/macros/s/AKfycbxrsZ8HRgA8Fo0nf4m0Tih6yrWCMMev1i3EAQ_7bSzdrnJ-yugYyFqQYjuTASxl2b9-qA/exec';
  const AGENTS_ACCESS_GATE={operationId:'agents-access-gate',inputs:{}};
  const JOBS={
    'shipping-network-td':{
      id:'shipping-network-td',label:'Shipping Network TD Extractor',operationId:'shipping-network-td-extractor',sheetName:'Shipping Network TD',output:{type:'sheet'},enabled:false,minHostVersion:'13.0.21',webAppUrl:REJECTED_DATASETS_WEB_APP_URL,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[AGENTS_ACCESS_GATE],
      inputs:{shippingNetworkLookup:{headers:['__network_lookup_name','id'],rows:[],totalRows:0}},
      pipeline:{}
    },
    'otd-extractor':{
      id:'otd-extractor',label:'OTD Extractor',operationId:'otd-extractor-dk-source',sheetName:'DK OTD (LG)',output:{type:'internal'},enabled:false,minHostVersion:'13.0.24',manualOnly:true,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[AGENTS_ACCESS_GATE],pipeline:{}
    },
    'distribution-centers':{
      id:'distribution-centers',label:'Distribution Centers Extractor',operationId:'extract-dc',sheetName:'Distribution Centers (LG)',output:{type:'sheet'},enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},
      preOperations:[AGENTS_ACCESS_GATE,{operationId:'dc-user-assignment',inputs:{useConfiguredEmail:true,dcCount:100}}]
    },
    'distribution-centers-dspace':{
      id:'distribution-centers-dspace',label:'Distribution Centers Extractor DSPACE',operationId:'extract-dc',sheetName:'Distribution Centers (LG)',output:{type:'dspace'},enabled:false,minHostVersion:'13.0.10',
      schedule:{type:'daily',time:'12:00',intervalHours:1},
      preOperations:[AGENTS_ACCESS_GATE,{operationId:'dc-user-assignment',inputs:{useConfiguredEmail:true,dcCount:100}}],
      dspace:{shareUrl:'https://dspace.dkservices.ir/s/PjQJZLpewe6yWLf',sheets:[{sheetName:'Distribution Centers (LG)',operationId:'extract-dc'}]}
    },
    'pickup-polygons':{
      id:'pickup-polygons',label:'Pickup Polygons Extractor',operationId:'extract-pickup-polygons',sheetName:'Pick-up Polygons',output:{type:'internal'},enabled:false,minHostVersion:'13.0.22',
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[AGENTS_ACCESS_GATE],
      pipeline:{afterRequest:{action:'replaceDataset',sheetName:'{{job.sheetName}}',headers:'{{result.headers}}',rows:'{{result.rows}}'}}
    },
    'delivery-polygons':{
      id:'delivery-polygons',label:'Delivery Polygons Extractor',operationId:'extract-delivery-polygons',sheetName:'Delivery Polygons',output:{type:'internal'},enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[AGENTS_ACCESS_GATE],
      pipeline:{afterRequest:{action:'replaceDataset',sheetName:'{{job.sheetName}}',headers:'{{result.headers}}',rows:'{{result.rows}}'}}
    },
    'pickup-polygons-dspace':{
      id:'pickup-polygons-dspace',label:'Pickup Polygons Extractor DSPACE',operationId:'extract-pickup-polygons',sheetName:'Pick-up Polygons',output:{type:'dspace'},enabled:false,minHostVersion:'13.0.22',
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[AGENTS_ACCESS_GATE],
      dspace:{shareUrl:'https://dspace.dkservices.ir/s/PjQJZLpewe6yWLf',sheets:[{sheetName:'Pick-up Polygons',operationId:'extract-pickup-polygons',transform:'pickup-polygons'}]}
    },
    'delivery-polygons-dspace':{
      id:'delivery-polygons-dspace',label:'Delivery Polygons Extractor DSPACE',operationId:'extract-delivery-polygons',sheetName:'Delivery Polygons',output:{type:'dspace'},enabled:false,minHostVersion:'13.0.9',
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[AGENTS_ACCESS_GATE],
      dspace:{shareUrl:'https://dspace.dkservices.ir/s/PjQJZLpewe6yWLf',lookupPlatformRequest:{method:'sheets.readRows',args:{spreadsheetId:'1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k',sheetName:'Distribution Centers (LG)',limit:100000}},sheets:[{sheetName:'Delivery Polygons',operationId:'extract-delivery-polygons',transform:'delivery-polygons'}]}
    }
,
    'iata-code-synchronizer':{
      id:'iata-code-synchronizer',label:'IATA Code Synchronizer',operationId:'sync-iata',sheetName:'IATA Synchronizer Log',output:{type:'none'},enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[AGENTS_ACCESS_GATE],
      inputs:{syncTargets:['shipping-points','shipping-polygons'],pointExceptions:'',polygonExceptions:''}
    }
,
    'rejected-shipments-sync':{
      id:'rejected-shipments-sync',label:'Rejected Shipments Synchronizer',operationId:'rejected-shipments-sync',sheetName:'Rejected Shipments',output:{type:'internal'},enabled:true,minHostVersion:'13.0.2',
      schedule:{type:'interval',time:'12:00',intervalHours:1,intervalMinutes:15},preOperations:[AGENTS_ACCESS_GATE],
      retry:{attempts:3,delayMs:60000,backoff:1},
      inputs:{keepScrapeTabOpen:false},
      pipeline:{
        beforeRequest:{action:'rejectedState',sheetName:'{{job.sheetName}}'},
        cursorResponsePath:'maxId',cursorInput:'previousMaxId',
        recordDefaults:{extracted_at:'{{now}}'},
        afterRequest:{action:'appendRejected',sheetName:'{{job.sheetName}}',rows:'{{records}}'}
      }
    },
    'rejected-shipments-dspace':{
      id:'rejected-shipments-dspace',label:'Rejected Shipments Synchronizer DSPACE',operationId:'rejected-shipments-sync',sheetName:'Rejected Shipments',output:{type:'dspace'},enabled:false,minHostVersion:'13.0.10',
      schedule:{type:'interval',time:'12:00',intervalHours:1,intervalMinutes:15},preOperations:[AGENTS_ACCESS_GATE],
      retry:{attempts:3,delayMs:60000,backoff:1},inputs:{keepScrapeTabOpen:false},
      pipeline:{beforePlatformRequest:{method:'dspace.maxNumericColumn',args:{shareUrl:'https://dspace.dkservices.ir/s/PjQJZLpewe6yWLf',sheetName:'Rejected Shipments',column:'id'}},cursorResponsePath:'maxId',cursorInput:'previousMaxId',recordDefaults:{extracted_at:'{{now}}'}},
      dspace:{shareUrl:'https://dspace.dkservices.ir/s/PjQJZLpewe6yWLf',mode:'append',sheets:[{sheetName:'Rejected Shipments',operationId:'rejected-shipments-sync',transform:'rejected-shipments'}]}
    },
  };
  const $=id=>document.getElementById(id);


  const DOWNLOAD_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
  async function downloadAgentOutput(jobId){
    const r=await window.DigiExpressPlatform.runtime.sendMessage({type:'DOWNLOAD_AGENT_OUTPUT',opId:jobId});
    if(!r?.ok)throw new Error(r?.error||'No Excel output is available yet.');return r;
  }
  async function syncAgentDownloadButtons(){
    for(const card of document.querySelectorAll('.agent-card[data-job]')){
      const id=card.dataset.job,actions=card.querySelector('.agent-actions'); if(!actions||JOBS[id]?.manualOnly)continue;
      let b=actions.querySelector('[data-download-job]');
      if(!b){b=document.createElement('button');b.className='agent-download icon-btn';b.type='button';b.dataset.downloadJob=id;b.innerHTML=DOWNLOAD_ICON;b.title='Download last extracted output (saved before publishing)';b.setAttribute('aria-label',`Download ${JOBS[id]?.label||id} last output`);actions.insertBefore(b,actions.querySelector('.agent-history'));b.addEventListener('click',async()=>{try{b.disabled=true;const out=await downloadAgentOutput(id);toast(`Excel downloaded${out?.rowCount?` · ${out.rowCount.toLocaleString('en-US')} rows`:''}`)}catch(e){toast(e.message)}finally{await syncAgentDownloadButtons()}})}
      const m=await window.DigiExpressPlatform.runtime.sendMessage({type:'GET_AGENT_OUTPUT_META',opId:id}).catch(()=>null); b.disabled=!m?.available; b.classList.toggle('available',!!m?.available);
    }
  }

  const RUN_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.6 6.4A8.95 8.95 0 0 0 12 3a9 9 0 0 0-8.5 6H1l4 4 4-4H6.6A6 6 0 0 1 17 7.2L14.2 10H21V3.2l-2.4 2.4v.8ZM5.4 17.6A8.95 8.95 0 0 0 12 21a9 9 0 0 0 8.5-6H23l-4-4-4 4h2.4A6 6 0 0 1 7 16.8L9.8 14H3v6.8l2.4-2.4v-.8Z"/></svg>';
  const STOP_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>';
  function setRunButtonVisual(run,isRunning,label){
    run.innerHTML=isRunning?STOP_ICON:RUN_ICON;
    run.title=isRunning?'Stop operation':'Update now';
    run.setAttribute('aria-label',isRunning?`Stop ${label}`:`Run ${label} now`);
  }
  let currentState=null,activeJobId='distribution-centers',pollTimer=null,migrationDone=false;
  let installedHostVersion=null,hostVersionChecked=false;
  function compareVersions(a,b){const A=String(a||'0').split('.').map(x=>Number(String(x).replace(/\D.*$/,''))||0),B=String(b||'0').split('.').map(x=>Number(String(x).replace(/\D.*$/,''))||0),n=Math.max(A.length,B.length);for(let i=0;i<n;i++){const x=A[i]||0,y=B[i]||0;if(x>y)return 1;if(x<y)return -1;}return 0;}
  async function detectHostVersion(force=false){if(hostVersionChecked&&!force)return installedHostVersion;hostVersionChecked=true;try{const info=await window.DigiExpressPlatform.call('platform.info',{});installedHostVersion=String(info?.result?.hostVersion??info?.hostVersion??'').trim()||null;}catch(_){installedHostVersion=null;}return installedHostVersion;}
  async function assertJobHostCompatibility(jobDef){const required=String(jobDef?.minHostVersion||'').trim();if(!required)return true;const installed=await detectHostVersion();if(!installed)return true;if(compareVersions(installed,required)<0)throw new Error(`${jobDef.label||jobDef.id} requires Host ${required} or newer. Installed Host: ${installed}. Other Agents remain available.`);return true;}

  function request(action,payload={}){
    const map={getState:'jobs.getState',saveJob:'jobs.saveJob',runNow:'jobs.runNow',cancel:'jobs.cancel',getHistory:'jobs.getHistory'};
    const method=map[action];
    if(!method)return Promise.reject(new Error('Unsupported Agents action.'));
    if(window.DigiExpressPlatform?.call){
      return window.DigiExpressPlatform.call(method,payload).then(r=>r?.result??r);
    }
    return Promise.reject(new Error('Stable Host 13.0.0 platform bridge is not available. Reload the extension.'));
  }

  async function assertAgentsAccess(){
    if(!window.DigiExpressPlatform?.runtime?.sendMessage)throw new Error('Stable Host access bridge is not available. Reload the extension.');
    const r=await window.DigiExpressPlatform.runtime.sendMessage({type:'CHECK_OPERATION_ACCESS',op:'agents-access-gate'});
    if(!r?.ok||!r?.allowed)throw new Error(r?.error||'Access denied for Agents.');
    return true;
  }

  const OTD_STATE_KEY='digiexpress.agents.otd-extractor.state.v1';
  function readOtdState(){try{return JSON.parse(localStorage.getItem(OTD_STATE_KEY)||'{}')||{}}catch(_){return {}}}
  function writeOtdState(patch){const next={...readOtdState(),...patch};try{localStorage.setItem(OTD_STATE_KEY,JSON.stringify(next))}catch(_){}renderOtdJob();return next}
  const faDigits='۰۱۲۳۴۵۶۷۸۹',arDigits='٠١٢٣٤٥٦٧٨٩';
  function latinDigits(value){return String(value??'').replace(/[۰-۹]/g,ch=>String(faDigits.indexOf(ch))).replace(/[٠-٩]/g,ch=>String(arDigits.indexOf(ch)))}
  function normOtdHeader(value){return latinDigits(value).normalize('NFKC').trim().toLocaleLowerCase().replace(/[()\[\]{}:_\-]+/g,' ').replace(/\s+/g,' ')}
  function otdHeaderIndex(headers,aliases){const hs=(headers||[]).map(normOtdHeader),as=(aliases||[]).map(normOtdHeader);for(const a of as){const i=hs.indexOf(a);if(i>=0)return i}for(const a of as){const i=hs.findIndex(h=>h.includes(a)||a.includes(h));if(i>=0)return i}return -1}
  function otdNumber(value){const x=latinDigits(value).replace(/[,،]/g,'').replace(/[^0-9.+-]/g,'').trim();if(!x)return 0;const n=Number(x);return Number.isFinite(n)?n:0}
  function otdNameKey(value){return latinDigits(value).normalize('NFKC').trim().toLocaleLowerCase().replace(/[\u200c\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ')}
  function normalizeOtdTimeScope(value){
    const raw=latinDigits(value).normalize('NFKC').trim().toLocaleLowerCase().replace(/\u200c/g,' ').replace(/\s+/g,' ');
    const nums=[...raw.matchAll(/(\d{1,2})(?::(\d{1,2}))?/g)].map(m=>({h:Number(m[1]),m:Number(m[2]||0)}));
    if(nums.length>=2){const a=nums[0],b=nums[1],part=x=>`${x.h}:${String(x.m).padStart(2,'0')}`,display=x=>x.m?`${x.h}:${String(x.m).padStart(2,'0')}`:`${x.h}`;return {key:`${part(a)}-${part(b)}`,display:`${display(a)} - ${display(b)}`};}
    const clean=raw.replace(/\bh\b/g,'').replace(/h/g,'').replace(/\s*-\s*/g,'-').replace(/\s+/g,' ').trim();return {key:clean,display:clean||raw};
  }
  function otdCombineKey(name,time){const t=normalizeOtdTimeScope(time);return `${otdNameKey(name)}|${t.key}`}
  function requiredOtdColumn(headers,aliases,label){const i=otdHeaderIndex(headers,aliases);if(i<0)throw new Error(`OTD Extractor could not find ${label}. Headers: ${(headers||[]).join(' | ')}`);return i}
  function buildOtdOutput(dk,dc){
    const h1=Array.isArray(dk?.headers)?dk.headers:[],r1=Array.isArray(dk?.rows)?dk.rows:[],h2=Array.isArray(dc?.headers)?dc.headers:[],r2=Array.isArray(dc?.rows)?dc.rows:[];
    if(!h1.length||!r1.length)throw new Error('DK OTD extraction returned no rows.');if(!h2.length||!r2.length)throw new Error('DC Time Scope extraction returned no rows.');
    const first={
      distributionCenterId:requiredOtdColumn(h1,['distribution center id','distribution_center_id','dc id'],'distribution center id'),
      dc:requiredOtdColumn(h1,['dc','distribution center','distribution center name'],'dc'),
      timeScope:requiredOtdColumn(h1,['time scope','time_scope','time scope name'],'time scope'),
      submitType:requiredOtdColumn(h1,['submit type','submit_type'],'submit type'),
      nature:requiredOtdColumn(h1,['nature','shipping nature'],'nature'),
      regionType:requiredOtdColumn(h1,['region type','region_type'],'region type'),
      deliveryType:requiredOtdColumn(h1,['delivery type','delivery_type'],'delivery type'),
      fcDuration:requiredOtdColumn(h1,['fc duration','fc_duration'],'FC Duration'),
      fcDepot:requiredOtdColumn(h1,['fc depot duration'],'fc depot duration'),
      fcLoading:requiredOtdColumn(h1,['fc loading duration'],'fc loading duration'),
      sendSc:requiredOtdColumn(h1,['send to sc duration'],'send to sc duration'),
      scUnloading:requiredOtdColumn(h1,['sc unloading duration'],'sc unloading duration'),
      dispatchDepot:requiredOtdColumn(h1,['dispatch and depot duration'],'dispatch and depot duration'),
      loading:requiredOtdColumn(h1,['loading duration'],'loading duration'),
      midMile:requiredOtdColumn(h1,['mid mile duration','mid-mile duration'],'mid mile duration'),
      unloading:requiredOtdColumn(h1,['unloading duration'],'unloading duration'),
      sorting:requiredOtdColumn(h1,['sorting duration'],'sorting duration'),
      lastMile:requiredOtdColumn(h1,['last mile duration','last-mile duration'],'last mile duration')
    };
    const second={
      dc:requiredOtdColumn(h2,['distribution center','distribution center name','dc'],'DISTRIBUTION CENTER'),
      timeScope:requiredOtdColumn(h2,['time scope','time_scope','time scope name'],'TIME SCOPE'),
      timeDistance:requiredOtdColumn(h2,['time distance min','time distance(min)','time distance','time_distance'],'Time distance(min)')
    };
    const lookup=new Map(),conflicts=new Set();
    for(const row of r2){const key=otdCombineKey(row?.[second.dc],row?.[second.timeScope]);if(!key||key.startsWith('|'))continue;const v=otdNumber(row?.[second.timeDistance]);if(!lookup.has(key))lookup.set(key,v);else if(lookup.get(key)!==v)conflicts.add(key);}
    for(const key of conflicts)lookup.delete(key);
    const outHeaders=['Combine ID','distribution center id','dc','time scope','submit type','nature','region type','delivery type','FC Duration','fc depot duration','fc loading duration','send to sc duration','sc unloading duration','dispatch and depot duration','loading duration','mid mile duration','unloading duration','sorting duration','last mile duration','Fc Fulfill Duration'];
    let matched=0,unmatched=0;const outRows=[];
    for(const row of r1){const dcName=row?.[first.dc]??'',timeRaw=row?.[first.timeScope]??'',time=normalizeOtdTimeScope(timeRaw),combine=`${String(dcName).trim()} [${time.display}]`,key=otdCombineKey(dcName,timeRaw);const td=lookup.get(key);let fulfill='';
      if(td!==undefined){const sum=[first.fcDepot,first.fcLoading,first.sendSc,first.scUnloading,first.dispatchDepot,first.loading,first.midMile,first.unloading,first.sorting,first.lastMile].reduce((n,i)=>n+otdNumber(row?.[i]),0);fulfill=td-sum;matched++;}else unmatched++;
      outRows.push([combine,row?.[first.distributionCenterId]??'',dcName,time.display,row?.[first.submitType]??'',row?.[first.nature]??'',row?.[first.regionType]??'',row?.[first.deliveryType]??'',row?.[first.fcDuration]??'',row?.[first.fcDepot]??'',row?.[first.fcLoading]??'',row?.[first.sendSc]??'',row?.[first.scUnloading]??'',row?.[first.dispatchDepot]??'',row?.[first.loading]??'',row?.[first.midMile]??'',row?.[first.unloading]??'',row?.[first.sorting]??'',row?.[first.lastMile]??'',fulfill]);
    }
    return {headers:outHeaders,rows:outRows,matched,unmatched,ambiguous:conflicts.size,sourceRows:{dk:r1.length,dc:r2.length}};
  }
  async function publishOtdDataset(result){
    const url=REJECTED_DATASETS_WEB_APP_URL||sharedWebAppUrl();if(!url)throw new Error('Google Sheets publishing is not configured.');
    const response=await window.DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request:{url,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'replaceDataset',dataset:'otd-extractor',sheetName:'DK OTD (LG)',headers:result.headers,rows:result.rows}),responseType:'json',timeoutMs:120000,credentials:'include'}});
    if(!response?.ok)throw new Error(response?.error||'Could not publish DK OTD (LG).');const data=response?.data||{};if(data?.ok===false)throw new Error(data.error||'Could not publish DK OTD (LG).');return data;
  }
  async function runOtdSourceJob(jobId,label,operationId){
    const job={id:jobId,label,operationId,enabled:false,schedule:{type:'daily',time:'12:00',intervalHours:1},retry:{attempts:1,delayMs:0,backoff:1},inputs:{},preOperations:[],output:{type:'internal'},sheetName:'',pipeline:null};
    await request('saveJob',{job});
    const run=await request('runNow',{jobId});
    if(!run?.ok)throw new Error(run?.error||`${label} failed.`);
    const result=run?.result||{};
    if(!Array.isArray(result?.headers)||!Array.isArray(result?.rows))throw new Error(`${label} returned no table output.`);
    return result;
  }
  async function runOtdExtractor(){
    await assertAgentsAccess();await assertJobHostCompatibility(JOBS['otd-extractor']);
    const startedAt=Date.now();writeOtdState({running:true,startedAt,lastError:'',lastStatus:'Running',phase:'Extracting DK OTD…'});
    try{
      const a=await runOtdSourceJob('otd-dk-source-job','OTD Extractor · DK OTD Source','otd-extractor-dk-source');
      writeOtdState({phase:'Extracting DC Time Scope…'});
      const b=await runOtdSourceJob('otd-dc-time-scope-source-job','OTD Extractor · DC Time Scope Source','otd-extractor-dc-time-scope-source');
      writeOtdState({phase:'Joining sources and calculating Fc Fulfill Duration…'});
      const out=buildOtdOutput(a,b);writeOtdState({phase:'Publishing DK OTD (LG)…'});await publishOtdDataset(out);
      const endedAt=Date.now();writeOtdState({running:false,phase:'',lastStatus:'Success',lastError:'',lastRunAt:endedAt,lastDurationMs:endedAt-startedAt,rowCount:out.rows.length,matched:out.matched,unmatched:out.unmatched,ambiguous:out.ambiguous});toast(`OTD Extractor completed · ${out.rows.length.toLocaleString('en-US')} rows`);
    }catch(e){const endedAt=Date.now();writeOtdState({running:false,phase:'',lastStatus:'Failed',lastError:String(e?.message||e),lastRunAt:endedAt,lastDurationMs:endedAt-startedAt});toast(String(e?.message||e));}
  }
  function renderOtdJob(){
    const id='otd-extractor',st=readOtdState(),run=document.querySelector(`[data-run-job="${id}"]`),mini=document.querySelector(`[data-status-for="${id}"]`),chip=document.querySelector(`[data-status-chip-for="${id}"]`),last=document.querySelector(`[data-last-run-for="${id}"]`),next=document.querySelector(`[data-next-run-for="${id}"]`),dur=document.querySelector(`[data-duration-for="${id}"]`),details=document.querySelector(`[data-error-details="${id}"]`);if(!run||!mini)return;
    run.disabled=!!st.running;run.classList.toggle('running',!!st.running);run.classList.remove('cancel-mode');setRunButtonVisual(run,false,JOBS[id].label);if(chip){const kind=st.running?'running':st.lastStatus==='Success'?'success':st.lastError?'failed':'ready';chip.className=`agent-status-chip ${kind}`;chip.textContent=st.running?(st.phase||'Running'):(st.lastStatus||'Ready');}if(last)last.textContent=fmt(st.lastRunAt);if(next)next.textContent='Manual';if(dur)dur.textContent=fmtDuration(st.running&&st.startedAt?Date.now()-Number(st.startedAt):st.lastDurationMs);mini.className='dataset-mini-status';if(st.running){mini.textContent=st.phase||'Working…';mini.classList.add('busy')}else if(st.lastError){mini.textContent=shortError(st.lastError);mini.classList.add('error')}else if(st.lastStatus==='Success'){mini.textContent=`Completed · ${Number(st.rowCount||0).toLocaleString('en-US')} rows · ${Number(st.matched||0).toLocaleString('en-US')} joined${st.unmatched?` · ${Number(st.unmatched).toLocaleString('en-US')} unmatched`:''}`;}else mini.textContent='Ready';if(details)details.hidden=!st.lastError;
  }
  const fmt=v=>v?new Date(v).toLocaleString():'—';
  const fmtDuration=ms=>{const n=Number(ms||0);if(!n)return '—';const sec=Math.max(0,Math.round(n/1000));if(sec<60)return `${sec}s`;const min=Math.floor(sec/60),rest=sec%60;if(min<60)return `${min}m ${rest}s`;const h=Math.floor(min/60);return `${h}h ${min%60}m`;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function shortError(text){const x=friendlyError(text);return x.length>115?`${x.slice(0,112).trim()}…`:x;}
  function statusKind(st){if(st.running)return 'running';const x=String(st.lastStatus||'Ready').toLowerCase();if(x==='success')return 'success';if(x==='failed'||x==='interrupted')return 'failed';if(x==='cancelled')return 'cancelled';return 'ready';}
  function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2600)}
  function openModal(id){$(id).classList.add('open');$(id).setAttribute('aria-hidden','false')}
  function closeModal(id){$(id).classList.remove('open');$(id).setAttribute('aria-hidden','true')}
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));

  const ARCHIVE_STORAGE_KEY='digiexpress.agents.archived.v1';
  let agentTab='active';
  function archivedAgentIds(){try{const raw=JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY)||'[]');return new Set(Array.isArray(raw)?raw.map(String):[])}catch(_){return new Set()}}
  function saveArchivedAgentIds(set){try{localStorage.setItem(ARCHIVE_STORAGE_KEY,JSON.stringify([...set]))}catch(_){}}
  function applyAgentArchiveView(){
    const archived=archivedAgentIds();let activeCount=0,archiveCount=0,visible=0;
    document.querySelectorAll('.agent-card[data-job]').forEach(card=>{
      const id=String(card.dataset.job||''),isArchived=archived.has(id);
      if(isArchived)archiveCount++;else activeCount++;
      const cb=card.querySelector('[data-archive-job]');if(cb)cb.checked=isArchived;
      const show=agentTab==='archive'?isArchived:!isArchived;card.hidden=!show;if(show)visible++;
    });
    const a=$('agentActiveCount'),r=$('agentArchiveCount'),empty=$('agentArchiveEmpty');if(a)a.textContent=String(activeCount);if(r)r.textContent=String(archiveCount);if(empty)empty.hidden=visible>0;
    document.querySelectorAll('[data-agent-tab]').forEach(btn=>{const on=btn.dataset.agentTab===agentTab;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',on?'true':'false')});
  }
  function initAgentArchiveUi(){
    document.querySelectorAll('.agent-card[data-job]').forEach(card=>{
      const id=String(card.dataset.job||''),actions=card.querySelector('.agent-actions');if(!id||!actions||actions.querySelector('[data-archive-job]'))return;
      const label=document.createElement('label');label.className='agent-archive-toggle';label.title='Move this Agent to Archive';label.innerHTML=`<input type="checkbox" data-archive-job="${esc(id)}"><span>Archive</span>`;actions.prepend(label);
      label.querySelector('input').addEventListener('change',e=>{const set=archivedAgentIds();if(e.target.checked)set.add(id);else set.delete(id);saveArchivedAgentIds(set);applyAgentArchiveView()});
    });
    document.querySelectorAll('[data-agent-tab]').forEach(btn=>btn.addEventListener('click',()=>{agentTab=btn.dataset.agentTab==='archive'?'archive':'active';applyAgentArchiveView()}));
    applyAgentArchiveView();
  }

  function defaultJob(id){return JSON.parse(JSON.stringify(JOBS[id]));}
  function friendlyError(raw){
    const msg=String(raw||'').trim(),low=msg.toLowerCase();
    if(!msg)return '';
    if(/no headers|returned no headers/.test(low))return 'No report columns were found. The LG page may not have finished loading or the table layout may have changed. Retry the Agent; if it fails again, enable Diagnostics in Settings.';
    if(/google apps script|web app url/.test(low))return 'Google Sheets publishing is not configured. Open Agents settings and save the Google Apps Script Web App URL for Sheet-based extractors.';
    if(/table.*not found|rows were not available|element not found/.test(low))return 'The required LG page content did not load in time. Keep the LG session signed in and retry. Diagnostics can show the failed URL and selector.';
    if(/login|authentication|credential/.test(low))return 'LG authentication needs attention. Sign in to LG or validate your account again in Settings, then retry.';
    return msg;
  }
  function getJob(id=activeJobId){return currentState?.jobs?.[id]||defaultJob(id)}
  function getState(id=activeJobId){return currentState?.states?.[id]||{}}
  function sharedWebAppUrl(){
    for(const id of Object.keys(JOBS)){const u=String(currentState?.jobs?.[id]?.webAppUrl||'').trim();if(u)return u;}
    return '';
  }
  async function rejectedEndpointCandidates(){
    const out=[];
    const add=v=>{const u=String(v||'').trim();if(u&&!out.includes(u))out.push(u);};
    add(REJECTED_DATASETS_WEB_APP_URL);
    add(currentState?.jobs?.['rejected-shipments-sync']?.webAppUrl);
    for(const id of Object.keys(JOBS))add(currentState?.jobs?.[id]?.webAppUrl);
    try{const legacy=await chrome.storage.sync.get({webAppUrl:''});add(legacy.webAppUrl);}catch(_){}
    try{add(localStorage.getItem('digiexpress.dataset.webAppUrl'));}catch(_){}
    return out;
  }
  async function probeRejectedDatasetEndpoint(url){
    if(!url||!window.DigiExpressPlatform?.runtime?.sendMessage)return false;
    try{
      const r=await window.DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request:{url,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'rejectedState',sheetName:REJECTED_DATASETS_SHEET}),responseType:'json',timeoutMs:15000,credentials:'include'}});
      const d=r?.data||{};
      return !!(r?.ok&&d&&d.ok!==false&&String(d.spreadsheetId||'')===REJECTED_DATASETS_SPREADSHEET_ID&&String(d.sheetName||'')===REJECTED_DATASETS_SHEET&&String(d.apiVersion||'')==='377-core-v1');
    }catch(_){return false;}
  }
  async function resolveRejectedDatasetEndpoint(){
    const candidates=await rejectedEndpointCandidates();
    for(const url of candidates){if(await probeRejectedDatasetEndpoint(url))return url;}
    throw new Error('Rejected Shipments endpoint is not the current DataSets Web App. Deploy the v377 Code.gs, then save that deployment /exec URL in Agents settings. The endpoint must report apiVersion 377-core-v1 and the exact DataSets spreadsheet ID.');
  }
  async function readRejectedStateFromEndpoint(url){
    const r=await window.DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request:{url,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'rejectedState',sheetName:REJECTED_DATASETS_SHEET}),responseType:'json',timeoutMs:15000,credentials:'include'}});
    if(!r?.ok)throw new Error(r?.error||'Could not read Rejected Shipments watermark.');
    const d=r?.data||{};
    if(d?.ok===false)throw new Error(d.error||'Could not read Rejected Shipments watermark.');
    if(String(d.spreadsheetId||'')!==REJECTED_DATASETS_SPREADSHEET_ID)throw new Error('Rejected Shipments endpoint points to a different spreadsheet.');
    return {maxId:Number(d.maxId)||0,totalRows:Number(d.totalRows)||0};
  }
  function updateScheduleControls(){
    const enabled=$('enabled').checked,type=$('scheduleType').value;
    $('scheduleType').disabled=!enabled;$('dailyTime').disabled=!enabled;$('intervalHours').disabled=!enabled;$('intervalMinutes').disabled=!enabled;
    $('dailyWrap').hidden=type!=='daily';$('hourlyWrap').hidden=type!=='hourly';$('minutesWrap').hidden=type!=='interval';
    $('dailyWrap').classList.toggle('disabled-setting',!enabled);$('hourlyWrap').classList.toggle('disabled-setting',!enabled);$('minutesWrap').classList.toggle('disabled-setting',!enabled);
    $('scheduleType').closest('label')?.classList.toggle('disabled-setting',!enabled);
  }
  function collectJob(id=activeJobId){
    const base=getJob(id),defs=JOBS[id];
    let inputs=base.inputs||defs.inputs||{};
    if(id==='iata-code-synchronizer')inputs={
      syncTargets:[...($('syncShippingPoints').checked?['shipping-points']:[]),...($('syncShippingPolygons').checked?['shipping-polygons']:[])],
      pointExceptions:$('pointExceptions').value.trim(),
      polygonExceptions:$('polygonExceptions').value.trim()
    };
    if(id==='rejected-shipments-sync'||id==='rejected-shipments-dspace')inputs={keepScrapeTabOpen:false};
    return {...defs,...base,webAppUrl:$('webAppUrl').value.trim()||sharedWebAppUrl()||defs.webAppUrl||'',enabled:$('enabled').checked,schedule:{type:$('scheduleType').value,time:$('dailyTime').value||'12:00',intervalHours:Number($('intervalHours').value||1),intervalMinutes:Number($('intervalMinutes').value||15)},preOperations:defs.preOperations,pipeline:defs.pipeline||base.pipeline||null,inputs};
  }

  function renderJob(id){
    if(id==='otd-extractor'){renderOtdJob();return;}
    const st=getState(id),run=document.querySelector(`[data-run-job="${id}"]`),mini=document.querySelector(`[data-status-for="${id}"]`),chip=document.querySelector(`[data-status-chip-for="${id}"]`),last=document.querySelector(`[data-last-run-for="${id}"]`),next=document.querySelector(`[data-next-run-for="${id}"]`),dur=document.querySelector(`[data-duration-for="${id}"]`),details=document.querySelector(`[data-error-details="${id}"]`);
    if(!run||!mini)return;
    const isRunning=!!st.running;run.classList.toggle('running',isRunning);run.classList.toggle('cancel-mode',isRunning);run.disabled=false;setRunButtonVisual(run,isRunning,JOBS[id].label);
    const kind=statusKind(st),statusText=isRunning?(st.phase||'Running'):String(st.lastStatus||'Ready');
    if(chip){chip.className=`agent-status-chip ${kind}`;chip.textContent=statusText;}
    if(last)last.textContent=fmt(st.lastRunAt);
    if(next)next.textContent=fmt(st.nextRunAt);
    if(dur)dur.textContent=fmtDuration(isRunning&&st.startedAt?Date.now()-Number(st.startedAt):st.lastDurationMs);
    mini.className='dataset-mini-status';
    if(st.running){mini.textContent=st.phase||'Working…';mini.classList.add('busy');}
    else if(st.lastError){mini.textContent=shortError(st.lastError);mini.classList.add('error');}
    else mini.textContent=st.lastStatus==='Success'?'Completed successfully':'Ready';
    if(details)details.hidden=!st.lastError;
  }
  function apply(state){
    currentState=state||{};const sharedUrl=sharedWebAppUrl();$('webAppUrl').value=sharedUrl;try{if(sharedUrl)localStorage.setItem('digiexpress.dataset.webAppUrl',sharedUrl)}catch(_){}
    for(const id of Object.keys(JOBS))renderJob(id);
    if(Object.keys(JOBS).some(id=>getState(id).running))startFastPoll();else stopFastPoll();
    if($('datasetSettingsModal').classList.contains('open'))populateSettings(activeJobId);
  }
  function populateSettings(id){
    activeJobId=id;const job=getJob(id),st=getState(id);
    $('datasetSettingsTitle').textContent=JOBS[id].label;
    $('preUpdateNote').hidden=!(id==='distribution-centers'||id==='distribution-centers-dspace');
    const isIata=id==='iata-code-synchronizer',isRejected=id==='rejected-shipments-sync'||id==='rejected-shipments-dspace';$('iataOptions').hidden=!isIata;if($('rejectedOptions'))$('rejectedOptions').hidden=true;$('rowCountLabel').textContent=isIata?'Processed records':(isRejected?'Rows appended':'Rows written');
    if(isIata){const inputs=job.inputs||JOBS[id].inputs||{};const targets=Array.isArray(inputs.syncTargets)?inputs.syncTargets:[];$('syncShippingPoints').checked=targets.includes('shipping-points');$('syncShippingPolygons').checked=targets.includes('shipping-polygons');$('pointExceptions').value=inputs.pointExceptions||'';$('polygonExceptions').value=inputs.polygonExceptions||'';}
    $('enabled').checked=job.enabled===true;const stype=job.schedule?.type;$('scheduleType').value=stype==='hourly'?'hourly':(stype==='interval'?'interval':'daily');
    $('dailyTime').value=job.schedule?.time||'12:00';$('intervalHours').value=String(job.schedule?.intervalHours||1);$('intervalMinutes').value=String(job.schedule?.intervalMinutes||15);updateScheduleControls();
    $('lastRun').textContent=fmt(st.lastRunAt);$('rowCount').textContent=st.rowCount??'—';$('nextRun').textContent=fmt(st.nextRunAt);$('lastStatus').textContent=st.running?(st.phase||st.lastStatus||'Running…'):(st.lastStatus||'—');
    $('datasetError').hidden=!st.lastError;$('datasetError').textContent=friendlyError(st.lastError)||'';
  }
  async function openHistory(id){
    $('historyTitle').textContent=`${JOBS[id].label} history`;$('historySubtitle').textContent='Latest executions, including scheduled runs';$('historyList').innerHTML='<div class="history-empty">Loading history…</div>';openModal('historyModal');
    try{const out=await request('getHistory',{jobId:id}),rows=Array.isArray(out.rows)?out.rows:[];
      $('historyList').innerHTML=rows.length?rows.map(row=>`<article class="history-item"><div class="history-item-head"><span class="history-status ${String(row.status||'').toLowerCase()}">${esc(row.status||'Unknown')}</span><strong>${esc(fmt(row.endedAt||row.startedAt))}</strong></div><div class="history-meta"><span>${esc(row.source==='automatic'?'Scheduled':'Manual')}</span><span>${esc(fmtDuration(row.durationMs))}</span>${row.rowCount!=null?`<span>${esc(row.rowCount)} records</span>`:''}</div>${row.error?`<div class="history-error">${esc(friendlyError(row.error))}</div>`:''}</article>`).join(''):'<div class="history-empty">No execution history yet.</div>';
    }catch(e){$('historyList').innerHTML=`<div class="history-empty error">${esc(e.message)}</div>`;}
  }
  function openErrorDetails(id){const st=id==='otd-extractor'?readOtdState():getState(id),raw=String(st.lastError||'');if(!raw)return;const friendly=friendlyError(raw);$('errorDetailsTitle').textContent=JOBS[id].label;$('errorDetailsBody').innerHTML=`<section class="error-detail-block"><span>What happened</span><strong>${esc(friendly)}</strong></section><section class="error-detail-block"><span>Technical detail</span><code>${esc(raw)}</code></section><section class="error-detail-block"><span>Recommended action</span><strong>Retry the Agent. If the issue repeats, open Diagnostics from Settings and review the failed URL, selector and tab details.</strong></section>`;openModal('errorDetailsModal');}
  function startFastPoll(){if(pollTimer)return;pollTimer=setInterval(()=>refresh({quiet:true}).catch(()=>{}),1200)}
  function stopFastPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}

  async function ensureJobs(state){
    if(migrationDone)return state;
    let changed=false;
    for(const id of Object.keys(JOBS)){
      const defs=JOBS[id];if(defs.manualOnly)continue;
      const cur=state?.jobs?.[id];
      const pre=Array.isArray(cur?.preOperations)?cur.preOperations:[];
      const preOk=JSON.stringify(pre)===JSON.stringify(defs.preOperations||[]);
      const opOk=cur?.operationId===defs.operationId&&String(cur?.sheetName||'')===String(defs.sheetName||'');
      const pipelineOk=JSON.stringify(cur?.pipeline||null)===JSON.stringify(defs.pipeline||null);
      const retryOk=JSON.stringify(cur?.retry||null)===JSON.stringify(defs.retry||null);
      const dspaceOk=JSON.stringify(cur?.dspace||null)===JSON.stringify(defs.dspace||null);
      if(!cur||!preOk||!opOk||!pipelineOk||!retryOk||!dspaceOk){await request('saveJob',{job:{...defs,...(cur||{}),operationId:defs.operationId,sheetName:defs.sheetName,webAppUrl:id.startsWith('rejected-')?REJECTED_DATASETS_WEB_APP_URL:String(cur?.webAppUrl||sharedWebAppUrl()||defs.webAppUrl||''),preOperations:defs.preOperations,pipeline:defs.pipeline||null,dspace:defs.dspace||null,retry:defs.retry||cur?.retry,inputs:{...(defs.inputs||{}),...(cur?.inputs||{})},schedule:{...defs.schedule,...(cur?.schedule||{})},enabled:cur?.enabled===undefined?defs.enabled:cur.enabled}});changed=true;}
    }
    migrationDone=true;return changed?request('getState'):state;
  }
  async function refresh({quiet=false}={}){
    try{let x=await request('getState');x=await ensureJobs(x);apply(x);$('connectionStatus').textContent='';$('connectionStatus').classList.remove('error');return x}
    catch(e){if(!quiet){$('connectionStatus').textContent=e.message;$('connectionStatus').classList.add('error')}throw e}
  }

  $('appSettingsBtn').addEventListener('click',()=>{ $('webAppUrl').value=sharedWebAppUrl();openModal('appSettingsModal'); });
  document.querySelectorAll('[data-settings-job]').forEach(btn=>btn.addEventListener('click',()=>{populateSettings(btn.dataset.settingsJob);openModal('datasetSettingsModal')}));
  document.querySelectorAll('[data-history-job]').forEach(btn=>btn.addEventListener('click',()=>openHistory(btn.dataset.historyJob)));
  document.querySelectorAll('[data-error-details]').forEach(btn=>btn.addEventListener('click',()=>openErrorDetails(btn.dataset.errorDetails)));
  $('scheduleType').addEventListener('change',updateScheduleControls);$('enabled').addEventListener('change',updateScheduleControls);

  $('saveConnection').addEventListener('click',async()=>{
    const btn=$('saveConnection');try{btn.disabled=true;const url=$('webAppUrl').value.trim();try{if(url)localStorage.setItem('digiexpress.dataset.webAppUrl',url);else localStorage.removeItem('digiexpress.dataset.webAppUrl')}catch(_){};for(const id of Object.keys(JOBS)){if(JOBS[id].manualOnly)continue;const base=getJob(id);await request('saveJob',{job:{...JOBS[id],...base,webAppUrl:url,preOperations:JOBS[id].preOperations,pipeline:JOBS[id].pipeline||base.pipeline||null,dspace:JOBS[id].dspace||base.dspace||null,retry:JOBS[id].retry||base.retry,inputs:{...(JOBS[id].inputs||{}),...(base.inputs||{})}}})}await refresh({quiet:true});toast('Google Sheets connection saved');closeModal('appSettingsModal')}
    catch(e){$('connectionStatus').textContent=e.message;$('connectionStatus').classList.add('error')}
    finally{btn.disabled=false}
  });
  $('saveSchedule').addEventListener('click',async()=>{
    const btn=$('saveSchedule');try{btn.disabled=true;const job=collectJob(activeJobId);if(job.enabled){await assertAgentsAccess();await assertJobHostCompatibility(JOBS[activeJobId]);}if(activeJobId==='iata-code-synchronizer'&&!job.inputs.syncTargets.length)throw new Error('Select at least one IATA synchronization target.');await request('saveJob',{job});await refresh({quiet:true});toast(`${JOBS[activeJobId].label} settings saved`);closeModal('datasetSettingsModal')}
    catch(e){$('datasetError').hidden=false;$('datasetError').textContent=e.message}
    finally{btn.disabled=false}
  });

  document.querySelectorAll('[data-run-job]').forEach(run=>run.addEventListener('click',async()=>{
    const id=run.dataset.runJob;if(id==='otd-extractor'){if(readOtdState().running){toast('OTD Extractor is already running');return;}await runOtdExtractor();return;}const st=getState(id),mini=document.querySelector(`[data-status-for="${id}"]`);
    if(st.running){try{setRunButtonVisual(run,true,JOBS[id].label);mini.textContent='Stopping operation…';mini.className='dataset-mini-status busy';await request('cancel',{jobId:id});toast('Operation stopped');await refresh({quiet:true})}catch(e){mini.textContent=e.message;mini.className='dataset-mini-status error'}return;}
    try{
      await assertAgentsAccess();
      await assertJobHostCompatibility(JOBS[id]);
      run.classList.add('running');run.classList.add('cancel-mode');setRunButtonVisual(run,true,JOBS[id].label);mini.textContent=(id==='distribution-centers'||id==='distribution-centers-dspace')?'Assigning 100 DCs…':(id==='pickup-polygons'||id==='pickup-polygons-dspace'?'Opening Drop Shipping Pickup Polygons…':(id==='delivery-polygons'||id==='delivery-polygons-dspace'?'Opening Admin DC Polygons…':((id==='rejected-shipments-sync'||id==='rejected-shipments-dspace')?'Synchronizing rejected shipments…':'Synchronizing IATA codes…')));mini.className='dataset-mini-status busy';
      let url=sharedWebAppUrl()||JOBS[id].webAppUrl||'';
      if(id==='rejected-shipments-sync')url=await resolveRejectedDatasetEndpoint();
      let job={...JOBS[id],...getJob(id),webAppUrl:url,preOperations:JOBS[id].preOperations,pipeline:JOBS[id].pipeline||getJob(id).pipeline||null,dspace:JOBS[id].dspace||getJob(id).dspace||null,retry:JOBS[id].retry||getJob(id).retry};
      if(id==='shipping-network-td')job.inputs={...(job.inputs||{}),shippingNetworkLookup:JOBS[id].inputs.shippingNetworkLookup};
      if(id==='iata-code-synchronizer'||id==='rejected-shipments-sync'||id==='rejected-shipments-dspace'){const saved={...(JOBS[id].inputs||{}),...(job.inputs||{})};job.inputs=saved;}
      if(id==='rejected-shipments-sync'){
        mini.textContent='Reading latest Rejected Shipments watermark…';
        const cursor=await readRejectedStateFromEndpoint(url);
        const maxId=Number(cursor.maxId)||0;
        job.inputs={...(job.inputs||{}),previousMaxId:maxId};
        mini.textContent=`Starting after ID ${maxId.toLocaleString('en-US')}…`;
      }
      await request('saveJob',{job});await request('runNow',{jobId:id});startFastPoll();await refresh({quiet:true});toast('Agent started');
    }catch(e){mini.textContent=e.message;mini.className='dataset-mini-status error';toast(e.message);try{await refresh({quiet:true})}catch(_){}}
  }));

  initAgentArchiveUi();renderOtdJob();
  refresh().then(()=>{renderOtdJob();return syncAgentDownloadButtons()}).catch(()=>{}); chrome.storage?.onChanged?.addListener?.(()=>syncAgentDownloadButtons().catch(()=>{})); setInterval(()=>syncAgentDownloadButtons().catch(()=>{}),5000);setInterval(()=>{if(document.visibilityState==='visible'&&!pollTimer)refresh({quiet:true}).catch(()=>{})},30000);
})();
