/* Rejected Shipments Remote adapter v341
 * All dashboard behavior is Remote-owned. Host 13 only supplies generic storage,
 * HTTP and operation capabilities through platform-client.js.
 */
(() => {
  const runtimeListeners=new Set();
  let retryTimer=null,retryAttempt=0,audioCtx=null,alertTimer=null,activeOscillators=[];
  const CACHE_KEY='dxRejectedDashboardCacheV2';
  const META_KEY='dxRejectedDashboardMetaV2';
  const emit=message=>{for(const fn of [...runtimeListeners]){try{fn(message,{},()=>{})}catch(_){}}};
  const numericId=v=>{const m=String(v??'').replace(/[,\s]/g,'').match(/\d+/);return m?Number(m[0]):0;};
  let resolvedConnectionUrl='';
  async function candidateUrls(){
    const x=await chrome.storage.local.get(['dxStableJobsV1','dxDatasetUpdateJobsV1']);
    const stable=x.dxStableJobsV1||{}, legacy=x.dxDatasetUpdateJobsV1||{};
    const out=[]; const add=v=>{const u=String(v||'').trim();if(u&&!out.includes(u))out.push(u);};
    add(stable['rejected-shipments-sync']?.webAppUrl);
    add(legacy['rejected-shipments-sync']?.webAppUrl);
    for(const pool of [stable,legacy])for(const j of Object.values(pool||{}))add(j?.webAppUrl);
    try{const old=await chrome.storage.sync.get({webAppUrl:''});add(old.webAppUrl);}catch(_){}
    try{add(localStorage.getItem('digiexpress.dataset.webAppUrl'));}catch(_){}
    return {urls:out,sheetName:String(stable['rejected-shipments-sync']?.sheetName||legacy['rejected-shipments-sync']?.sheetName||'Rejected Shipments')};
  }
  async function rawHttp(url,payload,timeoutMs=60000){
    const r=await DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request:{url,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),responseType:'json',timeoutMs}});
    if(!r?.ok)throw new Error(r?.error||'Google Sheet request failed.');
    if(r.data?.ok===false)throw new Error(r.data.error||'Google Sheet request failed.');
    return r.data||{};
  }
  async function connection(){
    const c=await candidateUrls();
    if(resolvedConnectionUrl)return {url:resolvedConnectionUrl,sheetName:c.sheetName};
    let lastError='';
    for(const url of c.urls){
      try{await rawHttp(url,{action:'rejectedState',sheetName:c.sheetName},15000);resolvedConnectionUrl=url;return {url,sheetName:c.sheetName};}
      catch(e){lastError=String(e?.message||e);}
    }
    if(!c.urls.length)throw new Error('Google Sheets connection is not configured in Agents.');
    throw new Error(`Rejected Shipments DataSets endpoint did not return JSON. ${lastError}`);
  }
  async function http(payload){
    const c=await connection();
    try{return await rawHttp(c.url,{...payload,sheetName:payload.sheetName||c.sheetName});}
    catch(e){resolvedConnectionUrl='';throw e;}
  }
  function rowsFrom(data){const h=Array.isArray(data.headers)?data.headers.map(String):[];return (data.rows||[]).map(r=>Object.fromEntries(h.map((k,i)=>[k,Array.isArray(r)?(r[i]??''):''])));}
  async function cachePayload(payload){await chrome.storage.local.set({[CACHE_KEY]:payload.rows||[],[META_KEY]:{totalRows:payload.totalRows||0,maxId:payload.maxId||0,cacheUpdatedAt:payload.cacheUpdatedAt||new Date().toISOString()}});}
  async function cached(limit=50000){const x=await chrome.storage.local.get([CACHE_KEY,META_KEY]);const rows=Array.isArray(x[CACHE_KEY])?x[CACHE_KEY].slice(-limit):[];const m=x[META_KEY]||{};return rows.length?{ok:true,rows,kpis:null,totalRows:Number(m.totalRows)||rows.length,maxId:Number(m.maxId)||Math.max(0,...rows.map(r=>numericId(r.id))),cacheUpdatedAt:m.cacheUpdatedAt||'',dataSource:'local-cache'}:{ok:false,error:'No dashboard cache available yet.'};}
  async function fresh(limit=50000){
    const d=await http({action:'readDataset',limit});const rows=rowsFrom(d);const payload={ok:true,rows,kpis:null,totalRows:Number(d.totalRows)||rows.length,maxId:Math.max(0,...rows.map(r=>numericId(r.id))),cacheUpdatedAt:d.updatedAt||new Date().toISOString(),dataSource:'google-sheet'};await cachePayload(payload);return payload;
  }
  function scheduleRetry(error){clearTimeout(retryTimer);retryAttempt++;retryTimer=setTimeout(()=>refresh('retry').catch(()=>{}),60000);emit({type:'dashboardRefreshFailed',error:String(error?.message||error),retryAttempt,nextRetry:new Date(Date.now()+60000).toISOString()});}
  async function refresh(source='manual'){
    try{const p=await fresh(50000);retryAttempt=0;clearTimeout(retryTimer);retryTimer=null;emit({type:'dashboardRefreshCompleted',result:{...p,source}});return p;}
    catch(e){scheduleRetry(e);const c=await cached(50000);return c.ok?{...c,warning:`Google Sheet read failed; showing cached data. ${e.message}`,retryScheduled:true}:{ok:false,error:e.message,retryScheduled:true};}
  }
  async function status(){
    const [jobs,cfg]=await Promise.all([chrome.storage.local.get(['dxStableJobStateV1']),chrome.storage.sync.get({alertEnabled:true,alertThreshold:10,alertWindowMinutes:60,dkUserMatcher:'دیجی کالا شاپ',dxUserMatcher:'دیجی اکسپرس',alertHistory:[]})]);
    const st=jobs.dxStableJobStateV1?.['rejected-shipments-sync']||{};
    return {ok:true,lastSync:st.lastRunAt?new Date(st.lastRunAt).toISOString():'',lastNewCount:st.rowCount||0,lastMaxId:0,lastError:st.lastError||'',lastPageCount:0,nextScheduledSync:st.nextRunAt||null,rollingCount:0,alertHistory:cfg.alertHistory||[],config:cfg};
  }

  async function ensureAudioContext(){
    if(!audioCtx||audioCtx.state==='closed')audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')await audioCtx.resume();
    return audioCtx;
  }
  async function playLegacyAlertPair(){
    const audio=await ensureAudioContext();
    const play=(delay,freq)=>{
      const osc=audio.createOscillator(),gain=audio.createGain();
      osc.type='sine';osc.frequency.value=freq;gain.gain.value=0.0001;
      osc.connect(gain);gain.connect(audio.destination);
      const t=audio.currentTime+delay;
      gain.gain.exponentialRampToValueAtTime(0.36,t+0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001,t+0.36);
      osc.start(t);osc.stop(t+0.38);activeOscillators.push(osc);
      osc.onended=()=>{activeOscillators=activeOscillators.filter(x=>x!==osc)};
    };
    play(0,880);play(0.40,1174.66);
  }
  async function startLegacyAlert(){
    if(alertTimer)return true;
    await playLegacyAlertPair();
    alertTimer=setInterval(()=>playLegacyAlertPair().catch(()=>{}),1800);
    return true;
  }
  async function stopLegacyAlert(){
    if(alertTimer){clearInterval(alertTimer);alertTimer=null;}
    for(const osc of activeOscillators.splice(0)){try{osc.stop()}catch(_){}}
    if(audioCtx&&audioCtx.state!=='closed'){await audioCtx.close().catch(()=>{});audioCtx=null;}
    return true;
  }

  async function sendMessage(message){
    switch(String(message?.type||'')){
      case 'getDashboardCache': return cached(message.limit||50000);
      case 'getDashboardData': {try{return await fresh(message.limit||50000)}catch(e){const c=await cached(message.limit||50000);return c.ok?{...c,warning:e.message}:{ok:false,error:e.message};}}
      case 'getDashboardKpis': return {ok:true,kpis:null,dataSource:'client-calculated'};
      case 'refreshDashboardNow': return refresh('manual');
      case 'getStatus': return status();
      case 'saveSettings': {const settings={...(message.settings||{})};await chrome.storage.sync.set(settings);return {ok:true,settings};}
      case 'clearAlertHistory': await chrome.storage.sync.set({alertHistory:[]});return {ok:true};
      case 'openShipmentReference': return DigiExpressPlatform.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:'rejected-shipments-sync',inputs:{__subOperationId:'open-reference',referenceId:String(message.referenceId||'')},awaitCompletion:true,silentDone:true});
      case 'testAlert': {try{await startLegacyAlert();return {ok:true};}catch(e){return {ok:false,error:e.message};}}
      case 'stopAlert': await stopLegacyAlert();return {ok:true};
      default: return DigiExpressPlatform.runtime.sendMessage(message);
    }
  }
  const baseChrome=window.chrome||{};
  window.chrome={...baseChrome,runtime:{...(baseChrome.runtime||{}),sendMessage,onMessage:{addListener:fn=>runtimeListeners.add(fn),removeListener:fn=>runtimeListeners.delete(fn)}},storage:baseChrome.storage};
})();
