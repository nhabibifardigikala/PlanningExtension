/* Rejected Shipments Remote adapter v338
 * All dashboard behavior is Remote-owned. Host 13 only supplies generic storage,
 * HTTP and operation capabilities through platform-client.js.
 */
(() => {
  const runtimeListeners=new Set();
  let retryTimer=null,retryAttempt=0,audioCtx=null,osc=null;
  const CACHE_KEY='dxRejectedDashboardCacheV2';
  const META_KEY='dxRejectedDashboardMetaV2';
  const emit=message=>{for(const fn of [...runtimeListeners]){try{fn(message,{},()=>{})}catch(_){}}};
  const numericId=v=>{const m=String(v??'').replace(/[,\s]/g,'').match(/\d+/);return m?Number(m[0]):0;};
  async function connection(){
    const x=await chrome.storage.local.get(['dxStableJobsV1','dxDatasetUpdateJobsV1']);
    const j=x.dxStableJobsV1?.['rejected-shipments-sync']||x.dxDatasetUpdateJobsV1?.['rejected-shipments-sync']||{};
    return {url:String(j.webAppUrl||'').trim(),sheetName:String(j.sheetName||'Rejected Shipments')};
  }
  async function http(payload){
    const c=await connection();if(!c.url)throw new Error('Google Sheets connection is not configured in Agents.');
    const r=await DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request:{url:c.url,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,sheetName:payload.sheetName||c.sheetName}),responseType:'json',timeoutMs:60000}});
    if(!r?.ok)throw new Error(r?.error||'Google Sheet request failed.');if(r.data?.ok===false)throw new Error(r.data.error||'Google Sheet request failed.');return r.data||{};
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
      case 'testAlert': {try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();osc=audioCtx.createOscillator();osc.frequency.value=880;osc.connect(audioCtx.destination);osc.start();setTimeout(()=>{try{osc?.stop()}catch(_){}},900);return {ok:true};}catch(e){return {ok:false,error:e.message};}}
      case 'stopAlert': try{osc?.stop();await audioCtx?.close();}catch(_){}return {ok:true};
      default: return DigiExpressPlatform.runtime.sendMessage(message);
    }
  }
  const baseChrome=window.chrome||{};
  window.chrome={...baseChrome,runtime:{...(baseChrome.runtime||{}),sendMessage,onMessage:{addListener:fn=>runtimeListeners.add(fn),removeListener:fn=>runtimeListeners.delete(fn)}},storage:baseChrome.storage};
})();
