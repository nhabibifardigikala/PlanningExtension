(()=>{
  const params=new URLSearchParams(location.search);
  const explicitTheme=params.get('theme');
  document.documentElement.dataset.theme=explicitTheme==='dark'?'dark':'light';

  const ORIGIN=location.origin;
  const JOBS={
    'distribution-centers':{
      id:'distribution-centers',label:'Distribution Centers Extractor',operationId:'extract-dc',sheetName:'Distribution Centers (LG)',output:{type:'sheet'},enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},
      preOperations:[{operationId:'dc-user-assignment',inputs:{useConfiguredEmail:true,dcCount:300}}]
    },
    'pickup-polygons':{
      id:'pickup-polygons',label:'Pickup Polygons Extractor',operationId:'extract-pickup-polygons',sheetName:'Pick-up Polygons',output:{type:'sheet'},enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[]
    },
    'delivery-polygons':{
      id:'delivery-polygons',label:'Delivery Polygons Extractor',operationId:'extract-delivery-polygons',sheetName:'Delivery Polygons',output:{type:'sheet'},enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[]
    }
,
    'iata-code-synchronizer':{
      id:'iata-code-synchronizer',label:'IATA Code Synchronizer',operationId:'sync-iata',sheetName:'IATA Synchronizer Log',output:{type:'none'},enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[],
      inputs:{syncTargets:['shipping-points','shipping-polygons'],pointExceptions:'',polygonExceptions:''}
    }
,
    'rejected-shipments-sync':{
      id:'rejected-shipments-sync',label:'Rejected Shipments Synchronizer',operationId:'rejected-shipments-sync',sheetName:'Rejected Shipments',output:{type:'internal'},enabled:true,
      schedule:{type:'interval',time:'12:00',intervalHours:1,intervalMinutes:15},preOperations:[],
      inputs:{keepScrapeTabOpen:false}
    }
  };
  const $=id=>document.getElementById(id);

  const RUN_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.6 6.4A8.95 8.95 0 0 0 12 3a9 9 0 0 0-8.5 6H1l4 4 4-4H6.6A6 6 0 0 1 17 7.2L14.2 10H21V3.2l-2.4 2.4v.8ZM5.4 17.6A8.95 8.95 0 0 0 12 21a9 9 0 0 0 8.5-6H23l-4-4-4 4h2.4A6 6 0 0 1 7 16.8L9.8 14H3v6.8l2.4-2.4v-.8Z"/></svg>';
  const STOP_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10H7z"/></svg>';
  function setRunButtonVisual(run,isRunning,label){
    run.innerHTML=isRunning?STOP_ICON:RUN_ICON;
    run.title=isRunning?'Stop operation':'Update now';
    run.setAttribute('aria-label',isRunning?`Stop ${label}`:`Run ${label} now`);
  }
  let currentState=null,activeJobId='distribution-centers',pollTimer=null,migrationDone=false;

  function request(action,payload={}){
    return new Promise((resolve,reject)=>{
      const requestId=`dsu-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer=setTimeout(()=>{window.removeEventListener('message',onMessage);reject(new Error('Host did not respond. Digiexpress Host 12.7.4 or newer is required.'));},20000);
      function onMessage(e){
        if(e.source!==window||e.origin!==ORIGIN)return;
        const d=e.data||{};
        if(d.type!=='DIGIEXPRESS_DATASET_UPDATE_RESULT'||d.requestId!==requestId)return;
        clearTimeout(timer);window.removeEventListener('message',onMessage);
        d.ok?resolve(d.result||{}):reject(new Error(d.error||'Request failed.'));
      }
      window.addEventListener('message',onMessage);
      window.postMessage({type:'DIGIEXPRESS_DATASET_UPDATE_REQUEST',requestId,action,payload},ORIGIN);
    });
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
    if(id==='rejected-shipments-sync')inputs={keepScrapeTabOpen:$('keepRejectedTabOpen').checked};
    return {...defs,...base,webAppUrl:$('webAppUrl').value.trim()||sharedWebAppUrl(),enabled:$('enabled').checked,schedule:{type:$('scheduleType').value,time:$('dailyTime').value||'12:00',intervalHours:Number($('intervalHours').value||1),intervalMinutes:Number($('intervalMinutes').value||15)},preOperations:defs.preOperations,inputs};
  }

  function renderJob(id){
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
    $('preUpdateNote').hidden=id!=='distribution-centers';
    const isIata=id==='iata-code-synchronizer',isRejected=id==='rejected-shipments-sync';$('iataOptions').hidden=!isIata;$('rejectedOptions').hidden=!isRejected;$('rowCountLabel').textContent=isIata?'Processed records':(isRejected?'Rows appended':'Rows written');
    if(isIata){const inputs=job.inputs||JOBS[id].inputs||{};const targets=Array.isArray(inputs.syncTargets)?inputs.syncTargets:[];$('syncShippingPoints').checked=targets.includes('shipping-points');$('syncShippingPolygons').checked=targets.includes('shipping-polygons');$('pointExceptions').value=inputs.pointExceptions||'';$('polygonExceptions').value=inputs.polygonExceptions||'';}
    if(isRejected){const inputs=job.inputs||JOBS[id].inputs||{};$('keepRejectedTabOpen').checked=inputs.keepScrapeTabOpen===true;}
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
  function openErrorDetails(id){const st=getState(id),raw=String(st.lastError||'');if(!raw)return;const friendly=friendlyError(raw);$('errorDetailsTitle').textContent=JOBS[id].label;$('errorDetailsBody').innerHTML=`<section class="error-detail-block"><span>What happened</span><strong>${esc(friendly)}</strong></section><section class="error-detail-block"><span>Technical detail</span><code>${esc(raw)}</code></section><section class="error-detail-block"><span>Recommended action</span><strong>Retry the Agent. If the issue repeats, open Diagnostics from Settings and review the failed URL, selector and tab details.</strong></section>`;openModal('errorDetailsModal');}
  function startFastPoll(){if(pollTimer)return;pollTimer=setInterval(()=>refresh({quiet:true}).catch(()=>{}),1200)}
  function stopFastPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}

  async function ensureJobs(state){
    if(migrationDone)return state;
    let changed=false;
    for(const id of Object.keys(JOBS)){
      const cur=state?.jobs?.[id];const defs=JOBS[id];
      const pre=Array.isArray(cur?.preOperations)?cur.preOperations:[];
      const preOk=id!=='distribution-centers'||pre.some(x=>x?.operationId==='dc-user-assignment'&&Number(x?.inputs?.dcCount)===300&&x?.inputs?.useConfiguredEmail===true);
      const opOk=cur?.operationId===defs.operationId&&String(cur?.sheetName||'')===String(defs.sheetName||'');
      if(!cur||!preOk||!opOk){await request('saveJob',{job:{...defs,...(cur||{}),operationId:defs.operationId,sheetName:defs.sheetName,webAppUrl:String(cur?.webAppUrl||sharedWebAppUrl()||''),preOperations:defs.preOperations,inputs:cur?.inputs||defs.inputs||{},schedule:{...defs.schedule,...(cur?.schedule||{})},enabled:cur?.enabled===undefined?defs.enabled:cur.enabled}});changed=true;}
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
    const btn=$('saveConnection');try{btn.disabled=true;const url=$('webAppUrl').value.trim();try{if(url)localStorage.setItem('digiexpress.dataset.webAppUrl',url);else localStorage.removeItem('digiexpress.dataset.webAppUrl')}catch(_){};for(const id of Object.keys(JOBS)){const base=getJob(id);await request('saveJob',{job:{...JOBS[id],...base,webAppUrl:url,preOperations:JOBS[id].preOperations,inputs:base.inputs||JOBS[id].inputs||{}}})}await refresh({quiet:true});toast('Google Sheets connection saved');closeModal('appSettingsModal')}
    catch(e){$('connectionStatus').textContent=e.message;$('connectionStatus').classList.add('error')}
    finally{btn.disabled=false}
  });
  $('saveSchedule').addEventListener('click',async()=>{
    const btn=$('saveSchedule');try{btn.disabled=true;const job=collectJob(activeJobId);if(activeJobId==='iata-code-synchronizer'&&!job.inputs.syncTargets.length)throw new Error('Select at least one IATA synchronization target.');await request('saveJob',{job});await refresh({quiet:true});toast(`${JOBS[activeJobId].label} settings saved`);closeModal('datasetSettingsModal')}
    catch(e){$('datasetError').hidden=false;$('datasetError').textContent=e.message}
    finally{btn.disabled=false}
  });

  document.querySelectorAll('[data-run-job]').forEach(run=>run.addEventListener('click',async()=>{
    const id=run.dataset.runJob,st=getState(id),mini=document.querySelector(`[data-status-for="${id}"]`);
    if(st.running){try{setRunButtonVisual(run,true,JOBS[id].label);mini.textContent='Stopping operation…';mini.className='dataset-mini-status busy';await request('cancel',{jobId:id});toast('Operation stopped');await refresh({quiet:true})}catch(e){mini.textContent=e.message;mini.className='dataset-mini-status error'}return;}
    try{
      run.classList.add('running');run.classList.add('cancel-mode');setRunButtonVisual(run,true,JOBS[id].label);mini.textContent=id==='distribution-centers'?'Assigning 300 DCs…':(id==='pickup-polygons'?'Opening Flex Coverage Polygons…':(id==='delivery-polygons'?'Opening Admin DC Polygons…':(id==='rejected-shipments-sync'?'Synchronizing rejected shipments…':'Synchronizing IATA codes…')));mini.className='dataset-mini-status busy';
      const url=sharedWebAppUrl();let job={...JOBS[id],...getJob(id),webAppUrl:url,preOperations:JOBS[id].preOperations};
      if(id==='iata-code-synchronizer'||id==='rejected-shipments-sync'){const saved=job.inputs||JOBS[id].inputs||{};job.inputs=saved;}
      await request('saveJob',{job});await request('runNow',{jobId:id});startFastPoll();await refresh({quiet:true});toast('Agent started');
    }catch(e){mini.textContent=e.message;mini.className='dataset-mini-status error';toast(e.message);try{await refresh({quiet:true})}catch(_){}}
  }));

  refresh().catch(()=>{});setInterval(()=>{if(document.visibilityState==='visible'&&!pollTimer)refresh({quiet:true}).catch(()=>{})},30000);
})();
