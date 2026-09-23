/* Rejected Shipments Remote adapter v373
 * All dashboard behavior is Remote-owned. Host 13 only supplies generic storage,
 * HTTP and operation capabilities through platform-client.js.
 */
(() => {
  const runtimeListeners=new Set();
  let retryTimer=null,retryAttempt=0,audioCtx=null,alertTimer=null,activeOscillators=[];
  const CACHE_KEY='dxRejectedDashboardCacheV4'; // legacy chrome.storage cache; migrated away in v371
  const DATASETS_SPREADSHEET_ID='1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
  const CANONICAL_WEB_APP_URL='https://script.google.com/macros/s/AKfycbyEJOsDh6uIsypeg0DxQKRffFguskutZ05aP7o44jygV7ZAlCrVUkX2eA3__WYmc0WNGg/exec';
  const EXPECTED_API_VERSION='376-destination-v4';
  const DATASETS_SHEET='Rejected Shipments';
  const META_KEY='dxRejectedDashboardMetaV5';
  const IDB_NAME='digiexpress-rejected-dashboard-v1';
  const IDB_STORE='snapshots';
  const IDB_KEY='current';
  const emit=message=>{for(const fn of [...runtimeListeners]){try{fn(message,{},()=>{})}catch(_){}}};
  const numericId=v=>{const m=String(v??'').replace(/[,\s]/g,'').match(/\d+/);return m?Number(m[0]):0;};
  let resolvedConnectionUrl='';
  async function candidateUrls(){
    const x=await chrome.storage.local.get(['dxStableJobsV1','dxDatasetUpdateJobsV1']);
    const stable=x.dxStableJobsV1||{}, legacy=x.dxDatasetUpdateJobsV1||{};
    const out=[]; const add=v=>{const u=String(v||'').trim();if(u&&!out.includes(u))out.push(u);};
    add(CANONICAL_WEB_APP_URL);
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
        if(String(data?.spreadsheetId||'') && String(data.spreadsheetId)!==DATASETS_SPREADSHEET_ID)throw new Error('Rejected Shipments endpoint points to a different spreadsheet.');
        resolvedConnectionUrl=url;
        return data;
      }catch(e){ lastError=e; if(url===resolvedConnectionUrl)resolvedConnectionUrl=''; }
    }
    throw lastError||new Error('Google Sheet request failed.');
  }
  function rowsFrom(data){const h=Array.isArray(data.headers)?data.headers.map(String):[];return (data.rows||[]).map(r=>Object.fromEntries(h.map((k,i)=>[k,Array.isArray(r)?(r[i]??''):''])));}
  function rowId(row){return numericId(row?.id??row?.ID??row?.Id??'');}
  function maxRowId(rows){let m=0;for(const row of (rows||[])){const n=rowId(row);if(n>m)m=n;}return m;}
  function mergeRows(base,incoming,keep=50000){
    const map=new Map(),loose=[];
    for(const row of [...(base||[]),...(incoming||[])]){const id=rowId(row);if(id)map.set(id,row);else loose.push(row);}
    const merged=[...map.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
    // Rejected Shipments rows normally have IDs. Preserve any malformed rows too, but cap cache size.
    return [...loose,...merged].slice(-keep);
  }
  function openCacheDb(){
    return new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB)return reject(new Error('IndexedDB is unavailable.'));
      const req=indexedDB.open(IDB_NAME,1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE);};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Could not open dashboard cache database.'));
    });
  }
  async function idbGetSnapshot(){
    const db=await openCacheDb();
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,'readonly'),req=tx.objectStore(IDB_STORE).get(IDB_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('Could not read dashboard cache.'));});}
    finally{db.close();}
  }
  async function idbPutSnapshot(value){
    const db=await openCacheDb();
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(value,IDB_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Could not save dashboard cache.'));tx.onabort=()=>reject(tx.error||new Error('Dashboard cache transaction was aborted.'));});}
    finally{db.close();}
  }
  async function cachePayload(payload){
    const rows=Array.isArray(payload.rows)?payload.rows:[];
    const meta={totalRows:Number(payload.totalRows)||rows.length,maxId:Number(payload.maxId)||maxRowId(rows),cursorRow:Number(payload.cursorRow??payload.totalRows??rows.length)||0,cacheUpdatedAt:payload.cacheUpdatedAt||new Date().toISOString()};
    // v370 stored up to 50k rich rows in chrome.storage.local. Host 13.0.5 does not request
    // unlimitedStorage, so the cache eventually exceeded QUOTA_BYTES and every successful
    // Google Sheet refresh was reported as a failure. Keep the large snapshot in IndexedDB
    // (origin storage) and only the tiny metadata object in extension storage.
    await idbPutSnapshot({rows,meta});
    await chrome.storage.local.set({[META_KEY]:meta});
    try{await chrome.storage.local.remove([CACHE_KEY,'dxRejectedDashboardMetaV4']);}catch(_){}
  }
  async function cached(limit=50000){
    let snapshot=null;
    try{snapshot=await idbGetSnapshot();}catch(_){}
    if(snapshot&&Array.isArray(snapshot.rows)&&snapshot.rows.length){
      const rows=snapshot.rows.slice(-limit),m=snapshot.meta||{};
      return {ok:true,rows,kpis:null,totalRows:Number(m.totalRows)||rows.length,maxId:Number(m.maxId)||maxRowId(rows),cursorRow:Number(m.cursorRow??m.totalRows??rows.length)||0,cacheUpdatedAt:m.cacheUpdatedAt||'',dataSource:'indexeddb-cache'};
    }
    // One-time migration from the old chrome.storage.local snapshot. If it already exceeded
    // quota, reading may still succeed even though future writes fail; migrate then delete it.
    const x=await chrome.storage.local.get([CACHE_KEY,META_KEY,'dxRejectedDashboardMetaV4']);
    const legacyRows=Array.isArray(x[CACHE_KEY])?x[CACHE_KEY]:[];
    const m=x[META_KEY]||x.dxRejectedDashboardMetaV4||{};
    if(legacyRows.length){
      const payload={ok:true,rows:legacyRows,kpis:null,totalRows:Number(m.totalRows)||legacyRows.length,maxId:Number(m.maxId)||Math.max(0,...legacyRows.map(rowId)),cursorRow:Number(m.cursorRow??m.totalRows??legacyRows.length)||0,cacheUpdatedAt:m.cacheUpdatedAt||'',dataSource:'legacy-cache'};
      try{await cachePayload(payload);}catch(_){}
      return {...payload,rows:legacyRows.slice(-limit)};
    }
    return {ok:false,error:'No dashboard cache available yet.'};
  }
  async function saveCacheBestEffort(payload){
    try{await cachePayload(payload);return '';}
    catch(e){console.warn('[RejectedDashboard] cache save failed',e);return String(e?.message||e||'Dashboard cache save failed.');}
  }
  async function readRejectedSnapshot(limit=120){
    const safeLimit=Math.max(20,Math.min(300,Number(limit)||120));
    let d;
    try{d=await http({action:'readRejectedDashboardSnapshot',sheetName:DATASETS_SHEET,limit:safeLimit});}
    catch(e){
      if(/Unsupported action/i.test(String(e?.message||e)))throw new Error('Rejected Shipments Apps Script is outdated. Deploy the v373 Code.gs to the existing Web App deployment.');
      throw e;
    }
    const rows=rowsFrom(d),totalRows=Number(d.totalRows)||rows.length,updatedAt=d.updatedAt||new Date().toISOString();
    return {rows,totalRows,updatedAt,maxId:Number(d.maxId)||maxRowId(rows),startDataRow:Number(d.startDataRow)||Math.max(1,totalRows-rows.length+1),apiVersion:String(d.apiVersion||''),mode:String(d.mode||'tail-snapshot')};
  }
  async function readRejectedDelta(afterRow=null,limit=80){
    const safeLimit=Math.max(1,Math.min(300,Number(limit)||80));
    const payload={action:'readRejectedDashboardDelta',sheetName:DATASETS_SHEET,limit:safeLimit};
    if(Number.isFinite(Number(afterRow))&&Number(afterRow)>=0)payload.afterRow=Math.floor(Number(afterRow));
    let d;
    try{d=await http(payload);}
    catch(e){
      if(/Unsupported action/i.test(String(e?.message||e)))throw new Error('Rejected Shipments Apps Script is outdated. Deploy the current DataSets Code.gs Web App, then retry.');
      throw e;
    }
    const rows=rowsFrom(d),totalRows=Number(d.totalRows)||rows.length,updatedAt=d.updatedAt||new Date().toISOString();
    return {rows,totalRows,updatedAt,maxId:Number(d.maxId)||maxRowId(rows),cursorRow:Number(d.cursorRow??totalRows)||0,truncated:!!d.truncated,remainingRows:Number(d.remainingRows)||0};
  }
  async function incrementalFresh(limit=50000){
    const c=await cached(limit);
    // Every refresh begins with a small authoritative tail snapshot. This validates the
    // current Sheet size/max ID and prevents a stale browser cursor from getting stuck forever.
    const snap=await readRejectedSnapshot(120);
    if(snap.apiVersion && snap.apiVersion!==EXPECTED_API_VERSION){
      throw new Error(`Rejected Shipments Apps Script version mismatch. Expected ${EXPECTED_API_VERSION}, received ${snap.apiVersion}.`);
    }

    if(!c.ok){
      const payload={ok:true,rows:snap.rows.slice(-limit),kpis:null,totalRows:snap.totalRows,maxId:snap.maxId,cursorRow:snap.totalRows,cacheUpdatedAt:snap.updatedAt,dataSource:'apps-script-tail-seed'};
      const cacheWarning=await saveCacheBestEffort(payload);
      return cacheWarning?{...payload,warning:'Fresh Google Sheet data loaded, but local cache could not be saved: '+cacheWarning}:payload;
    }

    let rows=c.rows||[];
    let cursor=Math.max(0,Number(c.cursorRow??c.totalRows??0)||0);
    const oldTotal=Math.max(0,Number(c.totalRows)||0);
    const oldMax=Math.max(0,Number(c.maxId)||maxRowId(rows));
    const remoteTotal=Math.max(0,Number(snap.totalRows)||0);
    const remoteMax=Math.max(0,Number(snap.maxId)||0);

    // Always merge the latest tail first. This picks up corrections to recent rows even when
    // row count is unchanged, and guarantees the newest records are visible immediately.
    rows=mergeRows(rows,snap.rows,limit);

    // If the Sheet was truncated/rebuilt, the old row cursor no longer has meaning. Reset the
    // cache to the authoritative tail rather than remaining permanently stuck at an old cursor.
    if(remoteTotal<cursor || (remoteTotal===oldTotal && remoteMax && oldMax && remoteMax<oldMax)){
      rows=snap.rows.slice(-limit);
      cursor=remoteTotal;
    }else if(remoteTotal>cursor){
      // Catch up exact missing rows in bounded chunks. Up to 10 chunks (= 800 rows) per refresh.
      // The tail snapshot above already makes the newest data visible while the historical gap
      // catches up over one or more cycles.
      for(let i=0;i<10 && cursor<remoteTotal;i++){
        const part=await readRejectedDelta(cursor,80);
        if(part.rows.length)rows=mergeRows(rows,part.rows,limit);
        const next=Math.max(cursor,Number(part.cursorRow)||cursor);
        if(next===cursor)break;
        cursor=next;
        if(!part.truncated||!part.remainingRows)break;
      }
    }else{
      cursor=remoteTotal;
    }

    const payload={ok:true,rows,kpis:null,totalRows:remoteTotal,maxId:Math.max(remoteMax,maxRowId(rows)),cursorRow:Math.min(cursor,remoteTotal),cacheUpdatedAt:snap.updatedAt,dataSource:cursor<remoteTotal?'apps-script-tail-plus-catchup':'apps-script-tail-snapshot'};
    const cacheWarning=await saveCacheBestEffort(payload);
    return cacheWarning?{...payload,warning:'Fresh Google Sheet data loaded, but local cache could not be saved: '+cacheWarning}:payload;
  }

  async function directFull(limit=500){
    const safeLimit=Math.max(25,Math.min(500,Number(limit)||500));
    const direct=await DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:DATASETS_SPREADSHEET_ID,sheetName:DATASETS_SHEET,limit:safeLimit});
    if(direct?.ok===false)throw new Error(direct.error||'Direct Google Sheet read failed.');
    const d=direct?.result??direct??{},rows=rowsFrom(d),totalRows=Number(d.totalRows)||rows.length,updatedAt=d.updatedAt||new Date().toISOString();
    const payload={ok:true,rows,kpis:null,totalRows,maxId:maxRowId(rows),cacheUpdatedAt:updatedAt,dataSource:'google-sheet-direct'};
    const cacheWarning=await saveCacheBestEffort(payload);return cacheWarning?{...payload,warning:'Fresh Google Sheet data loaded, but local cache could not be saved: '+cacheWarning}:payload;
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
      if(c.ok)return {...c,dataSource:'local-cache',warning:isQuotaError(e)?'Google Sheet quota is busy; showing cached data. Next refresh in 5 min.':`Google Sheet refresh failed: ${String(e?.message||e)}. Showing cached data; next refresh in 5 min.`,retryScheduled:true,nextRetryMs:5*60*1000,error:String(e?.message||e)};
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
