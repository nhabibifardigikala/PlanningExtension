(()=>{
  const params=new URLSearchParams(location.search);
  const explicitTheme=params.get('theme');
  document.documentElement.dataset.theme=explicitTheme==='dark'?'dark':'light';

  const ORIGIN=location.origin;
  const JOB_ID='distribution-centers';
  const PRE_OPERATIONS=[{
    operationId:'dc-user-assignment',
    inputs:{useConfiguredEmail:true,dcCount:300}
  }];
  const DEFAULT_JOB={
    id:JOB_ID,
    label:'Distribution Centers',
    operationId:'extract-dc',
    sheetName:'Distribution Centers (LG)',
    enabled:false,
    schedule:{type:'daily',time:'12:00',intervalHours:1},
    preOperations:PRE_OPERATIONS
  };
  const $=id=>document.getElementById(id);
  let currentState=null;
  let migrationDone=false;

  function request(action,payload={}){
    return new Promise((resolve,reject)=>{
      const requestId=`dsu-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer=setTimeout(()=>{window.removeEventListener('message',onMessage);reject(new Error('Host did not respond. Digiexpress Host 12.5.2 or newer is required.'));},20000);
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

  function toggleSchedule(){const hourly=$('scheduleType').value==='hourly';$('dailyWrap').hidden=hourly;$('hourlyWrap').hidden=!hourly}
  function getJob(){return currentState?.jobs?.[JOB_ID]||DEFAULT_JOB}
  function collectJob(){
    const base=getJob();
    return {
      ...DEFAULT_JOB,
      ...base,
      webAppUrl:$('webAppUrl').value.trim(),
      enabled:$('enabled').value==='true',
      schedule:{type:$('scheduleType').value,time:$('dailyTime').value||'12:00',intervalHours:Number($('intervalHours').value||1)},
      preOperations:PRE_OPERATIONS
    };
  }
  function apply(state){
    currentState=state||{};
    const job=getJob(),st=state?.states?.[JOB_ID]||{};
    $('webAppUrl').value=job.webAppUrl||'';
    $('enabled').value=String(job.enabled===true);
    $('scheduleType').value=job.schedule?.type==='hourly'?'hourly':'daily';
    $('dailyTime').value=job.schedule?.time||'12:00';
    $('intervalHours').value=String(job.schedule?.intervalHours||1);
    toggleSchedule();
    $('lastRun').textContent=fmt(st.lastRunAt);$('rowCount').textContent=st.rowCount??'—';$('nextRun').textContent=fmt(st.nextRunAt);$('lastStatus').textContent=st.running?(st.phase||st.lastStatus||'Running…'):(st.lastStatus||'—');
    $('datasetError').hidden=!st.lastError;$('datasetError').textContent=st.lastError||'';
    $('runNow').classList.toggle('running',!!st.running);$('runNow').disabled=!!st.running;
    const mini=$('dcMiniStatus');mini.className='dataset-mini-status';
    if(st.running){mini.textContent=st.phase||'Updating…';mini.classList.add('busy')}else if(st.lastError){mini.textContent=st.lastError;mini.classList.add('error')}else{mini.textContent='Ready'}
  }

  async function ensurePipeline(state){
    if(migrationDone)return state;
    const job=state?.jobs?.[JOB_ID];
    const pre=Array.isArray(job?.preOperations)?job.preOperations:[];
    const ok=pre.some(x=>x?.operationId==='dc-user-assignment'&&Number(x?.inputs?.dcCount)===300&&x?.inputs?.useConfiguredEmail===true);
    if(ok){migrationDone=true;return state}
    const patched={...DEFAULT_JOB,...(job||{}),preOperations:PRE_OPERATIONS};
    const saved=await request('saveJob',{job:patched});
    const savedPre=Array.isArray(saved?.job?.preOperations)?saved.job.preOperations:[];
    if(!savedPre.some(x=>x?.operationId==='dc-user-assignment'))throw new Error('Digiexpress Host 12.5.2 or newer is required for the DC assignment preparation step.');
    migrationDone=true;
    return request('getState');
  }

  async function refresh({quiet=false}={}){
    try{
      let x=await request('getState');
      x=await ensurePipeline(x);
      apply(x);$('connectionStatus').textContent='';$('connectionStatus').classList.remove('error');return x
    }catch(e){if(!quiet){$('connectionStatus').textContent=e.message;$('connectionStatus').classList.add('error')}throw e}
  }

  $('appSettingsBtn').addEventListener('click',()=>openModal('appSettingsModal'));
  $('datasetSettingsBtn').addEventListener('click',()=>openModal('datasetSettingsModal'));
  $('scheduleType').addEventListener('change',toggleSchedule);

  $('saveConnection').addEventListener('click',async()=>{
    const btn=$('saveConnection');try{btn.disabled=true;await request('saveJob',{job:collectJob()});await refresh({quiet:true});toast('Google Sheets connection saved');closeModal('appSettingsModal')}
    catch(e){$('connectionStatus').textContent=e.message;$('connectionStatus').classList.add('error')}
    finally{btn.disabled=false}
  });

  $('saveSchedule').addEventListener('click',async()=>{
    const btn=$('saveSchedule');try{btn.disabled=true;await request('saveJob',{job:collectJob()});await refresh({quiet:true});toast('Distribution Centers settings saved');closeModal('datasetSettingsModal')}
    catch(e){$('datasetError').hidden=false;$('datasetError').textContent=e.message}
    finally{btn.disabled=false}
  });

  $('runNow').addEventListener('click',async()=>{
    const btn=$('runNow');try{btn.disabled=true;btn.classList.add('running');$('dcMiniStatus').textContent='Assigning 300 DCs…';$('dcMiniStatus').className='dataset-mini-status busy';await request('saveJob',{job:collectJob()});await request('runNow',{jobId:JOB_ID});await refresh({quiet:true});toast('Distribution Centers updated')}
    catch(e){$('dcMiniStatus').textContent=e.message;$('dcMiniStatus').className='dataset-mini-status error';toast(e.message);try{await refresh({quiet:true})}catch(_){}}
    finally{btn.disabled=false;btn.classList.remove('running')}
  });

  refresh().catch(()=>{});
  setInterval(()=>{if(document.visibilityState==='visible')refresh({quiet:true}).catch(()=>{})},30000);
})();
