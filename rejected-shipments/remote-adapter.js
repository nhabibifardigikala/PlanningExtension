(() => {
  const STORE_KEY = 'dxRejectedShipmentsSettingsV1';
  const STATUS_KEY = 'dxRejectedShipmentsStatusV1';
  const CACHE_DB = 'DXRejectedShipmentsRemoteCache';
  const CACHE_STORE = 'payloads';
  const listeners = [];
  const pending = new Map();
  let seq = 0;

  const defaults = {
    webAppUrl:'', secretToken:'', intervalMinutes:15, alertEnabled:true,
    alertThreshold:10, alertWindowMinutes:60, keepScrapeTabOpen:false,
    dkUserMatcher:'دیجی کالا شاپ', dxUserMatcher:'دیجی اکسپرس', theme:'light', savedViews:[]
  };

  function loadSettings(){
    try { return {...defaults, ...(JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{})}; }
    catch (_) { return {...defaults}; }
  }
  function saveSettings(obj){
    const next={...loadSettings(),...(obj||{})};
    localStorage.setItem(STORE_KEY,JSON.stringify(next));
    return next;
  }
  function loadStatus(){
    try { return JSON.parse(localStorage.getItem(STATUS_KEY)||'{}')||{}; }
    catch (_) { return {}; }
  }
  function saveStatus(obj){ const next={...loadStatus(),...(obj||{})}; localStorage.setItem(STATUS_KEY,JSON.stringify(next)); return next; }

  function requestParent(type, payload, resultType, timeoutMs=90000){
    return new Promise((resolve,reject)=>{
      const requestId=`rs-${Date.now()}-${++seq}`;
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Digiexpress Host did not respond. Update the Host runtime if this continues.'));},timeoutMs);
      pending.set(requestId,{resolve,reject,timer,resultType});
      parent.postMessage({type,requestId,...payload},'*');
    });
  }
  window.addEventListener('message',e=>{
    if(e.source!==parent)return;
    const d=e.data||{}; const p=pending.get(String(d.requestId||''));
    if(!p||d.type!==p.resultType)return;
    clearTimeout(p.timer); pending.delete(String(d.requestId)); p.resolve(d);
  });

  async function hostOperation(inputs={}){
    const r=await requestParent('DIGIEXPRESS_REMOTE_OPERATION_REQUEST',{op:'rejected-shipments',inputs},'DIGIEXPRESS_REMOTE_OPERATION_RESULT',120000);
    if(!r?.ok)throw new Error(r?.error||'Rejected Shipments extraction failed.');
    return r.result||{};
  }
  async function hostHttp(url,payload){
    const r=await requestParent('DIGIEXPRESS_REMOTE_HTTP_REQUEST',{request:{url,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8','Accept':'application/json'},body:JSON.stringify(payload||{}),responseType:'json',timeoutMs:20000}},'DIGIEXPRESS_REMOTE_HTTP_RESULT',30000);
    if(!r?.ok)throw new Error(r?.error||'Google Apps Script request failed.');
    const data=r.data??r.result?.data??null;
    if(data?.ok===false)throw new Error(data.error||'Google Apps Script returned an error.');
    return data;
  }

  function normalizeHeader(v){return String(v??'').trim().toLowerCase().replace(/[\s-]+/g,'_');}
  function latinDigits(v){return String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));}
  function numericId(v){const m=latinDigits(v).replace(/[٬,\s]/g,'').match(/\d+/);return m?Number(m[0]):0;}
  function rowsToObjects(headers,rows){
    const keys=(headers||[]).map(normalizeHeader);
    const aliases={
      id:['id'],reference_id:['reference_id','referenceid'],user_id:['user_id','userid'],ready_date:['ready_date','readydate'],status:['status'],created_at:['created_at','createdat'],service_level:['service_level','servicelevel'],shipping_size_id:['shipping_size_id','shippingsizeid'],destination_address:['destination_address','destinationaddress'],destination_shipping_point:['destination_shipping_point','destinationshippingpoint'],parcel_ids:['parcel_ids','parcelids'],promise_date:['promise_date','promisedate']
    };
    const idx={};
    for(const [name,list] of Object.entries(aliases)){
      const normalized=list.map(normalizeHeader); idx[name]=keys.findIndex(k=>normalized.includes(k)||normalized.some(a=>k===a));
    }
    return (rows||[]).map(row=>{const o={};for(const name of Object.keys(aliases)){const i=idx[name];o[name]=i>=0?String(row?.[i]??''):'';}return o;}).filter(r=>numericId(r.id)>0);
  }

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(CACHE_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CACHE_STORE))db.createObjectStore(CACHE_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function cacheSet(key,value){try{const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(CACHE_STORE,'readwrite');tx.objectStore(CACHE_STORE).put(value,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(_){} }
  async function cacheGet(key){try{const db=await openDb();return await new Promise((res,rej)=>{const tx=db.transaction(CACHE_STORE,'readonly');const q=tx.objectStore(CACHE_STORE).get(key);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});}catch(_){return null;} }

  async function dashboardData(limit=20000){
    const s=loadSettings(); if(!String(s.webAppUrl||'').trim())return {ok:false,error:'Google Apps Script Web App URL is not configured.'};
    try{
      const data=await hostHttp(s.webAppUrl,{action:'dashboard',secret:s.secretToken||'',limit:Math.min(Math.max(Number(limit)||20000,100),50000),dkUserMatcher:s.dkUserMatcher,dxUserMatcher:s.dxUserMatcher});
      const payload={...data,ok:true,dataSource:'google-sheet',cacheUpdatedAt:new Date().toISOString()}; await cacheSet('dashboard',payload); return payload;
    }catch(error){const cached=await cacheGet('dashboard');if(cached)return {...cached,ok:true,dataSource:'local-cache',warning:error.message};return {ok:false,error:error.message};}
  }
  async function dashboardKpis(){
    const s=loadSettings(); if(!String(s.webAppUrl||'').trim())return {ok:false,error:'Google Apps Script Web App URL is not configured.'};
    try{const data=await hostHttp(s.webAppUrl,{action:'kpis',secret:s.secretToken||'',dkUserMatcher:s.dkUserMatcher,dxUserMatcher:s.dxUserMatcher});return {...data,ok:true,dataSource:'google-sheet'};}catch(error){const cached=await cacheGet('dashboard');if(cached?.kpis)return {ok:true,kpis:cached.kpis,dataSource:'local-cache',warning:error.message};return {ok:false,error:error.message};}
  }

  async function syncNow(){
    const s=loadSettings(); if(!String(s.webAppUrl||'').trim())return {ok:false,error:'Configure the Google Apps Script Web App URL in Settings first.'};
    try{
      const state=await hostHttp(s.webAppUrl,{action:'state',secret:s.secretToken||''});
      const previousMaxId=Math.max(0,Number(state?.maxId)||0);
      const extracted=await hostOperation({});
      const objects=rowsToObjects(extracted.headers,extracted.rows).filter(r=>numericId(r.id)>previousMaxId).sort((a,b)=>numericId(a.id)-numericId(b.id));
      const publish=await hostHttp(s.webAppUrl,{action:'append',secret:s.secretToken||'',source:'Digiexpress Rejected Shipments',extracted_at:new Date().toISOString(),previous_max_id:previousMaxId,page_count:Number(extracted.pageCount||1),rows:objects});
      const now=new Date().toISOString();
      const result={ok:true,newCount:Number(publish?.appendedCount??objects.length)||0,maxId:Number(publish?.maxId??previousMaxId)||previousMaxId,previousMaxId,pageCount:Number(extracted.pageCount||1),sheet:publish,source:'manual'};
      saveStatus({lastSync:now,lastSuccessfulSync:now,lastNewCount:result.newCount,lastMaxId:result.maxId,lastPageCount:result.pageCount,lastError:'',lastDiagnostics:{source:'Digiexpress Host',extractedRows:(extracted.rows||[]).length,newRows:objects.length}});
      await dashboardData(20000).catch(()=>null);
      return result;
    }catch(error){saveStatus({lastSync:new Date().toISOString(),lastError:error.message});return {ok:false,error:error.message};}
  }

  async function openShipmentReference(referenceId){
    try{await hostOperation({__subOperationId:'open-reference',referenceId:String(referenceId||'').trim()});return {ok:true,referenceId};}
    catch(error){return {ok:false,error:error.message};}
  }

  async function sendMessage(message={}){
    const type=message.type;
    if(type==='getDashboardCache'){const c=await cacheGet('dashboard');return c?{...c,ok:true,dataSource:'local-cache'}:{ok:false,error:'No dashboard cache available yet.'};}
    if(type==='getDashboardData'||type==='refreshDashboardNow')return dashboardData(message.limit||20000);
    if(type==='getDashboardKpis')return dashboardKpis();
    if(type==='saveSettings'){const settings=saveSettings(message.settings||{});return {ok:true,settings};}
    if(type==='syncNow')return syncNow();
    if(type==='openShipmentReference')return openShipmentReference(message.referenceId);
    if(type==='getStatus')return {ok:true,...loadStatus(),config:loadSettings(),alertHistory:loadStatus().alertHistory||[],rollingCount:Number(loadStatus().rollingCount||0)};
    if(type==='clearAlertHistory'){saveStatus({alertHistory:[]});return {ok:true};}
    if(type==='testAlert'){try{const a=new AudioContext();const o=a.createOscillator(),g=a.createGain();g.gain.value=.05;o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.18);return {ok:true};}catch(e){return {ok:false,error:e.message};}}
    if(type==='stopAlert')return {ok:true};
    return {ok:false,error:`Unsupported dashboard message: ${type}`};
  }

  const syncStore={
    async get(arg){const s=loadSettings();if(arg==null)return {...s};if(typeof arg==='string')return {[arg]:s[arg]};if(Array.isArray(arg))return Object.fromEntries(arg.map(k=>[k,s[k]]));return {...arg,...Object.fromEntries(Object.keys(arg||{}).map(k=>[k,s[k]===undefined?arg[k]:s[k]]))};},
    async set(obj){saveSettings(obj||{});}
  };
  window.chrome={
    runtime:{onMessage:{addListener(fn){if(typeof fn==='function')listeners.push(fn);}},sendMessage},
    storage:{sync:syncStore}
  };

  // Match the extension theme supplied by the parent iframe URL.
  const qp=new URLSearchParams(location.search); const t=qp.get('theme'); if(t==='dark'||t==='light')saveSettings({theme:t});
})();
