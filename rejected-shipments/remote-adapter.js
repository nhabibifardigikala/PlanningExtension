/* Rejected Shipments Remote adapter v368
 * All dashboard behavior is Remote-owned. Host 13 only supplies generic storage,
 * HTTP and operation capabilities through platform-client.js.
 */
(() => {
  const runtimeListeners=new Set();
  let retryTimer=null,retryAttempt=0,audioCtx=null,alertTimer=null,activeOscillators=[];
  const CACHE_KEY='dxRejectedDashboardCacheV4';
  const DATASETS_SPREADSHEET_ID='1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
  const DATASETS_SHEET='Rejected Shipments';
  const META_KEY='dxRejectedDashboardMetaV4';
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
    const r=await DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request:{url,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),responseType:'json',timeoutMs,credentials:'include'}});
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
  function rowId(row){return numericId(row?.id??row?.ID??row?.Id??'');}
  function mergeRows(base,incoming,keep=50000){
    const map=new Map(),loose=[];
    for(const row of [...(base||[]),...(incoming||[])]){const id=rowId(row);if(id)map.set(id,row);else loose.push(row);}
    const merged=[...map.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
    // Rejected Shipments rows normally have IDs. Preserve any malformed rows too, but cap cache size.
    return [...loose,...merged].slice(-keep);
  }
  async function cachePayload(payload){await chrome.storage.local.set({[CACHE_KEY]:payload.rows||[],[META_KEY]:{totalRows:payload.totalRows||0,maxId:payload.maxId||0,cacheUpdatedAt:payload.cacheUpdatedAt||new Date().toISOString()}});}
  async function cached(limit=50000){const x=await chrome.storage.local.get([CACHE_KEY,META_KEY]);const rows=Array.isArray(x[CACHE_KEY])?x[CACHE_KEY].slice(-limit):[];const m=x[META_KEY]||{};return rows.length?{ok:true,rows,kpis:null,totalRows:Number(m.totalRows)||rows.length,maxId:Number(m.maxId)||Math.max(0,...rows.map(rowId)),cacheUpdatedAt:m.cacheUpdatedAt||'',dataSource:'local-cache'}:{ok:false,error:'No dashboard cache available yet.'};}
  async function readAppsScriptTail(limit=2000){
    const d=await http({action:'readDataset',sheetName:DATASETS_SHEET,limit});
    const rows=rowsFrom(d),totalRows=Number(d.totalRows)||rows.length,updatedAt=d.updatedAt||new Date().toISOString();
    return {rows,totalRows,updatedAt,maxId:Math.max(0,...rows.map(rowId))};
  }
  async function incrementalFresh(limit=50000){
    const c=await cached(limit);
    // The old dashboard downloaded up to 50k rows every five minutes, which can exhaust
    // the Google Sheets byte quota. Refresh only the tail and merge it into local cache.
    let tailLimit=2000;
    if(c.ok){
      const metaRows=Number(c.totalRows)||c.rows.length;
      // Normal five-minute growth is small. 2k rows gives plenty of headroom without
      // repeatedly paying for the entire sheet.
      tailLimit=Math.min(5000,Math.max(1000,Math.ceil(Math.min(metaRows,2000))));
    }
    const tail=await readAppsScriptTail(tailLimit);
    if(c.ok){
      const delta=Math.max(0,tail.totalRows-Number(c.totalRows||0));
      let incoming=tail.rows;
      // If the sheet grew by more than the first tail window, fetch only enough recent
      // rows to cover that growth (capped to keep quota use bounded).
      if(delta>tailLimit && delta<=10000){
        const wider=await readAppsScriptTail(Math.min(10000,delta+250));
        incoming=wider.rows; tail.totalRows=wider.totalRows; tail.updatedAt=wider.updatedAt; tail.maxId=wider.maxId;
      }
      const rows=mergeRows(c.rows,incoming,limit);
      const payload={ok:true,rows,kpis:null,totalRows:tail.totalRows||rows.length,maxId:Math.max(Number(c.maxId)||0,tail.maxId||0,...rows.map(rowId)),cacheUpdatedAt:tail.updatedAt,dataSource:'apps-script-incremental'};
      await cachePayload(payload);
      return payload;
    }
    // First run has no cache yet. Seed a useful recent window without a huge 50k-byte read.
    const seed=tailLimit<10000?await readAppsScriptTail(10000):tail;
    const rows=seed.rows.slice(-limit);
    const payload={ok:true,rows,kpis:null,totalRows:seed.totalRows||rows.length,maxId:seed.maxId||Math.max(0,...rows.map(rowId)),cacheUpdatedAt:seed.updatedAt,dataSource:'apps-script-seed'};
    await cachePayload(payload);
    return payload;
  }
  async function directFull(limit=50000){
    const direct=await DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:DATASETS_SPREADSHEET_ID,sheetName:DATASETS_SHEET,limit});
    if(direct?.ok===false)throw new Error(direct.error||'Direct Google Sheet read failed.');
    const d=direct?.result??direct??{},rows=rowsFrom(d),totalRows=Number(d.totalRows)||rows.length,updatedAt=d.updatedAt||new Date().toISOString();
    const payload={ok:true,rows,kpis:null,totalRows,maxId:Math.max(0,...rows.map(rowId)),cacheUpdatedAt:updatedAt,dataSource:'google-sheet-direct'};
    await cachePayload(payload);return payload;
  }
  function retryDelay(error){
    const msg=String(error?.message||error||'').toLowerCase();
    if(/quota|kquotabytes|rate limit|resource exhausted/.test(msg))return Math.min(30*60*1000,5*60*1000*Math.max(1,retryAttempt+1));
    return Math.min(5*60*1000,60*1000*Math.max(1,retryAttempt+1));
  }
  function scheduleRetry(error){clearTimeout(retryTimer);retryAttempt++;const delay=retryDelay(error);retryTimer=setTimeout(()=>refresh('retry').catch(()=>{}),delay);emit({type:'dashboardRefreshFailed',error:String(error?.message||error),retryAttempt,nextRetry:new Date(Date.now()+delay).toISOString()});return delay;}
  async function refresh(source='manual'){
    try{
      // Scheduled/bootstrap refreshes are incremental. A manual refresh also prefers
      // incremental data when a cache exists; this avoids quota spikes for every click.
      const p=await incrementalFresh(50000);
      retryAttempt=0;clearTimeout(retryTimer);retryTimer=null;emit({type:'dashboardRefreshCompleted',result:{...p,source}});return p;
    }catch(e){
      const delay=scheduleRetry(e),c=await cached(50000);
      // Do not immediately hit the second Google path after a quota failure. The old
      // direct-then-Apps-Script sequence doubled pressure and made the quota outage last longer.
      if(c.ok)return {...c,warning:`Google Sheet quota is temporarily busy; showing cached data. Next retry in ${Math.ceil(delay/60000)} min.`,retryScheduled:true,nextRetryMs:delay};
      // Only when there is no cache at all, make one bounded direct attempt so first use can recover.
      try{return await directFull(10000);}catch(fullError){return {ok:false,error:`Dashboard data could not be loaded. ${fullError.message}`,retryScheduled:true,nextRetryMs:delay};}
    }
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
      case 'getDashboardData': return refresh(message.source||'bootstrap');
      case 'getDashboardKpis': return {ok:true,kpis:null,dataSource:'client-calculated'};
      case 'refreshDashboardNow': return refresh(message.source||'manual');
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
