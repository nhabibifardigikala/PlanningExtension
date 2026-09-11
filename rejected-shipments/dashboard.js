const RAW_HEADERS = ['id','reference_id','user_id','ready_date','status','created_at','service_level','shipping_size_id','destination_address','destination_shipping_point','parcel_ids','promise_date','extracted_at'];
const LATEST_HEADERS = ['reference_id','user_id','ready_date','created_at','shipping_size_id','destination_address','destination_shipping_point','parcel_ids','promise_date'];
let allRows = [], baseFilteredRows = [], filteredRows = [], page = 1, settings = {};
let chartFilters = {};
let serverKpis = null;
const chartMeta = new WeakMap();
const $ = id => document.getElementById(id);
// Digiexpress Remote integration: theme is supplied by the Host bridge when opened standalone.
try { const _dxTheme=new URLSearchParams(location.search).get('theme'); if(_dxTheme==='dark'||_dxTheme==='light') document.documentElement.dataset.theme=_dxTheme; } catch(_) {}


document.addEventListener('DOMContentLoaded', init);
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'syncCompleted' && message?.result?.source !== 'manual') {
    refreshStatus().catch(()=>{});
    refreshAfterSync(message.result).catch(()=>{});
    toast(`${fmt(message.result.newCount||0)} new records synced automatically`);
    return;
  }
  if (message?.type === 'dashboardRefreshCompleted' && message?.result) {
    applyDashboardPayload(message.result,{preserveBadge:true,fromCache:false});
    setSyncState('Up to date','good',false);
    return;
  }
  if (message?.type === 'dashboardRefreshFailed') {
    setSyncState(`Refresh retry ${message.retryAttempt||1}…`,'neutral',false);
  }
});

async function init(){
  bindNavigation(); bindActions(); initJalaliPickers(); initEnhancements();
  // The large overlay is only for the very short bootstrap phase.
  showLoadingOverlay(true);
  const releaseOverlay = setTimeout(()=>showLoadingOverlay(false), 800);
  try{
    await loadSettings();
    refreshStatus().catch(()=>{});
    refreshKpisFast().catch(()=>{});

    if(!String(settings.webAppUrl||'').trim()){
      setSyncState('Setup required','neutral',false);
      openSection('settings');
      return;
    }

    const cached = await withTimeout(
      chrome.runtime.sendMessage({type:'getDashboardCache',limit:20000}).catch(()=>null),
      500,
      null
    );
    if(cached?.ok && Array.isArray(cached.rows) && cached.rows.length){
      // Release the full-screen overlay before chart rendering. A chart failure must never trap the UI.
      showLoadingOverlay(false);
      applyDashboardPayload(cached, {preserveBadge:false, fromCache:true});
      setSyncState('Cached data','neutral',false);
      setTimeout(()=>loadDashboardData(true,20000), 0);
      return;
    }

    // No cache: release the full-screen overlay and continue fetching in the background.
    showLoadingOverlay(false);
    setSyncState('Loading in background…','neutral',false);
    setTimeout(()=>loadDashboardData(true,1000), 0);
  }catch(err){
    console.error('Dashboard bootstrap failed', err);
    setSyncState('Dashboard error','bad',false);
    openSection('settings');
  }finally{
    clearTimeout(releaseOverlay);
    showLoadingOverlay(false);
  }
}

function openSection(name){
  const btn=document.querySelector(`.nav-item[data-section="${name}"]`);
  if(btn) btn.click();
}

function withTimeout(promise, ms, fallback=null){
  return Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(fallback),ms))]);
}


async function refreshKpisFast(){
  try{
    const r=await withTimeout(chrome.runtime.sendMessage({type:'getDashboardKpis'}).catch(e=>({ok:false,error:String(e)})),5000,null);
    const normalized=normalizeKpis(r?.kpis);
    if(r?.ok&&normalized){
      serverKpis=normalized;
      renderKPIs();
    }
  }catch(e){ console.warn('KPI refresh failed',e); }
}

function normalizeKpis(k){
  if(!k||typeof k!=='object')return null;
  const aliases={
    last15m:['last15m','last_15m','last15Min','last15Minutes'],
    lastHour:['lastHour','last_hour','last60m','last60Min'],
    currentDay:['currentDay','current_day','today'],
    prevDay:['prevDay','prev_day','previousDay'],
    currentMonth:['currentMonth','current_month'],
    prevMonth:['prevMonth','prev_month','previousMonth'],
    todayDK:['todayDK','today_dk','dkToday'],
    todayDX:['todayDX','today_dx','dxToday']
  };
  const out={};
  let found=0;
  for(const [key,names] of Object.entries(aliases)){
    let v;
    for(const name of names){ if(k[name]!==undefined&&k[name]!==null&&k[name]!==''){v=Number(k[name]);break;} }
    if(Number.isFinite(v)){out[key]=v;found++;}
  }
  return found?out:null;
}

function bindNavigation(){
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); btn.classList.add('active');
    document.querySelectorAll('.section').forEach(x=>x.classList.remove('active')); $(`section-${btn.dataset.section}`).classList.add('active');
    const titles={dashboard:'Rejected Shipments Dashboard',data:'Data Explorer',alerts:'Alerts',settings:'Extension Settings',about:'System Status'};
    $('pageTitle').textContent=titles[btn.dataset.section]||'Rejected Shipments';
  }));
}

function bindActions(){
  $('syncNowBtn').addEventListener('click', syncNow);
  $('refreshDataBtn').addEventListener('click', async()=>{ setSyncState('Refreshing…','neutral',true); const r=await chrome.runtime.sendMessage({type:'refreshDashboardNow'}); if(r?.ok){ if(Array.isArray(r.rows)) applyDashboardPayload(r,{preserveBadge:false,fromCache:r.dataSource==='local-cache'}); setSyncState('Up to date','good',false); } else { setSyncState('Refresh retry scheduled','neutral',false); toast(r?.error||'Refresh failed; retry scheduled automatically'); } });
  ['filterService','filterDestination','filterUser','filterShippingSize'].forEach(id => $(id).addEventListener('change',()=>applyFilters()));
  $('trendBucket').addEventListener('change',()=>{delete chartFilters.trend;applyFilters();});
  $('trendPointCount').addEventListener('change',()=>renderCharts());
  $('latestRowCount').addEventListener('change',renderLatestTable);
  $('resetFilters').addEventListener('click',()=>{
    ['filterService','filterDestination','filterUser','filterShippingSize'].forEach(id=>$(id).value='');
    ['filterFrom','filterTo'].forEach(id=>{ $(id).value=''; $(id).dataset.iso=''; });
    chartFilters={}; applyFilters();
  });
  $('quickSearch').addEventListener('input', renderLatestTable);
  $('latestRows').addEventListener('click', handleShipmentRowClick);
  $('dataTable').querySelector('tbody').addEventListener('click', handleShipmentRowClick);
  $('dataSearch').addEventListener('input',()=>{page=1;renderDataTable();});
  $('pageSize').addEventListener('change',()=>{page=1;renderDataTable();});
  $('prevPage').addEventListener('click',()=>{if(page>1){page--;renderDataTable();}});
  $('nextPage').addEventListener('click',()=>{const pages=Math.max(1,Math.ceil(getDataRows().length/Number($('pageSize').value)));if(page<pages){page++;renderDataTable();}});
  $('saveSettingsBtn').addEventListener('click', saveAllSettings);
  $('saveAlertBtn').addEventListener('click', saveAllSettings);
  $('testAlertBtn').addEventListener('click', async()=>{const r=await chrome.runtime.sendMessage({type:'testAlert'});toast(r?.ok?'Test alert started — use Stop Alert Sound to silence it':(r?.error||'Could not start alert sound'));});
  $('stopAlertBtn').addEventListener('click', async()=>{await chrome.runtime.sendMessage({type:'stopAlert'});toast('Alert sound stopped');});
  ['trendChart','currentMonthDailyChart','destinationChart','shippingSizeChart','periodComparisonChart'].forEach(id=>{
    const canvas=$(id); canvas.addEventListener('click',e=>handleChartClick(canvas,e)); canvas.addEventListener('mousemove',e=>handleChartHover(canvas,e)); canvas.addEventListener('mouseleave',hideChartTooltip);
  });
}

async function loadSettings(){
  settings = await chrome.storage.sync.get({webAppUrl:'',secretToken:'',intervalMinutes:15,alertEnabled:true,alertThreshold:10,alertWindowMinutes:60,keepScrapeTabOpen:false,dkUserMatcher:'دیجی کالا شاپ',dxUserMatcher:'دیجی اکسپرس'});
  for(const key of ['webAppUrl','secretToken','intervalMinutes','alertThreshold','alertWindowMinutes','dkUserMatcher','dxUserMatcher']) if($(key)) $(key).value=settings[key]??'';
  $('alertEnabled').checked=Boolean(settings.alertEnabled); $('keepScrapeTabOpen').checked=Boolean(settings.keepScrapeTabOpen);
}

async function saveAllSettings(){
  const payload={webAppUrl:$('webAppUrl').value,secretToken:$('secretToken').value,intervalMinutes:15,alertEnabled:$('alertEnabled').checked,alertThreshold:Number($('alertThreshold').value),alertWindowMinutes:Number($('alertWindowMinutes').value),keepScrapeTabOpen:$('keepScrapeTabOpen').checked,dkUserMatcher:$('dkUserMatcher').value,dxUserMatcher:$('dxUserMatcher').value};
  const r=await chrome.runtime.sendMessage({type:'saveSettings',settings:payload});
  if(r?.ok){settings=r.settings;$('settingsSaved').textContent='Saved';toast('Settings saved');await refreshStatus();} else toast(r?.error||'Failed to save settings');
}

async function syncNow(){
  setSyncState('Syncing…','neutral',true);
  const r=await chrome.runtime.sendMessage({type:'syncNow'});
  if(r?.ok){
    toast(`${fmt(r.newCount)} new records added`); setSyncState('Refreshing dashboard…','neutral',true);
    await refreshStatus();
    await refreshAfterSync(r);
    setSyncState('Sync successful','good',false);
  }else{setSyncState('Sync failed','bad',false);toast(r?.error||'Sync failed');await refreshStatus();}
}

async function refreshAfterSync(syncResult){
  const expected=Number(syncResult?.maxId||syncResult?.lastMaxId||0);
  for(let i=0;i<3;i++){
    await loadDashboardData(true);
    if(!expected || maxId(allRows)>=expected) break;
    await sleep(450);
  }
}

async function refreshStatus(){
  const s=await chrome.runtime.sendMessage({type:'getStatus'}); if(!s)return;
  $('statusLastSync').textContent=formatDateTime(s.lastSync); $('sideLastSync').textContent=s.lastSync?`Last sync: ${formatDateTime(s.lastSync)}`:'Not synced yet';
  $('statusNewCount').textContent=fmt(s.lastNewCount??0); $('statusMaxId').textContent=fmt(s.lastMaxId??0); $('statusPages').textContent=fmt(s.lastPageCount??0); $('statusError').textContent=s.lastError||'No errors'; if($('statusDiagnostics')) $('statusDiagnostics').textContent=s.lastDiagnostics?JSON.stringify(s.lastDiagnostics,null,2):'No diagnostics recorded yet.';
  const ok=!s.lastError; $('healthDot').className=`dot ${ok?'good':'bad'}`; $('healthText').textContent=ok?'System healthy':'Needs attention';
  settings={...settings,...(s.config||{})}; const rolling=Number(s.rollingCount||0), threshold=Number(settings.alertThreshold||1), win=Number(settings.alertWindowMinutes||60);
  $('rollingCount').textContent=fmt(rolling); $('currentThreshold').textContent=fmt(threshold); $('currentWindow').textContent=`${fmt(win)} min`; $('rollingDescription').textContent=`${fmt(rolling)} new rejections in the last ${fmt(win)} minutes`;
  renderAlertHistory(s.alertHistory||[]);
  $('gaugeFill').style.width=`${Math.min(100,(rolling/Math.max(1,threshold))*100)}%`; if($('kpiAlert')) $('kpiAlert').textContent=rolling>=threshold?'Threshold exceeded':'Normal'; if($('kpiAlertSub')) $('kpiAlertSub').textContent=`${fmt(rolling)} / ${fmt(threshold)} in ${fmt(win)} min`;
}

async function loadDashboardData(preserveBadge=false, limit=20000){
  // Never reopen the full-screen overlay after bootstrap. Background refreshes use the badge only.
  if(!preserveBadge) setSyncState('Loading data…','neutral',true);
  try{
    const r=await withTimeout(
      chrome.runtime.sendMessage({type:'getDashboardData',limit}).catch(err=>({ok:false,error:String(err)})),
      12000,
      {ok:false,error:'Dashboard request timed out'}
    );
    if(!r?.ok){
      setSyncState('Data unavailable','bad',false);
      if(!preserveBadge) toast(r?.error||'Failed to load data');
      return;
    }
    applyDashboardPayload(r,{preserveBadge,fromCache:r.dataSource==='local-cache'});
  }catch(err){
    console.error('Dashboard data load failed', err);
    setSyncState('Data unavailable','bad',false);
    if(!preserveBadge) toast(err?.message||'Failed to load data');
  }finally{
    showLoadingOverlay(false);
    if($('syncNowBtn')) $('syncNowBtn').disabled=false;
    if($('refreshDataBtn')) $('refreshDataBtn').disabled=false;
  }
}

function applyDashboardPayload(r,{preserveBadge=false,fromCache=false}={}){
  if(r.warning && !preserveBadge) toast(r.warning);
  serverKpis=normalizeKpis(r.kpis)||serverKpis||null; if(!normalizeKpis(r.kpis)) refreshKpisFast().catch(()=>{});
  allRows=(r.rows||[]).map(normalizeRow); updateFreshness(r.cacheUpdatedAt||new Date().toISOString());
  const createdValid=allRows.reduce((n,row)=>n+(row._created?1:0),0);
  if(allRows.length && createdValid===0){
    setSyncState('Created At unavailable','bad',false);
    if(!preserveBadge) toast('Created At is not being returned correctly.');
  }
  populateSlicers(); applyFilters();
  if($('kpiMaxId')) $('kpiMaxId').textContent=fmt(r.maxId||maxId(allRows));
  if($('kpiMaxIdSub')) $('kpiMaxIdSub').textContent=`${fmt(r.totalRows||allRows.length)} records in Sheet`;
  if(!preserveBadge){
    setSyncState(fromCache?'Cached data':'Up to date',fromCache?'neutral':'good',false);
    showLoadingOverlay(false);
  } else if(!fromCache) {
    // Full hydration completed in background. Update freshness badge without reopening the overlay.
    setSyncState('Up to date','good',false);
  }
}

function normalizeRow(row){const o={};RAW_HEADERS.forEach(h=>o[h]=row[h]??'');o._id=num(o.id);o._extracted=parseDate(o.extracted_at);o._created=parseDate(o.created_at);return o;}
function populateSlicers(){fillSelect('filterService',unique(allRows.map(r=>r.service_level)));fillSelect('filterDestination',unique(allRows.map(r=>r.destination_shipping_point)));fillSelect('filterUser',unique(allRows.map(r=>r.user_id)));fillSelect('filterShippingSize',unique(allRows.map(r=>r.shipping_size_id)));}
function fillSelect(id,vals){const el=$(id),current=el.value;el.innerHTML='<option value="">All</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');el.value=vals.includes(current)?current:'';}

function applyFilters(){
  const from=parseDate($('filterFrom').dataset.iso), to=parseDate($('filterTo').dataset.iso), service=$('filterService').value,dest=$('filterDestination').value,user=$('filterUser').value,shipping=$('filterShippingSize').value;
  if(to)to.setHours(23,59,59,999);
  baseFilteredRows=allRows.filter(r=>{
    const d=r._created||r._extracted;
    if(from&&d&&d<from)return false;if(to&&d&&d>to)return false;if(service&&r.service_level!==service)return false;if(dest&&r.destination_shipping_point!==dest)return false;if(user&&String(r.user_id)!==user)return false;if(shipping&&String(r.shipping_size_id)!==shipping)return false;
    return true;
  });
  filteredRows=baseFilteredRows.filter(r=>matchesChartFilters(r));
  renderActiveFilter(); renderKPIs();renderCharts();renderLatestTable();page=1;renderDataTable();
}

function matchesOneChartFilter(r,type,filter){
  if(!filter)return true;
  if(type==='service')return String(r.service_level||'Unknown')===filter.value;
  if(type==='destination')return String(r.destination_shipping_point||'Unknown')===filter.value;
  if(type==='shipping')return String(r.shipping_size_id||'Unknown')===filter.value;
  if(type==='trend')return timeBucketKey(r._created,$('trendBucket').value)===filter.value;
  if(type==='monthday')return currentJalaliDayKey(r._created,r)===filter.value;
  return true;
}
function matchesChartFilters(r,excludeType=''){
  return Object.entries(chartFilters).every(([type,filter])=>type===excludeType||matchesOneChartFilter(r,type,filter));
}
function renderActiveFilter(){
  const el=$('activeChartFilter');if(!el)return;
  const entries=Object.entries(chartFilters);
  if(!entries.length){el.hidden=true;el.textContent='';return;}
  el.hidden=false;
  el.innerHTML=`Cross-filters: ${entries.map(([type,f])=>`<span class="filter-chip"><b>${esc(f.label||f.value)}</b><button data-clear-chart="${esc(type)}" aria-label="Clear ${esc(type)} filter">×</button></span>`).join(' ')} <button id="clearAllChartFilters" aria-label="Clear all cross-filters">Clear all</button>`;
  el.querySelectorAll('[data-clear-chart]').forEach(btn=>btn.onclick=()=>{delete chartFilters[btn.dataset.clearChart];applyFilters();});
  const clearAll=$('clearAllChartFilters');if(clearAll)clearAll.onclick=()=>{chartFilters={};applyFilters();};
}

function renderKPIs(){
  // KPI calculation deliberately follows the v3.2 behavior that was known-good,
  // but uses timezone-independent Tehran wall-clock serials for rolling windows.
  const local=computeKpisFromRows(filteredRows);
  const server=normalizeKpis(serverKpis);
  const final={...local.values};
  if(local.validCreatedCount===0 && server){Object.assign(final,server);}
  const map={kpi15m:'last15m',kpi1h:'lastHour',kpiCurrentDay:'currentDay',kpiPrevDay:'prevDay',kpiCurrentMonth:'currentMonth',kpiPrevMonth:'prevMonth',kpiTodayDK:'todayDK',kpiTodayDX:'todayDX'};
  for(const [id,key] of Object.entries(map)){
    const el=$(id);if(!el)continue;
    const value=Number(final[key]);
    el.textContent=Number.isFinite(value)?fmt(value):'0';
    el.dataset.source=local.validCreatedCount?'created-at-local':(server?'server':'no-created-at');
  }
}

function createdWallSerial(value){
  if(!value)return NaN;
  let s=String(value).trim().replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e]/g,' ').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g,' ');
  const m=s.match(/(\d{4})[-\/.]([01]?\d)[-\/.]([0-3]?\d)(?:[^\d]{0,8}([0-2]?\d):([0-5]?\d)(?::([0-5]?\d))?)?/);
  if(!m)return NaN;
  let y=Number(m[1]),mo=Number(m[2]),da=Number(m[3]);
  if(y>=1200&&y<1700){try{const g=toGregorian(y,mo,da);y=g.gy;mo=g.gm;da=g.gd;}catch(_){return NaN;}}
  return Date.UTC(y,mo-1,da,Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));
}
function tehranNowWallSerial(){
  const p=getTehranParts(new Date());
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
}
function computeKpisFromRows(rows){
  const tp=getTehranParts(new Date());
  const wallNowSerial=Date.UTC(tp.year,tp.month-1,tp.day,tp.hour,tp.minute,tp.second);
  // Rolling cards use the freshest Created At timestamp when the loaded dataset is stale.
  // This keeps Last 15min / Last Hour aligned with the visible trend instead of showing false zeroes
  // while a sync/cache is behind the official clock. Other calendar KPIs stay anchored to today.
  let latestCreatedSerial=NaN;
  for(const r of rows||[]){const t=createdWallSerial(r?.created_at);if(Number.isFinite(t)&&( !Number.isFinite(latestCreatedSerial)||t>latestCreatedSerial))latestCreatedSerial=t;}
  const lag=Number.isFinite(latestCreatedSerial)?wallNowSerial-latestCreatedSerial:0;
  const rollingNowSerial=Number.isFinite(latestCreatedSerial)&&lag>5*60*1000?latestCreatedSerial:wallNowSerial;
  const nowSerial=wallNowSerial;
  const startToday=Date.UTC(tp.year,tp.month-1,tp.day);
  const startTomorrow=Date.UTC(tp.year,tp.month-1,tp.day+1);
  const startPrevDay=Date.UTC(tp.year,tp.month-1,tp.day-1);
  const [jy,jm]=toJalali(tp.year,tp.month,tp.day);
  const curG=toGregorian(jy,jm,1);
  const nextG=toGregorian(jm===12?jy+1:jy,jm===12?1:jm+1,1);
  const prevG=toGregorian(jm===1?jy-1:jy,jm===1?12:jm-1,1);
  const startMonth=Date.UTC(curG.gy,curG.gm-1,curG.gd);
  const startNextMonth=Date.UTC(nextG.gy,nextG.gm-1,nextG.gd);
  const startPrevMonth=Date.UTC(prevG.gy,prevG.gm-1,prevG.gd);
  const values={last15m:0,lastHour:0,currentDay:0,prevDay:0,currentMonth:0,prevMonth:0,todayDK:0,todayDX:0};
  let validCreatedCount=0;
  for(const r of rows||[]){
    const t=createdWallSerial(r?.created_at);
    if(!Number.isFinite(t))continue;
    validCreatedCount++;
    const rollingAge=rollingNowSerial-t;
    if(rollingAge>=0&&rollingAge<15*60*1000)values.last15m++;
    if(rollingAge>=0&&rollingAge<60*60*1000)values.lastHour++;
    if(t>=startToday&&t<startTomorrow){values.currentDay++;if(isDKUser(r))values.todayDK++;if(isDXUser(r))values.todayDX++;}
    if(t>=startPrevDay&&t<startToday)values.prevDay++;
    if(t>=startMonth&&t<startNextMonth)values.currentMonth++;
    if(t>=startPrevMonth&&t<startMonth)values.prevMonth++;
  }
  return {values,validCreatedCount};
}

function normalizeUserIdentity(v){return String(v??'').trim().toLowerCase().replace(/[‌ـ\s_-]+/g,' ');}
function userMatches(v,configured,aliases=[]){const n=normalizeUserIdentity(v),c=normalizeUserIdentity(configured);if(c&&(n===c||n.includes(c)))return true;return aliases.some(a=>{const x=normalizeUserIdentity(a);return n===x||n.includes(x);});}
function isDKUser(r){return userMatches(r.user_id,settings.dkUserMatcher,['دیجی کالا شاپ','digikala shop','dk']);}
function isDXUser(r){return userMatches(r.user_id,settings.dxUserMatcher,['دیجی اکسپرس','digiexpress','digi express','dx']);}

function rowsForChart(type){return baseFilteredRows.filter(r=>matchesChartFilters(r,type));}
function renderCharts(){
  const bucket=$('trendBucket').value;
  const yStep=bucket==='month'?1000:(bucket==='day'?200:(bucket==='hour'?50:20));
  const trendRows=rowsForChart('trend');
  const trendAll=groupTime(trendRows,r=>r._created,bucket,()=>1);
  const uniqueByBucket=groupTimeDistinct(trendRows,r=>r._created,bucket,r=>r.reference_id);
  const uniqueAligned=trendAll.labels.map(label=>uniqueByBucket.counts.get(label)||0);
  const trendLimit=$('trendPointCount')?.value||'50';
  const start=trendLimit==='all'?0:Math.max(0,trendAll.labels.length-(Number(trendLimit)||50));
  const trend={
    labels:trendAll.labels.slice(start),
    total:trendAll.values.slice(start),
    unique:uniqueAligned.slice(start)
  };
  drawTrendDualLine($('trendChart'),trend.labels,trend.total,trend.unique,{filterType:'trend',showPointValues:true,yStep});
  const monthDaily=currentMonthDailySeries(rowsForChart('monthday'));
  drawLine($('currentMonthDailyChart'),monthDaily.labels,monthDaily.values,{filterType:'monthday',filterValues:monthDaily.filterValues,showPointValues:true,yStep:50,showAllXLabels:true});
  const dest=topGroups(rowsForChart('destination'),r=>r.destination_shipping_point||'Unknown',8,()=>1);drawBars($('destinationChart'),dest.labels,dest.values,{filterType:'destination',horizontalLabels:true,wrapLabels:true});
  const sizeMap={'1':'Normal','2':'Medium','3':'Large'};
  const sizeRows=rowsForChart('shipping'); const sizeCounts=new Map(); for(const r of sizeRows){const raw=String(r.shipping_size_id||'Unknown');sizeCounts.set(raw,(sizeCounts.get(raw)||0)+1);}
  const sizeEntries=[...sizeCounts.entries()].sort((a,b)=>b[1]-a[1]);
  const sizes={labels:sizeEntries.map(x=>sizeMap[x[0]]||x[0]),values:sizeEntries.map(x=>x[1]),rawLabels:sizeEntries.map(x=>x[0])};
  drawBars($('shippingSizeChart'),sizes.labels,sizes.values,{filterType:'shipping',filterValues:sizes.rawLabels,horizontalLabels:true,wrapLabels:false});
}

function createdJalaliParts(row){
  const raw=String(row?.created_at??'').trim().replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const m=raw.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if(m){const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);if(y>=1200&&y<1700)return [y,mo,d];}
  const dt=row?._created||parseDate(row?.created_at);if(!dt||isNaN(dt))return null;
  const p=getTehranParts(dt);return toJalali(p.year,p.month,p.day);
}
function currentJalaliDayKey(d,row){
  const j=row?createdJalaliParts(row):(d&&!isNaN(d)?(()=>{const p=getTehranParts(d);return toJalali(p.year,p.month,p.day)})():null);
  if(!j)return '';
  const now=getTehranParts(new Date()),cur=toJalali(now.year,now.month,now.day);
  if(j[0]!==cur[0]||j[1]!==cur[1])return '';
  return String(j[2]);
}
function currentMonthDailySeries(rows){
  const now=getTehranParts(new Date()),cur=toJalali(now.year,now.month,now.day),jy=cur[0],jm=cur[1],today=cur[2];
  const counts=Array(31).fill(0);
  for(const r of rows||[]){const j=createdJalaliParts(r);if(!j)continue;if(j[0]===jy&&j[1]===jm&&j[2]>=1&&j[2]<=31)counts[j[2]-1]++;}
  return {labels:Array.from({length:31},(_,i)=>String(i+1)),values:counts.map((v,i)=>i<today?v:null),filterValues:Array.from({length:31},(_,i)=>String(i+1))};
}

function renderLatestTable(){
  const q=$('quickSearch').value.trim().toLowerCase(), limit=Number($('latestRowCount').value)||20;
  const rows=[...filteredRows].sort((a,b)=>b._id-a._id).filter(r=>!q||Object.values(r).some(v=>String(v).toLowerCase().includes(q))).slice(0,limit);
  $('latestRows').innerHTML=rows.map(r=>`<tr class="shipment-row" data-reference-id="${escAttr(r.reference_id)}" title="Open shipment by Reference ID">`+LATEST_HEADERS.map(h=>`<td title="${esc(r[h])}">${esc(short(r[h],h.includes('address')?44:32))}</td>`).join('')+'</tr>').join('')||`<tr><td colspan="${LATEST_HEADERS.length}">No data available.</td></tr>`;
}

async function handleShipmentRowClick(e){
  const tr=e.target.closest('tr.shipment-row');
  if(!tr)return;
  const referenceId=String(tr.dataset.referenceId||'').trim();
  if(!referenceId){toast('Reference ID is empty for this shipment');return;}
  tr.classList.add('opening');
  try{
    const r=await chrome.runtime.sendMessage({type:'openShipmentReference',referenceId});
    if(!r?.ok)toast(r?.error||'Could not open shipment search');
  }catch(err){toast(err?.message||'Could not open shipment search');}
  finally{setTimeout(()=>tr.classList.remove('opening'),500);}
}
function escAttr(v){return String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function getDataRows(){const q=$('dataSearch').value.trim().toLowerCase();return [...filteredRows].sort((a,b)=>b._id-a._id).filter(r=>!q||RAW_HEADERS.some(h=>String(r[h]??'').toLowerCase().includes(q)));}
function renderDataTable(){const rows=getDataRows(),size=Number($('pageSize').value)||50,pages=Math.max(1,Math.ceil(rows.length/size));page=Math.min(page,pages);const slice=rows.slice((page-1)*size,page*size);const t=$('dataTable');t.querySelector('thead').innerHTML='<tr>'+RAW_HEADERS.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr>';t.querySelector('tbody').innerHTML=slice.map(r=>`<tr class="shipment-row" data-reference-id="${escAttr(r.reference_id)}" title="Open shipment by Reference ID">`+RAW_HEADERS.map(h=>`<td title="${esc(r[h])}">${esc(short(r[h],45))}</td>`).join('')+'</tr>').join('')||`<tr><td colspan="${RAW_HEADERS.length}">No data available.</td></tr>`;$('pageInfo').textContent=`${fmt(page)} / ${fmt(pages)} — ${fmt(rows.length)} records`;}

function timeBucketKey(d,bucket){if(!d||isNaN(d))return'';if(bucket==='quarter'){const q=Math.floor(d.getMinutes()/15)*15;return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(q)}`;}if(bucket==='hour')return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;if(bucket==='month')return`${d.getFullYear()}-${pad(d.getMonth()+1)}`;return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function groupTime(rows,dateFn,bucket,valueFn){const m=new Map();for(const r of rows){const d=dateFn(r);if(!d||isNaN(d))continue;const k=timeBucketKey(d,bucket);m.set(k,(m.get(k)||0)+(Number(valueFn(r))||0));}const keys=[...m.keys()].sort();return{labels:keys,values:keys.map(k=>m.get(k))};}
function groupTimeDistinct(rows,dateFn,bucket,distinctFn){
  const buckets=new Map();
  for(const r of rows||[]){
    const d=dateFn(r);if(!d||isNaN(d))continue;
    const k=timeBucketKey(d,bucket),raw=String(distinctFn(r)??'').trim();
    if(!buckets.has(k))buckets.set(k,new Set());
    // Empty reference IDs must not collapse into one artificial unique shipment.
    if(raw)buckets.get(k).add(raw);else buckets.get(k).add(`__row__${String(r.id??r._id??Math.random())}`);
  }
  const counts=new Map();for(const [k,set] of buckets)counts.set(k,set.size);
  return {labels:[...counts.keys()].sort(),counts};
}

function drawTrendDualLine(canvas,labels,totalValues,uniqueValues,opts={}){
  const dpr=devicePixelRatio||1,w=canvas.clientWidth||600,h=canvas.getAttribute('height')?Number(canvas.getAttribute('height')):240;
  canvas.width=w*dpr;canvas.height=h*dpr;
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const padL=54,padR=22,padT=opts.showPointValues?36:18,padB=48,cw=w-padL-padR,ch=h-padT-padB;
  const all=[...(totalValues||[]),...(uniqueValues||[])].filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number);
  let max=Math.max(...all,1),yStep=opts.yStep||Math.max(1,Math.ceil(max/4));max=Math.max(yStep,Math.ceil(max/yStep)*yStep);
  const dark=document.documentElement.dataset.theme==='dark';
  c.strokeStyle=dark?'#263244':'#e7eaf0';c.fillStyle=dark?'#94a3b8':'#748096';c.font='11px Tahoma, Arial';c.textAlign='left';
  for(let v=0;v<=max;v+=yStep){const y=padT+ch-(v/max)*ch;c.beginPath();c.moveTo(padL,y);c.lineTo(w-padR,y);c.stroke();c.fillText(fmt(v),7,y+4);}
  if(!labels.length){c.fillText('No data to display',padL+20,padT+40);chartMeta.set(canvas,{items:[]});return;}
  const xAt=i=>padL+(labels.length===1?cw/2:i*cw/(labels.length-1));
  const series=[
    {key:'total',name:'All Rejections',values:totalValues,color:'#e1003c',offset:-9,uniqueSeries:false},
    {key:'unique',name:'Unique Reference IDs',values:uniqueValues,color:'#0f9f6e',offset:13,uniqueSeries:true}
  ];
  const items=[];
  for(const sx of series){
    c.strokeStyle=sx.color;c.lineWidth=sx.key==='total'?2.3:2;c.beginPath();let pen=false;
    (sx.values||[]).forEach((raw,i)=>{
      if(raw===null||raw===undefined||!Number.isFinite(Number(raw))){pen=false;return;}
      const v=Number(raw),x=xAt(i),y=padT+ch-(v/max)*ch,filterValue=opts.filterValues?.[i]??labels[i];
      if(!pen){c.moveTo(x,y);pen=true;}else c.lineTo(x,y);
      items.push({type:'point',x,y,r:8,label:labels[i],value:v,filterType:opts.filterType,filterValue:String(filterValue),index:i,series:sx.name,uniqueSeries:sx.uniqueSeries});
    });c.stroke();
  }
  for(const it of items){
    const active=isChartItemActive(it.filterType,it.filterValue),isUnique=!!it.uniqueSeries;
    c.beginPath();c.arc(it.x,it.y,active?5:3.5,0,Math.PI*2);c.fillStyle=active?'#7c3aed':(isUnique?'#0f9f6e':'#e1003c');c.fill();
    if(opts.showPointValues){
      c.fillStyle=active?'#7c3aed':(isUnique?(dark?'#6ee7b7':'#087a54'):(dark?'#fda4af':'#4b5563'));
      c.font=active?'bold 8px Tahoma, Arial':'8px Tahoma, Arial';c.textAlign='center';
      const yy=isUnique?Math.min(h-padB-2,it.y+13):Math.max(10,it.y-8);c.fillText(fmt(it.value),it.x,yy);
    }
  }
  const step=Math.max(1,Math.ceil(labels.length/7));c.textAlign='center';
  for(let i=0;i<labels.length;i+=step){const x=xAt(i),filterValue=opts.filterValues?.[i]??labels[i],active=isChartItemActive(opts.filterType,filterValue);c.fillStyle=active?'#7c3aed':(dark?'#94a3b8':'#748096');c.font=active?'bold 9px Tahoma, Arial':'9px Tahoma, Arial';c.fillText(short(labels[i],16),x,h-11);}
  chartMeta.set(canvas,{items,type:'dual-line',labels,totalValues,uniqueValues,opts});
}
function topGroups(rows,keyFn,n,valueFn){const m=new Map();for(const r of rows){const k=String(keyFn(r)||'Unknown');m.set(k,(m.get(k)||0)+(Number(valueFn(r))||0));}const a=[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);return{labels:a.map(x=>x[0]),values:a.map(x=>x[1])};}

function drawLine(canvas,labels,values,opts={}){drawChart(canvas,labels,values,'line',opts);}function drawBars(canvas,labels,values,opts={}){drawChart(canvas,labels,values,'bar',opts);}
function drawChart(canvas,labels,values,type,opts={}){
  const dpr=devicePixelRatio||1,w=canvas.clientWidth||600,h=canvas.getAttribute('height')?Number(canvas.getAttribute('height')):240; canvas.width=w*dpr;canvas.height=h*dpr;
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const labelPad=type==='bar'&&opts.horizontalLabels?(opts.wrapLabels?66:50):48;
  const padL=54,padR=22,padT=opts.showPointValues?30:18,padB=labelPad,cw=w-padL-padR,ch=h-padT-padB;
  const finiteValues=values.filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number);
  let max=Math.max(...finiteValues,1); const yStep=opts.yStep||Math.max(1,Math.ceil(max/4)); max=Math.max(yStep,Math.ceil(max/yStep)*yStep);
  c.strokeStyle='#e7eaf0';c.fillStyle='#748096';c.font='11px Tahoma, Arial';c.textAlign='left';
  for(let v=0;v<=max;v+=yStep){const y=padT+ch-(v/max)*ch;c.beginPath();c.moveTo(padL,y);c.lineTo(w-padR,y);c.stroke();c.fillText(fmt(v),7,y+4);}
  if(!values.length){c.fillText('No data to display',padL+20,padT+40);chartMeta.set(canvas,{items:[]});return;}
  const items=[];
  if(type==='bar'){
    const slot=cw/values.length,bw=Math.min(38,Math.max(12,slot*.55));
    values.forEach((v,i)=>{
      v=Number(v)||0;const bh=(v/max)*ch,x=padL+i*slot+(slot-bw)/2,y=padT+ch-bh,filterValue=opts.filterValues?.[i]??labels[i],active=isChartItemActive(opts.filterType,filterValue);
      c.fillStyle=active?'rgba(124,58,237,.9)':'rgba(225,0,60,.78)';c.fillRect(x,y,bw,bh);
      items.push({type:'bar',x,y,w:bw,h:Math.max(bh,4),label:labels[i],value:v,filterType:opts.filterType,filterValue:String(filterValue),index:i});
      c.save();c.fillStyle=active?'#7c3aed':'#748096';c.font=active?'bold 10px Tahoma, Arial':'10px Tahoma, Arial';
      if(opts.horizontalLabels){
        c.textAlign='center';c.textBaseline='top';
        const lines=opts.wrapLabels?wrapChartLabel(labels[i],Math.max(8,Math.min(16,Math.floor(slot/6.5))),2):[short(labels[i],18)];
        const baseY=padT+ch+9;lines.forEach((line,li)=>c.fillText(line,x+bw/2,baseY+li*13));
      }else{c.translate(x+bw/2,h-9);c.rotate(-.30);c.textAlign='left';c.fillText(short(labels[i],15),0,0);}
      c.restore();
    });
  }else{
    const xAt=i=>padL+(values.length===1?cw/2:i*cw/(values.length-1));
    c.strokeStyle='#e1003c';c.lineWidth=2.2;c.beginPath();let penDown=false;
    values.forEach((raw,i)=>{
      if(raw===null||raw===undefined||!Number.isFinite(Number(raw))){penDown=false;return;}
      const v=Number(raw),x=xAt(i),y=padT+ch-(v/max)*ch,filterValue=opts.filterValues?.[i]??labels[i];
      if(!penDown){c.moveTo(x,y);penDown=true;}else c.lineTo(x,y);
      items.push({type:'point',x,y,r:8,label:labels[i],value:v,filterType:opts.filterType,filterValue:String(filterValue),index:i});
    });c.stroke();
    for(const it of items){const active=isChartItemActive(it.filterType,it.filterValue);c.beginPath();c.arc(it.x,it.y,active?5:3.5,0,Math.PI*2);c.fillStyle=active?'#7c3aed':'#e1003c';c.fill();if(opts.showPointValues){c.fillStyle=active?'#7c3aed':'#4b5563';c.font=active?'bold 9px Tahoma, Arial':'9px Tahoma, Arial';c.textAlign='center';c.fillText(fmt(it.value),it.x,Math.max(10,it.y-8));}}
    const step=opts.showAllXLabels?1:Math.max(1,Math.ceil(labels.length/7));c.textAlign='center';
    for(let i=0;i<labels.length;i+=step){const x=xAt(i),filterValue=opts.filterValues?.[i]??labels[i],active=isChartItemActive(opts.filterType,filterValue);c.fillStyle=active?'#7c3aed':'#748096';c.font=active?'bold 9px Tahoma, Arial':'9px Tahoma, Arial';c.fillText(short(labels[i],16),x,h-11);}
  }
  chartMeta.set(canvas,{items,type,labels,values,opts});
}
function wrapChartLabel(value,maxChars=14,maxLines=2){
  const text=String(value??'').trim(); if(!text)return [''];
  const words=text.split(/\s+/).filter(Boolean),lines=[]; let line='';
  for(const word of words){
    const candidate=line?`${line} ${word}`:word;
    if(candidate.length<=maxChars){line=candidate;continue;}
    if(line){lines.push(line);line='';if(lines.length>=maxLines)break;}
    if(word.length<=maxChars)line=word;else{lines.push(word.slice(0,maxChars));line=word.slice(maxChars);if(lines.length>=maxLines)break;}
  }
  if(lines.length<maxLines&&line)lines.push(line);
  if(lines.length===0)lines.push(short(text,maxChars));
  const consumed=lines.join(' ').replace(/…$/,'');
  if(text.length>consumed.length&&lines.length){const i=lines.length-1;lines[i]=short(lines[i]+'…',maxChars);}
  return lines.slice(0,maxLines);
}

function isChartItemActive(type,value){return !!chartFilters[type]&&chartFilters[type].value===String(value);}
function handleChartClick(canvas,e){const item=findChartItem(canvas,e);if(!item||!item.filterType)return;const type=item.filterType,next={type,value:String(item.filterValue??item.label),label:String(item.label)};if(chartFilters[type]&&chartFilters[type].value===next.value)delete chartFilters[type];else chartFilters[type]=next;applyFilters();}
function handleChartHover(canvas,e){const item=findChartItem(canvas,e);canvas.style.cursor=item?'pointer':'default';if(!item){hideChartTooltip();return;}const tip=$('chartTooltip');tip.textContent=item.series?`${item.series} · ${item.label}: ${fmt(item.value)}`:`${item.label}: ${fmt(item.value)}`;tip.style.left=`${e.clientX+12}px`;tip.style.top=`${e.clientY+12}px`;tip.hidden=false;}
function findChartItem(canvas,e){const meta=chartMeta.get(canvas);if(!meta)return null;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let best=null,bestD=Infinity;for(const it of meta.items){if(it.type==='bar'){if(x>=it.x-5&&x<=it.x+it.w+5&&y>=it.y-5&&y<=it.y+it.h+8)return it;}else{const d=Math.hypot(x-it.x,y-it.y);if(d<bestD&&d<=14){best=it;bestD=d;}}}return best;}
function hideChartTooltip(){const t=$('chartTooltip');if(t)t.hidden=true;}

function initJalaliPickers(){['filterFrom','filterTo'].forEach(id=>{const input=$(id);input.readOnly=true;input.placeholder='Select Jalali date';input.addEventListener('click',()=>openJalaliPicker(input));});document.addEventListener('click',e=>{const p=$('jalaliPicker');if(p&&!p.contains(e.target)&&!['filterFrom','filterTo'].includes(e.target.id))p.hidden=true;});}
function openJalaliPicker(input){const picker=$('jalaliPicker'),today=new Date(),current=input.dataset.iso?parseDate(input.dataset.iso):today;let [jy,jm,jd]=toJalali(current.getFullYear(),current.getMonth()+1,current.getDate());picker.dataset.target=input.id;picker.dataset.jy=jy;picker.dataset.jm=jm;renderJalaliPicker();const r=input.getBoundingClientRect();picker.style.left=`${Math.min(innerWidth-300,r.left)}px`;picker.style.top=`${r.bottom+6}px`;picker.hidden=false;}
function renderJalaliPicker(){const p=$('jalaliPicker'),jy=Number(p.dataset.jy),jm=Number(p.dataset.jm),target=$(p.dataset.target),monthNames=['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];const dim=jm<=6?31:jm<=11?30:(isJalaliLeap(jy)?30:29);const firstG=toGregorian(jy,jm,1),firstDow=(new Date(firstG.gy,firstG.gm-1,firstG.gd).getDay()+1)%7;let cells='';for(let i=0;i<firstDow;i++)cells+='<span></span>';for(let d=1;d<=dim;d++){const sel=target?.dataset.jalali===`${jy}/${pad(jm)}/${pad(d)}`;cells+=`<button class="jday${sel?' selected':''}" data-day="${d}">${d}</button>`;}p.innerHTML=`<div class="jhead"><button data-nav="prev">‹</button><b>${monthNames[jm-1]} ${jy}</b><button data-nav="next">›</button></div><div class="jweek"><span>Sh</span><span>Y</span><span>D</span><span>S</span><span>Ch</span><span>P</span><span>J</span></div><div class="jgrid">${cells}</div><div class="jfoot"><button data-clear="1">Clear</button><button data-today="1">Today</button></div>`;p.querySelector('[data-nav="prev"]').onclick=()=>{let y=jy,m=jm-1;if(m<1){m=12;y--;}p.dataset.jy=y;p.dataset.jm=m;renderJalaliPicker();};p.querySelector('[data-nav="next"]').onclick=()=>{let y=jy,m=jm+1;if(m>12){m=1;y++;}p.dataset.jy=y;p.dataset.jm=m;renderJalaliPicker();};p.querySelectorAll('.jday').forEach(b=>b.onclick=()=>selectJalaliDate(Number(b.dataset.day)));p.querySelector('[data-clear]').onclick=()=>{target.value='';target.dataset.iso='';target.dataset.jalali='';p.hidden=true;applyFilters();};p.querySelector('[data-today]').onclick=()=>{const n=new Date(),j=toJalali(n.getFullYear(),n.getMonth()+1,n.getDate());p.dataset.jy=j[0];p.dataset.jm=j[1];selectJalaliDate(j[2]);};}
function selectJalaliDate(day){const p=$('jalaliPicker'),input=$(p.dataset.target),jy=Number(p.dataset.jy),jm=Number(p.dataset.jm),g=toGregorian(jy,jm,day),iso=`${g.gy}-${pad(g.gm)}-${pad(g.gd)}`,jalali=`${jy}/${pad(jm)}/${pad(day)}`;input.dataset.iso=iso;input.dataset.jalali=jalali;input.value=jalali;p.hidden=true;applyFilters();}
function div(a,b){return Math.trunc(a/b);}
function mod(a,b){return a-Math.trunc(a/b)*b;}
function jalCal(jy,withoutLeap=false){
  const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  const bl=breaks.length,gy=jy+621;let leapJ=-14,jp=breaks[0],jm=0,jump=0,n=0,i=0;
  if(jy<jp||jy>=breaks[bl-1])throw new Error('Invalid Jalaali year '+jy);
  for(i=1;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=div(jump,33)*8+div(mod(jump,33),4);jp=jm;}
  n=jy-jp;leapJ+=div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ++;
  const leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150,march=20+leapJ-leapG;
  if(withoutLeap)return{gy,march};
  if(jump-n<6)n=n-jump+div(jump+4,33)*33;
  let leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return{leap,gy,march};
}
function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d;}
function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div(mod(j,1461),4)*5+308,gd=div(mod(i,153),5)+1,gm=mod(div(i,153),12)+1,gy=div(j,1461)-100100+div(8-gm,6);return{gy,gm,gd};}
function j2d(jy,jm,jd){const r=jalCal(jy,true);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1;}
function d2j(jdn){const g=d2g(jdn),jy=g.gy-621,r=jalCal(jy,false),jdn1f=g2d(g.gy,3,r.march);let k=jdn-jdn1f;if(k>=0){if(k<=185)return{jy,jm:1+div(k,31),jd:mod(k,31)+1};k-=186;}else{const jy2=jy-1;k+=179;if(r.leap===1)k++;return{jy:jy2,jm:7+div(k,30),jd:mod(k,30)+1};}return{jy,jm:7+div(k,30),jd:mod(k,30)+1};}
function isJalaliLeap(jy){return jalCal(jy,false).leap===0;}
function toJalali(gy,gm,gd){const j=d2j(g2d(Number(gy),Number(gm),Number(gd)));return[j.jy,j.jm,j.jd];}
function toGregorian(jy,jm,jd){return d2g(j2d(Number(jy),Number(jm),Number(jd)));}
function toPersianDigits(v){return String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);}

function setSyncState(text,cls,busy){$('syncBadge').textContent=text;$('syncBadge').className=`badge ${cls}`;$('syncNowBtn').disabled=busy;$('refreshDataBtn').disabled=busy;}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600);}
function tehranDate(y,m,d,h=0,mi=0,s=0){
  // Iran standard time is UTC+03:30. Shipment Created At values are Tehran wall-clock
  // timestamps without an explicit timezone, so interpret them explicitly rather than
  // inheriting the browser/OS timezone.
  return new Date(`${Number(y)}-${pad(Number(m))}-${pad(Number(d))}T${pad(Number(h))}:${pad(Number(mi))}:${pad(Number(s))}+03:30`);
}
function getTehranParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const o={};for(const p of parts)if(p.type!=='literal')o[p.type]=Number(p.value);
  return {year:o.year,month:o.month,day:o.day,hour:o.hour,minute:o.minute,second:o.second};
}
function parseDate(v){
  if(!v)return null;
  if(v instanceof Date)return isNaN(v)?null:v;
  let s=String(v).trim()
    .replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e]/g,' ')
    .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\s+/g,' ');
  // ISO timestamps carrying an explicit timezone are authoritative.
  if(/^\d{4}-\d{2}-\d{2}T/.test(s) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)){
    const iso=new Date(s); if(!isNaN(iso))return iso;
  }
  // Accept Gregorian or Jalali numeric dates even when extra text surrounds the value.
  const m=s.match(/(\d{4})[-\/.]([01]?\d)[-\/.]([0-3]?\d)(?:[^\d]{0,8}([0-2]?\d):([0-5]?\d)(?::([0-5]?\d))?)?/);
  if(m){
    let y=Number(m[1]),mo=Number(m[2]),da=Number(m[3]);
    if(y>=1200&&y<1700){try{const g=toGregorian(y,mo,da);y=g.gy;mo=g.gm;da=g.gd;}catch(_){}}
    const d=tehranDate(y,mo,da,Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));
    if(!isNaN(d))return d;
  }
  const d=new Date(s);return isNaN(d)?null:d;
}
function num(v){if(typeof v==='number')return v;const s=String(v??'').replace(/[٬,\s]/g,'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));const n=Number(s.replace(/[^0-9.\-]/g,''));return Number.isFinite(n)?n:0;}
function fmt(v){return new Intl.NumberFormat('en-US').format(Number(v)||0)}function compact(v){return new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v)||0)}function formatDateTime(v){const d=parseDate(v);return d?new Intl.DateTimeFormat('en-US',{dateStyle:'short',timeStyle:'short'}).format(d):'—'}function unique(a){return[...new Set(a.map(x=>String(x||'').trim()).filter(Boolean))].sort()}function maxId(rows){return rows.reduce((m,r)=>Math.max(m,r._id||num(r.id)),0)}function pad(n){return String(n).padStart(2,'0')}function short(v,n){const s=String(v??'');return s.length>n?s.slice(0,n-1)+'…':s}function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function showLoadingOverlay(show){const el=$('loadingOverlay');if(el)el.hidden=!show;}


// v4.4 enhancements ---------------------------------------------------------
let savedViews=[];
function initEnhancements(){
  loadTheme(); loadSavedViews();
  const theme=$('themeToggle');if(theme)theme.onclick=toggleTheme;
  const save=$('saveViewBtn');if(save)save.onclick=saveCurrentView;
  const del=$('deleteViewBtn');if(del)del.onclick=deleteSavedView;
  const sel=$('savedViewSelect');if(sel)sel.onchange=()=>applySavedView(sel.value);
  const clr=$('clearAlertHistoryBtn');if(clr)clr.onclick=async()=>{await chrome.runtime.sendMessage({type:'clearAlertHistory'});renderAlertHistory([]);toast('Alert history cleared');};
  const close=$('closeDrawerBtn'),back=$('drilldownBackdrop');if(close)close.onclick=closeDrilldown;if(back)back.onclick=closeDrilldown;
  ['trendChart','currentMonthDailyChart','destinationChart','shippingSizeChart','periodComparisonChart'].forEach(id=>{const c=$(id);if(c)c.addEventListener('dblclick',e=>handleChartDoubleClick(c,e));});
  const heat=$('heatmapChart');if(heat){heat.addEventListener('click',e=>handleHeatmapClick(heat,e));heat.addEventListener('dblclick',e=>handleHeatmapDoubleClick(heat,e));heat.addEventListener('mousemove',e=>handleChartHover(heat,e));heat.addEventListener('mouseleave',hideChartTooltip);}
}
async function loadTheme(){const r=await chrome.storage.sync.get({theme:document.documentElement.dataset.theme||'light'});applyTheme(document.documentElement.dataset.theme||r.theme||'light');}
function applyTheme(theme){document.documentElement.dataset.theme=theme;$('themeToggle').textContent=theme==='dark'?'☀':'☾';setTimeout(()=>renderCharts(),0);}
window.addEventListener('DIGIEXPRESS_THEME_READY',e=>{const theme=e?.detail?.theme==='dark'?'dark':'light';applyTheme(theme);});
async function toggleTheme(){const next=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(next);await chrome.storage.sync.set({theme:next});}
function updateFreshness(ts){const el=$('freshnessIndicator');if(!el)return;const d=parseDate(ts)||new Date();const mins=Math.max(0,Math.floor((Date.now()-d.getTime())/60000));el.textContent=mins<1?'Freshness: now':`Freshness: ${fmt(mins)}m`;el.className=`badge ${mins<=20?'good':mins<=60?'neutral':'bad'}`;el.dataset.ts=d.toISOString();}
setInterval(()=>{const el=$('freshnessIndicator');if(el?.dataset.ts)updateFreshness(el.dataset.ts);},60000);
async function loadSavedViews(){const r=await chrome.storage.sync.get({savedViews:[]});savedViews=Array.isArray(r.savedViews)?r.savedViews:[];renderSavedViews();}
function renderSavedViews(){const el=$('savedViewSelect');if(!el)return;const cur=el.value;el.innerHTML='<option value="">Select a saved view…</option>'+savedViews.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');if(savedViews.some(v=>v.id===cur))el.value=cur;}
function captureView(){return {filters:{from:$('filterFrom').dataset.iso||'',fromJ:$('filterFrom').dataset.jalali||'',to:$('filterTo').dataset.iso||'',toJ:$('filterTo').dataset.jalali||'',service:$('filterService').value,destination:$('filterDestination').value,user:$('filterUser').value,shipping:$('filterShippingSize').value},chartFilters:JSON.parse(JSON.stringify(chartFilters)),trendBucket:$('trendBucket').value,trendPointCount:$('trendPointCount').value};}
async function saveCurrentView(){const name=$('savedViewName').value.trim();if(!name){toast('Enter a view name');return;}const existing=savedViews.find(v=>v.name.toLowerCase()===name.toLowerCase());const view={id:existing?.id||String(Date.now()),name,...captureView()};savedViews=existing?savedViews.map(v=>v.id===existing.id?view:v):[...savedViews,view];await chrome.storage.sync.set({savedViews});$('savedViewName').value='';renderSavedViews();$('savedViewSelect').value=view.id;toast('View saved');}
async function deleteSavedView(){const id=$('savedViewSelect').value;if(!id)return;savedViews=savedViews.filter(v=>v.id!==id);await chrome.storage.sync.set({savedViews});renderSavedViews();toast('View deleted');}
function applySavedView(id){const v=savedViews.find(x=>x.id===id);if(!v)return;const f=v.filters||{};for(const [id2,val] of [['filterService',f.service],['filterDestination',f.destination],['filterUser',f.user],['filterShippingSize',f.shipping]])if($(id2))$(id2).value=val||'';for(const [id2,iso,j] of [['filterFrom',f.from,f.fromJ],['filterTo',f.to,f.toJ]]){const el=$(id2);el.dataset.iso=iso||'';el.dataset.jalali=j||'';el.value=j||'';}chartFilters=v.chartFilters||{};if(v.trendBucket)$('trendBucket').value=v.trendBucket;if(v.trendPointCount)$('trendPointCount').value=v.trendPointCount;applyFilters();toast(`Loaded: ${v.name}`);}

function periodRangeMatches(r,value){const t=createdWallSerial(r?.created_at);if(!Number.isFinite(t))return false;const tp=getTehranParts(new Date()),today=Date.UTC(tp.year,tp.month-1,tp.day),tomorrow=Date.UTC(tp.year,tp.month-1,tp.day+1),prev=Date.UTC(tp.year,tp.month-1,tp.day-1);const [jy,jm]=toJalali(tp.year,tp.month,tp.day);const cur=toGregorian(jy,jm,1),next=toGregorian(jm===12?jy+1:jy,jm===12?1:jm+1,1),pr=toGregorian(jm===1?jy-1:jy,jm===1?12:jm-1,1);const sm=Date.UTC(cur.gy,cur.gm-1,cur.gd),sn=Date.UTC(next.gy,next.gm-1,next.gd),sp=Date.UTC(pr.gy,pr.gm-1,pr.gd);if(value==='currentDay')return t>=today&&t<tomorrow;if(value==='prevDay')return t>=prev&&t<today;if(value==='currentMonth')return t>=sm&&t<sn;if(value==='prevMonth')return t>=sp&&t<sm;return true;}
const _matchesOneChartFilter=matchesOneChartFilter;
matchesOneChartFilter=function(r,type,filter){if(type==='period')return periodRangeMatches(r,filter.value);if(type==='heatmap'){const d=r._created;if(!d)return false;const p=getTehranParts(d);return `${p.weekday??new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short'}).format(d)}|${p.hour}`===filter.value;}return _matchesOneChartFilter(r,type,filter);};
function periodComparisonSeries(rows){const local=computeKpisFromRows(rows).values;return {labels:['Current Day','Previous Day','Current Month','Previous Month'],values:[local.currentDay,local.prevDay,local.currentMonth,local.prevMonth],filterValues:['currentDay','prevDay','currentMonth','prevMonth']};}

const _renderChartsV42=renderCharts;
renderCharts=function(){
  _renderChartsV42();
  const pc=periodComparisonSeries(rowsForChart('period'));drawBars($('periodComparisonChart'),pc.labels,pc.values,{filterType:'period',filterValues:pc.filterValues,horizontalLabels:true,wrapLabels:true});
  drawHeatmap($('heatmapChart'),rowsForChart('heatmap'));
};
function drawHeatmap(canvas,rows){if(!canvas)return;const dpr=devicePixelRatio||1,w=canvas.clientWidth||600,h=330;canvas.width=w*dpr;canvas.height=h*dpr;const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);const days=['Sat','Sun','Mon','Tue','Wed','Thu','Fri'],counts=Array.from({length:7},()=>Array(24).fill(0));for(const r of rows){const d=r._created;if(!d)continue;const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short'}).format(d),di=['Sat','Sun','Mon','Tue','Wed','Thu','Fri'].indexOf(weekday);const p=getTehranParts(d);if(di>=0)counts[di][p.hour]++;}const max=Math.max(1,...counts.flat()),left=42,top=16,right=10,bottom=32,cw=(w-left-right)/24,ch=(h-top-bottom)/7,items=[];const dark=document.documentElement.dataset.theme==='dark';c.font='10px Tahoma, Arial';c.textAlign='right';c.textBaseline='middle';days.forEach((day,i)=>{c.fillStyle=dark?'#cbd5e1':'#64748b';c.fillText(day,left-6,top+i*ch+ch/2);});for(let hr=0;hr<24;hr+=2){c.textAlign='center';c.fillStyle=dark?'#94a3b8':'#748096';c.fillText(String(hr),left+hr*cw+cw/2,h-10);}for(let di=0;di<7;di++)for(let hr=0;hr<24;hr++){const v=counts[di][hr],ratio=v/max,x=left+hr*cw,y=top+di*ch,active=isChartItemActive('heatmap',`${days[di]}|${hr}`);c.fillStyle=active?'#7c3aed':`rgba(225,0,60,${0.08+ratio*0.82})`;c.fillRect(x+1,y+1,Math.max(1,cw-2),Math.max(1,ch-2));if(cw>18&&v){c.fillStyle=ratio>.5?'#fff':(dark?'#e5e7eb':'#334155');c.font=active?'bold 9px Tahoma':'9px Tahoma';c.textAlign='center';c.fillText(fmt(v),x+cw/2,y+ch/2);}items.push({type:'bar',x,y,w:cw,h:ch,label:`${days[di]} ${pad(hr)}:00`,value:v,filterType:'heatmap',filterValue:`${days[di]}|${hr}`});}chartMeta.set(canvas,{items,type:'heatmap'});}
function handleHeatmapClick(canvas,e){const item=findChartItem(canvas,e);if(!item)return;const type='heatmap',next={type,value:item.filterValue,label:item.label};if(chartFilters[type]?.value===next.value)delete chartFilters[type];else chartFilters[type]=next;applyFilters();}
function handleHeatmapDoubleClick(canvas,e){const item=findChartItem(canvas,e);if(item)openDrilldownForItem(item);}
function handleChartDoubleClick(canvas,e){const item=findChartItem(canvas,e);if(item)openDrilldownForItem(item);}
function rowsBehindItem(item){
  const type=item.filterType;if(!type)return[];const filter={value:String(item.filterValue??item.label)};
  const rows=baseFilteredRows.filter(r=>matchesChartFilters(r,type)&&matchesOneChartFilter(r,type,filter));
  if(!item.uniqueSeries)return rows;
  const seen=new Set(),out=[];
  for(const r of rows){const ref=String(r.reference_id??'').trim(),key=ref||`__row__${String(r.id??r._id??out.length)}`;if(seen.has(key))continue;seen.add(key);out.push(r);}
  return out;
}
function openDrilldownForItem(item){const rows=rowsBehindItem(item).sort((a,b)=>b._id-a._id);$('drawerTitle').textContent=`Drill-down — ${item.label}`;$('drawerSubtitle').textContent=item.uniqueSeries?`${item.value} unique reference IDs behind the selected visual mark`:`${item.value} shipments behind the selected visual mark`;$('drawerCount').textContent=fmt(rows.length);const hs=['reference_id','user_id','ready_date','created_at','shipping_size_id','destination_shipping_point','parcel_ids','promise_date'];$('drawerRows').innerHTML=rows.slice(0,2000).map(r=>'<tr>'+hs.map(h=>`<td title="${esc(r[h])}">${esc(short(r[h],40))}</td>`).join('')+'</tr>').join('')||'<tr><td colspan="8">No shipments found.</td></tr>';$('drilldownBackdrop').hidden=false;$('drilldownDrawer').classList.add('open');$('drilldownDrawer').setAttribute('aria-hidden','false');}
function closeDrilldown(){$('drilldownBackdrop').hidden=true;$('drilldownDrawer').classList.remove('open');$('drilldownDrawer').setAttribute('aria-hidden','true');}
function renderAlertHistory(history){const el=$('alertHistoryRows');if(!el)return;const rows=Array.isArray(history)?[...history].reverse():[];el.innerHTML=rows.map(a=>`<tr><td>${esc(formatDateTime(a.triggeredAt))}</td><td>${fmt(a.value)}</td><td>${fmt(a.threshold)}</td><td>${fmt(a.windowMinutes)} min</td><td>${a.acknowledgedAt?esc(formatDateTime(a.acknowledgedAt)):'—'}</td></tr>`).join('')||'<tr><td colspan="5">No alerts recorded.</td></tr>';}


// v4.5 operational intelligence --------------------------------------------
const _renderChartsV44=renderCharts;
renderCharts=function(){
  _renderChartsV44();
  renderOperationalIntelligence();
};

function renderOperationalIntelligence(){
  const rows=filteredRows||[];
  renderSmartSummary(rows);
  renderRootCauseSnapshot(rows);
  renderContributionAnalysis(rows);
  drawCumulativeDayCurve($('cumulativeDayChart'), rows);
}

function rowJalaliParts(row){
  const j=createdJalaliParts(row);if(!j)return null;
  const raw=String(row?.created_at??'').trim().replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const m=raw.match(/\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}(?:[^\d]{0,8}([0-2]?\d):([0-5]?\d))?/);
  if(m)return {jy:j[0],jm:j[1],jd:j[2],hour:Number(m[1]||0),minute:Number(m[2]||0)};
  const d=row?._created;if(!d)return {jy:j[0],jm:j[1],jd:j[2],hour:0,minute:0};
  const p=getTehranParts(d);return {jy:j[0],jm:j[1],jd:j[2],hour:p.hour,minute:p.minute};
}
function jalaliDaySerial(jy,jm,jd){return j2d(Number(jy),Number(jm),Number(jd));}
function currentJalaliPartsNow(){const p=getTehranParts(new Date()),j=toJalali(p.year,p.month,p.day);return {jy:j[0],jm:j[1],jd:j[2],hour:p.hour,minute:p.minute};}
function classifyUser(row){if(isDKUser(row))return'DK';if(isDXUser(row))return'DX';return'Other';}
function shippingSizeLabel(v){return ({'1':'Normal','2':'Medium','3':'Large'})[String(v)]||String(v||'Unknown');}
function groupCountMap(rows,keyFn){const m=new Map();for(const r of rows||[]){const k=String(keyFn(r)||'Unknown');m.set(k,(m.get(k)||0)+1);}return m;}
function topEntry(rows,keyFn){const entries=[...groupCountMap(rows,keyFn).entries()].sort((a,b)=>b[1]-a[1]);return entries[0]||['—',0];}
function pct(n,d){return d?Math.round((Number(n)||0)*100/d):0;}

function renderRootCauseSnapshot(rows){
  const el=$('rootCauseSnapshot');if(!el)return;const total=rows.length;
  if(!total){el.innerHTML='<div class="root-cause-item wide"><span>Current context</span><strong>No data</strong><small>Adjust filters or refresh the dashboard.</small></div>';return;}
  const [user,userCount]=topEntry(rows,r=>classifyUser(r));
  const [dest,destCount]=topEntry(rows,r=>r.destination_shipping_point||'Unknown');
  const [size,sizeCount]=topEntry(rows,r=>shippingSizeLabel(r.shipping_size_id));
  const [rawUser,rawUserCount]=topEntry(rows,r=>r.user_id||'Unknown');
  const q=groupCountMap(rows,r=>{const p=rowJalaliParts(r);if(!p)return'Unknown';const qmin=Math.floor(p.minute/15)*15;return `${p.jy}/${pad(p.jm)}/${pad(p.jd)} ${pad(p.hour)}:${pad(qmin)}`;});
  const peak=[...q.entries()].sort((a,b)=>b[1]-a[1])[0]||['—',0];
  const items=[
    ['Leading source',user,`${fmt(userCount)} shipments · ${pct(userCount,total)}% of current context`],
    ['Top user ID',rawUser,`${fmt(rawUserCount)} shipments · ${pct(rawUserCount,total)}%`],
    ['Top shipping size',size,`${fmt(sizeCount)} shipments · ${pct(sizeCount,total)}%`],
    ['Peak 15-min window',peak[0],`${fmt(peak[1])} rejected shipments`],
    ['Top destination point',dest,`${fmt(destCount)} shipments · ${pct(destCount,total)}%`]
  ];
  el.innerHTML=items.map((x,i)=>`<div class="root-cause-item${i===4?' wide':''}" title="${esc(x[1])}"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></div>`).join('');
}

function contributionRows(rows,keyFn,limit=3){
  const total=rows.length||1;return [...groupCountMap(rows,keyFn).entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([label,count])=>({label,count,share:count*100/total}));
}
function renderContributionAnalysis(rows){
  const el=$('contributionAnalysis');if(!el)return;
  if(!rows.length){el.innerHTML='<div class="hint">No data available for contribution analysis.</div>';return;}
  const sections=[
    ['Source',contributionRows(rows,r=>classifyUser(r),3)],
    ['Shipping size',contributionRows(rows,r=>shippingSizeLabel(r.shipping_size_id),3)],
    ['Destination',contributionRows(rows,r=>r.destination_shipping_point||'Unknown',3)]
  ];
  el.innerHTML=sections.map(([title,data])=>`<div class="contrib-section"><h4>${esc(title)}</h4>${data.map(x=>`<div class="contrib-row" title="${esc(x.label)}"><span class="contrib-label">${esc(x.label)}</span><span class="contrib-track"><i class="contrib-fill" style="width:${Math.max(1,Math.min(100,x.share)).toFixed(1)}%"></i></span><span class="contrib-value">${fmt(x.count)} · ${Math.round(x.share)}%</span></div>`).join('')}</div>`).join('');
}

function sameElapsedDayRows(rows,targetSerial,elapsedMinutes){
  return (rows||[]).filter(r=>{const p=rowJalaliParts(r);if(!p)return false;return jalaliDaySerial(p.jy,p.jm,p.jd)===targetSerial && (p.hour*60+p.minute)<=elapsedMinutes;});
}
function renderSmartSummary(rows){
  const el=$('smartSummaryText');if(!el)return;
  if(!rows.length){el.textContent='No rejected shipment data is available in the current filter context.';return;}
  const now=currentJalaliPartsNow(),todayS=jalaliDaySerial(now.jy,now.jm,now.jd),elapsed=now.hour*60+now.minute;
  const today=sameElapsedDayRows(rows,todayS,elapsed),yesterday=sameElapsedDayRows(rows,todayS-1,elapsed);
  const delta=today.length-yesterday.length;
  let changeText='is level with yesterday at the same time';
  if(yesterday.length){const pc=Math.round(Math.abs(delta)*100/yesterday.length);changeText=delta>0?`is ${pc}% above yesterday at the same time`:delta<0?`is ${pc}% below yesterday at the same time`:'is level with yesterday at the same time';}
  else if(today.length)changeText='has activity while yesterday had none at the same time';
  const context=today.length?today:rows;
  const [source,sourceCount]=topEntry(context,r=>classifyUser(r));
  const [size,sizeCount]=topEntry(context,r=>shippingSizeLabel(r.shipping_size_id));
  const [dest,destCount]=topEntry(context,r=>r.destination_shipping_point||'Unknown');
  el.textContent=`Today ${changeText}. ${source} is the leading source (${pct(sourceCount,context.length)}%), ${size} leads shipping size (${pct(sizeCount,context.length)}%), and ${dest} is the top destination (${fmt(destCount)}).`;
}

function cumulativeSeries(rows){
  const now=currentJalaliPartsNow(),todayS=jalaliDaySerial(now.jy,now.jm,now.jd),currentHour=now.hour;
  const byDay=new Map();
  for(const r of rows||[]){const p=rowJalaliParts(r);if(!p)continue;const serial=jalaliDaySerial(p.jy,p.jm,p.jd);if(serial<todayS-7||serial>todayS)continue;if(!byDay.has(serial))byDay.set(serial,Array(24).fill(0));byDay.get(serial)[Math.max(0,Math.min(23,p.hour))]++;}
  const cumulative=a=>{let s=0;return a.map(v=>(s+=v));};
  const todayRaw=byDay.get(todayS)||Array(24).fill(0), yesterdayRaw=byDay.get(todayS-1)||Array(24).fill(0);
  const todayCum=cumulative(todayRaw).map((v,i)=>i<=currentHour?v:null), yesterdayCum=cumulative(yesterdayRaw);
  const past=[];for(let d=1;d<=7;d++)past.push(cumulative(byDay.get(todayS-d)||Array(24).fill(0)));
  const avg=Array.from({length:24},(_,h)=>past.reduce((s,a)=>s+a[h],0)/7);
  return {labels:Array.from({length:24},(_,h)=>`${pad(h)}:00`),today:todayCum,yesterday:yesterdayCum,average:avg};
}
function drawCumulativeDayCurve(canvas,rows){
  if(!canvas)return;const s=cumulativeSeries(rows),series=[{name:'Today',values:s.today,color:'#e1003c'},{name:'Yesterday',values:s.yesterday,color:'#7c3aed'},{name:'7-day average',values:s.average,color:'#0f9f6e'}];
  const dpr=devicePixelRatio||1,w=canvas.clientWidth||700,h=Number(canvas.getAttribute('height'))||280;canvas.width=w*dpr;canvas.height=h*dpr;const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const padL=54,padR=22,padT=18,padB=42,cw=w-padL-padR,ch=h-padT-padB,vals=series.flatMap(sx=>sx.values.filter(v=>v!==null&&Number.isFinite(Number(v))).map(Number));let max=Math.max(1,...vals),step=Math.max(10,Math.ceil(max/5/10)*10);max=Math.ceil(max/step)*step;
  const dark=document.documentElement.dataset.theme==='dark';c.font='10px Tahoma, Arial';c.strokeStyle=dark?'#263244':'#e7eaf0';c.fillStyle=dark?'#94a3b8':'#748096';c.textAlign='left';for(let v=0;v<=max;v+=step){const y=padT+ch-(v/max)*ch;c.beginPath();c.moveTo(padL,y);c.lineTo(w-padR,y);c.stroke();c.fillText(fmt(v),7,y+4);}const xAt=i=>padL+i*cw/23;
  const items=[];for(const sx of series){c.strokeStyle=sx.color;c.lineWidth=sx.name==='Today'?2.6:1.9;c.beginPath();let pen=false;sx.values.forEach((raw,i)=>{if(raw===null||!Number.isFinite(Number(raw))){pen=false;return;}const v=Number(raw),x=xAt(i),y=padT+ch-(v/max)*ch;if(!pen){c.moveTo(x,y);pen=true;}else c.lineTo(x,y);items.push({type:'point',x,y,r:7,label:`${sx.name} · ${s.labels[i]}`,value:Math.round(v),series:sx.name,index:i});});c.stroke();}
  c.fillStyle=dark?'#94a3b8':'#748096';c.textAlign='center';for(let i=0;i<24;i+=3)c.fillText(s.labels[i],xAt(i),h-12);chartMeta.set(canvas,{items,type:'multi-line',labels:s.labels,series});
}

const _handleChartHoverV44=handleChartHover;
handleChartHover=function(canvas,e){
  const meta=chartMeta.get(canvas);if(meta?.type==='multi-line'){const item=findChartItem(canvas,e);canvas.style.cursor=item?'crosshair':'default';if(!item){hideChartTooltip();return;}const tip=$('chartTooltip');tip.textContent=`${item.label}: ${fmt(item.value)}`;tip.style.left=`${e.clientX+12}px`;tip.style.top=`${e.clientY+12}px`;tip.hidden=false;return;}
  _handleChartHoverV44(canvas,e);
};

(function bindV45(){
  const c=$('cumulativeDayChart');if(c){c.addEventListener('mousemove',e=>handleChartHover(c,e));c.addEventListener('mouseleave',hideChartTooltip);}
})();
