(() => {
  const VERSION = 289;
  const SHEET_ID = '1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
  const SHEET_NAME = 'Distribution Centers (LG)';
  const CACHE_KEY = `dxCapacityReportLastV${VERSION}`;
  const state = { centers: [], flexCenters: [], allCenters: [], source: 'dk', busy: false };
  const $ = id => document.getElementById(id);
  const qs = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => [...root.querySelectorAll(s)];
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[\u200c\u200f\u202a-\u202e]/g,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => { const n = Number(String(v ?? '').replace(/[^\d.-]/g,'')); return Number.isFinite(n) ? n : null; };
  const fmt = v => v == null || !Number.isFinite(Number(v)) ? '—' : Math.round(Number(v)).toLocaleString('en-US');
  const latinDigits = v => String(v ?? '').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const validUrl = v => /^https?:\/\//i.test(String(v||''));


  const jDiv=(a,b)=>Math.trunc(a/b), jMod=(a,b)=>a-jDiv(a,b)*b;
  function jalCal(jy){const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];let gy=jy+621,leapJ=-14,jp=breaks[0],jm=0,jump=0,n=0;if(jy<jp||jy>=breaks[breaks.length-1])return{gy,march:20,leap:1};for(let i=1;i<breaks.length;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=jDiv(jump,33)*8+jDiv(jMod(jump,33),4);jp=jm;}n=jy-jp;leapJ+=jDiv(n,33)*8+jDiv(jMod(n,33)+3,4);if(jMod(jump,33)===4&&jump-n===4)leapJ++;const leapG=jDiv(gy,4)-jDiv((jDiv(gy,100)+1)*3,4)-150,march=20+leapJ-leapG;if(jump-n<6)n=n-jump+jDiv(jump+4,33)*33;let leap=jMod(jMod(n+1,33)-1,4);if(leap===-1)leap=4;return{gy,march,leap};}
  function g2d(gy,gm,gd){let d=jDiv((gy+jDiv(gm-8,6)+100100)*1461,4)+jDiv(153*jMod(gm+9,12)+2,5)+gd-34840408;d=d-jDiv(jDiv(gy+100100+jDiv(gm-8,6),100)*3,4)+752;return d;}
  function d2g(jdn){let j=4*jdn+139361631;j=j+jDiv(jDiv(4*jdn+183187720,146097)*3,4)*4-3908;const i=jDiv(jMod(j,1461),4)*5+308;const gd=jDiv(jMod(i,153),5)+1,gm=jMod(jDiv(i,153),12)+1,gy=jDiv(j,1461)-100100+jDiv(8-gm,6);return{gy,gm,gd};}
  function j2g(jy,jm,jd){const r=jalCal(jy),jdn=g2d(r.gy,3,r.march)+(jm-1)*31-jDiv(jm,7)*(jm-7)+jd-1;return d2g(jdn);}
  function jalaliWeekOffset(y,m){try{const g=j2g(y,m,1);return(new Date(Date.UTC(g.gy,g.gm-1,g.gd)).getUTCDay()+1)%7;}catch(_){return 0;}}
  function currentJalaliParts(){try{const parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));return{y:Number(obj.year),m:Number(obj.month),d:Number(obj.day)};}catch(_){return{y:1405,m:1,d:1};}}
  const jalaliMonthDays=(y,m)=>m<=6?31:m<=11?30:(jalCal(y).leap===0?30:29);
  function setupJalaliPicker(inputId){
    const input=$(inputId),wrap=input?.closest('.jalali-picker-wrap'),toggle=wrap?.querySelector(`[data-picker-for="${inputId}"]`),pop=wrap?.querySelector(`[data-picker="${inputId}"]`); if(!input||!toggle||!pop)return;
    const today=currentJalaliParts(); let view={...today};
    const readView=()=>{const raw=latinDigits(input.value).replace(/\D/g,'');if(/^\d{8}$/.test(raw)){const y=Number(raw.slice(0,4)),m=Number(raw.slice(4,6)),d=Number(raw.slice(6,8));if(m>=1&&m<=12&&d>=1&&d<=jalaliMonthDays(y,m))view={y,m,d};else view={...today};}else view={...today};};
    const close=()=>pop.classList.add('hidden');
    const setValue=(y,m,d)=>{input.value=`${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();};
    const render=()=>{const days=jalaliMonthDays(view.y,view.m),selected=latinDigits(input.value).replace(/\D/g,''),offset=jalaliWeekOffset(view.y,view.m);pop.innerHTML=`<div class="jalali-cal-head"><button type="button" data-cal-prev aria-label="Previous month">‹</button><strong>${view.y}/${String(view.m).padStart(2,'0')}</strong><button type="button" data-cal-next aria-label="Next month">›</button></div><div class="jalali-week"><span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span></div><div class="jalali-days">${'<span class="jalali-day-pad"></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>{const d=i+1,val=`${view.y}${String(view.m).padStart(2,'0')}${String(d).padStart(2,'0')}`;return`<button type="button" data-jday="${d}" class="${selected===val?'selected':''}">${d}</button>`}).join('')}</div><div class="jalali-cal-foot"><button type="button" data-cal-today>Today</button></div>`;pop.querySelector('[data-cal-prev]').onclick=e=>{e.stopPropagation();if(--view.m<1){view.m=12;view.y--;}render();};pop.querySelector('[data-cal-next]').onclick=e=>{e.stopPropagation();if(++view.m>12){view.m=1;view.y++;}render();};pop.querySelector('[data-cal-today]').onclick=e=>{e.stopPropagation();setValue(today.y,today.m,today.d);};pop.querySelectorAll('[data-jday]').forEach(b=>b.onclick=e=>{e.stopPropagation();setValue(view.y,view.m,Number(b.dataset.jday));});};
    const open=e=>{e?.preventDefault();e?.stopPropagation();readView();render();document.querySelectorAll('.jalali-picker').forEach(x=>{if(x!==pop)x.classList.add('hidden')});pop.classList.remove('hidden');};
    toggle.addEventListener('click',open); input.addEventListener('dblclick',open); input.addEventListener('keydown',e=>{if((e.altKey&&e.key==='ArrowDown')||e.key==='F4')open(e);else if(e.key==='Escape')close();}); document.addEventListener('click',e=>{if(!wrap.contains(e.target))close();});
  }

  const qp = new URLSearchParams(location.search);
  const theme = qp.get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;

  function setStatus(text, kind='') {
    const el = $('status'); if (!el) return;
    el.textContent = text || '';
    el.className = `status${kind ? ' ' + kind : ''}`;
  }

  function setBusy(busy) {
    state.busy = !!busy;
    const b = $('runReport'); if (b) { b.disabled = state.busy; b.textContent = state.busy ? 'Running…' : 'Run Capacity Report'; }
  }

  function requestHostOperation(inputs, timeoutMs=180000) {
    return new Promise((resolve, reject) => {
      const requestId = `cap-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Capacity Report timed out while waiting for Digiexpress Host.'));
      }, timeoutMs);
      function onMessage(event) {
        if (event.source !== parent) return;
        const d = event.data || {};
        if (d.type !== 'DIGIEXPRESS_REMOTE_OPERATION_RESULT' || d.requestId !== requestId) return;
        clearTimeout(timer); window.removeEventListener('message', onMessage);
        if (!d.ok) reject(new Error(d.error || 'Capacity Report failed.'));
        else resolve(d.result || {});
      }
      window.addEventListener('message', onMessage);
      parent.postMessage({type:'DIGIEXPRESS_REMOTE_OPERATION_REQUEST', requestId, op:'capacity-report', inputs}, '*');
    });
  }

  function loadCenters() {
    if (state.allCenters.length) return Promise.resolve(state.allCenters);
    return new Promise((resolve, reject) => {
      const cb = `__dxCapCenters_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => cleanup(new Error('Distribution Center list timed out.')), 15000);
      const cleanup = err => {
        clearTimeout(timer);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
        script.remove();
        if (err) reject(err);
      };
      window[cb] = data => {
        try {
          const rows = data?.table?.rows || [];
          const list = rows.map(r => {
            const cells = r.c || [];
            return { id: String(cells[0]?.v ?? '').replace(/\.0$/,''), name: String(cells[1]?.v ?? '').trim() };
          }).filter(x => x.id && x.name);
          if (!list.length) throw new Error('Distribution Center list is empty.');
          state.allCenters = list;
          cleanup(); resolve(list);
        } catch (e) { cleanup(e); }
      };
      const tq = encodeURIComponent("select A,B label A 'id', B 'name'");
      const tqx = encodeURIComponent(`out:json;responseHandler:${cb}`);
      script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(SHEET_NAME)}&headers=3&tq=${tq}&tqx=${tqx}`;
      script.onerror = () => cleanup(new Error('Could not load Distribution Centers from Google Sheets.'));
      document.head.appendChild(script);
    });
  }

  function rank(item, query) {
    const n = norm(item.name), id = String(item.id), q = norm(query);
    if (id === query.trim()) return 0;
    if (n === q) return 1;
    if (n.startsWith(q)) return 5 + (n.length-q.length)/1000;
    const idx = n.indexOf(q); return idx >= 0 ? 20 + idx/100 : 100;
  }

  function matchesCenter(item, query) {
    const q = norm(query); if (!q) return false;
    return norm(item.name).includes(q) || String(item.id).includes(query.trim());
  }

  function renderCenterMenu(input, menu, mode) {
    const query = input.value.trim();
    if (query.length < 1) { menu.classList.add('hidden'); return; }
    const numericQuery = latinDigits(query).trim();
    if (mode === 'flex' && /^\d+(?:\s+\d+)*$/.test(numericQuery)) {
      const ids=numericQuery.split(/\s+/).filter(Boolean);
      menu.innerHTML = `<button type="button" data-flex-raw-ids="${esc(ids.join(' '))}" class="active"><span>${ids.length===1?`Use Flex ID ${esc(ids[0])}`:`Use ${ids.length} Flex IDs`}</span><small>${esc(ids.join(' · '))}</small></button>`;
      menu.classList.remove('hidden');
      const btn=qs('[data-flex-raw-ids]',menu);
      if(btn)btn.onclick=()=>addRawFlexIds(btn.dataset.flexRawIds||'');
      return;
    }
    loadCenters().then(list => {
      const selected = mode === 'dk' ? state.centers : state.flexCenters;
      const selectedIds = new Set(selected.filter(x=>x.lookupMode!=='id').map(x=>String(x.id)));
      const found = list.filter(x => matchesCenter(x, query) && !selectedIds.has(String(x.id)))
        .sort((a,b)=>rank(a,query)-rank(b,query) || a.name.localeCompare(b.name)).slice(0,30);
      if (!found.length) { menu.innerHTML = '<div class="empty">No matching Distribution Center</div>'; menu.classList.remove('hidden'); return; }
      menu.innerHTML = found.map((x,i)=>`<button type="button" data-id="${esc(x.id)}" data-name="${esc(x.name)}" class="${i===0?'active':''}"><span>${esc(x.name)}</span><small>${mode==='flex'?'Select by name':`ID ${esc(x.id)}`}</small></button>`).join('');
      menu.classList.remove('hidden');
      qsa('button', menu).forEach(btn => btn.onclick = () => selectCenter(mode, btn.dataset.id, btn.dataset.name));
    }).catch(e => { menu.innerHTML = `<div class="empty">${esc(e.message||e)}</div>`; menu.classList.remove('hidden'); });
  }

  function selectCenter(mode, id, name) {
    if (mode === 'dk') {
      if (!state.centers.some(x => String(x.id) === String(id))) state.centers.push({id:String(id),name:String(name||id)});
      $('dkCentersInput').value = ''; $('dkMenu').classList.add('hidden'); renderChips();
    } else {
      const centerName=String(name||id);
      if (!state.flexCenters.some(x => x.lookupMode==='name' && norm(x.name) === norm(centerName))) {
        state.flexCenters.push({id:String(id||''),name:centerName,lookupMode:'name',flexId:''});
      }
      $('flexCenterInput').value = '';
      $('flexMenu').classList.add('hidden');
      renderFlexChips();
    }
  }

  function renderChips() {
    $('dkChips').innerHTML = state.centers.map((x,i)=>`<span class="chip"><span>${esc(x.name)}</span><small>${x.name===x.id?'':`ID ${esc(x.id)}`}</small><button type="button" data-remove-dk="${i}" aria-label="Remove">×</button></span>`).join('');
    qsa('[data-remove-dk]', $('dkChips')).forEach(b => b.onclick = () => { state.centers.splice(Number(b.dataset.removeDk),1); renderChips(); });
  }

  function renderFlexChips() {
    $('flexChips').innerHTML = state.flexCenters.map((x,i)=>{
      const byId=x.lookupMode==='id';
      const title=byId?`Flex ID ${esc(x.flexId||x.id)}`:esc(x.name);
      const meta=byId?'ID lookup':'Name lookup';
      return `<span class="chip"><span>${title}</span><small>${meta}</small><button type="button" data-remove-flex="${i}" aria-label="Remove">×</button></span>`;
    }).join('');
    qsa('[data-remove-flex]', $('flexChips')).forEach(b => b.onclick = () => { state.flexCenters.splice(Number(b.dataset.removeFlex),1); renderFlexChips(); });
  }

  function addRawFlexIds(raw) {
    const parts = latinDigits(raw).trim().split(/\s+/).filter(Boolean);
    if (!parts.length || !parts.every(x=>/^\d+$/.test(x))) return false;
    for (const id of parts) {
      if (!state.flexCenters.some(x=>x.lookupMode==='id' && String(x.flexId||x.id)===id)) {
        state.flexCenters.push({id,name:`Flex ID ${id}`,lookupMode:'id',flexId:id});
      }
    }
    $('flexCenterInput').value=''; $('flexMenu').classList.add('hidden'); renderFlexChips(); return true;
  }

  function addRawDkIds(raw) {
    const parts = latinDigits(raw).trim().split(/\s+/).filter(Boolean);
    if (!parts.length || !parts.every(x=>/^\d+$/.test(x))) return false;
    for (const id of parts) if (!state.centers.some(x=>String(x.id)===id)) state.centers.push({id,name:id});
    $('dkCentersInput').value=''; $('dkMenu').classList.add('hidden'); renderChips(); return true;
  }

  function bindAutocomplete() {
    const dkI=$('dkCentersInput'), dkM=$('dkMenu'), fxI=$('flexCenterInput'), fxM=$('flexMenu');
    dkI.addEventListener('input',()=>renderCenterMenu(dkI,dkM,'dk'));
    dkI.addEventListener('keydown',e=>{
      if(e.key!=='Enter')return;
      const first=qs('button',dkM);
      if(!dkM.classList.contains('hidden')&&first){e.preventDefault();selectCenter('dk',first.dataset.id,first.dataset.name);return;}
      if(addRawDkIds(dkI.value))e.preventDefault();
    });
    fxI.addEventListener('input',()=>renderCenterMenu(fxI,fxM,'flex'));
    fxI.addEventListener('keydown',e=>{
      if(e.key!=='Enter')return;
      if(addRawFlexIds(fxI.value)){e.preventDefault();return;}
      const first=qs('button[data-id]',fxM);
      if(first&&!fxM.classList.contains('hidden')){e.preventDefault();selectCenter('flex',first.dataset.id,first.dataset.name);}
    });
    document.addEventListener('click',e=>{if(!e.target.closest('.autocomplete')){dkM.classList.add('hidden');fxM.classList.add('hidden');}});
  }

  function setSource(source) {
    state.source = source === 'flex' ? 'flex' : 'dk';
    $('dkCentersField').classList.toggle('hidden', state.source !== 'dk');
    $('flexCenterField').classList.toggle('hidden', state.source !== 'flex');
    $('aggregateWrap').classList.toggle('hidden', state.source !== 'dk');
  }

  function headerIndex(headers, aliases) {
    const hs = headers.map(norm);
    const as = aliases.map(norm).filter(Boolean);
    // Prefer exact header matches before any fuzzy matching. This matters on Flex where
    // "time slot id" appears before "time slot" and several reserved-capacity columns coexist.
    for (const n of as) { const i = hs.findIndex(h => h === n); if (i >= 0) return i; }
    for (const n of as) { const i = hs.findIndex(h => h && (h.includes(n) || n.includes(h))); if (i >= 0) return i; }
    return -1;
  }

  const aliases = {
    date:['date','day','capacity date','تاریخ'],
    time:['time scope','time_scope','timescope','time slot','time_slot'],
    capacity:['capacity'],
    reserved:['capacity reserved','reserved capacity','capacity_reserved','shipping reserved capacity','shipping_reserved_capacity'],
    dcId:['distribution center id','dc id','distribution_center_id'],
    dcName:['distribution center','distribution center name','dc name','dc'],
    coveragePolygon:['coverage polygon','coverage_polygon','hub coverage polygon','hub coverage polygons','polygon name','polygon']
  };

  function findCenterForRow(headers,row,centers){
    const idIdx=headerIndex(headers,aliases.dcId), nameIdx=headerIndex(headers,aliases.dcName);
    if(idIdx>=0){const x=String(row[idIdx]??'').trim();const m=centers.filter(c=>x===String(c.id)||new RegExp(`(^|\\D)${String(c.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(\\D|$)`).test(x));if(m.length===1)return m[0];}
    if(nameIdx>=0){const x=norm(row[nameIdx]);const exact=centers.filter(c=>norm(c.name)===x);if(exact.length===1)return exact[0];const partial=centers.filter(c=>x&&norm(c.name)&&(x.includes(norm(c.name))||norm(c.name).includes(x)));if(partial.length===1)return partial[0];}
    for(const cell of row){const x=String(cell??'');const m=centers.filter(c=>x===String(c.id)||norm(x)===norm(c.name));if(m.length===1)return m[0];}
    return null;
  }

  function summary(values){const a=values.filter(v=>v!=null);if(!a.length)return{min:null,avg:null,max:null};return{min:Math.min(...a),avg:a.reduce((s,v)=>s+v,0)/a.length,max:Math.max(...a)}}

  function groupRows(headers,rows){
    const ti=headerIndex(headers,aliases.time);const m=new Map();
    for(const row of rows){const key=ti>=0?(String(row[ti]??'').trim()||'All'):'All';if(!m.has(key))m.set(key,[]);m.get(key).push(row);}
    return [...m].map(([label,rr])=>({label,rows:rr}));
  }

  function aggregateRows(headers, rows) {
    const di=headerIndex(headers,aliases.date), ci=headerIndex(headers,aliases.capacity), ri=headerIndex(headers,aliases.reserved);
    const map=new Map();
    for(const row of rows){const date=di>=0?String(row[di]??'').trim():'';const key=date||'Unknown date';if(!map.has(key))map.set(key,{date:key,capacity:0,reserved:0,hasC:false,hasR:false});const o=map.get(key);const c=ci>=0?num(row[ci]):null,r=ri>=0?num(row[ri]):null;if(c!=null){o.capacity+=c;o.hasC=true}if(r!=null){o.reserved+=r;o.hasR=true}}
    const outHeaders=['Date','Capacity','Capacity Reserved'];
    const outRows=[...map.values()].map(o=>[o.date,o.hasC?o.capacity:'',o.hasR?o.reserved:'']);
    return {headers:outHeaders,rows:outRows};
  }

  function normalizeFlexDataset(headers, rows) {
    const pi=headerIndex(headers,aliases.coveragePolygon);
    const ti=headerIndex(headers,aliases.time);
    const di=headerIndex(headers,aliases.date);
    const ri=headerIndex(headers,['shipping reserved capacity','shipping_reserved_capacity']);
    const missing=[];
    if(pi<0)missing.push('coverage polygon');
    if(ti<0)missing.push('time slot');
    if(di<0)missing.push('date');
    if(ri<0)missing.push('shipping reserved capacity');
    if(missing.length)throw new Error(`Flex result columns were not found: ${missing.join(', ')}.`);
    const outRows=rows.map(row=>[row[pi]??'',row[ti]??'',row[di]??'',row[ri]??''])
      .filter(row=>row.some(v=>String(v??'').trim()!==''));
    return {headers:['Coverage Polygon','Time Slot','Date','Shipping Reserved Capacity'],rows:outRows};
  }

  function buildModel(result, input) {
    let headers = Array.isArray(result.headers)?result.headers:[], rows=Array.isArray(result.rows)?result.rows:[];
    const source=input.reportSource;
    if(source==='flex'){
      const normalized=normalizeFlexDataset(headers,rows);
      headers=normalized.headers;
      rows=normalized.rows;
    }
    const aggregate=source==='dk'&&!!input.aggregateCapacities;
    const partitions=[];
    if(source==='dk'&&aggregate){
      const agg=aggregateRows(headers,rows);headers=agg.headers;rows=agg.rows;partitions.push({id:'aggregate',label:'Aggregated capacities',rows,groups:groupRows(headers,rows)});
    } else if(source==='dk') {
      const buckets=new Map(input.centers.map(c=>[String(c.id),[]]));
      const unmatched=[];
      for(const row of rows){const c=findCenterForRow(headers,row,input.centers);if(c)buckets.get(String(c.id)).push(row);else unmatched.push(row);}
      if(input.centers.length===1 && !buckets.get(String(input.centers[0].id)).length && rows.length)buckets.set(String(input.centers[0].id),rows);
      for(const c of input.centers){const rr=buckets.get(String(c.id))||[];partitions.push({id:c.id,label:c.name,rows:rr,groups:groupRows(headers,rr)});}
      if(input.centers.length>1 && partitions.every(p=>!p.rows.length) && rows.length) throw new Error('DK results could not be separated by Distribution Center.');
    } else {
      const pi=headerIndex(headers,aliases.coveragePolygon);
      const polygonBuckets=new Map();
      for(const row of rows){
        const label=(pi>=0?String(row[pi]??'').trim():'') || input.flexCenter?.name || 'Coverage Polygon';
        if(!polygonBuckets.has(label))polygonBuckets.set(label,[]);
        polygonBuckets.get(label).push(row);
      }
      if(!polygonBuckets.size)polygonBuckets.set(input.flexCenter?.name||'Coverage Polygon',rows);
      for(const [label,rr] of polygonBuckets){
        partitions.push({id:'',label,rows:rr,groups:groupRows(headers,rr)});
      }
    }
    return {source,aggregate,headers,rows,partitions,fromDate:input.fromDate,toDate:input.toDate,centers:input.centers||[],flexCenters:input.flexCenters||(input.flexCenter?[input.flexCenter]:[]),flexCenter:input.flexCenter||null,totalRows:rows.length};
  }

  function metricData(model, group) {
    const h=model.headers, di=headerIndex(h,aliases.date), ci=headerIndex(h,aliases.capacity), ri=model.source==='flex'?headerIndex(h,['shipping reserved capacity','shipping_reserved_capacity']):headerIndex(h,aliases.reserved);
    const days=di>=0?new Set(group.rows.map(r=>String(r[di]??'').trim()).filter(Boolean)).size:group.rows.length;
    const c=ci>=0?summary(group.rows.map(r=>num(r[ci]))):summary([]);
    const r=ri>=0?summary(group.rows.map(row=>num(row[ri]))):summary([]);
    return {days,capacity:c,reserved:r};
  }

  function seriesData(model, group) {
    const h=model.headers, di=headerIndex(h,aliases.date), ci=headerIndex(h,aliases.capacity), ri=model.source==='flex'?headerIndex(h,['shipping reserved capacity','shipping_reserved_capacity']):headerIndex(h,aliases.reserved), map=new Map();
    group.rows.forEach((row,index)=>{const date=di>=0?String(row[di]??'').trim():String(index+1);if(!date)return;if(!map.has(date))map.set(date,{date,capacity:0,reserved:0,hasC:false,hasR:false});const o=map.get(date),c=ci>=0?num(row[ci]):null,r=ri>=0?num(row[ri]):null;if(c!=null){o.capacity+=c;o.hasC=true}if(r!=null){o.reserved+=r;o.hasR=true}});
    return [...map.values()]
      .map(o=>({date:o.date,capacity:o.hasC?o.capacity:null,reserved:o.hasR?o.reserved:null}))
      .sort((a,b)=>{
        const ak=Number(latinDigits(a.date).replace(/\D/g,'')),bk=Number(latinDigits(b.date).replace(/\D/g,''));
        if(Number.isFinite(ak)&&Number.isFinite(bk)&&ak!==bk)return ak-bk;
        return String(a.date).localeCompare(String(b.date),'fa');
      });
  }


  function metricCard(label, stats, cls='') {
    return `<div class="metric ${cls}"><span>${esc(label)}</span><div class="metric-values"><div><small>Min</small><strong>${fmt(stats.min)}</strong></div><div><small>Average</small><strong>${fmt(stats.avg)}</strong></div><div><small>Max</small><strong>${fmt(stats.max)}</strong></div></div></div>`;
  }

  function renderChart(data, source) {
    if(!data.length)return '<div class="empty-state">No chart data.</div>';
    const series = source==='flex' ? [{key:'reserved',cls:'reserved',label:'Shipping Reserved Capacity'}] : [{key:'capacity',cls:'capacity',label:'Capacity'},{key:'reserved',cls:'reserved',label:'Capacity Reserved'}];
    const values=[];for(const d of data)for(const s of series)if(d[s.key]!=null)values.push(d[s.key]);if(!values.length)return '<div class="empty-state">No numeric capacity values.</div>';
    let min=Math.min(...values),max=Math.max(...values);if(min===max){min-=1;max+=1}
    const W=1000,H=330,p={l:58,r:22,t:18,b:104};
    const x=i=>p.l+(data.length===1?(W-p.l-p.r)/2:i*(W-p.l-p.r)/(data.length-1));const y=v=>p.t+(max-v)/(max-min)*(H-p.t-p.b);
    let grid='';for(let k=0;k<5;k++){const yy=p.t+k*(H-p.t-p.b)/4,v=max-k*(max-min)/4;grid+=`<line class="grid-line" x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}"/><text class="axis-text" x="${p.l-7}" y="${yy+3}" text-anchor="end">${Math.round(v)}</text>`}
    const paths=series.map(s=>{let d='';let started=false;data.forEach((o,i)=>{const v=o[s.key];if(v==null)return;d+=`${started?'L':'M'} ${x(i)} ${y(v)} `;started=true});return d?`<path class="line-${s.cls}" d="${d.trim()}"/>`:''}).join('');
    const pts=series.map(s=>data.map((o,i)=>o[s.key]==null?'':`<circle class="point-${s.cls}" cx="${x(i)}" cy="${y(o[s.key])}" r="3"><title>${esc(s.label)} • ${esc(o.date)}: ${fmt(o[s.key])}</title></circle>`).join('')).join('');
    const labelY=H-12;const labels=data.map((o,i)=>`<text class="axis-text axis-date" x="${x(i)}" y="${labelY}" text-anchor="start" transform="rotate(-90 ${x(i)} ${labelY})">${esc(o.date)}</text>`).join('');
    const legend=`<div class="legend">${series.map(s=>`<span><i class="${s.cls}"></i>${esc(s.label)}</span>`).join('')}</div>`;
    return `${legend}<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Capacity trend by date">${grid}${paths}${pts}${labels}</svg></div>`;
  }

  function renderModel(model, dashboard=false) {
    const host=$('result'); if(!host)return;
    const rows=model.partitions.reduce((n,p)=>n+p.rows.length,0);
    host.innerHTML=`<div class="result-toolbar"><div><strong>${model.source==='flex'?'Flex':'DK'} Capacity Report${model.aggregate?' • Aggregated':''}</strong><small>${esc(model.fromDate)} → ${esc(model.toDate)} • ${rows} row${rows===1?'':'s'}</small></div><div class="actions"><button class="secondary" id="downloadExcel">Download Excel</button>${dashboard?'':`<button class="secondary" id="openDashboard">Open dashboard</button>`}</div></div><div id="reportCards"></div>`;
    host.classList.remove('hidden');const cards=$('reportCards');
    for(const part of model.partitions){
      const sec=document.createElement('section');sec.className=`report-card${model.source==='flex'?' flex-report':''}`;
      const idText=model.source==='flex'?'':(part.id&&part.id!=='aggregate'?`ID ${esc(part.id)}`:'');
      sec.innerHTML=`<div class="report-title"><div><strong>${esc(part.label)}</strong>${idText?`<small>${idText}</small>`:''}</div><small>${part.rows.length} rows</small></div><div class="group-list"></div>`;cards.appendChild(sec);
      const gl=qs('.group-list',sec);
      for(const group of part.groups){const m=metricData(model,group),series=seriesData(model,group);const g=document.createElement('section');g.className='group-card';const metrics=model.source==='flex'?`<div class="metrics flex-metrics"><div class="metric days"><span>Report days</span><div class="metric-values"><div><strong>${m.days}</strong></div></div></div>${metricCard('Shipping Reserved Capacity',m.reserved)}</div>`:`<div class="metrics"><div class="metric days"><span>Report days</span><div class="metric-values"><div><strong>${m.days}</strong></div></div></div>${metricCard('Capacity',m.capacity)}${metricCard('Capacity Reserved',m.reserved)}</div>`;const groupTitle=model.aggregate?'':(model.source==='flex'?`Time Slot: ${group.label}`:group.label);g.innerHTML=`${groupTitle?`<div class="group-title">${esc(groupTitle)}</div>`:''}${metrics}${renderChart(series,model.source)}`;gl.appendChild(g);}
    }
    $('downloadExcel').onclick=()=>downloadModelXlsx(model);
    const db=$('openDashboard');if(db)db.onclick=()=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(model));}catch(_){}const u=new URL(location.href);u.searchParams.set('dashboard','1');u.searchParams.set('theme',theme);window.open(u.href,'_blank','noopener,noreferrer')};
  }

  function xmlEscape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
  function colName(n){let out='';while(n>0){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)}return out}
  function worksheetXml(headers,rows){const all=[headers,...rows];return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${all.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>`<c r="${colName(c+1)}${r+1}"${r===0?' s="1"':''} t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`}
  function crc32(bytes){let crc=0^-1;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xEDB88320&-(crc&1))}return(crc^-1)>>>0}
  const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  function zipStore(files){const enc=new TextEncoder(),local=[],central=[];let offset=0;for(const[name,text]of Object.entries(files)){const nb=enc.encode(name),data=enc.encode(text),crc=crc32(data),l=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...nb,...data]);local.push(l);central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...nb]));offset+=l.length}const cs=central.reduce((s,a)=>s+a.length,0),end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(cs),...u32(offset),...u16(0)]);return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
  function makeXlsx(headers,rows,sheet='Capacity Report'){const files={'[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,'_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,'xl/styles.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,'xl/worksheets/sheet1.xml':worksheetXml(headers,rows)};return zipStore(files)}

  function exportRows(model){
    if(model.source==='flex'){
      const pi=headerIndex(model.headers,aliases.coveragePolygon),di=headerIndex(model.headers,aliases.date),ti=headerIndex(model.headers,aliases.time),ri=headerIndex(model.headers,['shipping reserved capacity','shipping_reserved_capacity']);
      const headers=['Coverage Polygon','Time Slot','Date','Shipping Reserved Capacity'],rows=[];
      for(const p of model.partitions)for(const r of p.rows)rows.push([(pi>=0?r[pi]:'')||p.label,ti>=0?r[ti]:'',di>=0?r[di]:'',ri>=0?r[ri]:'']);
      return{headers,rows};
    }
    if(model.aggregate){return{headers:['From Date','To Date',...model.headers],rows:model.rows.map(r=>[model.fromDate,model.toDate,...r])}}
    const headers=['Distribution Center','Distribution Center ID','From Date','To Date',...model.headers],rows=[];for(const p of model.partitions)for(const r of p.rows)rows.push([p.label,p.id,model.fromDate,model.toDate,...r]);return{headers,rows};
  }
  function downloadModelXlsx(model){const x=exportRows(model);if(!x.rows.length){setStatus('No rows are available for Excel export.','error');return}const blob=makeXlsx(x.headers,x.rows,'Capacity Report'),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`capacity_report_${model.source}_${model.fromDate}_${model.toDate}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}

  function combineModels(models, input) {
    if(!models.length) throw new Error('No Capacity Report result was returned.');
    const source=input.reportSource;
    if(source==='dk'){
      const headers=models[0].headers||[];
      const allRows=models.flatMap(m=>m.rows||[]);
      if(input.aggregateCapacities){
        const agg=aggregateRows(headers,allRows);
        const partitions=[{id:'aggregate',label:'Aggregated capacities',rows:agg.rows,groups:groupRows(agg.headers,agg.rows)}];
        return {source:'dk',aggregate:true,headers:agg.headers,rows:agg.rows,partitions,fromDate:input.fromDate,toDate:input.toDate,centers:input.centers||[],flexCenters:[],totalRows:agg.rows.length};
      }
      const partitions=models.flatMap(m=>m.partitions||[]);
      return {source:'dk',aggregate:false,headers,rows:allRows,partitions,fromDate:input.fromDate,toDate:input.toDate,centers:input.centers||[],flexCenters:[],totalRows:allRows.length};
    }
    const headers=['Coverage Polygon','Time Slot','Date','Shipping Reserved Capacity'];
    const rows=models.flatMap(m=>m.rows||[]);
    const partitions=models.flatMap(m=>m.partitions||[]);
    return {source:'flex',aggregate:false,headers,rows,partitions,fromDate:input.fromDate,toDate:input.toDate,centers:[],flexCenters:input.flexCenters||[],totalRows:rows.length};
  }

  async function run() {
    if(state.busy)return;
    const from=latinDigits($('fromDate').value).replace(/\D/g,''),to=latinDigits($('toDate').value).replace(/\D/g,'');
    if(!/^\d{8}$/.test(from)||!/^\d{8}$/.test(to)){setStatus('From date and To date must contain exactly 8 Jalali digits.','error');return}
    if(Number(from)>Number(to)){setStatus('From date cannot be after To date.','error');return}
    if(state.source==='dk'){
      if($('dkCentersInput').value.trim() && !addRawDkIds($('dkCentersInput').value)){setStatus('Select the Distribution Center from the list, or press Enter after numeric IDs.','error');return}
      if(!state.centers.length){setStatus('Select at least one Distribution Center for DK.','error');return}
    } else {
      if($('flexCenterInput').value.trim() && !addRawFlexIds($('flexCenterInput').value)){setStatus('Select the Flex Distribution Center by name, or enter its numeric Flex ID and press Enter.','error');return}
      if(!state.flexCenters.length){setStatus('Select at least one Distribution Center for Flex, or enter a numeric Flex ID.','error');return}
    }
    setBusy(true);$('result').classList.add('hidden');
    if(state.source==='dk' && state.centers.some(x=>x.name===x.id)){
      try{
        const list=await loadCenters();
        const byId=new Map(list.map(x=>[String(x.id),x.name]));
        state.centers=state.centers.map(x=>({...x,name:byId.get(String(x.id))||x.name}));
        renderChips();
      }catch(_){}
      if(state.centers.some(x=>x.name===x.id)){
        setStatus('One or more numeric Distribution Center IDs could not be resolved to an exact center name. Please select them from the list and try again.','error');
        setBusy(false);
        return;
      }
    }
    const selected=state.source==='dk'?state.centers:state.flexCenters;
    const baseInput={reportSource:state.source,fromDate:from,toDate:to,aggregateCapacities:state.source==='dk'&&!!$('aggregateCapacities').checked,centers:state.centers.map(x=>({...x})),flexCenters:state.flexCenters.map(x=>({...x}))};
    const models=[];
    try{
      for(let i=0;i<selected.length;i++){
        const center=selected[i];
        setStatus(`Running ${state.source==='dk'?'DK':'Flex'} report ${i+1}/${selected.length}: ${center.lookupMode==='id'?`Flex ID ${center.flexId||center.id}`:center.name}…`);
        const input=state.source==='dk'
          ? {...baseInput,dcId:center.id,dcName:center.name,centers:[{...center}],flexCenter:null,flexDcId:'',flexDcName:'',flexSelectionMode:''}
          : {...baseInput,dcId:'',dcName:'',centers:[],flexCenter:{...center},flexSelectionMode:center.lookupMode==='id'?'id':'name',flexDcId:center.lookupMode==='id'?String(center.flexId||center.id):'',flexDcName:center.lookupMode==='id'?'':center.name};
        const result=await requestHostOperation(input,240000);
        models.push(buildModel(result,input));
      }
      const model=combineModels(models,baseInput);
      localStorage.setItem(CACHE_KEY,JSON.stringify(model));renderModel(model,false);setStatus(`Completed. ${model.totalRows} rows processed across ${selected.length} Distribution Center${selected.length===1?'':'s'}.`,'ok');
    } catch(e){setStatus(e.message||String(e),'error')}
    finally{setBusy(false)}
  }

  function initDashboard(){
    if(qp.get('dashboard')!=='1')return false;
    document.documentElement.classList.add('dashboard-mode');$('reportForm').classList.add('hidden');
    try{const model=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!model)throw new Error('No saved Capacity Report is available.');renderModel(model,true)}catch(e){$('result').classList.remove('hidden');$('result').innerHTML=`<div class="empty-state">${esc(e.message||e)}</div>`}
    return true;
  }

  function init(){
    if(initDashboard())return;
    bindAutocomplete();qsa('input[name="source"]').forEach(r=>r.addEventListener('change',()=>setSource(r.value)));setSource('dk');$('runReport').onclick=run;
    for(const id of['fromDate','toDate']){
      $(id).addEventListener('input',e=>{e.target.value=latinDigits(e.target.value).replace(/\D/g,'').slice(0,8)});
      setupJalaliPicker(id);
    }
    loadCenters().catch(()=>{});
  }
  init();
})();
