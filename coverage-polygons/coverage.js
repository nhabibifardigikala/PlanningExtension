const DATASETS={
  delivery:{label:'Delivery',url:'sheet:Delivery Polygons'},
  pickup:{label:'Pickup',url:'sheet:Pick-up Polygons'}
};
const PICKUP_STATUS_SOURCE={spreadsheetId:'1Lmi-6SgJdC2O91KDeqrobPHq_jIKvdDSlZ3_NLgFVJg',sheetName:'Pickup Capacity'};
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

function statusKey(v){return String(v??'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e]/g,' ').replace(/\s+/g,' ').trim().toLowerCase()}
function headerIndex(headers,names){const h=(headers||[]).map(statusKey);for(const name of names){const key=statusKey(name),i=h.indexOf(key);if(i>=0)return i}return -1}
async function markInactivePickupPolygons(list){
  const legend=document.getElementById('inactivePickupLegend');if(legend)legend.style.display='none';
  if(currentService!=='pickup'||!Array.isArray(list)||!list.length)return {count:0,error:''};
  if(!globalThis.DigiExpressPlatform?.call)return {count:0,error:'Stable Host Sheets bridge is unavailable.'};
  try{
    const table=await DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:PICKUP_STATUS_SOURCE.spreadsheetId,sheetName:PICKUP_STATUS_SOURCE.sheetName,limit:100000});
    const headers=table?.headers||[],data=table?.rows||[];
    const activeI=headerIndex(headers,['Active']),idI=headerIndex(headers,['Coverage Polygon ID','Coverage Polygon Id','Polygon ID']),nameI=headerIndex(headers,['Coverage Polygon','Coverage Polygon Name','Polygon']),dateI=headerIndex(headers,['Creation Date','Created At','Date']);
    if(activeI<0||(idI<0&&nameI<0))throw new Error(`Pickup Capacity status columns were not found. Headers: ${headers.join(' | ')}`);
    const latestById=new Map(),latestByName=new Map();
    const dateRank=v=>{const digits=String(v??'').replace(/\D/g,'');return digits?Number(digits):0};
    const remember=(map,key,state,rank,rowIndex)=>{if(!key)return;const prev=map.get(key);if(!prev||rank>prev.rank||(rank===prev.rank&&rowIndex>prev.rowIndex))map.set(key,{inactive:state,rank,rowIndex})};
    data.forEach((row,rowIndex)=>{const active=statusKey(row?.[activeI]),inactive=active==='0'||active==='false'||active==='no'||active==='inactive';const id=idI>=0?String(row?.[idI]??'').trim():'';const name=nameI>=0?statusKey(row?.[nameI]):'';const rank=dateI>=0?dateRank(row?.[dateI]):0;remember(latestById,id,inactive,rank,rowIndex);remember(latestByName,name,inactive,rank,rowIndex)});
    let count=0;for(const r of list){const ids=[r?.stateId,r?.dcId].map(v=>String(v??'').trim()).filter(Boolean);let inactive=false;for(const id of ids){const status=latestById.get(id);if(status){inactive=!!status.inactive;break}}if(!ids.some(id=>latestById.has(id))){const status=latestByName.get(statusKey(r?.name));inactive=!!status?.inactive}r.inactivePickup=inactive;if(inactive)count++}
    if(legend)legend.style.display=count?'':'none';return {count,error:''};
  }catch(error){for(const r of list)r.inactivePickup=false;return {count:0,error:String(error?.message||error)}}
}
function natureLabel(n){return ({1:'Normal',2:'Medium',3:'Large',4:'Barbari',5:'Business',6:'Fast',7:'SuperMarket',8:'Post'})[Number(n)]||String(n??'-')}
function polyColor(n){return ({1:'#1976d2',2:'#16a34a',3:'#7c3aed',4:'#2563eb',5:'#d946ef',6:'#0891b2',7:'#0f766e'})[Number(n)]||'#64748b'}
function cleanSubmit(v){return String(v||'').replace(/^EXPRESS\s+/i,'').trim()||'-'}
function makeFilter(host, values, cls){host.innerHTML=values.map(v=>`<label class="filter-chip"><input type="checkbox" class="${cls}" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('');host.querySelectorAll('input').forEach(x=>x.addEventListener('change',applyFilters))}
function selected(cls){return [...document.querySelectorAll('.'+cls+':checked')].map(x=>x.value)}
function pass(r){const ts=selected('f-type'),ds=selected('f-district');if(!ts.includes(natureLabel(r.natureId)))return false;if(ds.length&&!ds.some(x=>String(r.district||'').startsWith(x)))return false;return true}
function draw(list,fit=false){polygons.clearLayers();list.forEach(r=>(r.coordinates||[]).forEach(part=>{if(!Array.isArray(part)||part.length<3)return;const poly=L.polygon(part,{color:(currentService==='pickup'&&r.inactivePickup)?'#dc2626':polyColor(r.natureId),weight:(currentService==='pickup'&&r.inactivePickup)?3:2,fillOpacity:(currentService==='pickup'&&r.inactivePickup)?.28:.22}).addTo(polygons);poly.bindPopup(`<b>${esc(r.name)}</b><br>ID: ${esc(r.dcId||r.stateId||'-')}<br>IATA: ${esc(r.iata||'-')}`)}));if(searchedPoint)L.marker(searchedPoint).addTo(points);if(fit){const b=polygons.getBounds();if(b.isValid()){lastFitBounds=b;map.invalidateSize({pan:false,animate:false});map.fitBounds(b,{padding:[12,12],animate:false});setTimeout(()=>refreshMapSize(true),120)}}}
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
    const inactiveStatus=await markInactivePickupPolygons(rows);
    shown=[...rows];pointHits=[];searchedPoint=null;points.clearLayers();
    const district=[...new Set(rows.map(r=>String(r.district||'').split('(')[0].trim()).filter(Boolean))].sort();
    const typeValues=[...new Set(rows.map(r=>natureLabel(r.natureId)).filter(Boolean))].sort((a,b)=>Number(({Normal:1,Medium:2,Large:3,Barbari:4,Business:5,Fast:6,SuperMarket:7,Post:8})[a]||99)-Number(({Normal:1,Medium:2,Large:3,Barbari:4,Business:5,Fast:6,SuperMarket:7,Post:8})[b]||99));
    makeFilter($('#typeFilters'),typeValues,'f-type');document.querySelectorAll('.f-type').forEach(x=>x.checked=x.value==='Normal');
    makeFilter($('#districtFilters'),district,'f-district');
    $('#search').value='';$('#latlon').value='';$('#pointStatus').textContent='';
    shown=rows.filter(pass);draw(shown,fit);render();
    $('#datasetStatus').textContent=`${cfg.label}: ${rows.length} polygons loaded.${currentService==='pickup'&&inactiveStatus.count?` ${inactiveStatus.count} inactive polygon(s) marked red.`:''}${currentService==='pickup'&&inactiveStatus.error?` Inactive status unavailable: ${inactiveStatus.error}`:''}`;
    $('#datasetStatus').className='status '+(currentService==='pickup'&&inactiveStatus.error?'error':'ok');
  }catch(e){
    rows=[];shown=[];polygons.clearLayers();render();
    $('#datasetStatus').textContent=e.message||String(e);
    $('#datasetStatus').className='status error';
  }
}
async function init(){
  document.querySelectorAll('input[name=polygonService]').forEach(r=>r.addEventListener('change',()=>{if(r.checked)loadDataset(r.value,{fit:true})}));
  await loadDataset(currentService,{fit:true});
}
$('#check').onclick=checkPoint;$('#latlon').addEventListener('keydown',e=>{if(e.key==='Enter')checkPoint()});$('#search').addEventListener('input',render);$('#reset').onclick=reset;armMapVisibilityRefresh();init();
