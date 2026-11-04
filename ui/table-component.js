/* DigiExpress Standard Table Component v492
 * Progressive enhancement: styling, sticky headers, search, copy, CSV and sorting.
 * Add data-dx-table="off" to opt out, or data-dx-table-toolbar="off" to keep styling only.
 */
(()=>{
  const seen=new WeakSet();
  const escCsv=v=>{const s=String(v??'').replace(/\r?\n/g,' ');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
  const textOf=cell=>String(cell?.innerText??cell?.textContent??'').trim();
  const notify=(text,kind='ok')=>{
    let el=document.getElementById('dxTableToast');
    if(!el){el=document.createElement('div');el.id='dxTableToast';Object.assign(el.style,{position:'fixed',zIndex:'2147483647',right:'16px',bottom:'16px',padding:'10px 13px',borderRadius:'10px',font:'700 12px/1.35 var(--dx-font-latin,Arial)',boxShadow:'0 10px 28px #0003',transition:'opacity .2s',maxWidth:'320px'});document.body.appendChild(el)}
    el.style.background=kind==='error'?'var(--dx-danger,#d92d20)':'var(--dx-text,#10213f)';el.style.color='#fff';el.textContent=text;el.style.opacity='1';clearTimeout(el._t);el._t=setTimeout(()=>el.style.opacity='0',1800);
  };
  function rows(table){return Array.from(table.tBodies).flatMap(b=>Array.from(b.rows))}
  function visibleRows(table){return rows(table).filter(r=>r.style.display!=='none')}
  function tableMatrix(table,visibleOnly=false){const out=[];const headers=Array.from(table.tHead?.rows?.[0]?.cells||[]).map(textOf);if(headers.length)out.push(headers);const rs=visibleOnly?visibleRows(table):rows(table);for(const r of rs)out.push(Array.from(r.cells).map(textOf));return out}
  function copyTable(table){const txt=tableMatrix(table,true).map(r=>r.join('\t')).join('\n');navigator.clipboard?.writeText(txt).then(()=>notify('Table copied.')).catch(()=>{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();notify('Table copied.')})}
  function downloadCsv(table){const csv='\ufeff'+tableMatrix(table,true).map(r=>r.map(escCsv).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(document.title||'table').replace(/[^a-z0-9_-]+/gi,'_')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
  function sortTable(table,index,th){const body=table.tBodies[0];if(!body)return;const dir=th.dataset.dxSortDir==='asc'?'desc':'asc';Array.from(table.querySelectorAll('thead th')).forEach(x=>delete x.dataset.dxSortDir);th.dataset.dxSortDir=dir;const coll=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});const rs=Array.from(body.rows);rs.sort((a,b)=>{const av=textOf(a.cells[index]),bv=textOf(b.cells[index]);return coll.compare(av,bv)*(dir==='asc'?1:-1)});rs.forEach(r=>body.appendChild(r))}
  function enhance(table){
    if(!table||seen.has(table)||table.dataset.dxTable==='off'||table.closest('[data-dx-table-scope="off"]'))return;seen.add(table);table.classList.add('dx-table');
    const head=table.tHead?.rows?.[0];if(head)Array.from(head.cells).forEach((th,i)=>{if(th.dataset.dxNoSort==='1')return;th.dataset.dxSortable='1';th.tabIndex=0;const go=()=>sortTable(table,i,th);th.addEventListener('click',go);th.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})});
    if(table.dataset.dxTableToolbar==='off')return;
    const parent=table.parentElement;if(parent?.classList.contains('dx-table-scroll'))return;
    const shell=document.createElement('div');shell.className='dx-table-shell';
    const toolbar=document.createElement('div');toolbar.className='dx-table-toolbar';
    const search=document.createElement('input');search.type='search';search.className='dx-table-search';search.placeholder='Search table…';search.setAttribute('aria-label','Search table');
    const copy=document.createElement('button');copy.type='button';copy.className='dx-table-action';copy.innerHTML='<span aria-hidden="true">⧉</span><span>Copy</span>';
    const csv=document.createElement('button');csv.type='button';csv.className='dx-table-action';csv.innerHTML='<span aria-hidden="true">⇩</span><span>CSV</span>';
    const meta=document.createElement('span');meta.className='dx-table-meta';
    const scroll=document.createElement('div');scroll.className='dx-table-scroll';
    table.parentNode.insertBefore(shell,table);shell.appendChild(toolbar);shell.appendChild(scroll);scroll.appendChild(table);toolbar.append(search,copy,csv,meta);
    const refresh=()=>{const all=rows(table),shown=visibleRows(table);meta.textContent=`${shown.length.toLocaleString()} / ${all.length.toLocaleString()} rows`};
    search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase();rows(table).forEach(r=>{r.style.display=!q||textOf(r).toLocaleLowerCase().includes(q)?'':'none'});refresh()});copy.addEventListener('click',()=>copyTable(table));csv.addEventListener('click',()=>downloadCsv(table));refresh();
    const mo=new MutationObserver(()=>refresh());table.tBodies.length&&Array.from(table.tBodies).forEach(b=>mo.observe(b,{childList:true,subtree:false}));
  }
  function scan(root=document){root.querySelectorAll?.('table').forEach(enhance);if(root.matches?.('table'))enhance(root)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scan());else scan();
  new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n)}))).observe(document.documentElement,{childList:true,subtree:true});
  globalThis.DigiExpressTable={enhance,scan,copyTable,downloadCsv};
})();
