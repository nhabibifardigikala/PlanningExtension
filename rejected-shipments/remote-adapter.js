(() => {
  const STORE_KEY = 'dxRejectedShipmentsSettingsV1';
  const STATUS_KEY = 'dxRejectedShipmentsStatusV1';
  const CACHE_DB = 'DXRejectedShipmentsRemoteCache';
  const CACHE_STORE = 'payloads';
  const TASK_FEATURE_ID = 'rejected-shipments-sync';
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
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Digiexpress Host did not respond. Host 12.3.8 or newer is required for scheduled alerts.'));},timeoutMs);
      pending.set(requestId,{resolve,reject,timer,resultType});
      const target=(window.parent&&window.parent!==window)?window.parent:window;
      const targetOrigin=(target===window)?location.origin:'*';
      target.postMessage({type,requestId,...payload}, targetOrigin);
    });
  }
  window.addEventListener('message',e=>{
    const expected=(window.parent&&window.parent!==window)?window.parent:window; if(e.source!==expected)return;
    const d=e.data||{}; const p=pending.get(String(d.requestId||''));
    if(!p||d.type!==p.resultType)return;
    clearTimeout(p.timer); pending.delete(String(d.requestId)); p.resolve(d);
  });

  async function hostOperation(inputs={}){
    const r=await requestParent('DIGIEXPRESS_REMOTE_OPERATION_REQUEST',{op:'rejected-shipments-data',inputs},'DIGIEXPRESS_REMOTE_OPERATION_RESULT',150000);
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
  async function hostAlert(request){
    const r=await requestParent('DIGIEXPRESS_REMOTE_ALERT_REQUEST',{request},'DIGIEXPRESS_REMOTE_ALERT_RESULT',12000);
    if(!r?.ok)throw new Error(r?.error||'Host alert service failed.');
    return r;
  }
  async function ensureSchedule(settings=loadSettings()){
    const enabled=Boolean(String(settings.webAppUrl||'').trim());
    const r=await requestParent('DIGIEXPRESS_REMOTE_SCHEDULE_REQUEST',{config:{featureId:TASK_FEATURE_ID,path:'rejected-shipments/dashboard.html',enabled,intervalMinutes:15,aligned:true,retryMinutes:1}},'DIGIEXPRESS_REMOTE_SCHEDULE_RESULT',12000);
    if(!r?.ok)throw new Error(r?.error||'Could not configure the 15-minute extraction schedule.');
    return r;
  }
  async function scheduledTaskDone(ok,error=''){
    try{return await requestParent('DIGIEXPRESS_REMOTE_TASK_DONE',{ok:ok===true,error:String(error||'')},'DIGIEXPRESS_REMOTE_TASK_DONE_RESULT',8000);}catch(_){return {ok:false};}
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
      const normalized=list.map(normalizeHeader); idx[name]=keys.findIndex(k=>normalized.includes(k));
    }
    const missing=Object.keys(aliases).filter(name=>idx[name]<0);
    if(missing.length)throw new Error(`Required columns are missing from the extracted shipment table: ${missing.join(', ')}. Open Columns and verify the selection if this repeats.`);
    return (rows||[]).map(row=>{const o={};for(const name of Object.keys(aliases)){const i=idx[name];o[name]=String(row?.[i]??'');}return o;}).filter(r=>numericId(r.id)>0);
  }

  function div(a,b){return Math.trunc(a/b)}
  function mod(a,b){return a-Math.trunc(a/b)*b}
  function jalCal(jy){const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178],gy=jy+621;let leapJ=-14,jp=breaks[0],jm=0,jump=0,n=0;for(let i=1;i<breaks.length;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=div(jump,33)*8+div(mod(jump,33),4);jp=jm;}n=jy-jp;leapJ+=div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ++;const leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;return{gy,march:20+leapJ-leapG};}
  function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d;}
  function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div(mod(j,1461),4)*5+308,gd=div(mod(i,153),5)+1,gm=mod(div(i,153),12)+1,gy=div(j,1461)-100100+div(8-gm,6);return{gy,gm,gd};}
  function j2d(jy,jm,jd){const r=jalCal(jy);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1;}
  function toGregorian(jy,jm,jd){return d2g(j2d(Number(jy),Number(jm),Number(jd)));}
  function parseShipmentTimestamp(value){
    if(!value)return 0;let str=latinDigits(value).trim();
    const m=str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){let y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]);if(y>=1200&&y<1700){try{const g=toGregorian(y,mo,day);y=g.gy;mo=g.gm;day=g.gd;}catch(_){}}const d=new Date(y,mo-1,day,Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));return isNaN(d)?0:d.getTime();}
    const d=new Date(str);return isNaN(d)?0:d.getTime();
  }
  async function updateRollingAlert(rows,settings){
    const now=Date.now(),windowMinutes=Math.max(15,Number(settings.alertWindowMinutes)||60),windowMs=windowMinutes*60000;
    const st=loadStatus(),maxKeepMs=Math.max(windowMs,48*60*60*1000);
    const events=Array.isArray(st.alertEvents)?st.alertEvents.filter(e=>now-Number(e.ts)<=maxKeepMs):[];
    const known=new Set(events.map(e=>String(e.id||'')).filter(Boolean));
    for(const row of Array.isArray(rows)?rows:[]){const id=String(row?.id??'').trim();if(id&&known.has(id))continue;events.push({id,ts:parseShipmentTimestamp(row?.created_at)||now,count:1});if(id)known.add(id);}
    const recent=events.filter(e=>now-Number(e.ts)>=0&&now-Number(e.ts)<=windowMs);const rollingCount=recent.reduce((n,e)=>n+(Number(e.count)||0),0);
    const threshold=Math.max(1,Number(settings.alertThreshold)||1);let latched=Boolean(st.alertLatched),triggered=false,history=Array.isArray(st.alertHistory)?st.alertHistory:[];
    if(rollingCount<threshold)latched=false;
    if(settings.alertEnabled&&rollingCount>=threshold&&!latched){
      const message=`${rollingCount} rejected shipments were created in the last ${windowMinutes} minutes (threshold: ${threshold}).`;
      await hostAlert({action:'start',title:'Rejected Shipments Alert',message});latched=true;triggered=true;
      history=[...history,{id:`a-${Date.now()}`,triggeredAt:new Date().toISOString(),value:rollingCount,threshold,windowMinutes,acknowledgedAt:null}].slice(-500);
    }
    saveStatus({alertEvents:events.slice(-5000),rollingCount,alertLatched:latched,alertHistory:history});
    return {triggered,rollingCount,threshold,windowMinutes,latched};
  }

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(CACHE_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CACHE_STORE))db.createObjectStore(CACHE_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function cacheSet(key,value){try{const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(CACHE_STORE,'readwrite');tx.objectStore(CACHE_STORE).put(value,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(_){} }
  async function cacheGet(key){try{const db=await openDb();return await new Promise((res,rej)=>{const tx=db.transaction(CACHE_STORE,'readonly');const q=tx.objectStore(CACHE_STORE).get(key);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});}catch(_){return null;} }

  async function dashboardData(limit=20000){
    const s=loadSettings(); if(!String(s.webAppUrl||'').trim())return {ok:false,error:'Google Apps Script Web App URL is not configured.'};
    try{const data=await hostHttp(s.webAppUrl,{action:'dashboard',secret:s.secretToken||'',limit:Math.min(Math.max(Number(limit)||20000,100),50000),dkUserMatcher:s.dkUserMatcher,dxUserMatcher:s.dxUserMatcher});const payload={...data,ok:true,dataSource:'google-sheet',cacheUpdatedAt:new Date().toISOString()};await cacheSet('dashboard',payload);return payload;}
    catch(error){const cached=await cacheGet('dashboard');if(cached)return {...cached,ok:true,dataSource:'local-cache',warning:error.message};return {ok:false,error:error.message};}
  }
  async function dashboardKpis(){
    const s=loadSettings(); if(!String(s.webAppUrl||'').trim())return {ok:false,error:'Google Apps Script Web App URL is not configured.'};
    try{const data=await hostHttp(s.webAppUrl,{action:'kpis',secret:s.secretToken||'',dkUserMatcher:s.dkUserMatcher,dxUserMatcher:s.dxUserMatcher});return {...data,ok:true,dataSource:'google-sheet'};}catch(error){const cached=await cacheGet('dashboard');if(cached?.kpis)return {ok:true,kpis:cached.kpis,dataSource:'local-cache',warning:error.message};return {ok:false,error:error.message};}
  }

  async function syncNow(source='manual'){
    const s=loadSettings(); if(!String(s.webAppUrl||'').trim())return {ok:false,error:'Configure the Google Apps Script Web App URL in Settings first.'};
    try{
      const state=await hostHttp(s.webAppUrl,{action:'state',secret:s.secretToken||''});
      const previousMaxId=Math.max(0,Number(state?.maxId)||0);
      const extracted=await hostOperation({});
      const objects=rowsToObjects(extracted.headers,extracted.rows).filter(r=>numericId(r.id)>previousMaxId).sort((a,b)=>numericId(a.id)-numericId(b.id));
      const publish=await hostHttp(s.webAppUrl,{action:'append',secret:s.secretToken||'',source:'Digiexpress Rejected Shipments',extracted_at:new Date().toISOString(),previous_max_id:previousMaxId,page_count:Number(extracted.pageCount||1),rows:objects});
      const alert=await updateRollingAlert(objects,s);
      const now=new Date().toISOString();
      const result={ok:true,newCount:Number(publish?.appendedCount??objects.length)||0,maxId:Number(publish?.maxId??previousMaxId)||previousMaxId,previousMaxId,pageCount:Number(extracted.pageCount||1),sheet:publish,source,alert};
      saveStatus({lastSync:now,lastSuccessfulSync:now,lastNewCount:result.newCount,lastMaxId:result.maxId,lastPageCount:result.pageCount,lastError:'',lastDiagnostics:{source:'Digiexpress Host',extractedRows:(extracted.rows||[]).length,newRows:objects.length,headers:extracted.headers||[],alert}});
      await dashboardData(20000).catch(()=>null);
      return result;
    }catch(error){saveStatus({lastSync:new Date().toISOString(),lastError:error.message});return {ok:false,error:error.message,source};}
  }

  async function openShipmentReference(referenceId){try{await hostOperation({__subOperationId:'open-reference',referenceId:String(referenceId||'').trim()});return {ok:true,referenceId};}catch(error){return {ok:false,error:error.message};}}

  async function sendMessage(message={}){
    const type=message.type;
    if(type==='getDashboardCache'){const c=await cacheGet('dashboard');return c?{...c,ok:true,dataSource:'local-cache'}:{ok:false,error:'No dashboard cache available yet.'};}
    if(type==='getDashboardData'||type==='refreshDashboardNow')return dashboardData(message.limit||20000);
    if(type==='getDashboardKpis')return dashboardKpis();
    if(type==='saveSettings'){const settings=saveSettings(message.settings||{});try{await ensureSchedule(settings);}catch(error){return {ok:false,error:error.message,settings};}return {ok:true,settings};}
    if(type==='ensureSchedule'){try{return await ensureSchedule(loadSettings());}catch(error){return {ok:false,error:error.message};}}
    if(type==='syncNow')return syncNow(String(message.source||'manual'));
    if(type==='scheduledTaskDone')return scheduledTaskDone(message.ok===true,message.error||'');
    if(type==='openShipmentReference')return openShipmentReference(message.referenceId);
    if(type==='getStatus'){const st=loadStatus();return {ok:true,...st,config:loadSettings(),alertHistory:st.alertHistory||[],rollingCount:Number(st.rollingCount||0)};}
    if(type==='clearAlertHistory'){saveStatus({alertHistory:[]});return {ok:true};}
    if(type==='testAlert'){try{return await hostAlert({action:'test',title:'Rejected Shipments Test Alert',message:'Rejected Shipments alerting is active.'});}catch(error){return {ok:false,error:error.message};}}
    if(type==='stopAlert'){
      try{await hostAlert({action:'stop'});}catch(_){}
      const st=loadStatus(),history=Array.isArray(st.alertHistory)?[...st.alertHistory]:[];for(let i=history.length-1;i>=0;i--){if(!history[i].acknowledgedAt){history[i].acknowledgedAt=new Date().toISOString();break;}}
      saveStatus({alertHistory:history});return {ok:true};
    }
    return {ok:false,error:`Unsupported dashboard message: ${type}`};
  }

  const syncStore={
    async get(arg){const s=loadSettings();if(arg==null)return {...s};if(typeof arg==='string')return {[arg]:s[arg]};if(Array.isArray(arg))return Object.fromEntries(arg.map(k=>[k,s[k]]));return {...arg,...Object.fromEntries(Object.keys(arg||{}).map(k=>[k,s[k]===undefined?arg[k]:s[k]]))};},
    async set(obj){saveSettings(obj||{});}
  };
  window.chrome={runtime:{onMessage:{addListener(fn){if(typeof fn==='function')listeners.push(fn);}},sendMessage},storage:{sync:syncStore}};

  const qp=new URLSearchParams(location.search); const t=qp.get('theme'); if(t==='dark'||t==='light'){saveSettings({theme:t});document.documentElement.dataset.theme=t;}
  else {requestParent('DIGIEXPRESS_REMOTE_THEME_REQUEST',{},'DIGIEXPRESS_REMOTE_THEME_RESULT',5000).then(r=>{const theme=r?.theme==='dark'?'dark':'light';saveSettings({theme});document.documentElement.dataset.theme=theme;window.dispatchEvent(new CustomEvent('DIGIEXPRESS_THEME_READY',{detail:{theme}}));}).catch(()=>{});}
})();
