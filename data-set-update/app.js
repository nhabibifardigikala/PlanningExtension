(()=>{
  const params=new URLSearchParams(location.search);
  const explicitTheme=params.get('theme');
  document.documentElement.dataset.theme=explicitTheme==='dark'?'dark':'light';

  const ORIGIN=location.origin;
  const JOBS={
    'distribution-centers':{
      id:'distribution-centers',label:'Distribution Centers',operationId:'extract-dc',sheetName:'Distribution Centers (LG)',enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},
      preOperations:[{operationId:'dc-user-assignment',inputs:{useConfiguredEmail:true,dcCount:300}}]
    },
    'pickup-polygons':{
      id:'pickup-polygons',label:'Pick-up Polygons',operationId:'extract-pickup-polygons',sheetName:'Pick-up Polygons',enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[]
    },
    'delivery-polygons':{
      id:'delivery-polygons',label:'Delivery Polygons',operationId:'extract-delivery-polygons',sheetName:'Delivery Polygons',enabled:false,
      schedule:{type:'daily',time:'12:00',intervalHours:1},preOperations:[]
    }
  };
  const $=id=>document.getElementById(id);
  let currentState=null,activeJobId='distribution-centers',pollTimer=null,migrationDone=false;

  function request(action,payload={}){
    return new Promise((resolve,reject)=>{
      const requestId=`dsu-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer=setTimeout(()=>{window.removeEventListener('message',onMessage);reject(new Error('Host did not respond. Digiexpress Host 12.5.3 or newer is required.'));},20000);
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
    return {...defs,...base,webAppUrl:$('webAppUrl').value.trim()||sharedWebAppUrl(),enabled:$('enabled').checked,schedule:{type:$('scheduleType').value,time:$('dailyTime').value||'12:00',intervalHours:Number($('intervalHours').value||1)},preOperations:defs.preOperations};
  }

  function renderJob(id){
    const st=getState(id),run=document.querySelector(`[data-run-job="${id}"]`),mini=document.querySelector(`[data-status-for="${id}"]`);
    if(!run||!mini)return;
    run.classList.toggle('running',!!st.running);run.classList.toggle('cancel-mode',!!st.running);run.disabled=false;
    run.title=st.running?'Cancel update':'Update now';run.setAttribute('aria-label',st.running?`Cancel ${JOBS[id].label} update`:`Update ${JOBS[id].label} now`);
    mini.className='dataset-mini-status';
    if(st.running){mini.textContent=st.phase||'Updating…';mini.classList.add('busy')}
    else if(st.lastError){mini.textContent=st.lastError;mini.classList.add('error')}
    else mini.textContent='Ready';
  }
  function apply(state){
    currentState=state||{};$('webAppUrl').value=sharedWebAppUrl();
    for(const id of Object.keys(JOBS))renderJob(id);
    if(Object.keys(JOBS).some(id=>getState(id).running))startFastPoll();else stopFastPoll();
    if($('datasetSettingsModal').classList.contains('open'))populateSettings(activeJobId);
  }
  function populateSettings(id){
    activeJobId=id;const job=getJob(id),st=getState(id);
    $('datasetSettingsTitle').textContent=JOBS[id].label;
    $('preUpdateNote').hidden=id!=='distribution-centers';
    $('enabled').checked=job.enabled===true;$('scheduleType').value=job.schedule?.type==='hourly'?'hourly':'daily';
    $('dailyTime').value=job.schedule?.time||'12:00';$('intervalHours').value=String(job.schedule?.intervalHours||1);updateScheduleControls();
    $('lastRun').textContent=fmt(st.lastRunAt);$('rowCount').textContent=st.rowCount??'—';$('nextRun').textContent=fmt(st.nextRunAt);$('lastStatus').textContent=st.running?(st.phase||st.lastStatus||'Running…'):(st.lastStatus||'—');
    $('datasetError').hidden=!st.lastError;$('datasetError').textContent=st.lastError||'';
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
      const opOk=cur?.operationId===defs.operationId&&cur?.sheetName===defs.sheetName;
      if(!cur||!preOk||!opOk){await request('saveJob',{job:{...defs,...(cur||{}),operationId:defs.operationId,sheetName:defs.sheetName,preOperations:defs.preOperations}});changed=true;}
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
    const btn=$('saveConnection');try{btn.disabled=true;const url=$('webAppUrl').value.trim();for(const id of Object.keys(JOBS)){const base=getJob(id);await request('saveJob',{job:{...JOBS[id],...base,webAppUrl:url,preOperations:JOBS[id].preOperations}})}await refresh({quiet:true});toast('Google Sheets connection saved');closeModal('appSettingsModal')}
    catch(e){$('connectionStatus').textContent=e.message;$('connectionStatus').classList.add('error')}
    finally{btn.disabled=false}
  });
  $('saveSchedule').addEventListener('click',async()=>{
    const btn=$('saveSchedule');try{btn.disabled=true;await request('saveJob',{job:collectJob(activeJobId)});await refresh({quiet:true});toast(`${JOBS[activeJobId].label} settings saved`);closeModal('datasetSettingsModal')}
    catch(e){$('datasetError').hidden=false;$('datasetError').textContent=e.message}
    finally{btn.disabled=false}
  });

  document.querySelectorAll('[data-run-job]').forEach(run=>run.addEventListener('click',async()=>{
    const id=run.dataset.runJob,st=getState(id),mini=document.querySelector(`[data-status-for="${id}"]`);
    if(st.running){try{mini.textContent='Cancelling…';mini.className='dataset-mini-status busy';await request('cancel',{jobId:id});toast('Update cancelled');await refresh({quiet:true})}catch(e){mini.textContent=e.message;mini.className='dataset-mini-status error'}return;}
    try{
      run.classList.add('running');mini.textContent=id==='distribution-centers'?'Assigning 300 DCs…':(id==='pickup-polygons'?'Opening Flex Coverage Polygons…':'Opening Admin DC Polygons…');mini.className='dataset-mini-status busy';
      const url=sharedWebAppUrl();await request('saveJob',{job:{...JOBS[id],...getJob(id),webAppUrl:url,preOperations:JOBS[id].preOperations}});await request('runNow',{jobId:id});startFastPoll();await refresh({quiet:true});toast('Update started');
    }catch(e){mini.textContent=e.message;mini.className='dataset-mini-status error';toast(e.message);try{await refresh({quiet:true})}catch(_){}}
  }));

  refresh().catch(()=>{});setInterval(()=>{if(document.visibilityState==='visible'&&!pollTimer)refresh({quiet:true}).catch(()=>{})},30000);
})();
