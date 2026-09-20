const $ = (id) => document.getElementById(id);
const homeView = $('homeView');
const settingsView = $('settingsView');
const operationView = $('operationView');
const menu = $('menu');
const statusEl = $('status');
const usernameEl = $('username');
const passwordEl = $('password');
const validationOverlay = $('validationOverlay');
const settingsStatus = $('settingsStatus');
const operationStatus = $('operationStatus');
let selectedTheme = 'light';
let validationInProgress = false;
let remoteBundle = null;
let currentOperation = null;
let currentBaseOperation = null;
let currentSubOperationId = '';
let toastTimer = null;
let activeLogId = null;
const activityByOp=new Map();
const runningOps=new Set();
const liveReportsByOp=new Map();
let operationRunning = false;
let flexPauseRequested = false;
let flexPaused = false;
let flexCancelRequested = false;
let flexResumeResolver = null;
const ENGINE_VERSION = '13.0.0';
const EXPECTED_REMOTE_CONFIG_VERSION = 362;


async function getActivityLogs(){ const x=await chrome.storage.local.get(['opsActivityLog']); return Array.isArray(x.opsActivityLog)?x.opsActivityLog:[]; }
async function saveActivityLogs(logs){ await chrome.storage.local.set({opsActivityLog:logs.slice(0,30)}); }
async function startActivity(op){ const logs=await getActivityLogs(); const item={id:`${Date.now()}_${Math.random().toString(36).slice(2,7)}`,operation:op.title||op.id,opId:op.id,start:Date.now(),end:null,status:'running',records:null,errorCode:null}; activityByOp.set(op.id,item.id); activeLogId=item.id; await saveActivityLogs([item,...logs]); await renderActivityLog(); return item.id; }
async function finishActivity(status,text='',opId=currentOperation?.id){ const id=activityByOp.get(opId)||activeLogId;if(!id)return;const logs=await getActivityLogs();const item=logs.find(x=>x.id===id);if(item){item.end=Date.now();item.status=status;const m=String(text).match(/(\d+)\s+rows/i);if(m)item.records=Number(m[1]);if(status==='error')item.errorCode=(String(text).match(/\b[A-Z]{2,8}-\d{2,4}\b/)||[])[0]||'OP-001';}await saveActivityLogs(logs);activityByOp.delete(opId);if(activeLogId===id)activeLogId=null;await renderActivityLog();}
async function renderActivityLog(){ const el=$('activityLog'); if(!el)return; const logs=await getActivityLogs(); if(!logs.length){el.innerHTML='<div class="settings-help">No activity yet.</div>';return;} el.innerHTML=logs.map(x=>`<div class="log-item"><div class="log-top"><span>${escapeHtml(x.operation)}</span><span class="${x.status==='success'?'log-ok':x.status==='error'?'log-error':''}">${escapeHtml(x.status)}</span></div><div class="log-meta">${new Date(x.start).toLocaleString()}${x.end?` → ${new Date(x.end).toLocaleTimeString()}`:''}${x.records!=null?` • ${x.records} records`:''}${x.errorCode?` • ${x.errorCode}`:''}</div></div>`).join(''); }
function inferProgress(text){ const t=String(text||'').toLowerCase(); if(t.includes('opening'))return 10;if(t.includes('login')||t.includes('signing'))return 20;if(t.includes('entering distribution'))return 30;if(t.includes('start date'))return 40;if(t.includes('end date'))return 50;if(t.includes('submitting')||t.includes('waiting up to'))return 60;if(t.includes('search completed'))return 72;if(t.includes('extracting')||t.includes('reading all rows'))return 82;if(t.includes('creating excel'))return 94;if(t.includes('done'))return 100;return null; }
function setProgress(text, done=false){ const pct=done?100:inferProgress(text); if(pct==null)return; $('progressWrap')?.classList.remove('hidden');$('progressText')?.classList.remove('hidden'); if($('progressBar'))$('progressBar').style.width=`${pct}%`; if($('progressText'))$('progressText').textContent=`${pct}% • ${text||''}`; }
function isFlexBatchOperation(){return currentOperation?.clientProcessor?.type==='excel-batch-workflow';}
function resetFlexControls(){flexPauseRequested=false;flexPaused=false;flexCancelRequested=false;if(flexResumeResolver){flexResumeResolver();flexResumeResolver=null;}const p=$('pauseOperation');if(p){p.textContent='Pause';p.classList.add('hidden');p.disabled=false;}}
function syncFlexControls(){operationRunning=!!currentOperation&&runningOps.has(currentOperation.id);const active=operationRunning&&isFlexBatchOperation();const p=$('pauseOperation');if(p){p.classList.toggle('hidden',!active);p.textContent=flexPaused?'Resume':'Pause';p.disabled=!!flexCancelRequested;}const c=$('cancelOperation');if(c)c.classList.toggle('hidden',!operationRunning);}
function setOperationRunning(running,opId=currentOperation?.id){if(!opId)return;if(running)runningOps.add(opId);else runningOps.delete(opId);operationRunning=!!currentOperation&&runningOps.has(currentOperation.id);syncFlexControls();if(currentOperation?.id===opId){$('runOperation').disabled=operationRunning;if(!running&&!flexCancelRequested)resetFlexControls();}}
async function waitForFlexResume(){if(!flexPaused&&!flexPauseRequested)return;if(flexCancelRequested)return;setOperationStatus('Paused. Press Resume to repeat the current row and continue.');setProgress('Paused');await new Promise(resolve=>{flexResumeResolver=resolve;});flexResumeResolver=null;}
async function refreshSystemStatus(){ try{await chrome.runtime.sendMessage({type:'GET_SYSTEM_STATUS'});}catch(_){ } }

function showToast(message, kind = 'error') {
  const toast = $('accessToast');
  clearTimeout(toastTimer);
  toast.textContent = message || '';
  toast.className = `toast ${kind === 'success' ? 'success' : 'error'} show`;
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3200);
}
function setStatus(text, kind='') { statusEl.textContent = text || 'Ready'; statusEl.className = `status ${kind}`.trim(); }
function setSettingsStatus(text, kind='') { settingsStatus.textContent = text || ''; settingsStatus.className = `settings-status ${kind}`.trim(); }
function classifyOperationError(raw,op=currentOperation){
  const msg=String(raw||'').replace(/^Error:\s*/i,'').trim(); const low=msg.toLowerCase();
  let title='Operation could not be completed', reason='The page or remote workflow did not reach the expected state.', action='Retry the operation. If it fails again, open Diagnostics and export the report.';
  if(/no headers|no extracted table|returned no headers/.test(low)){title='No report columns were found';reason='The target page may still be loading, the table layout may have changed, or the LG session may have expired.';action='Keep the LG tab available, sign in if needed, then retry. Use View diagnostics if the problem continues.';}
  else if(/table.*not found|element not found|selector|rows were not available|did not appear/.test(low)){title='Required page content did not load';reason='LG did not render the expected table or control before the timeout.';action='Open LG, confirm the page loads normally, then retry. Diagnostics will show the URL and selector that failed.';}
  else if(/access denied|not listed in the access/.test(low)){title='Access is not available';reason='Your account is not currently authorized for this operation.';action='Check the access email in Settings or contact the operation owner.';}
  else if(/google apps script|web app url|sheet.*required|target sheet/.test(low)){title='Publishing destination is not configured';reason='This Agent requires a Google Sheets destination, but its publishing connection is missing or incomplete.';action='Open Agents settings, configure the destination, and run the Agent again.';}
  else if(/login|authentication|credential|password/.test(low)){title='LG authentication needs attention';reason='The saved session or credentials could not be used for this operation.';action='Open LG and sign in, or validate your account again in Settings.';}
  return {title,reason,action,details:msg||'Unknown error',opId:op?.id||''};
}
function bindOperationErrorActions(){
  const retry=document.getElementById('dxErrorRetry'); if(retry)retry.onclick=()=>document.getElementById('runOperation')?.click();
  const lg=document.getElementById('dxErrorOpenLg'); if(lg)lg.onclick=()=>chrome.runtime.sendMessage({type:'OPEN_URL',url:'https://lg.digikala.com/'}).catch(()=>{});
  const diag=document.getElementById('dxErrorDiagnostics'); if(diag)diag.onclick=async()=>{showView('settings');updateUrlState('settings');await refreshDiagnosticsPreview();document.querySelector('[data-settings-section="diagnostics"]')?.scrollIntoView({behavior:'smooth',block:'start'});};
}
function setOperationStatus(text, kind='') {
  if(!operationStatus)return;
  operationStatus.className = `settings-status ${kind}`.trim();
  if(kind==='error' && text){const e=classifyOperationError(text);operationStatus.innerHTML=`<div class="dx-error-card"><strong>${escapeHtml(e.title)}</strong><p>${escapeHtml(e.reason)}</p><p><b>What to do:</b> ${escapeHtml(e.action)}</p><details><summary>Technical details</summary><div class="dx-code">${escapeHtml(e.details)}</div></details><div class="dx-error-actions"><button id="dxErrorRetry" type="button">Retry</button><button id="dxErrorOpenLg" type="button">Open LG</button><button id="dxErrorDiagnostics" type="button">View diagnostics</button></div></div>`;bindOperationErrorActions();}
  else operationStatus.textContent = text || '';
}
function resetLiveReport(opId){if(opId)liveReportsByOp.delete(opId);const host=$('operationResult');if(host){host.innerHTML='';host.classList.add('hidden');}}
function renderLiveReport(opId,message){
  if(!Array.isArray(message?.reportHeaders)||!Array.isArray(message?.reportRow))return;
  let report=liveReportsByOp.get(opId);
  if(!report){report={headers:message.reportHeaders.slice(),rows:[],exportCfg:message.reportExport||{},title:message.reportTitle||'Live report'};liveReportsByOp.set(opId,report);}
  if(!report.headers.length)report.headers=message.reportHeaders.slice();
  report.rows.push(message.reportRow.slice());
  if(message.reportExport)report.exportCfg=message.reportExport;
  if(message.reportTitle)report.title=message.reportTitle;
  const host=$('operationResult');if(!host)return;host.classList.remove('hidden');
  const exp=report.exportCfg||{},buttonLabel=exp.buttonLabel||'Download Excel';
  host.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${escapeHtml(report.title||'Live report')}</strong><div class="field-help">${report.rows.length} item${report.rows.length===1?'':'s'} processed</div></div><div class="capacity-result-actions"><button id="liveReportDownload" class="save-button compact" type="button">${escapeHtml(buttonLabel)}</button></div></div><div class="table-scroll"><table class="result-table"><thead><tr>${report.headers.map(x=>`<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${report.rows.map(r=>`<tr>${r.map(x=>`<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const dl=host.querySelector('#liveReportDownload');if(dl)dl.onclick=async()=>{dl.disabled=true;try{await downloadLiveReport(opId);setOperationStatus('Excel downloaded.','ok');}catch(e){setOperationStatus(e.message||String(e),'error');}finally{dl.disabled=false;}};
}
async function downloadLiveReport(opId){
  const report=liveReportsByOp.get(opId);if(!report?.rows?.length)throw new Error('No live report rows are available.');
  const exp=report.exportCfg||{},now=new Date(),pad=n=>String(n).padStart(2,'0'),stamp=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename=String(exp.filename||'operation_report_{{timestamp}}.xlsx').replace('{{timestamp}}',stamp);
  const statusIndex=report.headers.findIndex(h=>String(h).toLowerCase()==='result');
  const rowFills=statusIndex>=0?report.rows.map(r=>String(r[statusIndex]||'').toLowerCase()==='updated'?'C6EFCE':String(r[statusIndex]||'').toLowerCase()==='failed'?'FFC7CE':null):null;
  const r=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers:report.headers,rows:report.rows,sheetName:exp.sheetName||'Report',filename,saveAs:exp.saveAs===true,rowFills});if(!r?.ok)throw new Error(r?.error||'Excel download failed.');return r;
}
function isAccessDeniedError(error) { const t=String(error?.message||error||'').toLowerCase(); return t.includes('access denied')||t.includes('not listed in the access database'); }

let currentViewName = 'home';
const viewHistory = [];
let applyingUrlState=false;
function parseUrlState(){const h=new URLSearchParams(String(location.hash||'').replace(/^#/,''));return {view:h.get('view')||'',operation:h.get('operation')||'',sub:h.get('sub')||''};}
function updateUrlState(view=currentViewName,opId=currentOperation?.id||'',subId=currentSubOperationId||'',replace=false){
  if(applyingUrlState)return; const p=new URLSearchParams();
  if(view==='settings')p.set('view','settings'); else if(view==='operation'&&opId){p.set('operation',opId);if(subId)p.set('sub',subId);} else p.set('view','home');
  const hash=`#${p.toString()}`; if(location.hash===hash)return; (replace?history.replaceState:history.pushState).call(history,null,'',hash);
}
function showView(view, options={}) {
  if (validationInProgress && view !== 'settings') return;
  if (view !== currentViewName && options.record !== false) {
    if (!viewHistory.length || viewHistory[viewHistory.length - 1] !== currentViewName) viewHistory.push(currentViewName);
    if (viewHistory.length > 20) viewHistory.shift();
  }
  homeView.classList.toggle('active', view === 'home');
  settingsView.classList.toggle('active', view === 'settings');
  operationView.classList.toggle('active', view === 'operation');
  currentViewName = view;
  if(options.syncHash!==false)updateUrlState(view);
  if (view !== 'operation') { setOperationStatus(''); setVoicePermissionBrokerVisible(false); }
}
function goBackView(){
  const target = viewHistory.pop() || 'home';
  showView(target,{record:false});
}
function goHomeView(){ viewHistory.length=0; showView('home',{record:false}); }

let voicePermissionBrokerInitialized=false;
function setVoicePermissionBrokerVisible(visible){ const b=$('voicePermissionBroker'); if(b)b.classList.toggle('active',!!visible); }
function initVoicePermissionBroker(){
  if(voicePermissionBrokerInitialized)return; voicePermissionBrokerInitialized=true;
  const broker=$('voicePermissionBroker'), fallback=$('voicePermissionFallback');
  if(!broker)return;
  const frame=()=>document.getElementById('voiceTypingFrame');
  const tell=(type,message='')=>{try{frame()?.contentWindow?.postMessage({type,message},'*')}catch(_){}};
  const refresh=async()=>{try{const q=await navigator.permissions?.query?.({name:'microphone'});if(q?.state==='granted')tell('DIGIEXPRESS_VOICE_PERMISSION_GRANTED');else tell('DIGIEXPRESS_VOICE_PERMISSION_DENIED','Microphone permission is not granted yet. Click Enable microphone.');}catch(_){}};
  if(fallback){fallback.classList.remove('hidden');fallback.onclick=async()=>{try{await chrome.tabs.create({url:chrome.runtime.getURL('voice-permission.html'),active:true});}catch(e){tell('DIGIEXPRESS_VOICE_PERMISSION_DENIED',String(e?.message||e));}};}
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.dxVoiceMicGrantedAt?.newValue){tell('DIGIEXPRESS_VOICE_PERMISSION_GRANTED');}});
  refresh();
}

function setValidationBusy(busy) {
  validationInProgress = !!busy;
  validationOverlay.classList.toggle('active', validationInProgress);
  validationOverlay.setAttribute('aria-hidden', validationInProgress ? 'false' : 'true');
  ['saveSettings','clearCredentials','refreshRemote','backBtn','settingsBtn','settingsHomeBtn','operationBackBtn','operationHomeBtn'].forEach(id => { const el=$(id); if(el) el.disabled=validationInProgress; });
  usernameEl.disabled = validationInProgress;
  passwordEl.disabled = validationInProgress;
  $('togglePassword').disabled = validationInProgress;
  document.querySelectorAll('.theme-option').forEach(el => el.disabled = validationInProgress);
}

function pushThemeToFrame(frame, theme=selectedTheme) {
  if (!frame) return;
  const normalized = theme === 'dark' ? 'dark' : 'light';
  // Same-origin Host pages can be themed immediately without waiting for messaging.
  try {
    const doc = frame.contentDocument;
    if (doc?.documentElement) {
      doc.documentElement.dataset.theme = normalized;
      doc.documentElement.style.colorScheme = normalized;
      if (doc.body) doc.body.dataset.theme = normalized;
    }
  } catch (_) {}
  // Cross-origin Remote pages receive the same theme through the shared bridge.
  try { frame.contentWindow?.postMessage({ type:'DIGIEXPRESS_THEME', theme:normalized }, '*'); setTimeout(()=>{try{frame.contentWindow?.postMessage({type:'DIGIEXPRESS_THEME',theme:normalized},'*')}catch(_){}},80); } catch (_) {}
}
function bindEmbeddedThemeBridge() {
  document.querySelectorAll('iframe').forEach(frame => {
    if (frame.dataset.dxThemeBound !== '1') {
      frame.dataset.dxThemeBound = '1';
      frame.addEventListener('load', () => pushThemeToFrame(frame));
    }
    pushThemeToFrame(frame);
  });
}
function broadcastTheme(theme=selectedTheme) {
  document.querySelectorAll('iframe').forEach(frame => pushThemeToFrame(frame, theme));
}
window.addEventListener('message', event => {
  if (event?.data?.type !== 'DIGIEXPRESS_THEME_REQUEST') return;
  try { event.source?.postMessage({ type:'DIGIEXPRESS_THEME', theme:selectedTheme }, '*'); } catch (_) {}
});

function applyRemoteTheme(themeName) {
  const theme = remoteBundle?.theme || {};
  selectedTheme = themeName === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = selectedTheme;
  document.documentElement.style.colorScheme = selectedTheme;
  if (document.body) document.body.dataset.theme = selectedTheme;
  const colors = theme[selectedTheme] || {};
  const layout = theme.layout || {};
  const root = document.documentElement.style;
  const mapping = { background:'--bg', panel:'--panel', card:'--card', text:'--text', muted:'--muted', accent:'--accent', border:'--border', danger:'--danger', success:'--success' };
  for (const [key, css] of Object.entries(mapping)) if (colors[key]) root.setProperty(css, colors[key]);
  if (layout.columns) root.setProperty('--columns', String(layout.columns));
  if (layout.cardRadius) root.setProperty('--radius', `${Number(layout.cardRadius)}px`);
  if (layout.gap) root.setProperty('--gap', `${Number(layout.gap)}px`);
  document.querySelectorAll('.theme-option').forEach(btn => btn.classList.toggle('selected', btn.dataset.theme === selectedTheme));
  bindEmbeddedThemeBridge();
  requestAnimationFrame(() => broadcastTheme(selectedTheme));
}

function renderRemoteBranding() {
  const app = remoteBundle?.app?.app || remoteBundle?.app?.branding || {};
  $('brandTitle').textContent = app.name || 'Digiexpress';
  $('brandSubtitle').textContent = app.subtitle || 'Operations Toolkit';
  $('homeHeading').textContent = remoteBundle?.messages?.home?.title || 'Choose an operation';
  $('homeSubheading').textContent = remoteBundle?.messages?.home?.subtitle || 'Run your daily operations from one place.';
  if (app.logoUrl) $('brandLogo').src = app.logoUrl;
}

function renderThemeOptions() {
  const defs = remoteBundle?.settings?.appearance?.themes || [
    { id:'light', label:'Day' }, { id:'dark', label:'Night' }
  ];
  $('themeSelector').innerHTML = defs.map(t => `<button class="theme-option" data-theme="${escapeHtml(t.id)}">${escapeHtml(t.label || t.id)}</button>`).join('');
  document.querySelectorAll('.theme-option').forEach(btn => btn.addEventListener('click', () => applyRemoteTheme(btn.dataset.theme)));
}

function applyRemoteSettingsLabels() {
  const s = remoteBundle?.settings || {};
  const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  const setPlaceholder = (id, value) => { const el = $(id); if (el) el.placeholder = value; };
  setText('settingsTitle', s.title || 'Settings');
  setText('settingsDescription', s.description || 'Theme, credentials and remote configuration.');
  setText('appearanceTitle', s.appearance?.title || 'Appearance');
  setText('credentialsHelp', s.credentials?.help || 'Credentials remain only on this device. The email is also used for access control.');
  setText('usernameLabel', s.credentials?.usernameLabel || 'Username / Access Email');
  setPlaceholder('username', s.credentials?.usernamePlaceholder || 'name@digikala.com');
  setText('passwordLabel', s.credentials?.passwordLabel || 'Password');
  setText('saveSettings', s.credentials?.saveLabel || 'Save & validate');
  setText('clearCredentials', s.credentials?.clearLabel || 'Clear username & password');
  setText('validationTitle', s.validation?.title || 'Validating username and password');
  setText('validationMessage', s.validation?.message || 'Please wait. Settings are locked during validation.');
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function iconMarkup(op) {
  if (op.iconImage) return `<img class="op-icon-image" src="${escapeHtml(remoteAssetUrl(op.iconImage))}" alt="" loading="lazy" decoding="async">`;
  if (Array.isArray(op.iconSvgLayers) && op.iconSvgLayers.length) {
    const layers=op.iconSvgLayers.slice(0,12).map(x=>`<path d="${escapeHtml(x?.path||'')}" fill="${escapeHtml(x?.fill||'currentColor')}"></path>`).join('');
    const overlay=op.iconTextOverlay ? `<text x="24" y="28" text-anchor="middle" font-size="${Number(op.iconTextOverlaySize)||11}" font-weight="900" fill="currentColor">${escapeHtml(op.iconTextOverlay)}</text>` : '';
    return `<svg viewBox="0 0 48 48" aria-hidden="true">${layers}${overlay}</svg>`;
  }
  if (op.iconSvgPath) return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="${escapeHtml(op.iconSvgPath)}"></path></svg>`;
  if (op.iconText) return `<span style="font-size:34px">${escapeHtml(op.iconText)}</span>`;
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 8h32v32H8zM14 14v20h20V14z"></path></svg>`;
}

const SMART_USAGE_KEY='opsOperationUsageV1';
const FAVORITES_KEY='opsFavoritesV1';
let visibleOperationsCache=[];
let favoriteOperationIds=new Set();
async function getOperationUsage(){const x=await chrome.storage.local.get(SMART_USAGE_KEY);return x?.[SMART_USAGE_KEY]||{};}
async function getFavorites(){const x=await chrome.storage.local.get(FAVORITES_KEY);const rows=Array.isArray(x?.[FAVORITES_KEY])?x[FAVORITES_KEY]:[];return new Set(rows.map(String));}
async function saveFavorites(){await chrome.storage.local.set({[FAVORITES_KEY]:[...favoriteOperationIds]});}
async function recordOperationUsage(opId){const usage=await getOperationUsage();const id=String(opId);const prev=usage[id]||{};usage[id]={count:Number(prev.count||0)+1,lastUsed:Date.now()};await chrome.storage.local.set({[SMART_USAGE_KEY]:usage});await renderSmartSidebar();}
async function renderSmartSidebar(){
  const box=$('smartSidebarItems'); if(!box)return;
  const usage=await getOperationUsage();
  const ranked=visibleOperationsCache.filter(op=>Number(usage[String(op.id)]?.count||0)>0).sort((a,b)=>{const A=usage[String(a.id)]||{},B=usage[String(b.id)]||{};return Number(B.count||0)-Number(A.count||0)||Number(B.lastUsed||0)-Number(A.lastUsed||0);}).slice(0,12);
  box.innerHTML=ranked.map(op=>`<button class="smart-op" data-smart-op="${escapeHtml(op.id)}" aria-label="${escapeHtml(op.title||op.id)}"><span class="op-icon">${iconMarkup(op)}</span></button>`).join('');
}
function createOperationCard(op,{favoriteCopy=false}={}){
  const card=document.createElement('article');
  card.className='op-card';
  card.dataset.op=op.id;
  card.dataset.category=String(op.category||'utilities').toLowerCase();
  card.dataset.search=`${op.title||op.id} ${op.subtitle||''} ${op.description||''} ${op.category||''}`;
  if(favoriteCopy)card.dataset.favoriteCopy='1';
  const starred=favoriteOperationIds.has(String(op.id));
  card.innerHTML=`<button class="op-card-open" type="button" aria-label="Open ${escapeHtml(op.title||op.id)}"><span class="op-icon">${iconMarkup(op)}</span><span class="op-title">${escapeHtml(op.title||op.id)}</span><span class="op-meta">${escapeHtml(op.subtitle||op.description||'')}</span><span class="op-arrow" aria-hidden="true">→</span></button><button type="button" class="favorite-toggle${starred?' active':''}" data-favorite-op="${escapeHtml(op.id)}" aria-pressed="${starred?'true':'false'}" title="${starred?'Remove from favorites':'Add to favorites'}" aria-label="${starred?'Remove':'Add'} ${escapeHtml(op.title||op.id)} ${starred?'from':'to'} favorites">★</button>`;
  return card;
}
function renderOperationCards(){
  menu.innerHTML='';
  const favGrid=document.getElementById('favoritesGrid');
  if(favGrid)favGrid.innerHTML='';
  for(const op of visibleOperationsCache){
    menu.appendChild(createOperationCard(op));
    if(favGrid&&favoriteOperationIds.has(String(op.id)))favGrid.appendChild(createOperationCard(op,{favoriteCopy:true}));
  }
  applyOperationFilters();
}
async function toggleFavorite(opId){
  const id=String(opId);
  if(favoriteOperationIds.has(id))favoriteOperationIds.delete(id);else favoriteOperationIds.add(id);
  await saveFavorites();
  renderOperationCards();
}
let activeOperationCategory='all';
function applyOperationFilters(){
  const q=String(document.getElementById('operationSearch')?.value||'').trim().toLowerCase();
  const matches=card=>{const category=String(card.dataset.category||'').toLowerCase();const haystack=String(card.dataset.search||'').toLowerCase();return (activeOperationCategory==='all'||category===activeOperationCategory)&&(!q||haystack.includes(q));};
  let shown=0;
  [...menu.querySelectorAll('.op-card')].forEach(card=>{const visible=matches(card);card.hidden=!visible;card.style.display=visible?'':'none';if(visible)shown++;});
  const favGrid=document.getElementById('favoritesGrid');
  let favShown=0;
  if(favGrid){[...favGrid.querySelectorAll('.op-card')].forEach(card=>{const visible=matches(card);card.hidden=!visible;card.style.display=visible?'':'none';if(visible)favShown++;});}
  const favSection=document.getElementById('favoritesSection');if(favSection)favSection.hidden=favShown===0;
  const count=document.getElementById('visibleToolCount');if(count)count.textContent=`${shown} tool${shown===1?'':'s'}`;
  document.querySelectorAll('[data-category]').forEach(btn=>{if(btn.classList.contains('op-card'))return;btn.classList.toggle('active',String(btn.dataset.category||'').toLowerCase()===activeOperationCategory);});
}
function setOperationCategory(category){activeOperationCategory=String(category||'all').toLowerCase();applyOperationFilters();}
function initOperationDiscoveryUi(){
  const search=document.getElementById('operationSearch');
  if(search&&!search.dataset.bound){search.dataset.bound='1';search.addEventListener('input',applyOperationFilters);}
  const chips=document.getElementById('categoryChips');
  if(chips&&!chips.dataset.bound){chips.dataset.bound='1';chips.addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b)setOperationCategory(b.dataset.category);});}
  const sidebar=document.querySelector('.sidebar-nav');
  if(sidebar&&!sidebar.dataset.bound){sidebar.dataset.bound='1';sidebar.addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){setOperationCategory(b.dataset.category);showView('home');}});}
  const ss=document.getElementById('sidebarSettingsBtn');if(ss&&!ss.dataset.bound){ss.dataset.bound='1';ss.addEventListener('click',()=>showView('settings'));}
  if(!document.body.dataset.searchShortcutBound){document.body.dataset.searchShortcutBound='1';document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){const x=document.getElementById('operationSearch');if(x){e.preventDefault();showView('home');x.focus();x.select();}}});}
}

async function refreshOperationVisibility(emailOverride = null) {
  const email = String(emailOverride ?? usernameEl.value ?? '').trim().toLowerCase();
  menu.innerHTML = '';
  if (!remoteBundle) return;
  const hasValidEmail = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  try {
    // Empty/invalid email is still sent so the security layer can return
    // operations whose access column contains the public marker "All".
    const response = await chrome.runtime.sendMessage({ type:'GET_VISIBLE_OPERATIONS', email: hasValidEmail ? email : '' });
    if (!response?.ok) throw new Error(response?.error || 'Could not load operation access.');
    const allowed = new Set((response.allowedOps || []).map(String));
    const operations = (remoteBundle.operations || []).filter(op => op.enabled !== false && allowed.has(String(op.id)));
    visibleOperationsCache=operations.slice();
    favoriteOperationIds=await getFavorites();
    await renderSmartSidebar();
    renderOperationCards();
    initOperationDiscoveryUi();
    applyOperationFilters();
    setStatus(operations.length ? 'Ready' : (hasValidEmail ? (remoteBundle?.messages?.access?.none || 'No operations are assigned to this email.') : (remoteBundle?.messages?.access?.setEmail || 'Set your email in Settings to load assigned operations.')));
  } catch (error) {
    menu.innerHTML = '';
    setStatus(error.message || 'Could not load operation access.', 'error');
  }
}

async function checkOperationAccess(op) {
  const response = await chrome.runtime.sendMessage({ type:'CHECK_OPERATION_ACCESS', op });
  if (!response?.ok) throw new Error(response?.error || 'Could not verify access.');
  if (!response.allowed) throw new Error(response?.error || 'Access denied.');
  return true;
}


const remoteAutocompleteCache = new Map();
function normalizeLookupText(value){
  return String(value ?? '').toLowerCase().trim()
    .replace(/[يى]/g,'ی').replace(/ك/g,'ک')
    .replace(/[\u064B-\u065F\u0670]/g,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function parseCsvText(text){
  const rows=[]; let row=[], cell='', quoted=false;
  const src=String(text??'');
  for(let i=0;i<src.length;i++){
    const ch=src[i];
    if(quoted){
      if(ch==='"' && src[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"'){quoted=false;}
      else cell+=ch;
    } else {
      if(ch==='"') quoted=true;
      else if(ch===','){row.push(cell);cell='';}
      else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
      else cell+=ch;
    }
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows.filter(r=>r.some(v=>String(v).trim()!==''));
}
function findCsvColumn(headers,candidates,kind){
  const h=headers.map(normalizeLookupText);
  for(const c of (candidates||[])){ const n=normalizeLookupText(c); const idx=h.indexOf(n); if(idx>=0)return idx; }
  if(kind==='name'){
    let i=h.findIndex(x=>x==='name'||x==='title'||x==='dc name'||x.includes('distribution center name'));
    if(i>=0)return i;
  } else {
    let i=h.findIndex(x=>x==='id'||x==='dc id'||x==='distribution center id'||x.includes('distribution center id'));
    if(i>=0)return i;
  }
  return -1;
}
async function loadRemoteAutocompleteRows(field){
  const source=field.source||{}; const url=String(source.url||'');
  if(!url) throw new Error(`${field.label||field.name}: remote source URL is missing.`);
  const ttl=Number(source.cacheMs||300000); const cached=remoteAutocompleteCache.get(url);
  if(cached && Date.now()-cached.at<ttl)return cached.rows;
  const res=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store',redirect:'follow'});
  if(!res.ok)throw new Error(`Could not load ${field.label||'remote list'} (${res.status}).`);
  const table=parseCsvText(await res.text()); if(table.length<2)throw new Error(`${field.label||'Remote list'} is empty.`);
  const headers=table[0];
  const normalizedHeaders=headers.map(normalizeLookupText);
  let nameIdx=source.nameColumn ? normalizedHeaders.indexOf(normalizeLookupText(source.nameColumn)) : findCsvColumn(headers,source.nameColumns||['Name','Distribution Center Name','DC Name'],'name');
  let idIdx=source.idColumn ? normalizedHeaders.indexOf(normalizeLookupText(source.idColumn)) : findCsvColumn(headers,source.idColumns||['ID','Distribution Center ID','DC ID'],'id');
  if(nameIdx<0 || idIdx<0){
    // Safe fallback: infer a mostly-text column for name and a mostly-numeric column for ID.
    const sample=table.slice(1,Math.min(table.length,41));
    const stats=headers.map((_,i)=>{const vals=sample.map(r=>String(r[i]??'').trim()).filter(Boolean);const numeric=vals.filter(v=>/^\d+(?:\.0+)?$/.test(v)).length;const avg=vals.length?vals.reduce((a,v)=>a+v.length,0)/vals.length:0;return {i,vals:vals.length,numericRatio:vals.length?numeric/vals.length:0,avg};});
    if(idIdx<0) idIdx=[...stats].sort((a,b)=>b.numericRatio-a.numericRatio||a.avg-b.avg)[0]?.i ?? -1;
    if(nameIdx<0) nameIdx=[...stats].filter(x=>x.i!==idIdx).sort((a,b)=>a.numericRatio-b.numericRatio||b.avg-a.avg)[0]?.i ?? -1;
  }
  if(nameIdx<0||idIdx<0)throw new Error(`Could not identify Name/ID columns. Headers: ${headers.join(', ')}`);
  const rows=table.slice(1).map(r=>({name:String(r[nameIdx]??'').trim(),id:String(r[idIdx]??'').trim()})).filter(x=>x.name&&x.id);
  remoteAutocompleteCache.set(url,{at:Date.now(),rows}); return rows;
}
function autocompleteRank(name,query){
  const n=normalizeLookupText(name), q=normalizeLookupText(query); const idx=n.indexOf(q);
  if(n===q)return 0;
  if(n.startsWith(q))return 10+(n.length-q.length)/1000;
  if(n.split(' ').some(w=>w.startsWith(q)))return 20+Math.max(0,idx)/100+(n.length-q.length)/1000;
  return 30+Math.max(0,idx)/100+(n.length-q.length)/1000;
}
function attachAutocompleteKeyboard(input,menu,selectButton){
  let active=-1;
  const items=()=>[...menu.querySelectorAll('.remote-autocomplete-item')];
  const mark=()=>items().forEach((b,i)=>b.classList.toggle('keyboard-active',i===active));
  input.addEventListener('keydown',e=>{
    const list=items();
    if(e.key==='ArrowDown'&&list.length){e.preventDefault();active=(active+1)%list.length;mark();list[active]?.scrollIntoView({block:'nearest'});}
    else if(e.key==='ArrowUp'&&list.length){e.preventDefault();active=(active<=0?list.length:active)-1;mark();list[active]?.scrollIntoView({block:'nearest'});}
    else if(e.key==='Enter'&&list.length&&!menu.classList.contains('hidden')){e.preventDefault();selectButton(list[active>=0?active:0]);active=-1;}
    else if(e.key==='Escape'){menu.classList.add('hidden');active=-1;}
  });
  return ()=>{active=-1;mark();};
}

function setupRemoteAutocomplete(field){
  const input=document.querySelector(`[data-input-name="${CSS.escape(field.name)}"]`); if(!input)return;
  const wrap=input.closest('.remote-autocomplete'); const menu=wrap?.querySelector('.remote-autocomplete-menu'); const loading=wrap?.querySelector('.remote-autocomplete-loading');
  let requestSeq=0;
  const close=()=>menu?.classList.add('hidden');
  const selectBtn=(btn)=>{input.value=btn.dataset.label||'';input.dataset.selectedValue=btn.dataset.value||'';input.dataset.selectedLabel=btn.dataset.label||'';close();input.dispatchEvent(new Event('change',{bubbles:true}));};
  const resetKeyboard=menu?attachAutocompleteKeyboard(input,menu,selectBtn):()=>{};
  const render=async()=>{
    const q=String(input.value||'').trim(); input.dataset.selectedValue=''; input.dataset.selectedLabel='';
    if(normalizeLookupText(q).length<Number(field.minChars||1)){close();return;}
    const seq=++requestSeq; loading?.classList.remove('hidden');
    try{
      const rows=await loadRemoteAutocompleteRows(field); if(seq!==requestSeq)return;
      const nq=normalizeLookupText(q);
      const matches=rows.filter(x=>normalizeLookupText(x.name).includes(nq)).sort((a,b)=>autocompleteRank(a.name,q)-autocompleteRank(b.name,q)||a.name.localeCompare(b.name));
      if(!menu)return;
      if(!matches.length){menu.innerHTML='<div class="remote-autocomplete-empty">No matching result</div>';menu.classList.remove('hidden');return;}
      const max=Number(field.maxResults||500);
      menu.innerHTML=matches.slice(0,max).map(x=>`<button type="button" class="remote-autocomplete-item" data-value="${escapeHtml(x.id)}" data-label="${escapeHtml(x.name)}"><span>${escapeHtml(x.name)}</span>${field.showId===false?'':`<small>ID ${escapeHtml(x.id)}</small>`}</button>`).join('');
      menu.classList.remove('hidden'); resetKeyboard();
      menu.querySelectorAll('.remote-autocomplete-item').forEach(btn=>btn.addEventListener('click',()=>selectBtn(btn)));
    }catch(e){ if(seq!==requestSeq)return; if(menu){menu.innerHTML=`<div class="remote-autocomplete-empty error">${escapeHtml(e.message||e)}</div>`;menu.classList.remove('hidden');} }
    finally{if(seq===requestSeq)loading?.classList.add('hidden');}
  };
  input.addEventListener('input',()=>{clearTimeout(input._remoteAcTimer);input._remoteAcTimer=setTimeout(render,Number(field.debounceMs||180));});
  input.addEventListener('focus',()=>{if(input.value)render();});
  document.addEventListener('click',e=>{if(wrap&&!wrap.contains(e.target))close();});
}

function setupRemoteMultiAutocomplete(field){
  const input=document.querySelector(`[data-input-name="${CSS.escape(field.name)}"]`); if(!input)return;
  const wrap=input.closest('.remote-multi-autocomplete'); const menu=wrap?.querySelector('.remote-autocomplete-menu'); const loading=wrap?.querySelector('.remote-autocomplete-loading'); const chips=wrap?.querySelector('.remote-multi-chips');
  let selected=[]; let requestSeq=0;
  const sync=()=>{input.dataset.selectedItems=JSON.stringify(selected); if(chips)chips.innerHTML=selected.map((x,i)=>`<span class="multi-chip"><span>${escapeHtml(x.name)}</span>${field.showSelectedId===false?'':`<small>ID ${escapeHtml(x.id)}</small>`}<button type="button" data-remove-index="${i}" aria-label="Remove ${escapeHtml(x.name)}">×</button></span>`).join(''); chips?.querySelectorAll('[data-remove-index]').forEach(b=>b.addEventListener('click',()=>{selected.splice(Number(b.dataset.removeIndex),1);sync();input.focus();})); input.dispatchEvent(new Event('change',{bubbles:true}));};
  const close=()=>menu?.classList.add('hidden');
  const selectBtn=(btn)=>{const id=btn.dataset.value||'',name=btn.dataset.label||''; if(id&&!selected.some(x=>String(x.id)===String(id)))selected.push({id,name}); input.value='';close();sync();};
  const resetKeyboard=menu?attachAutocompleteKeyboard(input,menu,selectBtn):()=>{};
  const render=async()=>{const q=String(input.value||'').trim(); if(normalizeLookupText(q).length<Number(field.minChars||1)){close();return;} const seq=++requestSeq;loading?.classList.remove('hidden');try{const rows=await loadRemoteAutocompleteRows(field);if(seq!==requestSeq)return;const nq=normalizeLookupText(q);const matches=rows.filter(x=>!selected.some(s=>String(s.id)===String(x.id))&&normalizeLookupText(x.name).includes(nq)).sort((a,b)=>autocompleteRank(a.name,q)-autocompleteRank(b.name,q)||a.name.localeCompare(b.name));if(!menu)return;if(!matches.length){menu.innerHTML='<div class="remote-autocomplete-empty">No matching result</div>';menu.classList.remove('hidden');return;}menu.innerHTML=matches.slice(0,Number(field.maxResults||500)).map(x=>`<button type="button" class="remote-autocomplete-item" data-value="${escapeHtml(x.id)}" data-label="${escapeHtml(x.name)}"><span>${escapeHtml(x.name)}</span>${field.showId===false?'':`<small>ID ${escapeHtml(x.id)}</small>`}</button>`).join('');menu.classList.remove('hidden');resetKeyboard();menu.querySelectorAll('.remote-autocomplete-item').forEach(btn=>btn.addEventListener('click',()=>selectBtn(btn)));}catch(e){if(seq!==requestSeq)return;if(menu){menu.innerHTML=`<div class="remote-autocomplete-empty error">${escapeHtml(e.message||e)}</div>`;menu.classList.remove('hidden');}}finally{if(seq===requestSeq)loading?.classList.add('hidden');}};
  if(field.allowRawValues===true){
    input.addEventListener('keydown',e=>{
      if(e.key!=='Enter')return;
      const raw=String(input.value||'').trim(); if(!raw)return;
      let splitter=/\s+/; try{if(field.rawSeparatorRegex)splitter=new RegExp(field.rawSeparatorRegex);}catch(_){}
      const parts=raw.split(splitter).map(x=>x.trim()).filter(Boolean);
      let pattern=null; try{if(field.rawPattern)pattern=new RegExp(field.rawPattern);}catch(_){}
      if(!parts.length || (pattern && !parts.every(x=>pattern.test(x))))return;
      e.preventDefault(); e.stopImmediatePropagation();
      for(const value of parts){ if(!selected.some(x=>String(x.id)===String(value))) selected.push({id:value,name:field.rawLabelMode==='value'?value:value}); }
      input.value=''; close(); sync();
    },true);
  }
  input.addEventListener('input',()=>{clearTimeout(input._remoteAcTimer);input._remoteAcTimer=setTimeout(render,Number(field.debounceMs||180));});
  input.addEventListener('focus',()=>{if(input.value)render();});
  input.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!input.value&&selected.length){selected.pop();sync();}});
  document.addEventListener('click',e=>{if(wrap&&!wrap.contains(e.target))close();});
  sync();
}

function jDiv(a,b){return Math.trunc(a/b);} function jMod(a,b){return a-jDiv(a,b)*b;}
function jalCal(jy){const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];let gy=jy+621,leapJ=-14,jp=breaks[0],jm=0,jump=0,n=0;if(jy<jp||jy>=breaks.at(-1))return{gy,march:20,leap:1};for(let i=1;i<breaks.length;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=jDiv(jump,33)*8+jDiv(jMod(jump,33),4);jp=jm;}n=jy-jp;leapJ+=jDiv(n,33)*8+jDiv(jMod(n,33)+3,4);if(jMod(jump,33)===4&&jump-n===4)leapJ++;const leapG=jDiv(gy,4)-jDiv((jDiv(gy,100)+1)*3,4)-150;const march=20+leapJ-leapG;if(jump-n<6)n=n-jump+jDiv(jump+4,33)*33;let leap=jMod(jMod(n+1,33)-1,4);if(leap===-1)leap=4;return{gy,march,leap};}
function g2d(gy,gm,gd){let d=jDiv((gy+jDiv(gm-8,6)+100100)*1461,4)+jDiv(153*jMod(gm+9,12)+2,5)+gd-34840408;d=d-jDiv(jDiv(gy+100100+jDiv(gm-8,6),100)*3,4)+752;return d;}
function d2g(jdn){let j=4*jdn+139361631;j=j+jDiv(jDiv(4*jdn+183187720,146097)*3,4)*4-3908;const i=jDiv(jMod(j,1461),4)*5+308;const gd=jDiv(jMod(i,153),5)+1,gm=jMod(jDiv(i,153),12)+1,gy=jDiv(j,1461)-100100+jDiv(8-gm,6);return{gy,gm,gd};}
function j2g(jy,jm,jd){const r=jalCal(jy);const jdn=g2d(r.gy,3,r.march)+(jm-1)*31-jDiv(jm,7)*(jm-7)+jd-1;return d2g(jdn);}
function jalaliWeekOffset(y,m){try{const g=j2g(y,m,1);return (new Date(Date.UTC(g.gy,g.gm-1,g.gd)).getUTCDay()+1)%7;}catch(_){return 0;}}
function currentJalaliParts(){
  try{const parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));return {y:Number(obj.year),m:Number(obj.month),d:Number(obj.day)};}catch(_){return {y:1405,m:1,d:1};}
}
function persianLeapYear(y){return jalCal(y).leap===0;}
function jalaliMonthDays(y,m){return m<=6?31:m<=11?30:(persianLeapYear(y)?30:29);}
function setupJalaliDatePicker(field){
  const input=document.querySelector(`[data-input-name="${CSS.escape(field.name)}"]`); if(!input)return; const wrap=input.closest('.jalali-picker-wrap'); const pop=wrap?.querySelector('.jalali-picker'); const toggle=wrap?.querySelector('.jalali-picker-toggle'); if(!pop||!toggle)return;
  const parsed=String(input.value||'').replace(/\D/g,''); const today=currentJalaliParts(); let state=parsed.length===8?{y:Number(parsed.slice(0,4)),m:Number(parsed.slice(4,6)),d:Number(parsed.slice(6,8))}:today;
  const close=()=>pop.classList.add('hidden');
  const render=()=>{const days=jalaliMonthDays(state.y,state.m);const selected=String(input.value||'').replace(/\D/g,'');const navLabel=`${state.y}/${String(state.m).padStart(2,'0')}`;pop.innerHTML=`<div class="jalali-cal-head"><button type="button" data-cal-prev aria-label="Previous month">‹</button><strong>${navLabel}</strong><button type="button" data-cal-next aria-label="Next month">›</button></div><div class="jalali-week"><span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span></div><div class="jalali-days">${'<span class="jalali-day-pad"></span>'.repeat(jalaliWeekOffset(state.y,state.m))}${Array.from({length:days},(_,i)=>{const d=i+1;const val=`${state.y}${String(state.m).padStart(2,'0')}${String(d).padStart(2,'0')}`;return `<button type="button" data-jday="${d}" class="${selected===val?'selected':''}">${d}</button>`}).join('')}</div><div class="jalali-cal-foot"><button type="button" data-cal-today>Today</button></div>`;pop.querySelector('[data-cal-prev]').onclick=(e)=>{e.preventDefault();e.stopPropagation();state.m--;if(state.m<1){state.m=12;state.y--;}render();};pop.querySelector('[data-cal-next]').onclick=(e)=>{e.preventDefault();e.stopPropagation();state.m++;if(state.m>12){state.m=1;state.y++;}render();};pop.querySelector('[data-cal-today]').onclick=()=>{state={...today};input.value=`${state.y}${String(state.m).padStart(2,'0')}${String(state.d).padStart(2,'0')}`;input.dispatchEvent(new Event('change',{bubbles:true}));close();};pop.querySelectorAll('[data-jday]').forEach(b=>b.onclick=()=>{state.d=Number(b.dataset.jday);input.value=`${state.y}${String(state.m).padStart(2,'0')}${String(state.d).padStart(2,'0')}`;input.dispatchEvent(new Event('change',{bubbles:true}));close();});};
  toggle.addEventListener('click',e=>{e.preventDefault();render();pop.classList.toggle('hidden');}); input.addEventListener('keydown',e=>{if(e.altKey&&e.key==='ArrowDown'){e.preventDefault();render();pop.classList.remove('hidden');}else if(e.key==='Escape')close();}); document.addEventListener('click',e=>{if(wrap&&!wrap.contains(e.target))close();});
}

function effectiveSubOperation(baseOp, subId='') {
  const subs=Array.isArray(baseOp?.subOperations)?baseOp.subOperations:[];
  if(!subs.length)return {...baseOp,subOperationId:''};
  const wanted=String(subId||baseOp.defaultSubOperation||subs[0]?.id||'');
  const sub=subs.find(x=>String(x.id)===wanted)||subs[0];
  return {...baseOp,...sub,id:baseOp.id,title:baseOp.title||sub.title,subOperationTitle:sub.title||sub.id,subOperationId:String(sub.id||''),subOperations:subs};
}
function renderOperationSubTabs(baseOp, activeId){
  const host=$('operationSubTabs');if(!host)return;
  const subs=Array.isArray(baseOp?.subOperations)?baseOp.subOperations:[];
  if(subs.length<2){host.innerHTML='';host.classList.add('hidden');return;}
  host.innerHTML=subs.map(s=>`<button type="button" class="operation-subtab ${String(s.id)===String(activeId)?'active':''}" data-subop="${escapeHtml(s.id)}">${escapeHtml(s.tabLabel||s.title||s.id)}</button>`).join('');
  host.classList.remove('hidden');
  host.querySelectorAll('[data-subop]').forEach(btn=>btn.addEventListener('click',()=>{
    if(operationRunning)return;
    renderOperationForm(currentBaseOperation||baseOp,String(btn.dataset.subop||''));
  }));
}

function renderOperationForm(op, subId='') {
  currentBaseOperation = op;
  op = effectiveSubOperation(op,subId);
  currentSubOperationId = op.subOperationId||'';
  currentOperation = op;
  initVoicePermissionBroker(); setVoicePermissionBrokerVisible(op.id==='voice-typing');
  operationRunning=runningOps.has(op.id); syncFlexControls(); if($('runOperation'))$('runOperation').disabled=operationRunning;
  $('operationTitle').textContent = op.title || op.id;
  const outputLabel={sheet:'Google Sheet',excel:'Excel',internal:'In-app result',none:'No published output'}[String(op?.output?.type||'')]||''; $('operationDescription').textContent = `${op.description || op.subtitle || ''}${outputLabel?` • Output: ${outputLabel}`:''}`;
  renderOperationSubTabs(currentBaseOperation||op,currentSubOperationId);
  $('runOperation').textContent = op.runLabel || 'Run';
  $('capacityStats').classList.add('hidden');
  const fields = Array.isArray(op.inputs) ? op.inputs : [];
  $('operationInputs').innerHTML = fields.map(field => {
    if (field.type === 'checkbox') {
      const checked = field.defaultChecked ? ' checked' : '';
      return `<div class="op-field-wrap op-checkbox-wrap" data-field-wrap="${escapeHtml(field.name)}"><label class="op-checkbox-label" for="op_${escapeHtml(field.name)}"><input id="op_${escapeHtml(field.name)}" data-input-name="${escapeHtml(field.name)}" type="checkbox"${checked}/><span>${escapeHtml(field.label || field.name)}</span></label>${field.help ? `<div class="field-help">${escapeHtml(field.help)}</div>` : ''}</div>`;
    }
    if (field.type === 'radio-group') {
      const def=String(field.default ?? field.options?.[0]?.value ?? field.options?.[0] ?? '');
      const opts=(field.options||[]).map(x=>typeof x==='object'?x:{value:x,label:x});
      return `<div class="op-field-wrap" data-field-wrap="${escapeHtml(field.name)}"><label>${escapeHtml(field.label||field.name)}</label><div class="choice-group">${opts.map(o=>`<label class="choice-option"><input data-input-name="${escapeHtml(field.name)}" type="radio" name="op_${escapeHtml(field.name)}" value="${escapeHtml(o.value)}"${String(o.value)===def?' checked':''}><span>${escapeHtml(o.label||o.value)}</span></label>`).join('')}</div>${field.help?`<div class="field-help">${escapeHtml(field.help)}</div>`:''}</div>`;
    }
    if (field.type === 'checkbox-group') {
      const defs=new Set((field.default||[]).map(String)); const opts=(field.options||[]).map(x=>typeof x==='object'?x:{value:x,label:x});
      return `<div class="op-field-wrap" data-field-wrap="${escapeHtml(field.name)}"><label>${escapeHtml(field.label||field.name)}</label><div class="choice-group">${opts.map(o=>`<label class="choice-option"><input data-input-name="${escapeHtml(field.name)}" data-group-value="${escapeHtml(o.value)}" type="checkbox"${defs.has(String(o.value))?' checked':''}><span>${escapeHtml(o.label||o.value)}</span></label>`).join('')}</div>${field.help?`<div class="field-help">${escapeHtml(field.help)}</div>`:''}</div>`;
    }
    if (field.type === 'download') {
      return `<div class="op-field-wrap op-download-wrap" data-field-wrap="${escapeHtml(field.name)}"><label>${escapeHtml(field.label||field.name)}</label><button class="save-button op-asset-download" type="button" data-download-asset="${escapeHtml(field.asset||'')}" data-download-name="${escapeHtml(field.filename||'template.xlsx')}">${escapeHtml(field.buttonLabel||'Download')}</button>${field.help?`<div class="field-help">${escapeHtml(field.help)}</div>`:''}</div>`;
    }
    if (field.type === 'file') {
      return `<div class="op-field-wrap" data-field-wrap="${escapeHtml(field.name)}"><label for="op_${escapeHtml(field.name)}">${escapeHtml(field.label||field.name)}</label><input class="file-input" id="op_${escapeHtml(field.name)}" data-input-name="${escapeHtml(field.name)}" type="file" accept="${escapeHtml(field.accept||'.xlsx')}"/>${field.help?`<div class="field-help">${escapeHtml(field.help)}</div>`:''}</div>`;
    }
    if (field.type === 'remote-autocomplete') {
      return `<div class="op-field-wrap" data-field-wrap="${escapeHtml(field.name)}"><label for="op_${escapeHtml(field.name)}">${escapeHtml(field.label||field.name)}</label><div class="remote-autocomplete"><input id="op_${escapeHtml(field.name)}" data-input-name="${escapeHtml(field.name)}" type="text" autocomplete="off" placeholder="${escapeHtml(field.placeholder||'Type to search…')}"/><div class="remote-autocomplete-loading hidden">Loading…</div><div class="remote-autocomplete-menu hidden"></div></div>${field.help?`<div class="field-help">${escapeHtml(field.help)}</div>`:''}</div>`;
    }
    if (field.type === 'remote-multi-autocomplete') {
      return `<div class="op-field-wrap" data-field-wrap="${escapeHtml(field.name)}"><label for="op_${escapeHtml(field.name)}">${escapeHtml(field.label||field.name)}</label><div class="remote-multi-autocomplete"><div class="remote-multi-chips"></div><div class="remote-autocomplete"><input id="op_${escapeHtml(field.name)}" data-input-name="${escapeHtml(field.name)}" type="text" autocomplete="off" placeholder="${escapeHtml(field.placeholder||'Type to add…')}"/><div class="remote-autocomplete-loading hidden">Loading…</div><div class="remote-autocomplete-menu hidden"></div></div></div>${field.help?`<div class="field-help">${escapeHtml(field.help)}</div>`:''}</div>`;
    }
    if (field.type === 'jalali-date') {
      return `<div class="op-field-wrap" data-field-wrap="${escapeHtml(field.name)}"><label for="op_${escapeHtml(field.name)}">${escapeHtml(field.label||field.name)}</label><div class="jalali-picker-wrap"><input id="op_${escapeHtml(field.name)}" data-input-name="${escapeHtml(field.name)}" type="text" inputmode="numeric" autocomplete="off" placeholder="${escapeHtml(field.placeholder||'14050101')}" maxlength="8"/><button type="button" class="jalali-picker-toggle" aria-label="Open Persian date picker">▦</button><div class="jalali-picker hidden"></div></div>${field.help?`<div class="field-help">${escapeHtml(field.help)}</div>`:''}</div>`;
    }
    const type = field.type === 'password' ? 'password' : (field.type === 'email' ? 'email' : 'text');
    const inputmode = field.inputMode || (field.type === 'number' || field.type === 'jalali-date' ? 'numeric' : 'text');
    const max = field.maxLength ? ` maxlength="${Number(field.maxLength)}"` : '';
    return `<div class="op-field-wrap" data-field-wrap="${escapeHtml(field.name)}"><label for="op_${escapeHtml(field.name)}">${escapeHtml(field.label || field.name)}</label><input id="op_${escapeHtml(field.name)}" data-input-name="${escapeHtml(field.name)}" type="${type}" inputmode="${escapeHtml(inputmode)}" placeholder="${escapeHtml(field.placeholder || '')}"${max}/>${field.help ? `<div class="field-help">${escapeHtml(field.help)}</div>` : ''}</div>`;
  }).join('');
  const currentFieldValue=(name)=>{ const nodes=[...document.querySelectorAll(`[data-input-name="${CSS.escape(name)}"]`)]; if(!nodes.length)return ''; if(nodes[0].type==='radio')return nodes.find(x=>x.checked)?.value||''; if(nodes[0].type==='checkbox')return !!nodes[0].checked; return nodes[0].value||''; };
  const applyVisibilityRules = () => {
    for (const field of fields) {
      if (field.type === 'checkbox' && Array.isArray(field.hideFields)) {
        const ctl = document.querySelector(`[data-input-name="${CSS.escape(field.name)}"]`);
        for (const target of field.hideFields) { const wrap=document.querySelector(`[data-field-wrap="${CSS.escape(target)}"]`); if(wrap)wrap.classList.toggle('hidden',!!ctl?.checked); }
      }
      if(field.showWhen){ const wrap=document.querySelector(`[data-field-wrap="${CSS.escape(field.name)}"]`); if(wrap)wrap.classList.toggle('hidden', currentFieldValue(field.showWhen.field)!==field.showWhen.equals); }
    }
  };
  document.querySelectorAll('#operationInputs input').forEach(el=>el.addEventListener('change',applyVisibilityRules));
  for(const field of fields.filter(f=>f.type==='remote-autocomplete')) setupRemoteAutocomplete(field);
  for(const field of fields.filter(f=>f.type==='remote-multi-autocomplete')) setupRemoteMultiAutocomplete(field);
  for(const field of fields.filter(f=>f.type==='jalali-date')) setupJalaliDatePicker(field);
  for(const field of fields.filter(f=>f.type==='checkbox-group')){ const boxes=[...document.querySelectorAll(`[data-input-name="${CSS.escape(field.name)}"]`)]; const all=boxes.find(x=>x.dataset.groupValue==='All'); boxes.forEach(b=>b.addEventListener('change',()=>{if(b===all&&b.checked)boxes.forEach(x=>{if(x!==all)x.checked=false});else if(b!==all&&b.checked&&all)all.checked=false;})); }
  document.querySelectorAll('[data-download-asset]').forEach(btn=>btn.addEventListener('click',async()=>{
    const old=btn.textContent; try{btn.disabled=true;btn.textContent='Downloading…';const url=remoteAssetUrl(btn.dataset.downloadAsset||'');const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`Template could not be downloaded (HTTP ${r.status}).`);const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=btn.dataset.downloadName||'template.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);btn.textContent='Downloaded';setTimeout(()=>btn.textContent=old,1000);}catch(e){setOperationStatus(e.message||String(e),'error');btn.textContent=old;}finally{btn.disabled=false;}}));
  applyVisibilityRules();
  $('operationResult')?.classList.add('hidden'); if($('operationResult'))$('operationResult').innerHTML='';
  showView('operation',{syncHash:false}); updateUrlState('operation',op.id,currentSubOperationId);
}

function collectOperationInputs(op) {
  const values = {};
  const getRule=(r)=>!r?false:values[r.field]===r.equals;
  for (const field of (op.inputs || [])) {
    if(field.type==='download') continue;
    const nodes=[...document.querySelectorAll(`[data-input-name="${CSS.escape(field.name)}"]`)];
    let value='';
    if(field.type==='checkbox') value=!!nodes[0]?.checked;
    else if(field.type==='radio-group') value=nodes.find(x=>x.checked)?.value||'';
    else if(field.type==='checkbox-group') value=nodes.filter(x=>x.checked).map(x=>x.dataset.groupValue||x.value);
    else if(field.type==='file') value=nodes[0]?.files?.[0]||null;
    else if(field.type==='remote-autocomplete') {
      value=String(nodes[0]?.dataset?.selectedValue||'').trim();
      if(!value && String(nodes[0]?.value||'').trim()) throw new Error(field.selectionMessage || `Please select ${field.label || field.name} from the list.`);
    }
    else if(field.type==='remote-multi-autocomplete') {
      try{value=JSON.parse(nodes[0]?.dataset?.selectedItems||'[]');}catch(_){value=[];}
      if(String(nodes[0]?.value||'').trim()) throw new Error(field.selectionMessage || `Press Enter or click a result to add ${field.label || field.name}.`);
    }
    else value=String(nodes[0]?.value||'').trim();
    const requiredUnless = field.requiredUnless ? !!values[field.requiredUnless] : false;
    const requiredWhen = field.requiredWhen ? getRule(field.requiredWhen) : false;
    if ((field.required || requiredWhen) && field.type !== 'checkbox' && ((field.type==='checkbox-group'||field.type==='remote-multi-autocomplete') ? !value.length : !value)) throw new Error(`${field.label || field.name} is required.`);
    if (field.requiredUnless && !requiredUnless && !value) throw new Error(`${field.label || field.name} is required.`);
    if (field.pattern && typeof value==='string' && value && !(new RegExp(field.pattern).test(String(value)))) throw new Error(field.validationMessage || `${field.label || field.name} is invalid.`);
    if (field.min !== undefined && value !== '' && Number(value) < Number(field.min)) throw new Error(field.validationMessage || `${field.label || field.name} must be at least ${field.min}.`);
    values[field.name] = value;
  }
  return values;
}

function formatNumber(value) { if (value===null||value===undefined||Number.isNaN(Number(value))) return '—'; return String(Math.round(Number(value))); }
function renderCapacityStats(stats) {
  $('capacityStats').classList.remove('hidden');
  $('statDays').textContent = stats.days ?? '—';
  $('statCapacityMin').textContent = formatNumber(stats.capacity?.min);
  $('statCapacityAvg').textContent = formatNumber(stats.capacity?.avg);
  $('statCapacityMax').textContent = formatNumber(stats.capacity?.max);
  $('statReservedMin').textContent = formatNumber(stats.reserved?.min);
  $('statReservedAvg').textContent = formatNumber(stats.reserved?.avg);
  $('statReservedMax').textContent = formatNumber(stats.reserved?.max);
}

async function autoValidateCredentialsIfDue(stored){
  const username=String(stored.opsUsername||'').trim();
  const password=String(stored.opsPassword||'');
  if(!username || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) return {ok:false,reason:'missing'};
  const validatedAt=Number(stored.opsValidatedAt||0);
  const sameUser=String(stored.opsValidatedUsername||'').toLowerCase()===username.toLowerCase();
  const fresh=stored.opsCredentialsValid===true && sameUser && validatedAt>0 && (Date.now()-validatedAt)<7*24*60*60*1000;
  if(fresh || stored.opsValidationMode==='exception') return {ok:true,fresh:true};
  try{
    const exception=await chrome.runtime.sendMessage({type:'CHECK_EXCEPTION_USER',email:username});
    if(exception?.ok && exception.exception){
      await chrome.storage.local.set({opsCredentialsValid:true,opsValidationMode:'exception',opsValidatedAt:Date.now()});
      return {ok:true,exception:true};
    }
  }catch(_){}
  if(!password){ await chrome.storage.local.set({opsCredentialsValid:false}); return {ok:false,reason:'password'}; }
  setValidationBusy(true); setSettingsStatus('');
  try{
    const response=await chrome.runtime.sendMessage({type:'VALIDATE_CREDENTIALS',username,password});
    if(!response?.ok || !response.valid){
      await chrome.storage.local.set({opsCredentialsValid:false});
      return {ok:false,reason:'invalid'};
    }
    await chrome.storage.local.set({opsCredentialsValid:true,opsValidatedUsername:username.toLowerCase(),opsValidationMode:'validated',opsValidatedAt:Date.now()});
    return {ok:true,validated:true};
  }catch(_){
    await chrome.storage.local.set({opsCredentialsValid:false});
    return {ok:false,reason:'invalid'};
  }finally{ setValidationBusy(false); }
}

async function fetchLiveCatalogVersion(){
  try{
    const url=new URL('../app.json',location.href);
    url.searchParams.set('_',String(Date.now()));
    const r=await fetch(url.href,{cache:'no-store',redirect:'follow'});
    if(!r.ok)return 0;
    const app=await r.json();
    return Number(app?.configVersion||0);
  }catch(_){return 0;}
}
async function loadRemote(force=false) {
  setStatus('Loading remote configuration…');
  // Structural rule: the Remote shell always forces the Host catalog to refresh.
  // New operations must never depend on a 5-minute Host cache before becoming visible.
  const liveVersion=await fetchLiveCatalogVersion();
  let response = await chrome.runtime.sendMessage({ type:'REFRESH_REMOTE_CONFIG', force:true });
  if (!response?.ok) throw new Error(response?.error || 'Remote configuration could not be loaded.');
  let loadedVersion=Number(response?.bundle?.app?.configVersion||0);
  const requiredVersion=Math.max(EXPECTED_REMOTE_CONFIG_VERSION,liveVersion||0);
  if(loadedVersion<requiredVersion){
    await new Promise(r=>setTimeout(r,350));
    const retry=await chrome.runtime.sendMessage({type:'REFRESH_REMOTE_CONFIG',force:true});
    if(retry?.ok){response=retry;loadedVersion=Number(retry?.bundle?.app?.configVersion||0);}
  }
  // Never brick the workspace because the Host still has an older catalog cached.
  // The shell can continue with the last usable bundle and the Host will refresh in the
  // background. Operation-specific compatibility/access checks still protect execution.
  if(loadedVersion<requiredVersion){
    response.bundle={...(response.bundle||{}),stale:true,remoteError:`Catalog ${loadedVersion||'unknown'} is behind live ${requiredVersion}. Background refresh will retry.`};
    setTimeout(()=>chrome.runtime.sendMessage({type:'REFRESH_REMOTE_CONFIG',force:true}).catch(()=>{}),1500);
  }
  remoteBundle = response.bundle;
  document.getElementById('hostCompatibilityGate')?.classList.add('compatible');
  renderRemoteBranding();
  renderThemeOptions();
  applyRemoteSettingsLabels();
  const stored = await chrome.storage.local.get(['opsTheme','opsUsername','opsPassword','opsCredentialsValid','opsValidatedUsername','opsValidationMode','opsValidatedAt','dxDiagnosticsEnabled']);
  applyRemoteTheme(stored.opsTheme || remoteBundle?.theme?.default || 'light');
  usernameEl.value = stored.opsUsername || '';
  passwordEl.value = stored.opsPassword || '';
  const validationResult=await autoValidateCredentialsIfDue(stored);
  if(validationResult?.reason==='invalid'){
    setSettingsStatus('Stored password is no longer valid. Please update it.','error');
    showView('settings');
  }
  const meta = remoteBundle.app || {};
  $('remoteMeta').textContent = `Config ${meta.configVersion ?? '—'} • fetched ${new Date(remoteBundle.fetchedAt).toLocaleString()}${remoteBundle.stale ? ' • cached/offline' : ''}`;
  $('versionInfo').textContent = `Engine ${ENGINE_VERSION} • Config ${meta.configVersion ?? '—'}`;
  await refreshOperationVisibility(stored.opsUsername || ''); await refreshSystemStatus(); await renderActivityLog(); await refreshDiagnosticsPreview();
}

$('settingsBtn').addEventListener('click', () => showView('settings'));
$('settingsHomeBtn')?.addEventListener('click', goHomeView);
$('operationHomeBtn')?.addEventListener('click', goHomeView);
$('backBtn')?.addEventListener('click', goBackView);
$('operationBackBtn')?.addEventListener('click', goBackView);
$('togglePassword').addEventListener('click', (e) => { const visible=passwordEl.type==='text'; passwordEl.type=visible?'password':'text'; e.currentTarget.textContent=visible?'Show':'Hide'; });
$('refreshRemote').addEventListener('click', async () => { try { const r=await chrome.runtime.sendMessage({type:'REFRESH_REMOTE_CONFIG'}); if(!r?.ok) throw new Error(r?.error||'Remote configuration could not be refreshed.'); location.reload(); } catch(e){ showToast(e.message,'error'); } });
$('rollbackRemote').addEventListener('click', async()=>{try{const r=await chrome.runtime.sendMessage({type:'ROLLBACK_REMOTE_CONFIG'});if(!r?.ok)throw new Error(r?.error||'Rollback failed.');location.reload();}catch(e){showToast(e.message,'error')}});
$('clearActivityLog').addEventListener('click',async()=>{await chrome.storage.local.remove(['opsActivityLog']);await renderActivityLog();showToast('Activity log cleared.','success')});
$('openAgentsSettings')?.addEventListener('click',async()=>{try{await openOperationById('data-set-update');}catch(e){showToast(e.message,'error');}});
async function refreshDiagnosticsPreview(){
  const r=await chrome.runtime.sendMessage({type:'GET_DIAGNOSTICS'}); if(!r?.ok)return;
  const box=$('diagnosticsPreview'),toggle=$('diagnosticsEnabled');if(toggle)toggle.checked=!!r.enabled;
  const rows=(r.rows||[]).slice(0,15); if(box){box.classList.toggle('hidden',!rows.length);box.textContent=rows.length?rows.map(x=>`${new Date(x.at).toLocaleString()} • ${x.opId||'system'} • ${x.type||''}${x.action?` • ${x.action}`:''}${x.error?`\n${x.error}`:''}${x.url?`\n${x.url}`:''}`).join('\n\n'):'No diagnostic events yet.';}
}
$('diagnosticsEnabled')?.addEventListener('change',async e=>{const r=await chrome.runtime.sendMessage({type:'SET_DIAGNOSTICS_ENABLED',enabled:!!e.target.checked});$('diagnosticsStatus').textContent=r?.ok?(e.target.checked?'Diagnostic Mode enabled.':'Diagnostic Mode disabled.'):(r?.error||'Could not update diagnostics.');await refreshDiagnosticsPreview();});
$('testLgAccess')?.addEventListener('click',async()=>{const el=$('diagnosticsStatus');el.textContent='Testing LG access…';const r=await chrome.runtime.sendMessage({type:'TEST_LG_ACCESS'});el.textContent=r?.ok?`LG reachable • HTTP ${r.status} • ${r.elapsedMs} ms${r.authenticated?' • session looks active':' • sign-in may be required'}`:`LG test failed: ${r?.error||'Unknown error'}`;el.className=`settings-status ${r?.ok?'ok':'error'}`;});
$('clearDiagnostics')?.addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'CLEAR_DIAGNOSTICS'});await refreshDiagnosticsPreview();showToast('Diagnostics cleared.','success');});
$('exportDiagnostics')?.addEventListener('click',async()=>{const r=await chrome.runtime.sendMessage({type:'GET_DIAGNOSTICS'});if(!r?.ok)return showToast(r?.error||'Could not read diagnostics.','error');const payload={exportedAt:new Date().toISOString(),engineVersion:ENGINE_VERSION,configVersion:remoteBundle?.app?.configVersion||null,diagnostics:r.rows||[]};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`digiexpress-diagnostics-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);showToast('Diagnostics exported.','success');});
$('clearRemoteCache')?.addEventListener('click',async()=>{const r=await chrome.runtime.sendMessage({type:'CLEAR_REMOTE_CACHE'});if(!r?.ok)return showToast(r?.error||'Could not clear remote cache.','error');showToast('Remote cache cleared. Reloading…','success');setTimeout(()=>location.reload(),500);});
$('cancelOperation').addEventListener('click',async()=>{
  if(isFlexBatchOperation()&&operationRunning){flexCancelRequested=true;flexPauseRequested=false;flexPaused=false;if(flexResumeResolver){flexResumeResolver();flexResumeResolver=null;}syncFlexControls();setOperationStatus('Cancelling… preparing partial report.');await chrome.runtime.sendMessage({type:'CANCEL_OPERATION',op:currentOperation?.id});return;}
  await chrome.runtime.sendMessage({type:'CANCEL_OPERATION',op:currentOperation?.id});setOperationRunning(false);setOperationStatus('Operation cancelled.','error');setProgress('Cancelled',true);await finishActivity('error','OP-CANCEL');showToast('Operation cancelled.','error')
});
$('pauseOperation')?.addEventListener('click',async()=>{
  if(!operationRunning||!isFlexBatchOperation()||flexCancelRequested)return;
  if(flexPaused||flexPauseRequested){flexPaused=false;flexPauseRequested=false;syncFlexControls();if(flexResumeResolver){flexResumeResolver();flexResumeResolver=null;}setOperationStatus('Resuming… the current row will be repeated from the beginning.');return;}
  flexPauseRequested=true;flexPaused=true;syncFlexControls();setOperationStatus('Pausing… the current row will be repeated after Resume.');await chrome.runtime.sendMessage({type:'CANCEL_OPERATION',op:currentOperation?.id});
});

$('saveSettings').addEventListener('click', async () => {
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  if (!username || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) return setSettingsStatus('A valid access email is required.', 'error');
  await chrome.storage.local.set({ opsTheme:selectedTheme, opsCredentialsValid:false });
  await chrome.storage.local.remove(['opsPassword','opsValidatedUsername','opsValidationMode','opsValidatedAt']);
  setValidationBusy(true); setSettingsStatus('');
  try {
    const exception = await chrome.runtime.sendMessage({ type:'CHECK_EXCEPTION_USER', email:username });
    if (!exception?.ok) throw new Error(exception?.error || 'Could not verify exception status.');
    if (exception.exception) {
      const values={opsTheme:selectedTheme,opsUsername:username,opsCredentialsValid:true,opsValidationMode:'exception',opsValidatedAt:Date.now()};
      if(password) values.opsPassword=password;
      await chrome.storage.local.set(values); if(!password) await chrome.storage.local.remove(['opsPassword']);
      setSettingsStatus('Settings saved.','ok'); showToast('Settings saved.','success'); await refreshOperationVisibility(username); return;
    }
    if(!password) throw new Error('Username and password are invalid.');
    const response=await chrome.runtime.sendMessage({type:'VALIDATE_CREDENTIALS',username,password});
    if(!response?.ok||!response.valid){ await chrome.storage.local.remove(['opsPassword','opsValidatedUsername','opsValidationMode','opsValidatedAt']); await chrome.storage.local.set({opsCredentialsValid:false}); passwordEl.value=''; throw new Error('Username and password are invalid.'); }
    await chrome.storage.local.set({opsTheme:selectedTheme,opsUsername:username,opsPassword:password,opsCredentialsValid:true,opsValidatedUsername:username.toLowerCase(),opsValidationMode:'validated',opsValidatedAt:Date.now()});
    setSettingsStatus('Username and password are valid.','ok'); showToast('Username and password are valid.','success'); await refreshOperationVisibility(username);
  } catch(error) {
    const msg=String(error?.message||'Username and password are invalid.');
    const safe=msg.toLowerCase().includes('database')||msg.toLowerCase().includes('exception')?msg:'Username and password are invalid.';
    setSettingsStatus(safe,'error'); showToast(safe,'error');
  } finally { setValidationBusy(false); }
});

$('clearCredentials').addEventListener('click', async () => {
  if(validationInProgress) return;
  await chrome.storage.local.remove(['opsUsername','opsPassword','opsCredentialsValid','opsValidatedUsername','opsValidationMode','opsValidatedAt']);
  usernameEl.value=''; passwordEl.value=''; passwordEl.type='password'; $('togglePassword').textContent='Show'; menu.innerHTML='';
  setSettingsStatus('Username and password cleared.','ok'); showToast('Username and password cleared.','success'); setStatus('Set your email in Settings to load available operations.');
});

$('smartSidebarItems')?.addEventListener('click',(event)=>{const b=event.target.closest('[data-smart-op]');if(!b)return;const card=menu.querySelector(`[data-op="${CSS.escape(String(b.dataset.smartOp))}"]`);if(card)card.click();});

async function openOperationById(opId,subId=''){
  const catalogOp=(remoteBundle?.operations||[]).find(x=>String(x.id)===String(opId)); if(!catalogOp)throw new Error(`Operation not found: ${opId}`);
  if(String(catalogOp.id)==='authenticator'){
    setStatus('Loading secure Authenticator…');
    const loaded=await chrome.runtime.sendMessage({type:'GET_REMOTE_OPERATION',op:catalogOp.id});
    const op={...catalogOp,...(loaded?.operation||{}),id:catalogOp.id};
    renderOperationForm(op,subId);
    const frame=document.getElementById('authenticatorFrame');
    if(!frame)throw new Error('Authenticator frame is unavailable.');
    if(frame.dataset.hostAuthenticatorLoaded!=='1'){
      const local=await globalThis.DigiExpressPlatform.call('localPage.getUrl',{path:'authenticator.html'});
      const localUrl=String(local?.url||'');
      if(!localUrl.startsWith('chrome-extension://'))throw new Error('Secure Authenticator URL is unavailable. Reload Host 13.0.4 and retry.');
      const u=new URL(localUrl);u.searchParams.set('embedded','1');u.searchParams.set('v','13.0.4');
      frame.src=u.href;frame.dataset.hostAuthenticatorLoaded='1';
    }
    setStatus('Ready');
    return true;
  }
  setStatus(`Loading ${catalogOp.title||catalogOp.id}…`);
  const loaded=await chrome.runtime.sendMessage({type:'GET_REMOTE_OPERATION',op:catalogOp.id}); if(!loaded?.ok)throw new Error(loaded?.error||'Could not load the remote operation.');
  const op={...catalogOp,...(loaded.operation||{}),id:catalogOp.id};
  if((Array.isArray(op.inputs)&&op.inputs.length)||(Array.isArray(op.subOperations)&&op.subOperations.length)){renderOperationForm(op,subId);setStatus('Ready');return true;}
  await checkOperationAccess(op.id); const response=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:op.id,inputs:{}}); if(!response?.ok)throw new Error(response?.error||'Could not start operation.'); setStatus(`${op.title||op.id} started.`,'ok');return true;
}

async function handleOperationCardClick(event){
  const fav=event.target.closest('[data-favorite-op]');
  if(fav){event.preventDefault();event.stopPropagation();await toggleFavorite(fav.dataset.favoriteOp);return;}
  const openButton=event.target.closest('.op-card-open');
  const card=(openButton||event.target).closest?.('[data-op]'); if(!card)return;
  const catalogOp=(remoteBundle.operations||[]).find(x=>String(x.id)===String(card.dataset.op)); if(!catalogOp)return;
  recordOperationUsage(catalogOp.id).catch(()=>{});
  card.classList.add('is-loading');
  try {
    await openOperationById(catalogOp.id);
  } catch(error){ if(isAccessDeniedError(error)){showToast(error.message,'error');setStatus('Ready');}else setStatus(error.message,'error'); }
  finally { setTimeout(()=>card.classList.remove('is-loading'),700); }
}
menu.addEventListener('click',handleOperationCardClick);
document.getElementById('favoritesGrid')?.addEventListener('click',handleOperationCardClick);


function remoteAssetUrl(path){ try{return new URL(path,remoteBundle?.baseUrl||'https://nhabibifardigikala.github.io/PlanningExtension/').href;}catch(_){return path;} }
function pointInRing(lat,lng,ring){ let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const yi=Number(ring[i]?.[0]),xi=Number(ring[i]?.[1]), yj=Number(ring[j]?.[0]),xj=Number(ring[j]?.[1]); if(!Number.isFinite(xi+yi+xj+yj))continue; const hit=((yi>lat)!==(yj>lat)) && (lng < (xj-xi)*(lat-yi)/((yj-yi)||1e-15)+xi); if(hit)inside=!inside; } return inside; }
function pointInCoordinateSet(lat,lng,coords){ if(!Array.isArray(coords))return false; return coords.some(r=>Array.isArray(r)&&r.length>=3&&pointInRing(lat,lng,r)); }
function parseCoordinateText(text){ const parts=String(text||'').split(',').map(x=>x.trim()); if(parts.length!==2)throw new Error('Enter coordinates as latitude, longitude.'); const lat=Number(parts[0]),lng=Number(parts[1]); if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180)throw new Error('Latitude or longitude is invalid.'); return {lat,lng}; }
function selectedNatureTypes(values,cfg){ let names=Array.isArray(values[cfg.filterField])?values[cfg.filterField]:[]; const all=cfg.allOption||'All'; const map=cfg.natureMap||{}; if(names.includes(all))names=Object.keys(map); return names.filter(x=>map[x]!=null); }
function findParentsForPoint(lat,lng,dataset,typeNames,cfg){ const out={}; const map=cfg.natureMap||{}; for(const name of typeNames){ const nid=Number(map[name]); const matches=[]; for(const row of (dataset.rows||[])){ if(Number(row.natureId)!==nid)continue; if(pointInCoordinateSet(lat,lng,row.coordinates))matches.push(row); } out[name]=matches; } return out; }
function mercatorWorld(lat,lng,z){const scale=256*Math.pow(2,z);const x=(lng+180)/360*scale;const s=Math.sin(Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180);const y=(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale;return{x,y};}
function matchedPolygonRings(result){const rings=[];for(const ms of Object.values(result||{}))for(const row of (ms||[]))for(const r of (row.coordinates||[]))if(Array.isArray(r)&&r.length>=3)rings.push(r);return rings;}
function renderParentMap(host,lat,lng,result,cfg={}){
  if(!host||cfg.map?.enabled===false)return; const rings=matchedPolygonRings(result); const pts=[[lat,lng],...rings.flat().map(p=>[Number(p?.[0]),Number(p?.[1])]).filter(p=>Number.isFinite(p[0]+p[1]))]; let minLat=Math.min(...pts.map(p=>p[0])),maxLat=Math.max(...pts.map(p=>p[0])),minLng=Math.min(...pts.map(p=>p[1])),maxLng=Math.max(...pts.map(p=>p[1]));if(!Number.isFinite(minLat+maxLat+minLng+maxLng)){minLat=lat-.02;maxLat=lat+.02;minLng=lng-.02;maxLng=lng+.02;} if(maxLat-minLat<.002){minLat-=.01;maxLat+=.01;}if(maxLng-minLng<.002){minLng-=.01;maxLng+=.01;}
  host.innerHTML='<div class="geo-map-stage"></div><div class="geo-map-controls"><button type="button" data-map-in>+</button><button type="button" data-map-out>−</button></div><div class="geo-map-attrib">© OpenStreetMap contributors</div>'; const stage=host.querySelector('.geo-map-stage'); let z=13;
  const w=Math.max(300,Math.round(host.clientWidth||520)),h=300; for(let zz=16;zz>=5;zz--){const a=mercatorWorld(maxLat,minLng,zz),b=mercatorWorld(minLat,maxLng,zz);if(Math.abs(b.x-a.x)<w*.78&&Math.abs(b.y-a.y)<h*.72){z=zz;break;}}
  const draw=()=>{stage.innerHTML='';const center=mercatorWorld((minLat+maxLat)/2,(minLng+maxLng)/2,z);const left=center.x-w/2,top=center.y-h/2; const x0=Math.floor(left/256),x1=Math.floor((left+w)/256),y0=Math.floor(top/256),y1=Math.floor((top+h)/256);for(let tx=x0;tx<=x1;tx++)for(let ty=y0;ty<=y1;ty++){const img=document.createElement('img');img.className='geo-map-tile';img.alt='';img.draggable=false;img.src=`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;img.style.left=`${tx*256-left}px`;img.style.top=`${ty*256-top}px`;stage.appendChild(img);} const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','geo-map-overlay');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);for(const ring of rings){const poly=document.createElementNS(svg.namespaceURI,'polygon');poly.setAttribute('points',ring.map(p=>{const q=mercatorWorld(Number(p[0]),Number(p[1]),z);return `${q.x-left},${q.y-top}`}).join(' '));poly.setAttribute('class','geo-parent-polygon');svg.appendChild(poly);} const q=mercatorWorld(lat,lng,z);const c=document.createElementNS(svg.namespaceURI,'circle');c.setAttribute('cx',q.x-left);c.setAttribute('cy',q.y-top);c.setAttribute('r','6');c.setAttribute('class','geo-location-marker');svg.appendChild(c);stage.appendChild(svg);};
  host.querySelector('[data-map-in]').onclick=()=>{z=Math.min(18,z+1);draw();};host.querySelector('[data-map-out]').onclick=()=>{z=Math.max(3,z-1);draw();};host.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)<2)return;e.preventDefault();z=Math.max(3,Math.min(18,z+(e.deltaY<0?1:-1)));draw();},{passive:false});draw();
}
function renderParentResult(lat,lng,result,typeNames,cfg={}){ const el=$('operationResult'); if(!el)return; const rows=typeNames.map(t=>{const ms=result[t]||[]; const names=ms.length?ms.map(x=>x.name??'').filter(Boolean).join(' | '):'Not found'; const ids=ms.length?ms.map(x=>x.dcId??'').filter(x=>x!==''&&x!=null).join(' | '):'—'; return `<tr><td>${escapeHtml(t)}</td><td>${escapeHtml(names)}</td><td>${escapeHtml(ids)}</td></tr>`;}).join(''); const h=cfg.output?.headers||['Type','Name','ID']; el.innerHTML=`<div class="field-help parent-coordinate-label">${escapeHtml(lat)}, ${escapeHtml(lng)}</div><div id="parentMap" class="geo-map"></div><table class="result-table"><thead><tr><th>${escapeHtml(h[0]||'Type')}</th><th>${escapeHtml(h[1]||'Name')}</th><th>${escapeHtml(h[2]||'ID')}</th></tr></thead><tbody>${rows}</tbody></table>`; el.classList.remove('hidden'); renderParentMap(el.querySelector('#parentMap'),lat,lng,result,cfg); }

async function inflateZipEntry(bytes,method){ if(method===0)return bytes; if(method!==8)throw new Error(`Unsupported XLSX compression method: ${method}`); const ds=new DecompressionStream('deflate-raw'); const ab=await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer(); return new Uint8Array(ab); }
async function readZipEntries(file){ const u8=new Uint8Array(await file.arrayBuffer()); const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength); let eocd=-1; for(let i=u8.length-22;i>=Math.max(0,u8.length-66000);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}} if(eocd<0)throw new Error('Invalid XLSX file.'); const count=dv.getUint16(eocd+10,true), centralOffset=dv.getUint32(eocd+16,true); let p=centralOffset; const dec=new TextDecoder(); const out={}; for(let n=0;n<count;n++){ if(dv.getUint32(p,true)!==0x02014b50)break; const method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true), nameLen=dv.getUint16(p+28,true), extraLen=dv.getUint16(p+30,true), commentLen=dv.getUint16(p+32,true), localOff=dv.getUint32(p+42,true); const name=dec.decode(u8.subarray(p+46,p+46+nameLen)); const ln=dv.getUint16(localOff+26,true), le=dv.getUint16(localOff+28,true), dataOff=localOff+30+ln+le; out[name]=await inflateZipEntry(u8.subarray(dataOff,dataOff+csize),method); p+=46+nameLen+extraLen+commentLen; } return out; }
function xmlText(bytes){return new TextDecoder().decode(bytes||new Uint8Array());}
function excelColIndex(ref){ const m=String(ref||'').match(/^([A-Z]+)/i); if(!m)return 0; let n=0; for(const ch of m[1].toUpperCase())n=n*26+ch.charCodeAt(0)-64; return n-1; }
async function readFirstTwoExcelColumns(file){ const entries=await readZipEntries(file); const parser=new DOMParser(); let shared=[]; if(entries['xl/sharedStrings.xml']){ const d=parser.parseFromString(xmlText(entries['xl/sharedStrings.xml']),'application/xml'); shared=[...d.getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent||'').join('')); } const sheetKey=Object.keys(entries).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(k)).sort()[0]; if(!sheetKey)throw new Error('No worksheet was found in the Excel file.'); const doc=parser.parseFromString(xmlText(entries[sheetKey]),'application/xml'); const rows=[]; for(const r of [...doc.getElementsByTagName('row')]){ const vals=[]; for(const c of [...r.getElementsByTagName('c')]){ const idx=excelColIndex(c.getAttribute('r')); if(idx>1)continue; const t=c.getAttribute('t'); let v=''; if(t==='inlineStr')v=[...c.getElementsByTagName('t')].map(x=>x.textContent||'').join(''); else {const vn=c.getElementsByTagName('v')[0]; v=vn?vn.textContent:''; if(t==='s')v=shared[Number(v)]??'';} vals[idx]=v; } if((vals[0]??'')!==''||(vals[1]??'')!=='')rows.push([vals[0]??'',vals[1]??'']); } if(rows.length&&(!Number.isFinite(Number(rows[0][0]))||!Number.isFinite(Number(rows[0][1]))))rows.shift(); return rows; }

async function readExcelTable(file){
  const entries=await readZipEntries(file), parser=new DOMParser(); let shared=[];
  if(entries['xl/sharedStrings.xml']){const d=parser.parseFromString(xmlText(entries['xl/sharedStrings.xml']),'application/xml');shared=[...d.getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent||'').join(''));}
  const sheetKey=Object.keys(entries).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(k)).sort()[0];if(!sheetKey)throw new Error('No worksheet was found in the Excel file.');
  const doc=parser.parseFromString(xmlText(entries[sheetKey]),'application/xml'), raw=[];
  for(const rr of [...doc.getElementsByTagName('row')]){const vals=[];for(const c of [...rr.getElementsByTagName('c')]){const idx=excelColIndex(c.getAttribute('r')),t=c.getAttribute('t');let v='';if(t==='inlineStr')v=[...c.getElementsByTagName('t')].map(x=>x.textContent||'').join('');else{const vn=c.getElementsByTagName('v')[0];v=vn?vn.textContent:'';if(t==='s')v=shared[Number(v)]??'';else if(t==='b')v=String(v)==='1'?'1':'0';}vals[idx]=v;}if(vals.some(v=>String(v??'').trim()!==''))raw.push(vals);}
  if(!raw.length)return{headers:[],rows:[]};const headers=raw.shift().map(v=>String(v??'').trim());const rows=raw.map(r=>headers.map((_,i)=>r[i]??''));return{headers,rows};
}
async function readExcelTwoColumnRows(file,cfg={}){
  const entries=await readZipEntries(file),parser=new DOMParser();let shared=[];
  if(entries['xl/sharedStrings.xml']){const d=parser.parseFromString(xmlText(entries['xl/sharedStrings.xml']),'application/xml');shared=[...d.getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent||'').join(''));}
  const sheetKey=Object.keys(entries).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(k)).sort()[0];if(!sheetKey)throw new Error('No worksheet was found in the Excel file.');
  const doc=parser.parseFromString(xmlText(entries[sheetKey]),'application/xml'),rows=[];
  for(const rr of [...doc.getElementsByTagName('row')]){const vals=['',''];for(const c of [...rr.getElementsByTagName('c')]){const idx=excelColIndex(c.getAttribute('r'));if(idx>1)continue;const t=c.getAttribute('t');let v='';if(t==='inlineStr')v=[...c.getElementsByTagName('t')].map(x=>x.textContent||'').join('');else{const vn=c.getElementsByTagName('v')[0];v=vn?vn.textContent:'';if(t==='s')v=shared[Number(v)]??'';}vals[idx]=String(v??'').trim();}if(vals[0]||vals[1])rows.push(vals);}
  const aliases=(cfg.headerAliases||['email','personnel code','personal code','identifier','user','ایمیل','کد پرسنلی','role id','role ids','roles']).map(x=>String(x).trim().toLowerCase());
  if(rows.length&&rows[0].some(v=>aliases.some(a=>String(v).toLowerCase().includes(a))))rows.shift();
  return rows;
}

async function runSingleOrExcelWorkflowProcessor(op,values){
  const cfg=op.clientProcessor||{},mode=String(values[cfg.modeField||'inputMode']||'single'),items=[];
  if(mode==='excel'){
    const file=values[cfg.fileField||'inputFile'];if(!file)throw new Error('Excel file is required.');
    const rows=await readExcelTwoColumnRows(file,cfg.excel||{});for(const row of rows)items.push({identifier:String(row[0]??'').trim(),roleIds:String(row[1]??'').trim()});
  }else items.push({identifier:String(values[cfg.identifierField||'userIdentifier']||'').trim(),roleIds:String(values[cfg.rolesField||'roleIds']||'').trim()});
  if(!items.length)throw new Error('No input rows were found.');
  const reportHeaders=cfg.reportHeaders||['User','Role ID','Status','Message'];
  const baseRows=[],outcomes=new Map();let reportRows=[],succeeded=0,failed=0;
  const host=$('operationResult');host.classList.remove('hidden');
  const rebuild=()=>{
    reportRows=[...baseRows];
    [...outcomes.keys()].sort((x,y)=>x-y).forEach(k=>reportRows.push(...(outcomes.get(k)||[])));
    succeeded=reportRows.filter(r=>String(r[2])==='Success').length;failed=reportRows.length-succeeded;
    renderLive();
  };
  const renderLive=()=>{host.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${succeeded} successful • ${failed} failed</strong><div class="field-help">${reportRows.length} role assignment result${reportRows.length===1?'':'s'} • background-safe</div></div><button id="workflowReportDownload" class="save-button compact" type="button" ${reportRows.length?'':'disabled'}>${escapeHtml(cfg.downloadButtonLabel||'Download Report')}</button></div><div class="table-scroll role-live-scroll"><table class="result-table"><thead><tr>${reportHeaders.map(x=>`<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${reportRows.map(r=>`<tr>${r.map(x=>`<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;const button=host.querySelector('#workflowReportDownload');if(button)button.onclick=async()=>{const exp=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers:reportHeaders,rows:reportRows,sheetName:cfg.sheetName||'Results',filename:cfg.filename||'role_assignment_results.xlsx',saveAs:false,rowFills:reportRows.map(r=>String(r[2])==='Success'?(cfg.successFill||'C6EFCE'):(cfg.failureFill||'FFC7CE'))});if(!exp?.ok)setOperationStatus(exp?.error||'Could not download report.','error');};const sc=host.querySelector('.role-live-scroll');if(sc)requestAnimationFrame(()=>{sc.scrollTop=sc.scrollHeight;});};
  const batchItems=[];
  for(let i=0;i<items.length;i++){
    const item=items[i];
    if(!item.identifier||!/\S/.test(item.roleIds)){baseRows.push([item.identifier,'','Failed','Identifier or role IDs are empty']);continue;}
    if(!item.identifier.includes('@')&&!/^\d+$/.test(item.identifier)){for(const roleId of item.roleIds.split(/\s+/).filter(Boolean))baseRows.push([item.identifier,roleId,'Failed','Personnel code must contain digits only']);continue;}
    if(!/^\s*\d+(?:\s+\d+)*\s*$/.test(item.roleIds)){baseRows.push([item.identifier,item.roleIds,'Failed','Role IDs must be numeric and separated by spaces']);continue;}
    const workflowInputs={userIdentifier:item.identifier,roleIds:item.roleIds};for(const field of(cfg.passthroughFields||[]))workflowInputs[field]=values[field];if(op.subOperationId)workflowInputs.__subOperationId=op.subOperationId;
    batchItems.push({inputs:workflowInputs,meta:{identifier:item.identifier,roleIds:item.roleIds,sourceIndex:i}});
  }
  rebuild();
  if(!batchItems.length){setOperationStatus(`Completed: ${succeeded} successful, ${failed} failed.`,failed?'':'ok');setProgress('Done',true);return{records:reportRows.length,succeeded,failed};}
  const jobId=`role-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const rowsFromOutcome=(outcome)=>{
    const meta=outcome?.meta||{},identifier=String(meta.identifier||''),roles=String(meta.roleIds||'').split(/\s+/).filter(Boolean);
    if(!outcome?.ok)return roles.map(roleId=>[identifier,roleId,'Failed',String(outcome?.error||'Role assignment failed.')]);
    const rows=outcome?.result?.rows||[];
    if(rows.length)return rows.map(row=>[identifier,...row]);
    return roles.map(roleId=>[identifier,roleId,'Failed','No role result was returned']);
  };
  const listener=(message)=>{
    if(message?.type!=='REMOTE_BATCH_STATUS'||message.jobId!==jobId)return;
    if(message.phase==='item-started'){
      const name=message.meta?.identifier||'';setOperationStatus(`Processing user ${Number(message.index||0)+1}/${message.total}: ${name}…`);
      const fill=$('progressFill');if(fill)fill.style.width=`${Math.round((Number(message.completed||0)/Math.max(1,Number(message.total||1)))*100)}%`;
    }else if(message.phase==='item-completed'&&message.outcome){
      outcomes.set(Number(message.index||0),rowsFromOutcome(message.outcome));rebuild();
      const fill=$('progressFill');if(fill)fill.style.width=`${Math.round((Number(message.completed||0)/Math.max(1,Number(message.total||1)))*100)}%`;
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  try{
    setOperationStatus(`Background job started for ${batchItems.length} user${batchItems.length===1?'':'s'}. You can switch tabs or minimize this window.`);
    const response=await chrome.runtime.sendMessage({type:'RUN_REMOTE_BATCH_JOB',jobId,op:op.id,items:batchItems,options:{executionMode:'background'}});
    if(!response?.ok)throw new Error(response?.error||'Background Role Assignment job failed.');
    for(const outcome of(response.job?.results||[]))outcomes.set(Number(outcome.index||0),rowsFromOutcome(outcome));
    rebuild();
    if(response.job?.status==='cancelled')throw new Error('OP-CANCEL');
  }finally{chrome.runtime.onMessage.removeListener(listener);}
  setOperationStatus(`Completed: ${succeeded} successful, ${failed} failed.`,failed?'':'ok');setProgress('Done',true);return{records:reportRows.length,succeeded,failed};
}

function excelBatchBool(v){if(v===true||v===false)return v;const s=String(v??'').trim().toLowerCase();return ['1','true','yes','y'].includes(s);}
function excelBatchEmpty(v){return v==null||String(v).trim()==='';}
function excelBatchValidate(mapped,cfg){const labels=cfg.labels||{};for(const f of(cfg.required||[]))if(excelBatchEmpty(mapped[f]))return `${labels[f]||f} is empty`;for(const group of(cfg.atLeastOne||[]))if(!group.some(f=>excelBatchBool(mapped[f])))return 'At least one weekday must be selected';for(const pair of(cfg.mutuallyExclusive||[]))if(pair.length>=2&&excelBatchBool(mapped[pair[0]])&&excelBatchBool(mapped[pair[1]]))return 'Pickup Reservable and Delivery Reservable cannot both be True';return'';}
function flexResultMarkup(counts,cfg){return `<div class="capacity-result-toolbar"><div><strong>${counts.total} row${counts.total===1?'':'s'} in report</strong><div class="field-help">${counts.done} done • ${counts.failed} failed • ${counts.notProcessed||0} not processed</div></div><button id="downloadFlexResult" type="button" class="save-button compact">${escapeHtml(cfg.downloadButtonLabel||'Download Result')}</button></div>`;}
async function runExcelBatchWorkflowProcessor(op,values){
  const cfg=op.clientProcessor||{}, file=values[cfg.fileField||'capacityFile'];
  if(!file)throw new Error('Excel file is required.');
  flexPauseRequested=false;flexPaused=false;flexCancelRequested=false;syncFlexControls();
  setOperationStatus('Reading Excel file…');
  const table=await readExcelTable(file);if(!table.headers.length||!table.rows.length)throw new Error('No data rows were found in the Excel file.');
  const headerIndex=new Map(table.headers.map((h,i)=>[String(h).trim().toLowerCase(),i])), cmap=cfg.columnMap||{}, bools=new Set(cfg.booleanFields||[]), output=[];
  let done=0,failed=0,notProcessed=0,cancelled=false;
  const tabSessionEnabled=cfg.tabSession?.enabled===true && cfg.tabSession?.reuseForBatch!==false;
  const batchSessionId=tabSessionEnabled?`flex-${op.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`:'';
  const notProcessedText=cfg.result?.notProcessedText||'Not processed (cancelled)';
  const liveCfg=cfg.liveReport&&typeof cfg.liveReport==='object'?cfg.liveReport:null;
  const exportFlexResult=async(button)=>{const rcfg=cfg.result||{},b=button,old=b?.textContent||'';try{if(b){b.disabled=true;b.textContent='Preparing Excel…';}const headers=[...table.headers,rcfg.resultColumn||'Result'];const ts=new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);const fn=String(rcfg.filename||'flex_capacity_result_{{timestamp}}.xlsx').replace('{{timestamp}}',ts);const rowFills=output.map(r=>String(r.at(-1)||'').includes(rcfg.successText||'Done')?(rcfg.successFill||'C6EFCE'):(rcfg.failureFill||'FFC7CE'));const exp=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers,rows:output,sheetName:rcfg.sheetName||'Results',filename:fn,saveAs:false,rowFills});if(!exp?.ok)throw new Error(exp?.error||'Could not create result Excel file.');if(b){b.textContent='Downloaded';setTimeout(()=>b.textContent=old,1200);}}catch(e){setOperationStatus(e.message||String(e),'error');if(b)b.textContent=old;}finally{if(b)b.disabled=false;}};
  const renderFlexLive=()=>{
    const rcfg=cfg.result||{},el=$('operationResult');if(!el)return;
    const processed=done+failed, total=table.rows.length, pct=total?Math.round((processed/total)*100):0;
    let tableHtml='';
    if(liveCfg?.enabled!==false){
      const cols=Array.isArray(liveCfg?.columns)&&liveCfg.columns.length?liveCfg.columns:null;
      const headers=cols?cols.map(c=>c.header||c.label||c.field||''):[...(liveCfg?.includeInputColumns===false?[]:table.headers),liveCfg?.statusHeader||'Status'];
      const rows=output.map((row,ri)=>{const raw=table.rows[ri]||[],result=row.at(-1)||'';const mapped={};for(const [key,spec] of Object.entries(cmap)){let idx;if(spec&&typeof spec==='object'){const aliases=[...(Array.isArray(spec.headers)?spec.headers:[]),spec.header].filter(Boolean).map(x=>String(x).trim().toLowerCase());for(const alias of aliases){if(headerIndex.has(alias)){idx=headerIndex.get(alias);break;}}if(idx===undefined&&Number.isInteger(Number(spec.index)))idx=Number(spec.index);}else idx=headerIndex.get(String(spec).trim().toLowerCase());mapped[key]=idx===undefined?'':raw[idx];}
        const success=String(result).includes(rcfg.successText||'Done');
        if(cols)return cols.map(c=>c.result===true||c.field==='__result__'?(success?(c.successText||'Success'):(c.failureText||'Failed')):c.resultMessage===true?result:(c.field&&Object.prototype.hasOwnProperty.call(mapped,c.field)?mapped[c.field]:(Number.isInteger(Number(c.index))?raw[Number(c.index)]??'':'')));
        return [...raw,success?'Success':'Failed'];
      });
      tableHtml=`<div class="table-scroll flex-live-scroll" style="max-height:${Math.max(180,Number(liveCfg?.maxHeight||340))}px;overflow:auto"><table class="result-table"><thead><tr>${headers.map(x=>`<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,idx)=>`<tr data-live-row="${idx}">${r.map(x=>`<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    el.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${processed} / ${total} ${escapeHtml(liveCfg?.itemLabel||'items')} processed</strong><div class="field-help">${done} successful • ${failed} failed${notProcessed?` • ${notProcessed} not processed`:''}</div></div><button id="downloadFlexResult" type="button" class="save-button compact" ${output.length?'':'disabled'}>${escapeHtml(rcfg.downloadButtonLabel||'Download Result')}</button></div>${tableHtml}`;el.classList.remove('hidden');
    const b=el.querySelector('#downloadFlexResult');if(b)b.onclick=()=>exportFlexResult(b);
    if(liveCfg?.autoScroll!==false){const sc=el.querySelector('.flex-live-scroll');if(sc)requestAnimationFrame(()=>{sc.scrollTop=sc.scrollHeight;const last=sc.querySelector('tbody tr:last-child');last?.scrollIntoView?.({block:'nearest'});});}
    const fill=$('progressFill')||$('progressBar');if(fill)fill.style.width=`${Math.min(100,Math.max(0,pct))}%`;const txt=$('progressText');if(txt){txt.classList.remove('hidden');txt.textContent=`${pct}% • ${processed} of ${total} ${liveCfg?.itemLabel||'items'} processed • ${done} successful • ${failed} failed`;}
  };
  const finalizeReport=async()=>{renderFlexLive();};
  renderFlexLive();
  for(let i=0;i<table.rows.length;i++){
    const raw=table.rows[i];
    if(flexCancelRequested){cancelled=true;for(let j=i;j<table.rows.length;j++){output.push([...table.rows[j],notProcessedText]);notProcessed++;}break;}
    const mapped={};for(const [key,spec] of Object.entries(cmap)){
      let idx;
      if(spec && typeof spec==='object'){
        const aliases=[...(Array.isArray(spec.headers)?spec.headers:[]),spec.header].filter(Boolean).map(x=>String(x).trim().toLowerCase());
        for(const alias of aliases){if(headerIndex.has(alias)){idx=headerIndex.get(alias);break;}}
        if(idx===undefined && Number.isInteger(Number(spec.index)))idx=Number(spec.index);
      }else idx=headerIndex.get(String(spec).trim().toLowerCase());
      mapped[key]=idx===undefined?'':raw[idx];if(bools.has(key))mapped[key]=excelBatchBool(mapped[key]);
    }
    let resultText=excelBatchValidate(mapped,cfg.validation||{});
    if(resultText){failed++;output.push([...raw,resultText]);renderFlexLive();continue;}
    let rowFinished=false;
    while(!rowFinished){
      if(flexCancelRequested){cancelled=true;resultText=notProcessedText;notProcessed++;rowFinished=true;break;}
      if(flexPauseRequested||flexPaused){flexPaused=true;flexPauseRequested=false;syncFlexControls();await waitForFlexResume();if(flexCancelRequested){cancelled=true;resultText=notProcessedText;notProcessed++;rowFinished=true;break;}setOperationStatus(`Resuming row ${i+1}/${table.rows.length} from the beginning…`);}
      let success=false, repeatRow=false, attempt=0;
      const confirmationText=String(cfg.result?.confirmationText||cfg.result?.existingText||'Existing capacity slot');
      const repeatUntilConfirmation=cfg.result?.repeatUntilConfirmation===true;
      while(!success){
        attempt++;
        if(flexCancelRequested){cancelled=true;resultText=notProcessedText;notProcessed++;rowFinished=true;break;}
        if(flexPauseRequested||flexPaused){repeatRow=true;break;}
        setOperationStatus(`Processing row ${i+1}/${table.rows.length} • attempt ${attempt}${repeatUntilConfirmation?' • waiting for confirmation':`/${cfg.maxRetries||5}`}…`);
        try{
          const resp=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:op.id,inputs:mapped,awaitCompletion:true,silentDone:true,sessionId:batchSessionId});
          if(flexCancelRequested){cancelled=true;resultText=notProcessedText;notProcessed++;rowFinished=true;break;}
          if(flexPauseRequested||flexPaused){repeatRow=true;break;}
          if(!resp?.ok)throw new Error(resp?.error||'Form submission failed due to invalid field value');
          resultText=String(resp?.result?.doneText||'Save status unclear (no alert found).').trim()||'Save status unclear (no alert found).';
          if(resultText.includes(confirmationText)){
            success=true;done++;rowFinished=true;
            const successText=String(cfg.result?.successText||'Done');
            if(cfg.result?.preserveConfirmationMessage===true)resultText=`${successText} - ${resultText}`;
            else resultText=successText;
            break;
          }
          if(!repeatUntilConfirmation && resultText===String(cfg.result?.successText||'Done')){success=true;done++;rowFinished=true;break;}
        }catch(e){
          if(flexCancelRequested){cancelled=true;resultText=notProcessedText;notProcessed++;rowFinished=true;break;}
          if(flexPauseRequested||flexPaused||/cancelled/i.test(String(e?.message||e||''))){repeatRow=!!(flexPauseRequested||flexPaused);if(repeatRow)break;}
          resultText='Form submission failed due to invalid field value';
        }
        if(!repeatUntilConfirmation && attempt>=Number(cfg.maxRetries||5))break;
        await new Promise(r=>setTimeout(r,Number(cfg.retryDelayMs||2000)));
      }
      if(rowFinished)break;
      if(repeatRow){flexPaused=true;flexPauseRequested=false;syncFlexControls();await waitForFlexResume();if(flexCancelRequested){cancelled=true;resultText=notProcessedText;notProcessed++;rowFinished=true;break;}continue;}
      if(!success){failed++;rowFinished=true;}
    }
    output.push([...raw,resultText||'Form submission failed due to invalid field value']);
    renderFlexLive();
    if(cancelled){for(let j=i+1;j<table.rows.length;j++){output.push([...table.rows[j],notProcessedText]);notProcessed++;}renderFlexLive();break;}
    await new Promise(r=>setTimeout(r,0));
  }
  if(batchSessionId && (cfg.tabSession?.closeOnFinish!==false || cancelled || flexCancelRequested)){try{await chrome.runtime.sendMessage({type:'CLOSE_REMOTE_SESSION',sessionId:batchSessionId});}catch(_){}}
  await finalizeReport();
  if(cancelled||flexCancelRequested){setOperationStatus(`Cancelled. Report ready: ${done} done, ${failed} failed, ${notProcessed} not processed.`,'error');setProgress('Cancelled',true);return{records:output.length,cancelled:true,done,failed,notProcessed};}
  setOperationStatus(`Completed: ${done} done, ${failed} failed.`,'ok');setProgress('Done',true);return{records:output.length,cancelled:false,done,failed,notProcessed};
}

async function runPointInPolygonProcessor(op,values){ const cfg=op.clientProcessor||{}; const typeNames=selectedNatureTypes(values,cfg); if(!typeNames.length)throw new Error('Select at least one expected parent type.'); setOperationStatus('Loading polygon data…'); setProgress('Loading polygon data…'); const res=await fetch(`${remoteAssetUrl(cfg.dataset)}${String(cfg.dataset).includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'}); if(!res.ok)throw new Error(`Polygon data could not be loaded (HTTP ${res.status}).`); const dataset=await res.json(); const mode=values[cfg.modeField]; if(mode==='single'){ const {lat,lng}=parseCoordinateText(values[cfg.singleField]); setOperationStatus('Determining parent…'); const result=findParentsForPoint(lat,lng,dataset,typeNames,cfg); renderParentResult(lat,lng,result,typeNames,cfg); setOperationStatus('Parent determination completed.','ok'); setProgress('Done',true); return {records:1}; }
  const file=values[cfg.fileField]; if(!file)throw new Error('Excel file is required.'); setOperationStatus('Reading Excel file…'); const points=await readFirstTwoExcelColumns(file); if(!points.length)throw new Error('No latitude/longitude rows were found in the Excel file.'); const headers=['Latitude','Longitude','Status']; for(const t of typeNames)headers.push(`${t} Parent Name`,`${t} DC ID`); const output=[]; for(let i=0;i<points.length;i++){ if(!operationRunning)throw new Error('OP-CANCEL'); const lat=Number(points[i][0]),lng=Number(points[i][1]); const row=[points[i][0],points[i][1]]; if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180){row.push('Invalid coordinate'); for(const t of typeNames)row.push('',''); output.push(row);continue;} const result=findParentsForPoint(lat,lng,dataset,typeNames,cfg); const any=typeNames.some(t=>(result[t]||[]).length); row.push(any?'Matched':'No parent found'); for(const t of typeNames){const ms=result[t]||[]; row.push(ms.length?ms.map(x=>x.name??'').filter(Boolean).join(' | '):'Not found',ms.length?ms.map(x=>x.dcId??'').filter(x=>x!==''&&x!=null).join(' | '):'');} output.push(row); if(i%25===0){const pct=Math.min(92,15+Math.round((i/points.length)*75)); if($('progressBar'))$('progressBar').style.width=`${pct}%`; if($('progressText'))$('progressText').textContent=`${pct}% • Processing ${i+1} of ${points.length} locations…`; await new Promise(r=>setTimeout(r,0));} }
  setOperationStatus('Creating Excel output…'); const exp=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers,rows:output,sheetName:'Parent Determination',filename:`parent_determination_${new Date().toISOString().slice(0,10).replaceAll('-','')}.xlsx`}); if(!exp?.ok)throw new Error(exp?.error||'Could not create Excel output.'); setOperationStatus(`Completed: ${output.length} locations.`,'ok'); setProgress('Done',true); return {records:output.length}; }

function normalizedHeaderIndex(headers,aliases){const hs=(headers||[]).map(normalizeLookupText);for(const a of (aliases||[])){const i=hs.indexOf(normalizeLookupText(a));if(i>=0)return i;}return -1;}
function capacitySeries(report,cfg={}){const headers=report.headers||[],rows=report.rows||[];let di=normalizedHeaderIndex(headers,cfg.dateAliases||['date','day','capacity date','تاریخ']);if(di<0)di=0;const ci=normalizedHeaderIndex(headers,cfg.capacityAliases||['capacity']);const ri=normalizedHeaderIndex(headers,cfg.reservedAliases||['capacity reserved','reserved capacity','capacity_reserved']);return rows.map(r=>({date:String(r[di]??''),capacity:ci>=0?Number(String(r[ci]??'').replace(/[^\d.-]/g,'')):NaN,reserved:ri>=0?Number(String(r[ri]??'').replace(/[^\d.-]/g,'')):NaN})).filter(x=>x.date&&(Number.isFinite(x.capacity)||Number.isFinite(x.reserved)));}
function renderInteractiveLineChart(host,series,title='Capacity trend',options={}){
  if(!host)return; if(!series.length){host.innerHTML='<div class="chart-empty">No chart data.</div>';return;}
  const pointSpacing=Math.max(18,Number(options.pointSpacing||29));
  const available=Math.max(320,Math.floor(host.clientWidth||host.parentElement?.clientWidth||620));
  const natural=Math.max(320,series.length*pointSpacing);
  const W=options.fillAvailable===false ? Math.max(620,natural) : Math.max(available,natural);
  const H=330,p={l:58,r:24,t:34,b:102};const vals=series.flatMap(x=>[x.capacity,x.reserved]).filter(Number.isFinite);let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=1;max+=1;}const x=i=>p.l+(series.length===1?(W-p.l-p.r)/2:(i/(series.length-1))*(W-p.l-p.r));const y=v=>p.t+(max-v)/(max-min)*(H-p.t-p.b);const line=(key)=>series.map((s,i)=>Number.isFinite(s[key])?`${i?'L':'M'} ${x(i).toFixed(1)} ${y(s[key]).toFixed(1)}`:'').join(' ');let grid='';for(let k=0;k<5;k++){const yy=p.t+k*(H-p.t-p.b)/4;const vv=max-k*(max-min)/4;grid+=`<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" class="chart-grid"/><text x="${p.l-8}" y="${yy+4}" class="chart-y" text-anchor="end">${Math.round(vv)}</text>`;}const points=(key,cls)=>series.map((s,i)=>Number.isFinite(s[key])?`<circle class="chart-point ${cls}" cx="${x(i)}" cy="${y(s[key])}" r="4" data-date="${escapeHtml(s.date)}" data-value="${Math.round(s[key])}" data-series="${key==='capacity'?'Capacity':'Capacity Reserved'}"></circle>`:'').join('');const labels=series.map((s,i)=>`<text class="chart-x" transform="translate(${x(i)},${H-p.b+20}) rotate(90)" text-anchor="start">${escapeHtml(s.date)}</text>`).join('');host.innerHTML=`<div class="chart-head"><strong>${escapeHtml(title)}</strong><div class="chart-legend"><span><i class="legend-capacity"></i>Capacity</span><span><i class="legend-reserved"></i>Capacity Reserved</span></div></div><div class="chart-scroll"><div class="chart-canvas" style="width:${W}px"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${grid}<path d="${line('capacity')}" class="chart-line capacity-line"/><path d="${line('reserved')}" class="chart-line reserved-line"/>${points('capacity','capacity-point')}${points('reserved','reserved-point')}${labels}</svg><div class="chart-tooltip hidden"></div></div></div>`;const tip=host.querySelector('.chart-tooltip');host.querySelectorAll('.chart-point').forEach(pt=>{pt.addEventListener('mouseenter',()=>{tip.textContent=`${pt.dataset.series} • ${pt.dataset.date}: ${pt.dataset.value}`;tip.classList.remove('hidden');const box=pt.getBoundingClientRect(),base=host.querySelector('.chart-canvas').getBoundingClientRect();tip.style.left=`${box.left-base.left+8}px`;tip.style.top=`${box.top-base.top-34}px`;});pt.addEventListener('mouseleave',()=>tip.classList.add('hidden'));});
}
function capacityStatMarkup(stats){return `<div class="capacity-summary"><div class="capacity-summary-days"><span>Report days</span><strong>${escapeHtml(stats?.days??'—')}</strong></div><div class="capacity-metric-block"><span>Capacity</span><div class="capacity-metric-values"><div class="stat-min"><small>Min</small><strong>${formatNumber(stats?.capacity?.min)}</strong></div><div><small>Average</small><strong>${formatNumber(stats?.capacity?.avg)}</strong></div><div class="stat-max"><small>Max</small><strong>${formatNumber(stats?.capacity?.max)}</strong></div></div></div><div class="capacity-metric-block"><span>Capacity Reserved</span><div class="capacity-metric-values"><div class="stat-min"><small>Min</small><strong>${formatNumber(stats?.reserved?.min)}</strong></div><div><small>Average</small><strong>${formatNumber(stats?.reserved?.avg)}</strong></div><div class="stat-max"><small>Max</small><strong>${formatNumber(stats?.reserved?.max)}</strong></div></div></div></div>`;}
function capacityCombinedExcelData(reports){
  const union=[]; const seen=new Set();
  for(const r of reports){for(const h of (r.headers||[])){const key=String(h??'').trim().toLowerCase();if(!seen.has(key)){seen.add(key);union.push(String(h??''));}}}
  const headers=['Distribution Center','Distribution Center ID','From Date','To Date',...union];
  const rows=[];
  for(const r of reports){const map=new Map((r.headers||[]).map((h,i)=>[String(h??'').trim().toLowerCase(),i]));for(const row of (r.rows||[])){rows.push([r.center?.name??'',r.center?.id??'',r.fromDate??'',r.toDate??'',...union.map(h=>{const i=map.get(String(h).trim().toLowerCase());return i===undefined?'':row[i];})]);}}
  return {headers,rows};
}
async function downloadCombinedCapacityExcel(reports,op){
  const cfg=op.clientProcessor?.excel||{}; const data=capacityCombinedExcelData(reports); if(!data.rows.length)throw new Error('No capacity rows are available for Excel export.');
  const first=reports[0]||{}; const from=first.fromDate||'',to=first.toDate||''; const filename=String(cfg.filename||`capacity_report_${from}_${to}.xlsx`).replace('{{fromDate}}',from).replace('{{toDate}}',to);
  const resp=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers:data.headers,rows:data.rows,sheetName:cfg.sheetName||'Capacity Report',filename,saveAs:false}); if(!resp?.ok)throw new Error(resp?.error||'Could not create Capacity Excel file.'); return resp;
}
function renderCapacityReports(reports,op){
  const el=$('operationResult');if(!el)return;
  const view=op.clientProcessor?.resultView||{},excelCfg=op.clientProcessor?.excel||{};const dashLabel=view.dashboardButtonLabel||'Open dashboard';
  el.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${reports.length} Distribution Center${reports.length===1?'':'s'}</strong><div class="field-help">Each center and Time Scope is shown separately.</div></div><div class="capacity-result-actions">${excelCfg.enabled===false?'':`<button id="downloadCapacityExcel" type="button" class="save-button compact">${escapeHtml(excelCfg.buttonLabel||'Download Excel')}</button>`}<button id="openCapacityDashboard" type="button" class="save-button compact">${escapeHtml(dashLabel)}</button></div></div><div id="capacityReportCards"></div>`;
  el.classList.remove('hidden');const cards=el.querySelector('#capacityReportCards');
  for(const [idx,r] of reports.entries()){
    const card=document.createElement('section');card.className='capacity-report-card';
    const groups=capacityTimeScopeGroups(r,view);
    card.innerHTML=`<div class="capacity-report-title"><div><strong>${escapeHtml(r.center.name)}</strong><small>ID ${escapeHtml(r.center.id)} • ${groups.length} Time Scope${groups.length===1?'':'s'}</small></div><span>${escapeHtml(r.fromDate)} → ${escapeHtml(r.toDate)}</span></div><div class="capacity-timescope-list"></div>`;
    cards.appendChild(card);const list=card.querySelector('.capacity-timescope-list');
    groups.forEach((g,gi)=>{const sec=document.createElement('section');sec.className='capacity-timescope-card';sec.innerHTML=`<div class="capacity-timescope-title"><strong>Time Scope: ${escapeHtml(g.timeScope)}</strong></div>${capacityStatMarkup(g.stats)}<div class="capacity-chart-host" data-chart-index="${idx}-${gi}"></div>`;list.appendChild(sec);renderInteractiveLineChart(sec.querySelector('.capacity-chart-host'),capacitySeries(g,view),`${r.center.name} • ${g.timeScope}`,{pointSpacing:view.chartPointSpacing||29,fillAvailable:view.chartFillAvailable!==false});});
  }
  el.querySelector('#downloadCapacityExcel')?.addEventListener('click',async()=>{const b=el.querySelector('#downloadCapacityExcel');try{b.disabled=true;b.textContent='Preparing Excel…';await downloadCombinedCapacityExcel(reports,op);setOperationStatus('Capacity Excel downloaded.','ok');}catch(e){setOperationStatus(e.message||String(e),'error');}finally{b.disabled=false;b.textContent=excelCfg.buttonLabel||'Download Excel';}});
  el.querySelector('#openCapacityDashboard').addEventListener('click',async()=>{const b=el.querySelector('#openCapacityDashboard');try{b.disabled=true;await chrome.storage.local.set({capacityDashboardData:{savedAt:Date.now(),reports,view,excelCfg,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()}});const opened=await chrome.runtime.sendMessage({type:'OPEN_CAPACITY_DASHBOARD'});if(!opened?.ok)throw new Error(opened?.error||'Could not open dashboard.');setOperationStatus('Dashboard opened.','ok');}catch(e){setOperationStatus(e.message||String(e),'error');}finally{b.disabled=false;}});
}
function capacityMetricStats(headers,rows,view,days){const sr=capacitySeries({headers,rows},view);const calc=key=>{const a=sr.map(x=>x[key]).filter(Number.isFinite);if(!a.length)return{min:null,avg:null,max:null};return{min:Math.min(...a),avg:a.reduce((x,y)=>x+y,0)/a.length,max:Math.max(...a)}};return{days,capacity:calc('capacity'),reserved:calc('reserved')}}
function capacityTimeScopeGroups(report,view={}){
  const headers=report.headers||[],rows=report.rows||[];
  const aliases=view.timeScopeAliases||['time scope','time_scope','timescope','time slot','time_slot'];
  const ti=normalizedHeaderIndex(headers,aliases);
  if(ti<0)return[{timeScope:'All',rows,headers,stats:capacityMetricStats(headers,rows,view,uniqueCapacityDays(headers,rows,view))}];
  const groups=new Map();
  for(const row of rows){const raw=String(row[ti]??'').trim();const key=raw||'Unspecified';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return [...groups.entries()].map(([timeScope,rr])=>({timeScope,rows:rr,headers,stats:capacityMetricStats(headers,rr,view,uniqueCapacityDays(headers,rr,view))}));
}
function uniqueCapacityDays(headers,rows,view={}){let di=normalizedHeaderIndex(headers,view.dateAliases||['date','day','capacity date','تاریخ']);if(di<0)di=0;return new Set((rows||[]).map(r=>String(r[di]??'').trim()).filter(Boolean)).size||'—';}
function partitionCapacityRowsByCenters(headers,rows,centers,grouping={}){
  const idAliases=grouping.idAliases||['distribution center id','dc id','distribution_center_id'];
  const nameAliases=grouping.nameAliases||['distribution center','distribution center name','dc name','dc'];
  const ii=normalizedHeaderIndex(headers,idAliases),ni=normalizedHeaderIndex(headers,nameAliases);
  const meta=(centers||[]).map((center,index)=>({index,center,id:String(center?.id??'').trim(),name:normalizeLookupText(center?.name)}));
  const buckets=meta.map(()=>[]),unassigned=[];
  const escRe=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const idMatches=(value)=>{const x=String(value??'').trim();if(!x)return[];return meta.filter(m=>m.id&&(x===m.id||new RegExp(`(^|\D)${escRe(m.id)}(\D|$)`).test(x)));};
  const nameMatches=(value)=>{const x=normalizeLookupText(value);if(!x)return[];const exact=meta.filter(m=>m.name&&x===m.name);if(exact.length)return exact;const partial=meta.filter(m=>m.name&&(x.includes(m.name)||m.name.includes(x)));if(partial.length<=1)return partial;const longest=Math.max(...partial.map(m=>m.name.length));return partial.filter(m=>m.name.length===longest);};
  for(const row of (rows||[])){
    let candidates=[];
    if(ii>=0)candidates=idMatches(row[ii]);
    if(candidates.length!==1&&ni>=0){const n=nameMatches(row[ni]);if(n.length)candidates=n;}
    if(candidates.length!==1&&grouping.allowRowScanFallback!==false){
      const ids=[]; for(const cell of row){for(const m of idMatches(cell))if(!ids.includes(m))ids.push(m);} if(ids.length===1)candidates=ids;
      if(candidates.length!==1){const names=[];for(const cell of row){for(const m of nameMatches(cell))if(!names.includes(m))names.push(m);}if(names.length===1)candidates=names;}
    }
    if(candidates.length===1)buckets[candidates[0].index].push(row);else unassigned.push(row);
  }
  return {buckets,unassigned,idColumnIndex:ii,nameColumnIndex:ni};
}

async function runCapacityCentersIndividually(op,values,centers,cfg){const reports=[];let totalRows=0;for(let i=0;i<centers.length;i++){if(!operationRunning)throw new Error('OP-CANCEL');const center=centers[i];setOperationStatus(`Running capacity report ${i+1}/${centers.length}: ${center.name}…`);const resp=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:op.id,inputs:{...values,dcId:String(center.id),dcName:center.name},awaitCompletion:true,silentDone:true});if(!resp?.ok)throw new Error(resp?.error||`Capacity report failed for ${center.name}.`);const result=resp.result||{};totalRows+=Number(result.records||result.rows?.length||0);reports.push({center,fromDate:values[cfg.fromField||'fromDate'],toDate:values[cfg.toField||'toDate'],headers:result.headers||[],rows:result.rows||[],stats:result.stats||{}});}return{reports,totalRows};}
async function runMultiCapacityProcessor(op,values){const cfg=op.clientProcessor||{};const centers=values[cfg.centerField||'dcIds'];if(!Array.isArray(centers)||!centers.length)throw new Error('Select at least one Distribution Center.');let reports=[],totalRows=0;const batch=cfg.batchCenters||{};if(batch.enabled!==false&&centers.length){if(!operationRunning)throw new Error('OP-CANCEL');const joined=centers.map(x=>String(x.id??'').trim()).filter(Boolean).join(String(batch.separator??' '));setOperationStatus(`Running one capacity query for ${centers.length} Distribution Centers…`);const resp=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:op.id,inputs:{...values,dcId:joined,dcName:centers.map(x=>x.name).join(' | ')},awaitCompletion:true,silentDone:true});if(!resp?.ok)throw new Error(resp?.error||'Combined Capacity Report failed.');const result=resp.result||{},headers=result.headers||[],rows=result.rows||[],days=result.stats?.days??'—',grouping=batch.grouping||{};totalRows=Number(result.records||rows.length||0);if(centers.length===1){reports=[{center:centers[0],fromDate:values[cfg.fromField||'fromDate'],toDate:values[cfg.toField||'toDate'],headers,rows,stats:capacityMetricStats(headers,rows,cfg.resultView||{},days)}];}else{const partition=partitionCapacityRowsByCenters(headers,rows,centers,grouping);reports=centers.map((center,i)=>{const rr=partition.buckets[i]||[];return{center,fromDate:values[cfg.fromField||'fromDate'],toDate:values[cfg.toField||'toDate'],headers,rows:rr,stats:capacityMetricStats(headers,rr,cfg.resultView||{},days)}});const matched=reports.reduce((n,r)=>n+r.rows.length,0);if(!matched){throw new Error('Combined Capacity results were returned, but no reliable Distribution Center column/value was available to separate the centers. No shared chart was created.');}if(partition.unassigned.length){setOperationStatus(`Separated ${matched} rows by Distribution Center. ${partition.unassigned.length} ambiguous row${partition.unassigned.length===1?' was':'s were'} excluded from charts.`);}}}else{const fallback=await runCapacityCentersIndividually(op,values,centers,cfg);reports=fallback.reports;totalRows=fallback.totalRows;}renderCapacityReports(reports,op);await chrome.storage.local.set({capacityDashboardData:{savedAt:Date.now(),reports,view:cfg.resultView||{},excelCfg:cfg.excel||{}}});setOperationStatus(`Completed ${reports.length} capacity report${reports.length===1?'':'s'}.`,'ok');setProgress('Done',true);return{records:totalRows};}

function operationRequiredOrigins(op){
  const explicit=Array.isArray(op?.requiredHosts)?op.requiredHosts:[];
  const urls=[];
  const walk=v=>{ if(!v)return; if(typeof v==='string'){ if(/^https:\/\//i.test(v))urls.push(v); return;} if(Array.isArray(v)){v.forEach(walk);return;} if(typeof v==='object')Object.values(v).forEach(walk); };
  walk(op?.workflow);
  const origins=[...explicit];
  for(const u of urls){ try{const x=new URL(u); origins.push(`${x.protocol}//${x.host}/*`);}catch(_){} }
  return [...new Set(origins.filter(x=>/^https:\/\//i.test(x)))];
}
async function ensureOperationHostPermissions(op){
  const origins=operationRequiredOrigins(op); if(!origins.length)return true;
  const missing=[];
  for(const origin of origins){ try{ if(!(await chrome.permissions.contains({origins:[origin]})))missing.push(origin); }catch(_){} }
  if(!missing.length)return true;
  // This runs directly from the Run button user gesture. Chrome may display a one-time prompt.
  const granted=await chrome.permissions.request({origins:missing});
  if(!granted)throw new Error('Required website permission was not granted.');
  return true;
}


// ============================================================
// Generic Remote Data Pipeline Interpreter (v10)
// Operation/domain semantics live in remote JSON. The runtime only
// provides generic source, partition, group, aggregate, chart, export
// and dashboard primitives.
// ============================================================
function gpTpl(text,ctx={}){
  return String(text??'').replace(/\{\{\s*([^}]+?)\s*\}\}/g,(_,key)=>{
    const k=String(key).trim();
    if(k.startsWith('count:')){const v=ctx.inputs?.[k.slice(6)];return Array.isArray(v)?v.length:0;}
    const parts=k.split('.');let v=ctx;
    for(const part of parts){if(v==null)return'';v=v[part];}
    return v==null?'':String(v);
  });
}
function gpHeaderIndex(headers,aliases){return normalizedHeaderIndex(headers,aliases||[]);}
function gpNumber(v){const n=Number(String(v??'').replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:null;}
function gpTransformInput(spec,inputs){
  if(spec==null)return''; if(typeof spec==='string')return gpTpl(spec,{input:inputs,inputs});
  const v=inputs?.[spec.from];
  if(spec.transform==='joinSelectionIds')return (Array.isArray(v)?v:[]).map(x=>String(x?.id??'').trim()).filter(Boolean).join(String(spec.separator??' '));
  if(spec.transform==='joinSelectionNames')return (Array.isArray(v)?v:[]).map(x=>String(x?.name??'').trim()).filter(Boolean).join(String(spec.separator??' | '));
  if(spec.transform==='join')return (Array.isArray(v)?v:[]).join(String(spec.separator??','));
  return v;
}
function gpMetricValue(metric,headers,rows){
  const i=gpHeaderIndex(headers,metric.fieldAliases||[]);
  if(metric.type==='distinctCount'){
    if(i<0)return null; return new Set((rows||[]).map(r=>String(r?.[i]??'').trim()).filter(Boolean)).size;
  }
  if(metric.type==='numberSummary'){
    if(i<0)return {min:null,avg:null,max:null};const a=(rows||[]).map(r=>gpNumber(r?.[i])).filter(v=>v!=null);
    if(!a.length)return {min:null,avg:null,max:null}; return {min:Math.min(...a),avg:a.reduce((x,y)=>x+y,0)/a.length,max:Math.max(...a)};
  }
  if(metric.type==='count')return (rows||[]).length;
  return null;
}
function gpBuildMetrics(cfg,headers,rows){const out={};for(const m of(cfg||[]))out[m.id]={config:m,value:gpMetricValue(m,headers,rows)};return out;}
function gpGroupRows(headers,rows,groupSpecs){
  let nodes=[{key:'all',label:'All',rows:rows||[],path:[]}];
  for(const spec of(groupSpecs||[])){
    const idx=gpHeaderIndex(headers,spec.fieldAliases||[]); if(idx<0){nodes=nodes.map(n=>({...n,path:[...n.path,{label:spec.label||'Group',value:spec.fallbackLabel||'All'}]}));continue;}
    const next=[]; for(const node of nodes){const m=new Map();for(const row of node.rows){const k=String(row?.[idx]??'').trim()||spec.fallbackLabel||'Unspecified';if(!m.has(k))m.set(k,[]);m.get(k).push(row);}for(const [k,rr] of m)next.push({key:`${node.key}|${k}`,label:k,rows:rr,path:[...node.path,{label:spec.label||'Group',value:k}]});}
    nodes=next;
  }
  return nodes;
}
function gpPartitionRows(headers,rows,items,cfg={}){
  // Generic exclusive partition by item id/label. Each row belongs to at most one item.
  const idIdx=gpHeaderIndex(headers,cfg.rowIdAliases||[]), labelIdx=gpHeaderIndex(headers,cfg.rowLabelAliases||[]);
  const meta=(items||[]).map((item,index)=>({index,item,id:String(item?.[cfg.itemId||'id']??'').trim(),label:normalizeLookupText(item?.[cfg.itemLabel||'name'])}));
  const buckets=meta.map(()=>[]),unmatched=[];const escRe=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const idMatches=v=>{const x=String(v??'').trim();if(!x)return[];return meta.filter(m=>m.id&&(x===m.id||new RegExp(`(^|\\D)${escRe(m.id)}(\\D|$)`).test(x)));};
  const labelMatches=v=>{const x=normalizeLookupText(v);if(!x)return[];const exact=meta.filter(m=>m.label&&x===m.label);if(exact.length)return exact;const p=meta.filter(m=>m.label&&(x.includes(m.label)||m.label.includes(x)));if(p.length<=1)return p;const mx=Math.max(...p.map(m=>m.label.length));return p.filter(m=>m.label.length===mx);};
  for(const row of(rows||[])){let c=[];if(idIdx>=0)c=idMatches(row[idIdx]);if(c.length!==1&&labelIdx>=0){const n=labelMatches(row[labelIdx]);if(n.length)c=n;}if(c.length!==1&&cfg.allowRowScanFallback!==false){const im=[];for(const cell of row)for(const m of idMatches(cell))if(!im.includes(m))im.push(m);if(im.length===1)c=im;if(c.length!==1){const nm=[];for(const cell of row)for(const m of labelMatches(cell))if(!nm.includes(m))nm.push(m);if(nm.length===1)c=nm;}}if(c.length===1)buckets[c[0].index].push(row);else unmatched.push(row);}
  return {buckets,unmatched,idColumnIndex:idIdx,labelColumnIndex:labelIdx};
}
function gpSeries(headers,rows,chart){
  const xi=gpHeaderIndex(headers,chart.x?.fieldAliases||[]);const series=(chart.series||[]).map(s=>({...s,index:gpHeaderIndex(headers,s.fieldAliases||[])}));
  return (rows||[]).map(r=>{const o={x:xi>=0?String(r[xi]??''):''};for(const s of series)o[s.id]=s.index>=0?gpNumber(r[s.index]):null;return o;}).filter(o=>o.x&&series.some(s=>o[s.id]!=null));
}
function gpMetricMarkup(metrics){
  const entries=Object.values(metrics||{});if(!entries.length)return'';return `<div class="capacity-summary generic-metrics">${entries.map(({config,value})=>{if(config.type==='numberSummary'){return `<div class="capacity-metric-block"><span>${escapeHtml(config.label||config.id)}</span><div class="capacity-metric-values"><div class="stat-min"><small>Min</small><strong>${formatNumber(value?.min)}</strong></div><div><small>Average</small><strong>${formatNumber(value?.avg)}</strong></div><div class="stat-max"><small>Max</small><strong>${formatNumber(value?.max)}</strong></div></div></div>`;}return `<div class="capacity-summary-days"><span>${escapeHtml(config.label||config.id)}</span><strong>${escapeHtml(value??'—')}</strong></div>`;}).join('')}</div>`;
}
function gpRenderLineChart(host,data,chart,ctx){
  if(!host)return;if(!data.length){host.innerHTML='<div class="chart-empty">No chart data.</div>';return;}
  const sdefs=chart.series||[],spacing=Math.max(18,Number(chart.pointSpacing||29)),available=Math.max(460,Math.floor(host.clientWidth||host.parentElement?.clientWidth||620)),natural=Math.max(460,data.length*spacing),W=chart.fillAvailable===false?Math.max(700,natural):Math.max(available,natural),H=330,p={l:58,r:24,t:34,b:102};
  const vals=[];for(const d of data)for(const sd of sdefs)if(d[sd.id]!=null)vals.push(d[sd.id]);if(!vals.length){host.innerHTML='<div class="chart-empty">No chart values.</div>';return;}let mn=Math.min(...vals),mx=Math.max(...vals);if(mn===mx){mn--;mx++;}
  const X=i=>p.l+(data.length===1?(W-p.l-p.r)/2:(i/(data.length-1))*(W-p.l-p.r)),Y=v=>p.t+(mx-v)/(mx-mn)*(H-p.t-p.b);
  let grid='';for(let k=0;k<5;k++){const yy=p.t+k*(H-p.t-p.b)/4,v=mx-k*(mx-mn)/4;grid+=`<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" class="chart-grid"/><text x="${p.l-8}" y="${yy+4}" class="chart-y" text-anchor="end">${Math.round(v)}</text>`;}
  const paths=sdefs.map((sd,si)=>{const d=data.map((a,i)=>a[sd.id]!=null?`${i?'L':'M'} ${X(i)} ${Y(a[sd.id])}`:'').join(' ');return `<path d="${d}" class="chart-line generic-series-${si}"/>`;}).join('');
  const pts=sdefs.map((sd,si)=>data.map((a,i)=>a[sd.id]!=null?`<circle class="chart-point generic-point-${si}" cx="${X(i)}" cy="${Y(a[sd.id])}" r="4" data-x="${escapeHtml(a.x)}" data-value="${Math.round(a[sd.id])}" data-series="${escapeHtml(sd.label||sd.id)}"/>`:'').join('')).join('');
  const labels=data.map((a,i)=>`<text class="chart-x" transform="translate(${X(i)},${H-p.b+20}) rotate(${chart.x?.verticalLabels===false?0:90})" text-anchor="start">${escapeHtml(a.x)}</text>`).join('');
  const title=gpTpl(chart.title||'',ctx); const legend=sdefs.map((sd,si)=>`<span><i class="generic-legend-${si}"></i>${escapeHtml(sd.label||sd.id)}</span>`).join('');
  host.innerHTML=`<div class="chart-head"><strong>${escapeHtml(title)}</strong><div class="chart-legend">${legend}</div></div><div class="chart-scroll"><div class="chart-canvas" style="width:${W}px"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${grid}${paths}${pts}${labels}</svg><div class="chart-tooltip hidden"></div></div></div>`;
  const tip=host.querySelector('.chart-tooltip');host.querySelectorAll('.chart-point').forEach(pt=>{pt.onmouseenter=()=>{tip.textContent=`${pt.dataset.series} • ${pt.dataset.x}: ${pt.dataset.value}`;tip.classList.remove('hidden');const b=pt.getBoundingClientRect(),a=host.querySelector('.chart-canvas').getBoundingClientRect();tip.style.left=`${b.left-a.left+8}px`;tip.style.top=`${b.top-a.top-34}px`;};pt.onmouseleave=()=>tip.classList.add('hidden');});
}
function gpBuildExport(model,cfg,inputs){
  const rawHeaders=model.headers||[],prepend=cfg.prependColumns||[],headers=[...prepend.map(x=>x.header),...rawHeaders],rows=[];
  for(const part of model.partitions)for(const row of part.rows){const ctx={partition:{id:part.id,label:part.label},input:inputs,inputs};rows.push([...prepend.map(x=>gpTpl(x.value||'',ctx)),...row]);}
  return {headers,rows};
}
async function gpDownloadExport(op,model,inputs){const cfg=op.clientProcessor?.export||{};const x=gpBuildExport(model,cfg,inputs);if(!x.rows.length)throw new Error('No rows are available for export.');const fn=gpTpl(cfg.filename||'report.xlsx',{input:inputs,inputs});const r=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers:x.headers,rows:x.rows,sheetName:cfg.sheetName||'Report',filename:fn,saveAs:cfg.saveAs===true});if(!r?.ok)throw new Error(r?.error||'Could not create Excel file.');}
function gpRenderModel(op,model,inputs){
  const host=$('operationResult');if(!host)return;const cp=op.clientProcessor,p=cp.presentation||{},exp=cp.export||{};
  host.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${model.partitions.length} ${escapeHtml(p.partitionCountLabel||'Distribution Center')}${model.partitions.length===1?'':'s'}</strong></div><div class="capacity-result-actions">${exp.enabled===false?'':`<button id="gpDownload" class="save-button compact" type="button">${escapeHtml(exp.buttonLabel||p.downloadButtonLabel||'Download Excel')}</button>`}${p.hideDashboardButton===true?'':`<button id="gpDashboard" class="save-button compact" type="button">${escapeHtml(p.dashboardButtonLabel||'Open dashboard')}</button>`}</div></div><div id="gpCards"></div>`;host.classList.remove('hidden');const cards=host.querySelector('#gpCards');
  for(const part of model.partitions){const sec=document.createElement('section');sec.className='capacity-report-card';const ctx={partition:{id:part.id,label:part.label},groupCount:part.groups.length,groupCountPlural:part.groups.length===1?'':'s',input:inputs,inputs};sec.innerHTML=`<div class="capacity-report-title"><div><strong>${escapeHtml(gpTpl(p.partitionTitle||'{{partition.label}}',ctx))}</strong><small>${escapeHtml(gpTpl(p.partitionSubtitle||'',ctx))}</small></div></div><div class="capacity-timescope-list"></div>`;cards.appendChild(sec);const list=sec.querySelector('.capacity-timescope-list');for(const group of part.groups){const gctx={...ctx,group:{label:group.label,key:group.key}};const g=document.createElement('section');g.className='capacity-timescope-card';g.innerHTML=`<div class="capacity-timescope-title"><strong>${escapeHtml(gpTpl(p.groupTitle||'{{group.label}}',gctx))}</strong></div>${gpMetricMarkup(group.metrics)}<div class="gp-chart-list"></div>`;list.appendChild(g);const ch=g.querySelector('.gp-chart-list');for(const chart of(cp.charts||[])){const c=document.createElement('div');c.className='capacity-chart-host';ch.appendChild(c);if(chart.type==='line')gpRenderLineChart(c,gpSeries(model.headers,group.rows,chart),chart,gctx);}}
  }
  const dl=host.querySelector('#gpDownload');if(dl)dl.onclick=async()=>{try{dl.disabled=true;await gpDownloadExport(op,model,inputs);setOperationStatus('Excel downloaded.','ok');}catch(e){setOperationStatus(e.message||String(e),'error');}finally{dl.disabled=false;}};
  const dashBtn=host.querySelector('#gpDashboard');if(dashBtn)dashBtn.onclick=async()=>{const b=dashBtn;try{b.disabled=true;await chrome.storage.local.set({genericDashboardData:{savedAt:Date.now(),model,processor:cp,inputs,accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()}});const r=await chrome.runtime.sendMessage({type:'OPEN_GENERIC_DASHBOARD'});if(!r?.ok)throw new Error(r?.error||'Could not open dashboard.');}catch(e){setOperationStatus(e.message||String(e),'error');}finally{b.disabled=false;}};
}
async function runDataPipelineProcessor(op,inputs){
  const cp=op.clientProcessor||{},src=cp.source||{};if(src.type!=='remote-operation')throw new Error('Unsupported data source.');
  const srcInputs={...inputs};for(const [k,v] of Object.entries(src.inputs||{}))srcInputs[k]=gpTransformInput(v,inputs);
  setOperationStatus(gpTpl(src.status||'Running report…',{inputs,input:inputs}));
  const resp=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:src.operationId||op.id,inputs:srcInputs,awaitCompletion:true,silentDone:true});if(!resp?.ok)throw new Error(resp?.error||'Remote operation failed.');
  const result=resp.result||{},headers=result.headers||[],rows=result.rows||[],partCfg=cp.partition||{},items=Array.isArray(inputs?.[partCfg.byInput])?inputs[partCfg.byInput]:[];
  const partition=items.length?gpPartitionRows(headers,rows,items,partCfg):{buckets:[rows],unmatched:[]};
  const parts=[];for(let i=0;i<(items.length?items.length:1);i++){const item=items[i]||{id:'all',name:'All'},rr=partition.buckets[i]||[];const groups=gpGroupRows(headers,rr,cp.groups||[]).map(g=>({...g,metrics:gpBuildMetrics(cp.metrics||[],headers,g.rows)}));parts.push({id:String(item?.[partCfg.itemId||'id']??'all'),label:String(item?.[partCfg.itemLabel||'name']??'All'),rows:rr,groups});}
  const matched=parts.reduce((n,x)=>n+x.rows.length,0);if(items.length>1&&!matched)throw new Error('Results were returned, but could not be partitioned reliably. Check remote partition aliases.');
  const model={headers,partitions:parts,unmatchedCount:partition.unmatched?.length||0,totalRows:rows.length};gpRenderModel(op,model,inputs);await chrome.storage.local.set({genericDashboardData:{savedAt:Date.now(),model,processor:cp,inputs}});setOperationStatus(`Completed. ${matched||rows.length} rows processed.`,'ok');setProgress('Done',true);return{records:matched||rows.length};
}


async function runBatchDataPipelineProcessor(op,values){
  const cfg=op.clientProcessor||{},mode=values[cfg.modeField||'inputMode'];let items=[];
  if(mode===(cfg.singleMode||'single'))items=[String(values[cfg.singleField]||'').trim()].filter(Boolean);else{const file=values[cfg.fileField];if(!file)throw new Error('Excel file is required.');const t=await readExcelTable(file);items=t.rows.map(r=>String(r?.[0]??'').trim()).filter(Boolean);const h=String(t.headers?.[0]??'').trim();if(h&&!/^(barcode|parcel[ _-]?code)$/i.test(h))items.unshift(h);}
  items=[...new Set(items)];if(!items.length)throw new Error('No input values were found.');
  const outHeaders=(cfg.resultColumns||[]).map(c=>c.header),outRows=[];let done=0;
  for(let i=0;i<items.length;i++){const item=items[i];setOperationStatus(`Processing ${i+1}/${items.length}: ${item}`);const resp=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:cfg.sourceOperationId||op.id,inputs:{[cfg.sourceInputName||'value']:item},awaitCompletion:true,silentDone:true});if(!resp?.ok)throw new Error(resp?.error||`Failed: ${item}`);const rr=resp.result||{},hs=rr.headers||[];const idxs=(cfg.resultColumns||[]).map(c=>gpHeaderIndex(hs,c.aliases||[c.header]));for(const row of(rr.rows||[])){outRows.push(idxs.map((ix,k)=>{if(ix>=0)return row[ix]??'';return k===0?item:'';}));}done++;}
  const host=$('operationResult');host.classList.remove('hidden');host.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${done} item${done===1?'':'s'} processed</strong><div class="field-help">${outRows.length} log row${outRows.length===1?'':'s'}</div></div><div class="capacity-result-actions"><button id="batchDownload" class="save-button compact">${escapeHtml(cfg.presentation?.downloadButtonLabel||'Download Excel')}</button><button id="batchDashboard" class="save-button compact">${escapeHtml(cfg.presentation?.openDashboardLabel||'Open Dashboard')}</button></div></div><div class="table-scroll"><table class="result-table"><thead><tr>${outHeaders.map(x=>`<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${outRows.map(r=>`<tr>${r.map(x=>`<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const model={headers:outHeaders,partitions:[{id:'all',label:cfg.presentation?.title||op.title,rows:outRows,groups:[{key:'all',label:'All records',rows:outRows,metrics:{}}]}]};const processor={...cfg,presentation:{...(cfg.presentation||{}),table:{enabled:true}},charts:[],export:cfg.export||{}};await chrome.storage.local.set({genericDashboardData:{savedAt:Date.now(),model,processor,inputs:values}});
  host.querySelector('#batchDownload').onclick=async()=>{const b=host.querySelector('#batchDownload');b.disabled=true;try{const e=cfg.export||{},x=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers:outHeaders,rows:outRows,sheetName:e.sheetName||op.title,filename:e.filename||'report.xlsx',saveAs:e.saveAs===true});if(!x?.ok)throw new Error(x?.error||'Excel download failed.');}catch(e){setOperationStatus(e.message,'error')}finally{b.disabled=false}};
  host.querySelector('#batchDashboard').onclick=async()=>{const x=await chrome.runtime.sendMessage({type:'OPEN_GENERIC_DASHBOARD'});if(!x?.ok)setOperationStatus(x?.error||'Dashboard could not be opened.','error')};setOperationStatus('Completed.','ok');setProgress('Done',true);return{records:outRows.length};
}

async function runDirectWorkflowProcessor(op,values){
  const resp=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:op.id,inputs:{...values,__subOperationId:op.subOperationId||''},awaitCompletion:true,silentDone:true});
  if(!resp?.ok)throw new Error(resp?.error||'Operation failed.');
  const result=resp.result||{},headers=Array.isArray(result.headers)?result.headers:[],rows=Array.isArray(result.rows)?result.rows:[];
  if(headers.length){
    const host=$('operationResult');host.classList.remove('hidden');
    host.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${escapeHtml(op.resultTitle||op.subOperationTitle||op.title||'Result')}</strong><div class="field-help">${rows.length} row${rows.length===1?'':'s'}</div></div>${op.resultDownload===false?'':`<div class="capacity-result-actions"><button id="directResultDownload" class="save-button compact" type="button">${escapeHtml(op.downloadButtonLabel||'Download Excel')}</button></div>`}</div><div class="table-scroll"><table class="result-table"><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const dl=host.querySelector('#directResultDownload');if(dl)dl.onclick=async()=>{dl.disabled=true;try{const e=await chrome.runtime.sendMessage({type:'EXPORT_GENERIC_XLSX',headers,rows,sheetName:op.sheetName||op.subOperationTitle||'Role Access',filename:op.filename||'role_access_result.xlsx',saveAs:true});if(!e?.ok)throw new Error(e?.error||'Excel download failed.');}catch(e){setOperationStatus(e.message||String(e),'error')}finally{dl.disabled=false}};
  }
  setOperationStatus(op.successMessage||'Completed.','ok');setProgress('Done',true);return {records:Number(result.records||rows.length||0),headers,rows};
}

function parseCoordinateArray(value){
  let coords=value;
  for(let depth=0;depth<3&&typeof coords==='string';depth++){
    const text=coords.trim();if(!text)throw new Error('coordinates is empty');
    try{coords=JSON.parse(text);continue;}catch(_){}
    try{coords=JSON.parse(text.replace(/\(/g,'[').replace(/\)/g,']').replace(/'/g,'"'));}
    catch(_2){throw new Error('coordinates is not a valid array');}
  }
  const numberValue=value=>{
    if(typeof value==='number')return value;
    const normalized=String(value??'').trim().replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[−–—]/g,'-');
    return normalized===''?NaN:Number(normalized);
  };
  const isPoint=point=>Array.isArray(point)&&point.length>=2&&Number.isFinite(numberValue(point[0]))&&Number.isFinite(numberValue(point[1]));
  const rings=[];
  const collectRings=node=>{
    if(!Array.isArray(node))return;
    if(node.length>=3&&node.every(isPoint)){rings.push(node);return;}
    for(const child of node)collectRings(child);
  };
  collectRings(coords);
  if(!rings.length)throw new Error('coordinates does not contain a valid polygon ring of at least three numeric [latitude, longitude] points');
  const wktRings=rings.map((ring,ringIndex)=>{
    const points=ring.map((point,index)=>{
      const lat=numberValue(point[0]),lon=numberValue(point[1]);
      if(lat<-90||lat>90||lon<-180||lon>180)throw new Error(`ring ${ringIndex+1}, point ${index+1} is outside latitude/longitude bounds`);
      return `${lon} ${lat}`;
    });
    if(points[0]!==points.at(-1))points.push(points[0]);
    return `(${points.join(', ')})`;
  });
  return `POLYGON (${wktRings.join(', ')})`;
}
function quotedCsv(rows){return rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\n')+'\n';}
function downloadTextFile(text,filename,mime='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function runExcelWktCsvProcessor(op,values){
  const cfg=op.clientProcessor||{},file=values[cfg.fileField||'inputFile'];if(!file)throw new Error('Excel file is required.');
  setOperationStatus('Reading Excel file…');const table=await readExcelTable(file);if(!table.headers.length||!table.rows.length)throw new Error('No data rows were found in the Excel file.');
  const normalized=table.headers.map(h=>String(h??'').trim().toLowerCase());
  const findColumn=aliases=>aliases.map(x=>String(x).trim().toLowerCase()).map(x=>normalized.indexOf(x)).find(i=>i>=0)??-1;
  const nameIndex=findColumn(cfg.nameHeaders||['Name']),coordinatesIndex=findColumn(cfg.coordinateHeaders||['coordinates']);
  if(nameIndex<0||coordinatesIndex<0)throw new Error(`Required columns were not found. Expected: ${(cfg.nameHeaders||['Name'])[0]} and ${(cfg.coordinateHeaders||['coordinates'])[0]}.`);
  const output=[],errors=[];
  for(let i=0;i<table.rows.length;i++){
    const name=String(table.rows[i][nameIndex]??'').trim();
    try{if(!name)throw new Error('Name is empty');output.push([parseCoordinateArray(table.rows[i][coordinatesIndex]),name,'']);}
    catch(error){errors.push(`Row ${i+2}: ${error.message||error}`);}
  }
  if(errors.length)throw new Error(`CSV was not created. ${errors.slice(0,5).join(' | ')}${errors.length>5?` | ${errors.length-5} more error(s)`:''}`);
  const headers=cfg.outputHeaders||['WKT','name','description'],filename=cfg.filename||'output_wkt.csv';
  downloadTextFile(quotedCsv([headers,...output]),filename,'text/csv;charset=utf-8');
  const host=$('operationResult');if(host){host.innerHTML=`<div class="capacity-result-toolbar"><div><strong>${output.length} polygon${output.length===1?'':'s'} converted</strong><div class="field-help">${escapeHtml(filename)} downloaded successfully.</div></div></div><div class="table-scroll"><table class="result-table"><thead><tr>${headers.map(x=>`<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${output.slice(0,20).map(row=>`<tr>${row.map(x=>`<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;host.classList.remove('hidden');}
  setOperationStatus(`Completed: ${output.length} polygon${output.length===1?'':'s'} converted and CSV downloaded.`,'ok');setProgress('Done',true);return{records:output.length};
}

$('runOperation').addEventListener('click', async () => {
  if(!currentOperation) return;
  const op=currentOperation; if(runningOps.has(op.id))return; const btn=$('runOperation'); btn.disabled=true; $('capacityStats').classList.add('hidden'); resetLiveReport(op.id);
  try {
    const inputs=collectOperationInputs(op); if(op.subOperationId)inputs.__subOperationId=op.subOperationId;
    await ensureOperationHostPermissions(op);
    await startActivity(op); setOperationRunning(true,op.id); setProgress('Preparing…');
    setOperationStatus('Checking access…'); await checkOperationAccess(op.id);
    setOperationStatus('Starting operation…');
    if(op.clientProcessor?.type==='direct-workflow'){ const result=await runDirectWorkflowProcessor(op,inputs); await finishActivity('success',`${result.records||0} rows done`,op.id); setOperationRunning(false,op.id); btn.disabled=false; return; }
    if(op.clientProcessor?.type==='point-in-polygon'){ const result=await runPointInPolygonProcessor(op,inputs); await finishActivity('success',`${result.records||0} rows done`,op.id); setOperationRunning(false,op.id); btn.disabled=false; return; }
    if(op.clientProcessor?.type==='data-pipeline'){ const result=await runDataPipelineProcessor(op,inputs); await finishActivity('success',`${result.records||0} rows done`,op.id); setOperationRunning(false,op.id); btn.disabled=false; return; }
    if(op.clientProcessor?.type==='multi-capacity-report'){ const result=await runMultiCapacityProcessor(op,inputs); await finishActivity('success',`${result.records||0} rows done`,op.id); setOperationRunning(false,op.id); btn.disabled=false; return; }
    if(op.clientProcessor?.type==='batch-data-pipeline'){ const result=await runBatchDataPipelineProcessor(op,inputs); await finishActivity('success',`${result.records||0} rows done`,op.id); setOperationRunning(false,op.id); btn.disabled=false; return; }
    if(op.clientProcessor?.type==='single-or-excel-workflow'){ const result=await runSingleOrExcelWorkflowProcessor(op,inputs); await finishActivity(result.failed?'error':'success',`${result.succeeded||0} successful, ${result.failed||0} failed`,op.id); setOperationRunning(false,op.id); btn.disabled=false; return; }
    if(op.clientProcessor?.type==='excel-wkt-csv'){ const result=await runExcelWktCsvProcessor(op,inputs); await finishActivity('success',`${result.records||0} rows done`,op.id); setOperationRunning(false,op.id); btn.disabled=false; return; }
    if(op.clientProcessor?.type==='excel-batch-workflow'){ try { const result=await runExcelBatchWorkflowProcessor(op,inputs); await finishActivity(result.cancelled?'error':'success',result.cancelled?'OP-CANCEL':`${result.records||0} rows done`,op.id); setOperationRunning(false,op.id); resetFlexControls(); btn.disabled=false; return; } finally { chrome.runtime.sendMessage({type:'CLEAR_OPERATION_ACCESS_GRANT',op:op.id}).catch(()=>{}); } }
    const response=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:op.id,inputs});
    if(!response?.ok) throw new Error(response?.error || 'Could not start operation.');
    setOperationStatus('Operation started.','ok');
  } catch(error){ await finishActivity('error',String(error?.message||error),op.id); setOperationRunning(false,op.id); if(isAccessDeniedError(error)){showToast(error.message,'error');setOperationStatus('');}else setOperationStatus(error.message,'error'); btn.disabled=false; }
});

chrome.runtime.onMessage.addListener((message) => {
  if(message?.type==='OPERATION_STATUS'){
    if(message.done){setOperationRunning(false,message.opId);finishActivity(message.kind==='error'?'error':'success',message.records!=null?`${message.records} rows ${message.text}`:message.text,message.opId);}
    if(message.opId!==currentOperation?.id)return;
    setStatus(message.text,message.kind||''); setOperationStatus(message.text,message.kind||'');
    if(message.reportRow) renderLiveReport(message.opId,message);
    if(typeof message.progress==='number'){ const fill=$('progressFill'); if(fill) fill.style.width=`${Math.max(0,Math.min(100,message.progress))}%`; }
    setProgress(message.text,!!message.done);
    if(message.stats) renderCapacityStats(message.stats);
    if(message.done){
      setOperationRunning(false,message.opId);
      const live=liveReportsByOp.get(message.opId);
      if(message.kind!=='error'&&live?.rows?.length&&live.exportCfg?.autoDownloadOnDone===true&&!live.autoDownloaded){
        live.autoDownloaded=true;downloadLiveReport(message.opId).then(()=>setOperationStatus('Completed. Excel report downloaded.','ok')).catch(e=>setOperationStatus(`Completed, but Excel download failed: ${e.message||e}`,'error'));
      }
    }
  }
  if(message?.type==='EXTRACT_STATUS'){ setStatus(message.text,message.kind||''); setOperationStatus(message.text,message.kind||''); setProgress(message.text,!!message.done); if(message.done){setOperationRunning(false);finishActivity(message.kind==='error'?'error':'success',message.text);} }
  if(message?.type==='CAPACITY_STATUS') {
    setOperationStatus(message.text,message.kind||'');
    setProgress(message.text,!!message.done); if(message.done){ setOperationRunning(false); finishActivity(message.kind==='error'?'error':'success',message.text); }
    if(message.stats) renderCapacityStats(message.stats);
  }
});

document.addEventListener('keydown',e=>{
  const t=e.target;
  if((t?.type==='checkbox'||t?.type==='radio')&&e.key==='Enter'){e.preventDefault();t.click();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&operationView.classList.contains('active')&&!operationRunning){e.preventDefault();$('runOperation')?.click();return;}
  if(e.key==='Escape'&&!validationInProgress){document.querySelectorAll('.remote-autocomplete-menu,.jalali-picker').forEach(x=>x.classList.add('hidden'));if(operationView.classList.contains('active')&&!operationRunning)showView('home');}
});


// Generic bridge for remote modules that register browser-wide shortcut actions.
// The Host stores only declarative shortcut data; operation-specific logic remains remote.
window.addEventListener('message', async (event) => {
  try {
    if (event.origin !== 'https://nhabibifardigikala.github.io') return;
    const data = event.data || {};
    if (data.type === 'DIGIEXPRESS_GLOBAL_SHORTCUTS_CONFIG') {
      await chrome.runtime.sendMessage({type:'SET_GLOBAL_SHORTCUTS_CONFIG',config:data.config||{}});
      return;
    }
    if (data.type === 'DIGIEXPRESS_REMOTE_REMINDER_CONFIG') {
      await chrome.runtime.sendMessage({type:'SET_REMOTE_REMINDER_CONFIG',config:data.config||{}});
      return;
    }
    if (data.type === 'DIGIEXPRESS_FETCH_RESOURCE') {
      const requestId=String(data.requestId||'');
      const source=event.source;
      const targetOrigin=event.origin;
      const result=await chrome.runtime.sendMessage({type:'FETCH_INTERNAL_RESOURCE',url:String(data.url||'')});
      try{source?.postMessage({type:'DIGIEXPRESS_RESOURCE_RESULT',requestId,...result},targetOrigin);}catch(_){}
      return;
    }
    if (data.type === 'DIGIEXPRESS_REMOTE_OPERATION_REQUEST') {
      const requestId=String(data.requestId||'');
      const source=event.source;
      const targetOrigin=event.origin;
      const op=String(data.op||'').trim();
      if(!/^[a-z0-9_-]{1,80}$/i.test(op)) throw new Error('Invalid remote operation id.');
      const result=await chrome.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op,inputs:(data.inputs&&typeof data.inputs==='object')?data.inputs:{},awaitCompletion:true,silentDone:true});
      try{source?.postMessage({type:'DIGIEXPRESS_REMOTE_OPERATION_RESULT',requestId,...result},targetOrigin);}catch(_){}
      return;
    }
    if (data.type === 'DIGIEXPRESS_REMOTE_HTTP_REQUEST') {
      const requestId=String(data.requestId||'');
      const source=event.source;
      const targetOrigin=event.origin;
      const request=(data.request&&typeof data.request==='object')?data.request:{};
      const result=await chrome.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request});
      try{source?.postMessage({type:'DIGIEXPRESS_REMOTE_HTTP_RESULT',requestId,...result},targetOrigin);}catch(_){}
      return;
    }
    if (data.type === 'DIGIEXPRESS_QUICK_SCREENSHOT') {
      const result = await chrome.runtime.sendMessage({type:'GLOBAL_CAPTURE_VISIBLE_UI'});
      const frame = document.getElementById('pasteAssistantFrame');
      frame?.contentWindow?.postMessage({type:'DIGIEXPRESS_QUICK_SCREENSHOT_RESULT',result}, 'https://nhabibifardigikala.github.io');
      return;
    }
  } catch (_) {}
});

async function applyUrlState(){
  const state=parseUrlState(); applyingUrlState=true;
  try{if(state.operation){await openOperationById(state.operation,state.sub||'');}else if(state.view==='settings'){showView('settings',{syncHash:false});}else showView('home',{syncHash:false});}catch(e){showView('home',{syncHash:false});showToast(e.message||String(e),'error');}finally{applyingUrlState=false;}
}
window.addEventListener('hashchange',()=>applyUrlState());
loadRemote(false).then(()=>applyUrlState()).catch(error => { setStatus(error.message,'error'); showToast('Remote configuration could not be loaded.','error'); });
