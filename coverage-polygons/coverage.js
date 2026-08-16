
const DATA='../data/DX_Polygons.json?v=93';
let rows=[],shown=[],pointHits=[],searchedPoint=null,sortKey='name',sortDir=1;
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const map=L.map('map',{zoomControl:true}).setView([32,51],6), polygons=L.layerGroup().addTo(map), points=L.layerGroup().addTo(map);

const TILE_BRIDGE_ORIGIN='https://nhabibifardigikala.github.io';
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

function natureLabel(n){return ({1:'Normal',2:'Medium',3:'Large',4:'Barbari',5:'Business',6:'Fast'})[Number(n)]||String(n??'-')}
function polyColor(n){return ({1:'#1976d2',2:'#16a34a',3:'#7c3aed',4:'#F79009',5:'#d946ef',6:'#0891b2'})[Number(n)]||'#64748b'}
function cleanSubmit(v){return String(v||'').replace(/^EXPRESS\s+/i,'').trim()||'-'}
function makeFilter(host, values, cls){host.innerHTML=values.map(v=>`<label class="filter-chip"><input type="checkbox" class="${cls}" value="${esc(v)}"><span>${esc(v)}</span></label>`).join('');host.querySelectorAll('input').forEach(x=>x.addEventListener('change',applyFilters))}
function selected(cls){return [...document.querySelectorAll('.'+cls+':checked')].map(x=>x.value)}
function pass(r){const ts=selected('f-type'),ds=selected('f-district'),ss=selected('f-submit'),as=selected('f-active');if(ts.length&&!ts.includes(natureLabel(r.natureId)))return false;if(ds.length&&!ds.some(x=>String(r.district||'').startsWith(x)))return false;if(ss.length&&!ss.includes(cleanSubmit(r.submitType)))return false;const av=Number(r.active)===1?'YES':'NO';if(as.length&&!as.includes(av))return false;return true}
function draw(list,fit=false){polygons.clearLayers();list.forEach(r=>(r.coordinates||[]).forEach(part=>{if(!Array.isArray(part)||part.length<3)return;const poly=L.polygon(part,{color:polyColor(r.natureId),weight:2,fillOpacity:.22}).addTo(polygons);poly.bindPopup(`<b>${esc(r.name)}</b><br>ID: ${esc(r.dcId)}<br>IATA: ${esc(r.iata||'-')}<br>Type: ${esc(natureLabel(r.natureId))}<br>Time Scope: ${esc(r.timeScope||'-')}`)}));if(searchedPoint)L.marker(searchedPoint).addTo(points);if(fit){const b=polygons.getBounds();if(b.isValid()){lastFitBounds=b;map.invalidateSize({pan:false,animate:false});map.fitBounds(b,{padding:[12,12],animate:false});setTimeout(()=>refreshMapSize(true),120)}}}
function render(){const q=$('#search').value.trim().toLocaleLowerCase();let a=(pointHits.length?pointHits:shown).filter(r=>!q||[r.name,r.dcId,r.iata,r.district,r.timeScope,cleanSubmit(r.submitType),natureLabel(r.natureId)].join(' ').toLocaleLowerCase().includes(q));a=[...a].sort((x,y)=>String(x[sortKey]??'').localeCompare(String(y[sortKey]??''),undefined,{numeric:true})*sortDir);$('#count').textContent=`${a.length} polygon${a.length===1?'':'s'}`;$('#results').innerHTML=a.length?`<table><thead><tr><th data-key="name">Name</th><th data-key="dcId">ID</th><th data-key="natureId">Type</th><th data-key="iata">IATA</th><th data-key="timeScope">Time Scope</th></tr></thead><tbody>${a.map(r=>`<tr data-id="${esc(r.dcId)}" data-name="${esc(r.name)}"><td>${esc(r.name)}</td><td>${esc(r.dcId)}</td><td>${esc(natureLabel(r.natureId))}</td><td>${esc(r.iata||'-')}</td><td>${esc(r.timeScope||'-')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No polygons found.</div>';document.querySelectorAll('th[data-key]').forEach(h=>h.onclick=()=>{sortKey=h.dataset.key;sortDir*=-1;render()});document.querySelectorAll('tbody tr').forEach(tr=>tr.onclick=()=>focusPolygon(tr.dataset.id,tr.dataset.name))}
function applyFilters(){shown=rows.filter(pass);pointHits=[];draw(shown,true);render()}
function focusPolygon(id,name){const r=rows.find(x=>String(x.dcId)===String(id)&&String(x.name)===String(name))||rows.find(x=>String(x.dcId)===String(id));if(!r)return;polygons.clearLayers();(r.coordinates||[]).forEach(part=>L.polygon(part,{color:'#e11d48',weight:4,fillOpacity:.34}).addTo(polygons));const b=polygons.getBounds();if(b.isValid())map.fitBounds(b,{padding:[20,20]})}
function checkPoint(){const p=$('#latlon').value.split(',').map(x=>Number(x.trim()));if(p.length!==2||p.some(Number.isNaN)){$('#pointStatus').textContent='Use format: latitude, longitude';$('#pointStatus').className='status error';return}const [lat,lon]=p;searchedPoint=[lat,lon];points.clearLayers();L.marker(searchedPoint).addTo(points);const pt=turf.point([lon,lat]);pointHits=shown.filter(r=>(r.coordinates||[]).some(part=>{try{return turf.booleanPointInPolygon(pt,turf.polygon([[...part.map(c=>[c[1],c[0]])]]))}catch{return false}}));draw(shown,false);L.marker(searchedPoint).addTo(points);pointHits.forEach(r=>(r.coordinates||[]).forEach(part=>L.polygon(part,{color:'#e11d48',weight:4,fillOpacity:.32}).addTo(polygons)));$('#pointStatus').textContent=pointHits.length?`${pointHits.length} matching polygon(s)`:'No polygon contains this point.';$('#pointStatus').className='status '+(pointHits.length?'ok':'error');render();if(pointHits.length){const b=polygons.getBounds();if(b.isValid())map.fitBounds(b,{padding:[20,20]})}else map.setView([lat,lon],14)}
function reset(){document.querySelectorAll('.filter-chip input').forEach(x=>x.checked=false);$('#search').value='';$('#latlon').value='';$('#pointStatus').textContent='';searchedPoint=null;pointHits=[];points.clearLayers();shown=[...rows];draw(shown,true);render()}
async function init(){try{const j=await fetch(DATA,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Dataset unavailable');return r.json()});rows=Array.isArray(j)?j:(j.rows||[]);shown=[...rows];const district=[...new Set(rows.map(r=>String(r.district||'').split('(')[0].trim()).filter(Boolean))].sort();const submit=[...new Set(rows.map(r=>cleanSubmit(r.submitType)).filter(x=>x&&x!=='-'))].sort();makeFilter($('#typeFilters'),['Normal','Medium','Large','Barbari','Business','Fast'],'f-type');makeFilter($('#districtFilters'),district,'f-district');makeFilter($('#submitFilters'),submit,'f-submit');makeFilter($('#activeFilters'),['YES','NO'],'f-active');draw(shown,true);render()}catch(e){$('#results').innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
$('#check').onclick=checkPoint;$('#latlon').addEventListener('keydown',e=>{if(e.key==='Enter')checkPoint()});$('#search').addEventListener('input',render);$('#reset').onclick=reset;armMapVisibilityRefresh();init();
