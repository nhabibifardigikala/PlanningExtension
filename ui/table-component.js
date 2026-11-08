(()=>{
  'use strict';
  const ENHANCED='dxTableEnhanced';
  const SEARCH_MARK='dxTableSearch';

  const norm=s=>String(s||'').trim().toLowerCase();
  const isVisible=el=>!!(el&&el.getClientRects&&el.getClientRects().length);
  const hasOwnSearch=(table)=>{
    if(table.closest?.('[data-dx-own-search="1"]')) return true;
    let node=table;
    for(let depth=0;node&&depth<5;depth++,node=node.parentElement){
      const inputs=[...node.querySelectorAll('input')].filter(i=>i.dataset?.[SEARCH_MARK]!=='1'&&isVisible(i));
      if(inputs.some(i=>{
        const ph=norm(i.getAttribute('placeholder'));
        const id=norm(i.id), type=norm(i.type);
        return type==='search'||id.includes('search')||ph.includes('search')||ph.includes('جستجو');
      })) return true;
      if(node.matches?.('.panel,.card,.section,.table-wrap,.table-scroll,.result,.results')) break;
    }
    return false;
  };

  const rowsOf=t=>[...t.tBodies].flatMap(b=>[...b.rows]);
  const textMatrix=t=>{
    const out=[];
    const head=t.tHead?.rows?.[0];
    if(head) out.push([...head.cells].map(c=>c.innerText.trim()));
    for(const r of rowsOf(t)) if(r.style.display!=='none') out.push([...r.cells].map(c=>c.innerText.trim()));
    return out;
  };
  const csvEscape=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const copyTable=async(t)=>{
    const clone=t.cloneNode(true);
    clone.querySelectorAll('th,td').forEach(c=>{c.style.textAlign='center';c.style.verticalAlign='middle';});
    const html='<table>'+clone.innerHTML+'</table>';
    const plain=textMatrix(t).map(r=>r.join('\t')).join('\n');
    if(navigator.clipboard?.write&&window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':new Blob([html],{type:'text/html'}),
        'text/plain':new Blob([plain],{type:'text/plain'})
      })]);
    }else await navigator.clipboard.writeText(plain);
  };
  const exportCsv=t=>{
    const csv='\uFEFF'+textMatrix(t).map(r=>r.map(csvEscape).join(',')).join('\r\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download=(t.dataset.dxTableFilename||'table')+'.csv'; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  const updateCount=(t,el)=>{const all=rowsOf(t),shown=all.filter(r=>r.style.display!=='none');el.textContent=`${shown.length} / ${all.length} rows`;};
  const applySearch=(t,q,count)=>{q=norm(q);for(const r of rowsOf(t))r.style.display=!q||norm(r.innerText).includes(q)?'':'none';updateCount(t,count);};
  const installSort=t=>{
    const hs=[...(t.tHead?.rows?.[0]?.cells||[])];
    hs.forEach((h,idx)=>{if(h.dataset.dxSortBound)return;h.dataset.dxSortBound='1';h.style.cursor='pointer';h.addEventListener('click',()=>{
      const body=t.tBodies[0]; if(!body)return;
      const asc=h.dataset.dxSort!=='asc'; hs.forEach(x=>delete x.dataset.dxSort); h.dataset.dxSort=asc?'asc':'desc';
      const rs=[...body.rows]; rs.sort((a,b)=>{
        const av=a.cells[idx]?.innerText.trim()||'', bv=b.cells[idx]?.innerText.trim()||'';
        const an=Number(av.replaceAll(',','')),bn=Number(bv.replaceAll(',',''));
        const cmp=Number.isFinite(an)&&Number.isFinite(bn)?an-bn:av.localeCompare(bv,undefined,{numeric:true,sensitivity:'base'});
        return asc?cmp:-cmp;
      }); rs.forEach(r=>body.appendChild(r));
    });});
  };
  const enhance=t=>{
    if(!t||t.dataset.dxTable==='off'||t.dataset[ENHANCED]==='1')return;
    t.dataset[ENHANCED]='1'; t.classList.add('dx-standard-table'); installSort(t);
    if(t.dataset.dxTableToolbar==='off')return;
    const bar=document.createElement('div');bar.className='dx-table-toolbar';
    const own=hasOwnSearch(t);
    let search=null;
    if(!own){search=document.createElement('input');search.type='search';search.placeholder='Search table...';search.className='dx-table-search';search.dataset[SEARCH_MARK]='1';bar.appendChild(search);}
    const actions=document.createElement('div');actions.className='dx-table-actions';
    const copy=document.createElement('button');copy.type='button';copy.textContent='⧉ Copy';copy.className='dx-table-action';actions.appendChild(copy);
    const csv=document.createElement('button');csv.type='button';csv.textContent='⇩ CSV';csv.className='dx-table-action';actions.appendChild(csv);
    bar.appendChild(actions);
    const count=document.createElement('span');count.className='dx-table-count';bar.appendChild(count);
    if(own)bar.classList.add('dx-table-toolbar--no-search');
    const host=t.closest('.table-wrap,.table-scroll')||t.parentElement;
    host?.parentElement?.insertBefore(bar,host);
    updateCount(t,count);
    search?.addEventListener('input',()=>applySearch(t,search.value,count));
    copy.addEventListener('click',()=>copyTable(t).catch(()=>{})); csv.addEventListener('click',()=>exportCsv(t));
  };
  const scan=root=>(root.querySelectorAll?root.querySelectorAll('table'):[]).forEach(enhance);
  const css=document.createElement('style');css.textContent=`
    .dx-table-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 10px;margin:8px 0;font:inherit;width:100%;min-width:0}
    .dx-table-search{grid-column:1;min-width:0;width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--dx-border,#dbe3f0);border-radius:10px;background:var(--dx-surface,#fff);color:inherit}
    .dx-table-actions{grid-column:2;display:flex;align-items:center;gap:6px;flex:0 0 auto;white-space:nowrap}
    .dx-table-action{padding:8px 11px;border:1px solid var(--dx-border,#dbe3f0);border-radius:10px;background:var(--dx-surface,#fff);color:inherit;cursor:pointer;white-space:nowrap;line-height:1.2}
    .dx-table-count{grid-column:1/-1;justify-self:end;font-size:12px;opacity:.7;white-space:nowrap;line-height:1.2}
    .dx-table-toolbar--no-search{grid-template-columns:1fr auto}
    .dx-table-toolbar--no-search .dx-table-actions{grid-column:2}
    .dx-table-toolbar--no-search .dx-table-count{grid-column:1;grid-row:1;justify-self:start;align-self:center}
    @media (max-width:560px){
      .dx-table-toolbar{grid-template-columns:1fr}
      .dx-table-search,.dx-table-actions,.dx-table-count{grid-column:1}
      .dx-table-actions{justify-self:start;flex-wrap:wrap}
      .dx-table-count{justify-self:end}
      .dx-table-toolbar--no-search .dx-table-actions{grid-column:1;grid-row:auto}
      .dx-table-toolbar--no-search .dx-table-count{grid-column:1;grid-row:auto;justify-self:end}
    }
    .dx-standard-table thead th{position:sticky;top:0;z-index:1}
  `;document.head.appendChild(css);
  const start=()=>{scan(document);new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType!==1)return;if(n.tagName==='TABLE')enhance(n);scan(n);}))).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
