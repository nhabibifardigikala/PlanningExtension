/* Rejected Shipments Remote adapter v370
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
    if(resolvedConnectionUrl)return {url:resolvedConnectionUrl,sheetName:c.sheetName,urls:c.urls};
    if(!c.urls.length)throw new Error('Google Sheets connection is not configured in Agents.');
    // Do not probe rejectedState here. That endpoint scans the full ID column and was
    // needlessly consuming quota before every incremental dashboard read.
    return {url:c.urls[0],sheetName:c.sheetName,urls:c.urls};
  }
  async function http(payload){
    const c=await connection();
    const ordered=[resolvedConnectionUrl,...(c.urls||[])].filter((u,i,a)=>u&&a.indexOf(u)===i);
    let lastError=null;
    for(const url of ordered){
      try{
        const data=await rawHttp(url,{...payload,sheetName:payload.sheetName||c.sheetName});
        resolvedConnectionUrl=url;
        return data;
      }catch(e){ lastError=e; if(url===resolvedConnectionUrl)resolvedConnectionUrl=''; }
    }
    throw lastError||new Error('Google Sheet request failed.');
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
  async function cachePayload(payload){await chrome.storage.local.set({[CACHE_KEY]:payload.rows||[],[META_KEY]:{totalRows:payload.totalRows||0,maxId:payload.maxId||0,cursorRow:Number(payload.cursorRow??payload.totalRows??0)||0,cacheUpdatedAt:payload.cacheUpdatedAt||new Date().toISOString()}});}
  async function cached(limit=50000){const x=await chrome.storage.local.get([CACHE_KEY,META_KEY]);const rows=Array.isArray(x[CACHE_KEY])?x[CACHE_KEY].slice(-limit):[];const m=x[META_KEY]||{};return rows.length?{ok:true,rows,kpis:null,totalRows:Number(m.totalRows)||rows.length,maxId:Number(m.maxId)||Math.max(0,...rows.map(rowId)),cursorRow:Number(m.cursorRow??m.totalRows??0)||0,cacheUpdatedAt:m.cacheUpdatedAt||'',dataSource:'local-cache'}:{ok:false,error:'No dashboard cache available yet.'};}
  async function readRejectedDelta(afterRow=null,limit=80){
    const safeLimit=Math.max(1,Math.min(300,Number(limit)||80));
    const payload={action:'readRejectedDashboardDelta',sheetName:DATASETS_SHEET,limit:safeLimit};
    if(Number.isFinite(Number(afterRow))&&Number(afterRow)>=0)payload.afterRow=Math.floor(Number(afterRow));
    let d;
    try{d=await http(payload);}
    catch(e){
      if(/Unsupported action/i.test(String(e?.message||e)))throw new Error('Rejected Shipments Apps Script is outdated. Deploy the v370 Code.gs Web App, then retry.');
      throw e;
    }
    const rows=rowsFrom(d),totalRows=Number(d.totalRows)||rows.length,updatedAt=d.updatedAt||new Date().toISOString();
    return {rows,totalRows,updatedAt,maxId:Number(d.maxId)||Math.max(0,...rows.map(rowId)),cursorRow:Number(d.cursorRow??totalRows)||0,truncated:!!d.truncated,remainingRows:Number(d.remainingRows)||0};
  }
  async function incrementalFresh(limit=50000){
    const c=await cached(limit);
    if(!c.ok){
      // First use: seed only a small tail. This is intentionally bounded so a fresh browser
      // never asks Apps Script to serialize the whole sheet.
      const seed=await readRejectedDelta(null,180);
      const payload={ok:true,rows:seed.rows.slice(-limit),kpis:null,totalRows:seed.totalRows,maxId:seed.maxId,cursorRow:seed.cursorRow,cacheUpdatedAt:seed.updatedAt,dataSource:'apps-script-delta-seed'};
      await cachePayload(payload);
      return payload;
    }

    let cursor=Number(c.cursorRow??c.totalRows??0)||0;
    let rows=c.rows;
    let latestTotal=Number(c.totalRows)||cursor;
    let latestMax=Number(c.maxId)||Math.max(0,...rows.map(rowId));
    let updatedAt=c.cacheUpdatedAt||new Date().toISOString();
    // Normally this loop runs once and returns zero or a handful of new rows. If the browser
    // was closed for a while, catch up in at most three small chunks to avoid quota spikes.
    for(let i=0;i<3;i++){
      const part=await readRejectedDelta(cursor,80);
      latestTotal=part.totalRows;latestMax=Math.max(latestMax,part.maxId||0);updatedAt=part.updatedAt;
      if(part.rows.length)rows=mergeRows(rows,part.rows,limit);
      cursor=part.cursorRow;
      if(!part.truncated||!part.remainingRows||part.rows.length===0)break;
    }
    const payload={ok:true,rows,kpis:null,totalRows:latestTotal,maxId:latestMax,cursorRow:cursor,cacheUpdatedAt:updatedAt,dataSource:'apps-script-row-delta'};
    await cachePayload(payload);
    return payload;
  }
  async function directFull(limit=500){
    const safeLimit=Math.max(25,Math.min(500,Number(limit)||500));
    const direct=await DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:DATASETS_SPREADSHEET_ID,sheetName:DATASETS_SHEET,limit:safeLimit});
    if(direct?.ok===false)throw new Error(direct.error||'Direct Google Sheet read failed.');
    const d=direct?.result??direct??{},rows=rowsFrom(d),totalRows=Number(d.totalRows)||rows.length,updatedAt=d.updatedAt||new Date().toISOString();
    const payload={ok:true,rows,kpis:null,totalRows,maxId:Math.max(0,...rows.map(rowId)),cacheUpdatedAt:updatedAt,dataSource:'google-sheet-direct'};
    await cachePayload(payload);return payload;
  }
  function isQuotaError(error){return /quota|kquotabytes|rate limit|resource exhausted/i.test(String(error?.message||error||''));}
  async function refresh(source='manual'){
    try{
      const p=await incrementalFresh(50000);
      retryAttempt=0;
      if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
      emit({type:'dashboardRefreshCompleted',result:{...p,source}});
      return p;
    }catch(e){
      const c=await cached(50000);
      // Important: do not create a second hidden retry timer after a quota error. The dashboard
      // already has one five-minute scheduler; duplicate retry loops were multiplying requests.
      emit({type:'dashboardRefreshFailed',error:String(e?.message||e),retryAttempt:1,nextRetry:new Date(Date.now()+5*60*1000).toISOString()});
      if(c.ok)return {...c,warning:isQuotaError(e)?'Google Sheet quota is busy; showing cached data. The next delta refresh will run in 5 min.':`Google Sheet refresh failed; showing cached data. Next automatic refresh in 5 min.`,retryScheduled:true,nextRetryMs:5*60*1000};
      // No cache: make one very small direct attempt only.
      try{return await directFull(250);}catch(fullError){return {ok:false,error:`Dashboard data could not be loaded. ${fullError.message}`,retryScheduled:true,nextRetryMs:5*60*1000};}
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
