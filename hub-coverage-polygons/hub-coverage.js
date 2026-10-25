const DATASETS={
  delivery:{label:'Delivery',url:'sheet:Delivery Polygons'},
  pickup:{label:'Pickup',url:'sheet:Pick-up Polygons'}
};
let currentService='delivery';
let rows=[],shown=[],pointHits=[],searchedPoint=null,sortKey='name',sortDir=1;
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const map=L.map('map',{zoomControl:true}).setView([32,51],6), polygons=L.featureGroup().addTo(map), points=L.layerGroup().addTo(map);

const TILE_TIMEOUT_MS=15000;
const tilePending=new Map();
let tileSeq=0;
window.addEventListener('message',event=>{
  if(event.source!==parent)return;
  const data=event.data||{};
  if(data.type!=='DIGIEXPRESS_RESOURCE_RESULT')return;
  const p=tilePending.get(String(data.requestId||''));
  if(!p)return;
  tilePending.delete(String(data.requestId||''));
  clearTimeout(p.timer);
  if(data.ok&&data.dataUrl)p.resolve(data.dataUrl); else p.reject(new Error(data.error||'Tile request failed'));
});
function requestTileFromHost(url){
  return new Promise((resolve,reject)=>{
    const requestId='tile-'+Date.now()+'-'+(++tileSeq);
    const timer=setTimeout(()=>{tilePending.delete(requestId);reject(new Error('Tile bridge timeout'));},TILE_TIMEOUT_MS);
    tilePending.set(requestId,{resolve,reject,timer});
    parent.postMessage({type:'DIGIEXPRESS_FETCH_RESOURCE',requestId,url},'*');
  });
}
const DigiexpressTileLayer=L.TileLayer.extend({
  createTile(coords,done){
    const tile=document.createElement('img');
    tile.alt=''; tile.setAttribute('role','presentation');
    const url=this.getTileUrl(coords);
    requestTileFromHost(url).then(dataUrl=>{tile.onload=()=>done(null,tile);tile.onerror=()=>done(new Error('Tile decode failed'),tile);tile.src=dataUrl;}).catch(err=>done(err,tile));
    return tile;
  }
});
const baseTiles=new DigiexpressTileLayer('https://osm.digiexpress.ir/tile/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:2,updateWhenIdle:true});
baseTiles.addTo(map);
baseTiles.on('tileerror',e=>console.warn('OSM tile bridge failed',e?.error||e));

let lastFitBounds=null;
let mapRefreshTimer=null;
function refreshMapSize(refit=false){
  if(mapRefreshTimer) clearTimeout(mapRefreshTimer);
  mapRefreshTimer=setTimeout(()=>{
    try{
      map.invalidateSize({pan:false,animate:false});
      if(refit&&lastFitBounds&&lastFitBounds.isValid()) map.fitBounds(lastFitBounds,{padding:[12,12],animate:false});
    }catch(e){console.warn('Coverage map resize refresh failed',e)}
  },30);
}
function armMapVisibilityRefresh(){
  const host=document.querySelector('.map-wrap')||document.getElementById('map');
  if(window.ResizeObserver&&host){
    const ro=new ResizeObserver(()=>refreshMapSize(false));
    ro.observe(host);
  }
  window.addEventListener('resize',()=>refreshMapSize(false));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshMapSize(true)});
  window.addEventListener('focus',()=>refreshMapSize(false));
  [0,100,300,700,1400,2500].forEach(ms=>setTimeout(()=>refreshMapSize(ms>=300),ms));
}

function natureLabel(n){return ({1:'Normal',2:'Medium',3:'Large',4:'Barbari',5:'Business',6:'Fast',7:'SuperMarket'})[Number(n)]||String(n??'-')}
function polyColor(n){return ({1:'#1976d2',2:'#16a34a',3:'#7c3aed',4:'#2563eb',5:'#d946ef',6:'#0891b2',7:'#0f766e'})[Number(n)]||'#64748b'}
function cleanSubmit(v){return String(v||'').replace(/^EXPRESS\s+/i,'').trim()||'-'}
function makeFilter(host, values, cls){host.innerHTML=values.map(v=>`<label class="filter-chip"><input type="checkbox" class="${cls}" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('');host.querySelectorAll('input').forEach(x=>x.addEventListener('change',applyFilters))}
function selected(cls){return [...document.querySelectorAll('.'+cls+':checked')].map(x=>x.value)}
function pass(r){const ts=selected('f-type'),ds=selected('f-district');if(!ts.includes(natureLabel(r.natureId)))return false;if(ds.length&&!ds.some(x=>String(r.district||'').startsWith(x)))return false;return true}
const SHEET_ID='1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
const DSPACE_URL='https://dspace.dkservices.ir/s/PjQJZLpewe6yWLf';
const cleanId=v=>String(v??'').trim().replace(/\.0$/,'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const hnorm=v=>String(v??'').toLowerCase().replace(/[_\s-]+/g,' ').trim();
const hindex=(headers,names)=>{const hs=headers.map(hnorm);for(const name of names){let i=hs.indexOf(hnorm(name));if(i>=0)return i;}return -1};
let hubMap=new Map(),hubIds=new Set(),hubNames=new Map(),capacityById=new Map(),hoverHub=null,lockedHub=null,polyLayers=new Map(),capacityLoadError='';
const getId=r=>cleanId(r.dcId||r.stateId);
const isHub=r=>hubIds.has(getId(r));
function activeHub(){return lockedHub||hoverHub}
function groupSet(hubId){return new Set([hubId,...(hubMap.get(hubId)||[])])}
function restyle(){const active=activeHub(),members=active?groupSet(active):null;polyLayers.forEach((layers,id)=>layers.forEach(layer=>{const r=layer._dxrow,member=members?.has(id);layer.setStyle({color:isHub(r)?'#dc2626':polyColor(r.natureId),weight:member?6:2,fillOpacity:member?.38:.22,opacity:members&&!member?.48:1});if(member)layer.bringToFront()}))}
function hubFor(r){const id=getId(r);if(hubIds.has(id))return id;for(const [h,members] of hubMap)if(members.has(id))return h;return null}
const fmtCap=n=>n==null?'—':Math.round(n).toLocaleString('en-US');
// Capacity Report defaults to the first day of the current Jalali month through today.
const jalaliToday=(()=>{const parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const x=Object.fromEntries(parts.map(v=>[v.type,v.value]));return `${x.year}${String(x.month).padStart(2,'0')}${String(x.day).padStart(2,'0')}`;})();
let reserveFrom=jalaliToday.slice(0,6)+'01',reserveTo=jalaliToday;
function rangedDays(daily){return new Map([...(daily||new Map())].filter(([d])=>d>=reserveFrom&&d<=reserveTo));}
function updateReserveRange(){const a=$('#reserveFrom').value.replace(/[^0-9۰-۹]/g,c=>c).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g,'');const b=$('#reserveTo').value.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g,'');const el=$('#reserveRangeStatus');if(!/^\d{8}$/.test(a)||!/^\d{8}$/.test(b)||a>b){el.textContent='Use a valid Jalali date range (YYYYMMDD).';el.className='status error';return}reserveFrom=a;reserveTo=b;el.textContent=`Daily average: ${reserveFrom} → ${reserveTo}`;el.className='status ok';closeAllHoverTips();}

function intersectDays(a,b){return [...a.keys()].filter(d=>b.has(d)).sort()}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
function computeReserves(v){
  const flex=rangedDays(v.flexDaily),dk=rangedDays(v.dkDaily);
  if(!flex?.size&&!dk?.size)return {total:null,dk:null,non:null};
  // All displayed figures must share the same days. Never subtract averages of different date ranges.
  if(!flex?.size||!dk?.size)return {total:flex?.size?mean([...flex.values()]):null,dk:dk?.size?mean([...dk.values()]):null,non:null};
  const dates=intersectDays(flex,dk);
  if(!dates.length)return {total:null,dk:null,non:null};
  const total=mean(dates.map(d=>flex.get(d))),reservedDk=mean(dates.map(d=>dk.get(d)));
  const diff=total-reservedDk;
  // A negative figure indicates incompatible source aggregation, not actual negative NonDK usage.
  return {total,dk:reservedDk,non:diff>=-0.001?Math.max(0,diff):null};
}
function tooltipHtml(r){
  const id=getId(r),v=capacityById.get(id)||{},c=computeReserves(v);
  const days=v.days?.length?v.days.join('، '):'—';
  const field=(label,value,fa=false)=>`<div class="hub-popup-row"><span class="hub-popup-key">${label}</span><span class="hub-popup-value${fa?' hub-popup-fa':''}">${value}</span></div>`;
  return `<div class="hub-popup" dir="rtl">${field('Name',esc(r.name))}${field('DC ID',esc(id))}${field('Workdays',esc(days),true)}${field('Total Reserve',fmtCap(c.total))}${field('DK Reserve',fmtCap(c.dk))}${field('NonDK Reserve',fmtCap(c.non))}</div>`;
}
function closeAllHoverTips(){polygons.eachLayer(p=>{if(p.closeTooltip)p.closeTooltip()})}
map.on('click',()=>{lockedHub=null;hoverHub=null;closeAllHoverTips();restyle()});
map.on('mouseout',()=>{hoverHub=null;closeAllHoverTips();restyle()});
function draw(list,fit=false){polygons.clearLayers();polyLayers=new Map();list.forEach(r=>(r.coordinates||[]).forEach(part=>{if(!Array.isArray(part)||part.length<3)return;const id=getId(r);const poly=L.polygon(part,{color:isHub(r)?'#dc2626':polyColor(r.natureId),weight:2,fillOpacity:.22}).addTo(polygons);poly._dxrow=r;if(!polyLayers.has(id))polyLayers.set(id,[]);polyLayers.get(id).push(poly);
  poly.bindTooltip(()=>tooltipHtml(r),{sticky:true,direction:'top',offset:[0,-12],opacity:1,className:'hub-hover-tooltip',permanent:false,interactive:false});
  // Explicitly control opening/closing: no tooltip is allowed when the pointer leaves a polygon.
  poly.on('mouseover',e=>{closeAllHoverTips();hoverHub=hubFor(r);restyle();poly.openTooltip(e.latlng)});
  poly.on('mousemove',e=>{if(!poly.isTooltipOpen())poly.openTooltip(e.latlng)});
  poly.on('mouseout',()=>{poly.closeTooltip();hoverHub=null;restyle()});
  poly.on('remove',()=>poly.closeTooltip());
  poly.on('click',e=>{L.DomEvent.stopPropagation(e);if(isHub(r)){lockedHub=lockedHub===id?null:id;restyle()}else{lockedHub=null;restyle()}})
}));restyle();if(searchedPoint)L.marker(searchedPoint).addTo(points);if(fit){const b=polygons.getBounds();if(b.isValid()){lastFitBounds=b;map.invalidateSize({pan:false,animate:false});map.fitBounds(b,{padding:[12,12],animate:false});setTimeout(()=>refreshMapSize(true),120)}}}
async function readSheet(sheetName,source='google'){const args=source==='google'?{spreadsheetId:SHEET_ID,sheetName,limit:100000}:{shareUrl:DSPACE_URL,sheetName,limit:250000};const raw=await DigiExpressPlatform.call(source==='google'?'sheets.readRows':'dspace.readSheet',args);if(raw?.ok===false)throw Error(raw.error||sheetName);const data=raw?.result||raw;if(!Array.isArray(data?.headers)||!Array.isArray(data?.rows))throw Error(`Invalid ${sheetName} response`);return data}
async function loadMapper(){const d=await readSheet('FlexHubMapper');const hi=hindex(d.headers,['Hub ID']),di=hindex(d.headers,['DC ID']),hn=hindex(d.headers,['Flex Hub']);if(hi<0||di<0)throw Error('FlexHubMapper must include Hub ID and DC ID');const m=new Map(),names=new Map();for(const row of d.rows){const h=cleanId(row[hi]),id=cleanId(row[di]);if(!h||!id)continue;if(!m.has(h))m.set(h,new Set());m.get(h).add(id);if(hn>=0&&row[hn])names.set(h,String(row[hn]))}hubMap=m;hubIds=new Set(m.keys());hubNames=names}
const persianDays=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
function dayName(value){const raw=String(value??'').replace(/[^0-9۰-۹]/g,'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));if(raw.length!==8)return null;try{const y=+raw.slice(0,4),m=+raw.slice(4,6),day=+raw.slice(6,8);if(y>1900){return persianDays[new Date(Date.UTC(y,m-1,day)).getUTCDay()]||null}const f=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});let d=new Date(Date.UTC(y+621,m-1,day));for(let i=0;i<370;i++,d.setUTCDate(d.getUTCDate()+1)){const p=Object.fromEntries(f.formatToParts(d).map(x=>[x.type,+x.value]));if(p.year===y&&p.month===m&&p.day===day)return persianDays[d.getUTCDay()]||null}}catch(e){}return null}
// Match the same source aliases used in Capacity Report. Prefer IDs; use unique
// center names only when the source does not provide a usable ID column.
function sourceColumn(headers,aliases){
  const exact=hindex(headers,aliases);if(exact>=0)return exact;
  const hs=headers.map(hnorm),as=aliases.map(hnorm);
  for(const a of as){const ix=hs.findIndex(h=>h&&a&&(h.includes(a)||a.includes(h)));if(ix>=0)return ix}
  return -1;
}
const capacityAliases={
  dkId:['Distribution Center ID','DC ID','distribution_center_id'],
  dkName:['Distribution Center','Distribution Center Name','DC Name','DC'],
  flexId:['Coverage Polygon ID','coverage_polygon_id','Polygon ID'],
  flexName:['Coverage Polygon','coverage_polygon','Hub Coverage Polygon','Polygon Name','Polygon'],
  date:['Date','Day','Capacity Date','تاریخ'],
  reserved:['Reserved','Capacity Reserved','Reserved Capacity','capacity_reserved','Shipping Reserved Capacity','shipping_reserved_capacity'],
  slot:['Time Slot','Time Scope','time_slot','time_scope']
};
function normalizeCapacityDate(value){
  const digits=String(value??'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g,'');
  return digits.length>=8?digits.slice(0,8):'';
}
function collectCapacity(d,kind,store){
  const headers=d.headers||[];
  const idIdx=sourceColumn(headers,capacityAliases[kind+'Id']);
  const nameIdx=sourceColumn(headers,capacityAliases[kind+'Name']);
  const dateIdx=sourceColumn(headers,capacityAliases.date);
  const rIdx=sourceColumn(headers,capacityAliases.reserved);
  if(idIdx<0&&nameIdx<0)throw Error(`No usable center ID/name in ${kind}: ${headers.join(', ').slice(0,320)}`);
  if(dateIdx<0||rIdx<0)throw Error(`Missing Date/Reserved column in ${kind}: ${headers.join(', ').slice(0,320)}`);
  const byName=new Map(),polygonIds=new Set();
  for(const poly of rows){const name=hnorm(poly.name),id=getId(poly);if(!name||!id)continue;polygonIds.add(id);if(!byName.has(name))byName.set(name,new Set());byName.get(name).add(id)}
  const grouped=new Map(),daysById=new Map();
  for(const row of d.rows){
    let id=idIdx>=0?cleanId(row[idIdx]):'';
    // Only map a source ID if it actually belongs to a polygon; otherwise allow unique name fallback.
    if(!polygonIds.has(id))id='';
    if(!id&&nameIdx>=0){const candidates=byName.get(hnorm(row[nameIdx]));if(candidates?.size===1)id=[...candidates][0]}
    if(!id)continue;
    const date=normalizeCapacityDate(row[dateIdx]);if(!date)continue;
    const raw=row[rIdx],numeric=Number(String(raw??'').replace(/[,٬\s]/g,''));
    if(!String(raw??'').trim()||!Number.isFinite(numeric))continue;
    if(!grouped.has(id))grouped.set(id,new Map());
    const byDate=grouped.get(id);byDate.set(date,(byDate.get(date)||0)+numeric);
    const day=dayName(date);if(day){if(!daysById.has(id))daysById.set(id,new Set());daysById.get(id).add(day)}
  }
  for(const [id,daily] of grouped){
    const v=store.get(id)||{};v[kind+'Daily']=daily;
    const days=daysById.get(id);
    if(days?.size)v.days=[...new Set([...(v.days||[]),...days])].sort((a,b)=>['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'].indexOf(a)-['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'].indexOf(b));
    store.set(id,v);
  }
}
async function loadExtras(){const results=await Promise.allSettled([loadMapper(),readSheet('DC Capacity (LG)','dspace'),readSheet('DC Capacity (Flex)','dspace')]);capacityById=new Map();if(results[1].status==='fulfilled'){try{collectCapacity(results[1].value,'dk',capacityById)}catch(e){results[1]={status:'rejected',reason:e}}}if(results[2].status==='fulfilled'){try{collectCapacity(results[2].value,'flex',capacityById)}catch(e){results[2]={status:'rejected',reason:e}}}const failed=results.map((x,i)=>x.status==='rejected'?['FlexHubMapper','DK Capacity','Flex Capacity'][i]+': '+x.reason.message:null).filter(Boolean);capacityLoadError=failed.join(' / ');return failed}
function csvEscape(v){const s=String(v??'');return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function fmtCoord(n){const x=Number(n);if(!Number.isFinite(x))return'';return String(Number(x.toFixed(10)))}
function ringToWkt(ring){const pts=(ring||[]).filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]))).map(p=>[Number(p[0]),Number(p[1])]);if(pts.length<3)return'';const first=pts[0],last=pts[pts.length-1];if(first[0]!==last[0]||first[1]!==last[1])pts.push([...first]);return pts.map(([lat,lon])=>`${fmtCoord(lon)} ${fmtCoord(lat)}`).join(', ')}
function polygonWkt(r){const parts=(r.coordinates||[]).map(ringToWkt).filter(Boolean);if(!parts.length)return'';if(parts.length===1)return `POLYGON ((${parts[0]}))`;return `MULTIPOLYGON (${parts.map(p=>`((${p}))`).join(', ')})`}
function safeCsvName(v){return String(v||'polygon').replace(/[\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120)||'polygon'}
function exportPolygonCsv(r){const wkt=polygonWkt(r);if(!wkt){$('#datasetStatus').textContent=`${r.name||'Polygon'}: no valid coordinates to export.`;$('#datasetStatus').className='status error';return}const csv=['WKT,name,description',[csvEscape(wkt),csvEscape(r.name||''),''].join(',')].join('\r\n')+'\r\n';const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeCsvName(r.name)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);$('#datasetStatus').textContent=`Exported ${r.name||'polygon'} as CSV.`;$('#datasetStatus').className='status ok'}
function render(){const q=$('#search').value.trim().toLocaleLowerCase();let a=(pointHits.length?pointHits:shown).filter(r=>!q||[r.name,r.dcId,r.stateId,r.iata,r.district,r.timeScope,cleanSubmit(r.submitType),natureLabel(r.natureId)].join(' ').toLocaleLowerCase().includes(q));a=[...a].sort((x,y)=>String(x[sortKey]??'').localeCompare(String(y[sortKey]??''),undefined,{numeric:true})*sortDir);$('#count').textContent=`${a.length} polygon${a.length===1?'':'s'}`;$('#results').innerHTML=a.length?`<table><thead><tr><th data-key="name">Name</th><th data-key="dcId">ID</th><th data-key="iata">IATA</th><th class="export-head" title="Export CSV">⇩</th></tr></thead><tbody>${a.map((r,i)=>`<tr data-id="${esc(r.dcId||r.stateId)}" data-name="${esc(r.name)}"><td>${esc(r.name)}</td><td>${esc(r.dcId||r.stateId||'-')}</td><td>${esc(r.iata||'-')}</td><td class="export-cell"><button type="button" class="polygon-export" data-export-index="${i}" title="Export ${esc(r.name)} as CSV" aria-label="Export ${esc(r.name)} as CSV"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/></svg></button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No polygons found.</div>';document.querySelectorAll('th[data-key]').forEach(h=>h.onclick=()=>{sortKey=h.dataset.key;sortDir*=-1;render()});document.querySelectorAll('tbody tr').forEach(tr=>tr.onclick=()=>focusPolygon(tr.dataset.id,tr.dataset.name));document.querySelectorAll('.polygon-export').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();const r=a[Number(btn.dataset.exportIndex)];if(r)exportPolygonCsv(r)})}
function applyFilters(){shown=rows.filter(pass);pointHits=[];draw(shown,false);render()}
function focusPolygon(id,name){const r=rows.find(x=>String(x.dcId||x.stateId)===String(id)&&String(x.name)===String(name))||rows.find(x=>String(x.dcId||x.stateId)===String(id));if(!r)return;polygons.clearLayers();(r.coordinates||[]).forEach(part=>L.polygon(part,{color:'#e11d48',weight:4,fillOpacity:.34}).addTo(polygons));const b=polygons.getBounds();if(b.isValid())map.fitBounds(b,{padding:[20,20]})}
function parseLatLonInput(value){const text=String(value||'').trim();const labeled=text.match(/lat(?:itude)?\s*=\s*([-+]?\d+(?:\.\d+)?)\s*[,;،]?\s*(?:long|lon|lng|longitude)\s*=\s*([-+]?\d+(?:\.\d+)?)/i);const p=labeled?[Number(labeled[1]),Number(labeled[2])]:text.split(/(?:\s*,\s*|\s+)/).filter(Boolean).map(Number);if(p.length!==2||p.some(x=>!Number.isFinite(x))||p[0]<-90||p[0]>90||p[1]<-180||p[1]>180)throw new Error('Use format: latitude, longitude; latitude longitude; or Lat=34.48162, Long=47.65790');return p}
function checkPoint(){let p;try{p=parseLatLonInput($('#latlon').value)}catch(e){$('#pointStatus').textContent=e.message;$('#pointStatus').className='status error';return}const [lat,lon]=p;searchedPoint=[lat,lon];points.clearLayers();L.marker(searchedPoint).addTo(points);const pt=turf.point([lon,lat]);pointHits=shown.filter(r=>(r.coordinates||[]).some(part=>{try{return turf.booleanPointInPolygon(pt,turf.polygon([[...part.map(c=>[c[1],c[0]])]]))}catch{return false}}));draw(shown,false);L.marker(searchedPoint).addTo(points);pointHits.forEach(r=>(r.coordinates||[]).forEach(part=>L.polygon(part,{color:'#e11d48',weight:4,fillOpacity:.32}).addTo(polygons)));$('#pointStatus').textContent=pointHits.length?`${pointHits.length} matching polygon(s)`:'No polygon contains this point.';$('#pointStatus').className='status '+(pointHits.length?'ok':'error');render();if(pointHits.length){const b=polygons.getBounds();if(b.isValid())map.fitBounds(b,{padding:[20,20]})}else map.setView([lat,lon],14)}
function reset(){document.querySelectorAll('.f-type').forEach(x=>x.checked=x.value==='Normal');document.querySelectorAll('.f-district').forEach(x=>x.checked=false);$('#search').value='';$('#latlon').value='';$('#pointStatus').textContent='';searchedPoint=null;pointHits=[];points.clearLayers();shown=rows.filter(pass);draw(shown,true);render()}
function normalizePickupIds(list){if(currentService!=='pickup')return list;return list.map(r=>{if((r.dcId===''||r.dcId==null)&&r.stateId!=='')r.dcId=r.stateId;return r;});}
async function loadDataset(service,{fit=true}={}){
  currentService=service;
  const cfg=DATASETS[service]||DATASETS.delivery;
  $('#datasetStatus').textContent=`Loading ${cfg.label} polygons…`;
  $('#datasetStatus').className='status';
  try{
    const dataset=await DXPolygonLoader.load(cfg.url);
    rows=normalizePickupIds(dataset.rows||[]);
    shown=[...rows];pointHits=[];searchedPoint=null;points.clearLayers();
    const district=[...new Set(rows.map(r=>String(r.district||'').split('(')[0].trim()).filter(Boolean))].sort();
    const typeValues=[...new Set(rows.map(r=>natureLabel(r.natureId)).filter(Boolean))].sort((a,b)=>Number(({Normal:1,Medium:2,Large:3,Barbari:4,Business:5,Fast:6,SuperMarket:7})[a]||99)-Number(({Normal:1,Medium:2,Large:3,Barbari:4,Business:5,Fast:6,SuperMarket:7})[b]||99));
    makeFilter($('#typeFilters'),typeValues,'f-type');document.querySelectorAll('.f-type').forEach(x=>x.checked=x.value==='Normal');
    makeFilter($('#districtFilters'),district,'f-district');
    $('#search').value='';$('#latlon').value='';$('#pointStatus').textContent='';
    shown=rows.filter(pass);draw(shown,fit);render();
    $('#datasetStatus').textContent=capacityLoadError?`Partial data: ${capacityLoadError}`:`${cfg.label}: ${rows.length} polygons loaded; ${hubIds.size} Hub IDs mapped; ${capacityById.size} capacity records ready.`;
    $('#datasetStatus').className=capacityLoadError?'status error':'status ok';
  }catch(e){
    rows=[];shown=[];polygons.clearLayers();render();
    $('#datasetStatus').textContent='Polygon map load failed: '+(e?.message||String(e));
    $('#datasetStatus').className='status error';
  }
}
async function init(){
  document.querySelectorAll('input[name=polygonService]').forEach(r=>r.addEventListener('change',()=>{if(r.checked)loadDataset(r.value,{fit:true})}));
  await loadDataset(currentService,{fit:true});
  if(!rows.length)return;
  $('#datasetStatus').textContent=`${rows.length} polygons loaded. Loading capacity data...`;
  setTimeout(()=>{
    loadExtras().then(failures=>{
      restyle();
      $('#datasetStatus').textContent=failures.length?'Partial data: '+failures.join(' / '):`${rows.length} polygons loaded; ${hubIds.size} Hubs mapped; ${capacityById.size} capacity records ready.`;
      $('#datasetStatus').className=failures.length?'status error':'status ok';
    }).catch(e=>{
      $('#datasetStatus').textContent='Map loaded; capacity unavailable: '+String(e?.message||e);
      $('#datasetStatus').className='status error';
    });
  },250);
}
$('#check').onclick=checkPoint;$('#latlon').addEventListener('keydown',e=>{if(e.key==='Enter')checkPoint()});$('#search').addEventListener('input',render);$('#reset').onclick=reset;$('#reserveFrom').value=reserveFrom;$('#reserveTo').value=reserveTo;$('#reserveFrom').addEventListener('change',updateReserveRange);$('#reserveTo').addEventListener('change',updateReserveRange);updateReserveRange();armMapVisibilityRefresh();init();

window.addEventListener('unhandledrejection',event=>{const e=event.reason;console.error('Hub Coverage error:',e);const el=document.getElementById('datasetStatus');if(el&&!rows.length){el.textContent='Map startup error: '+String(e?.message||e);el.className='status error';}});
