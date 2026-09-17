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
      const timer=setTimeout(()=>{window.removeEventListener('message',onMessage);reject(new Error('Host did not respond. Digiexpress Host 12.5.4 or newer is required.'));},20000);
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
    const enabled=$('enabled').checked;
    $('scheduleType').disabled=!enabled;$('dailyTime').disabled=!enabled;$('intervalHours').disabled=!enabled;
    const hourly=$('scheduleType').value==='hourly';
    $('dailyWrap').hidden=hourly;$('hourlyWrap').hidden=!hourly;
    $('dailyWrap').classList.toggle('disabled-setting',!enabled);$('hourlyWrap').classList.toggle('disabled-setting',!enabled);
    $('scheduleType').closest('label')?.classList.toggle('disabled-setting',!enabled);
  }
  function collectJob(id=activeJobId){
    const base=getJob(id),defs=JOBS[id];
    const inputs=id==='iata-code-synchronizer'?{
      syncTargets:[...($('syncShippingPoints').checked?['shipping-points']:[]),...($('syncShippingPolygons').checked?['shipping-polygons']:[])],
      pointExceptions:$('pointExceptions').value.trim(),
      polygonExceptions:$('polygonExceptions').value.trim()
    }:(base.inputs||defs.inputs||{});
    return {...defs,...base,webAppUrl:$('webAppUrl').value.trim()||sharedWebAppUrl(),enabled:$('enabled').checked,schedule:{type:$('scheduleType').value,time:$('dailyTime').value||'12:00',intervalHours:Number($('intervalHours').value||1)},preOperations:defs.preOperations,inputs};
  }

  function renderJob(id){
    const st=getState(id),run=document.querySelector(`[data-run-job="${id}"]`),mini=document.querySelector(`[data-status-for="${id}"]`);
    if(!run||!mini)return;
    const isRunning=!!st.running;run.classList.toggle('running',isRunning);run.classList.toggle('cancel-mode',isRunning);run.disabled=false;setRunButtonVisual(run,isRunning,JOBS[id].label);
    mini.className='dataset-mini-status';
    if(st.running){mini.textContent=st.phase||'Updating…';mini.classList.add('busy')}
    else if(st.lastError){mini.textContent=friendlyError(st.lastError);mini.classList.add('error')}
    else mini.textContent='Ready';
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
    const isIata=id==='iata-code-synchronizer';$('iataOptions').hidden=!isIata;$('rowCountLabel').textContent=isIata?'Processed records':'Rows written';
    if(isIata){const inputs=job.inputs||JOBS[id].inputs||{};const targets=Array.isArray(inputs.syncTargets)?inputs.syncTargets:[];$('syncShippingPoints').checked=targets.includes('shipping-points');$('syncShippingPolygons').checked=targets.includes('shipping-polygons');$('pointExceptions').value=inputs.pointExceptions||'';$('polygonExceptions').value=inputs.polygonExceptions||'';}
    $('enabled').checked=job.enabled===true;$('scheduleType').value=job.schedule?.type==='hourly'?'hourly':'daily';
    $('dailyTime').value=job.schedule?.time||'12:00';$('intervalHours').value=String(job.schedule?.intervalHours||1);updateScheduleControls();
    $('lastRun').textContent=fmt(st.lastRunAt);$('rowCount').textContent=st.rowCount??'—';$('nextRun').textContent=fmt(st.nextRunAt);$('lastStatus').textContent=st.running?(st.phase||st.lastStatus||'Running…'):(st.lastStatus||'—');
    $('datasetError').hidden=!st.lastError;$('datasetError').textContent=friendlyError(st.lastError)||'';
  }
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
      if(!cur||!preOk||!opOk){await request('saveJob',{job:{...defs,...(cur||{}),operationId:defs.operationId,sheetName:defs.sheetName,preOperations:defs.preOperations,inputs:cur?.inputs||defs.inputs||{}}});changed=true;}
    }
    migrationDone=true;return changed?request('getState'):state;
  }
  async function refresh({quiet=false}={}){
    try{let x=await request('getState');x=await ensureJobs(x);apply(x);$('connectionStatus').textContent='';$('connectionStatus').classList.remove('error');return x}
    catch(e){if(!quiet){$('connectionStatus').textContent=e.message;$('connectionStatus').classList.add('error')}throw e}
  }

  $('appSettingsBtn').addEventListener('click',()=>{ $('webAppUrl').value=sharedWebAppUrl();openModal('appSettingsModal'); });
  document.querySelectorAll('[data-settings-job]').forEach(btn=>btn.addEventListener('click',()=>{populateSettings(btn.dataset.settingsJob);openModal('datasetSettingsModal')}));
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
      run.classList.add('running');run.classList.add('cancel-mode');setRunButtonVisual(run,true,JOBS[id].label);mini.textContent=id==='distribution-centers'?'Assigning 300 DCs…':(id==='pickup-polygons'?'Opening Flex Coverage Polygons…':(id==='delivery-polygons'?'Opening Admin DC Polygons…':'Synchronizing IATA codes…'));mini.className='dataset-mini-status busy';
      const url=sharedWebAppUrl();let job={...JOBS[id],...getJob(id),webAppUrl:url,preOperations:JOBS[id].preOperations};
      if(id==='iata-code-synchronizer'){const saved=job.inputs||JOBS[id].inputs||{};job.inputs=saved;}
      await request('saveJob',{job});await request('runNow',{jobId:id});startFastPoll();await refresh({quiet:true});toast('Agent started');
    }catch(e){mini.textContent=e.message;mini.className='dataset-mini-status error';toast(e.message);try{await refresh({quiet:true})}catch(_){}}
  }));

  refresh().catch(()=>{});setInterval(()=>{if(document.visibilityState==='visible'&&!pollTimer)refresh({quiet:true}).catch(()=>{})},30000);
})();
