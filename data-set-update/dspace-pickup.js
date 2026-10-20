(()=>{
  'use strict';

  const AGENT_ID='pickup-polygons-dspace';
  const SOURCE_OPERATION='extract-pickup-polygons';
  const TARGET_SHEET='Pick-up Polygons';
  const STORAGE_KEY='digiexpress.dspace.pickup.shareUrl';
  const STATE_KEY='digiexpress.dspace.pickup.state';
  const REQUIRED_ORIGIN='https://dspace.dkservices.ir/*';

  const q=s=>document.querySelector(s);
  const nowIso=()=>new Date().toISOString();
  const fmt=v=>v?new Date(v).toLocaleString():'—';
  const fmtDuration=ms=>{const s=Math.max(0,Math.round(Number(ms||0)/1000));if(s<60)return `${s}s`;const m=Math.floor(s/60);return `${m}m ${s%60}s`;};

  function ui(){return{
    run:q('[data-run-dspace]'),
    config:q('[data-config-dspace]'),
    status:q('[data-status-for="pickup-polygons-dspace"]'),
    chip:q('[data-status-chip-for="pickup-polygons-dspace"]'),
    last:q('[data-last-run-for="pickup-polygons-dspace"]'),
    next:q('[data-next-run-for="pickup-polygons-dspace"]'),
    duration:q('[data-duration-for="pickup-polygons-dspace"]')
  };}

  async function storageGet(key){
    try{const r=await chrome.storage.local.get([key]);return r?.[key];}catch(_){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_2){return null;}}
  }
  async function storageSet(key,value){
    try{await chrome.storage.local.set({[key]:value});return;}catch(_){try{localStorage.setItem(key,JSON.stringify(value));}catch(_2){}}
  }

  async function loadState(){return (await storageGet(STATE_KEY))||{};}
  async function saveState(patch){const s={...(await loadState()),...patch};await storageSet(STATE_KEY,s);renderState(s);return s;}
  function renderState(s={}){
    const x=ui();if(!x.run)return;
    x.last.textContent=fmt(s.lastRunAt);
    x.next.textContent='Manual';
    x.duration.textContent=s.durationMs?fmtDuration(s.durationMs):'—';
    const running=!!s.running;
    const failed=String(s.lastStatus||'').toLowerCase()==='failed';
    x.chip.textContent=running?'Running':failed?'Failed':s.lastStatus==='Success'?'Success':'Ready';
    x.chip.className=`agent-status-chip ${running?'running':failed?'failed':s.lastStatus==='Success'?'success':'ready'}`;
    if(!running && s.lastMessage)x.status.textContent=s.lastMessage;
    else if(!running && !x.status.textContent)x.status.textContent='Ready';
  }
  function setProgress(text,kind='busy'){
    const x=ui();x.status.textContent=text;x.status.className=`dataset-mini-status ${kind}`;
    x.chip.textContent=kind==='error'?'Failed':kind==='success'?'Success':'Running';
    x.chip.className=`agent-status-chip ${kind==='error'?'failed':kind==='success'?'success':'running'}`;
  }

  function tokenFromShareUrl(input){
    const raw=String(input||'').trim();if(!raw)return'';
    try{
      const u=new URL(raw);
      if(u.hostname!=='dspace.dkservices.ir')throw new Error('Only dspace.dkservices.ir public shares are allowed.');
      const m=u.pathname.match(/\/s\/([^/?#]+)/);if(m?.[1])return decodeURIComponent(m[1]);
      const m2=u.pathname.match(/\/public\.php\/dav\/files\/([^/?#]+)/);if(m2?.[1])return decodeURIComponent(m2[1]);
    }catch(e){if(e instanceof TypeError)throw new Error('Invalid DSpace Share URL.');throw e;}
    throw new Error('Could not read the DSpace public share token from this URL.');
  }
  function davRootFromShareUrl(input){const token=tokenFromShareUrl(input);return `https://dspace.dkservices.ir/public.php/dav/files/${encodeURIComponent(token)}/`;}

  async function configure(){
    const current=String((await storageGet(STORAGE_KEY))||'');
    const value=prompt('Paste the DSpace Public Share link for Pickup Polygons:',current);
    if(value===null)return;
    const cleaned=String(value).trim();
    if(!cleaned){await storageSet(STORAGE_KEY,'');setProgress('DSpace Share URL cleared.','');return;}
    davRootFromShareUrl(cleaned);
    await storageSet(STORAGE_KEY,cleaned);
    setProgress('DSpace Share URL saved locally.','success');
  }

  async function ensureHostPermission(){
    try{
      const ok=await chrome.permissions.request({origins:[REQUIRED_ORIGIN]});
      if(!ok)throw new Error('Permission for dspace.dkservices.ir was not granted.');
      return true;
    }catch(e){throw new Error(e?.message||'Could not request DSpace host permission.');}
  }

  function headersObject(h){
    if(!h)return{};if(Array.isArray(h)){const o={};for(const pair of h)if(Array.isArray(pair)&&pair.length>=2)o[String(pair[0]).toLowerCase()]=String(pair[1]);return o;}
    const o={};for(const [k,v] of Object.entries(h))o[String(k).toLowerCase()]=Array.isArray(v)?v.join(', '):String(v);return o;
  }

  async function remoteHttp(request){
    const r=await window.DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request});
    if(!r?.ok)throw new Error(r?.error||`HTTP request failed: ${request.method||'GET'} ${request.url}`);
    const status=Number(r.status||r.statusCode||r?.response?.status||200);
    if(status>=400){const err=new Error(`DSpace returned HTTP ${status}.`);err.status=status;throw err;}
    return {...r,status,headers:headersObject(r.headers||r.responseHeaders||r?.response?.headers)};
  }

  function bytesToBase64(bytes){
    const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let s='';const CHUNK=0x8000;
    for(let i=0;i<u.length;i+=CHUNK)s+=String.fromCharCode(...u.subarray(i,i+CHUNK));
    return btoa(s);
  }
  function base64ToBytes(s){
    const raw=atob(String(s).replace(/^data:[^,]+,/,''));const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
  }
  function responseBytes(data){
    if(data instanceof ArrayBuffer)return new Uint8Array(data);
    if(ArrayBuffer.isView(data))return new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    if(Array.isArray(data))return new Uint8Array(data);
    if(data&&typeof data==='object'){
      if(typeof data.base64==='string')return base64ToBytes(data.base64);
      if(typeof data.data==='string'&&data.encoding==='base64')return base64ToBytes(data.data);
      if(Array.isArray(data.data))return new Uint8Array(data.data);
    }
    if(typeof data==='string'&&/^[A-Za-z0-9+/=\s]+$/.test(data)&&data.replace(/\s/g,'').length>100)return base64ToBytes(data.replace(/\s/g,''));
    throw new Error('Stable Host did not return the XLSX file as binary data.');
  }

  async function davPropfind(root){
    const body='<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:resourcetype/><d:getetag/><d:getcontenttype/><oc:permissions/></d:prop></d:propfind>';
    return remoteHttp({url:root,method:'PROPFIND',headers:{Depth:'1','Content-Type':'application/xml; charset=utf-8'},body,responseType:'text',timeoutMs:30000,credentials:'omit'});
  }
  function parsePropfind(xmlText,root){
    const doc=new DOMParser().parseFromString(String(xmlText||''),'application/xml');
    if(doc.querySelector('parsererror'))throw new Error('DSpace returned an invalid WebDAV PROPFIND response.');
    const responses=[...doc.getElementsByTagNameNS('DAV:','response')];
    const items=responses.map(node=>{
      const href=node.getElementsByTagNameNS('DAV:','href')[0]?.textContent||'';
      const etag=node.getElementsByTagNameNS('DAV:','getetag')[0]?.textContent||'';
      const perms=[...node.getElementsByTagNameNS('http://owncloud.org/ns','permissions')].map(x=>x.textContent||'').join('');
      const isCollection=!!node.getElementsByTagNameNS('DAV:','collection').length;
      let url;try{url=new URL(href,root).href;}catch(_){url='';}
      let name='';try{name=decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop()||'');}catch(_){name='';}
      return{href,url,name,etag,permissions:perms,isCollection};
    }).filter(x=>x.url);
    const permissionText=items.map(x=>x.permissions).join('');
    if(!/W/i.test(permissionText))throw new Error('This DSpace Public Share does not report WebDAV write permission (W).');
    const files=items.filter(x=>!x.isCollection&&/\.xlsx$/i.test(x.name));
    if(!files.length)throw new Error('No XLSX file was found in this DSpace Public Share.');
    if(files.length>1)throw new Error(`More than one XLSX file was found (${files.map(x=>x.name).join(', ')}). Use a Public Share containing only the target workbook.`);
    return files[0];
  }

  async function davGet(fileUrl){
    let r;
    try{r=await remoteHttp({url:fileUrl,method:'GET',headers:{'Cache-Control':'no-cache'},responseType:'arrayBuffer',timeoutMs:60000,credentials:'omit'});return{bytes:responseBytes(r.data),etag:r.headers?.etag||''};}
    catch(first){
      r=await remoteHttp({url:fileUrl,method:'GET',headers:{'Cache-Control':'no-cache'},responseType:'base64',timeoutMs:60000,credentials:'omit'});
      return{bytes:responseBytes(r.data),etag:r.headers?.etag||''};
    }
  }

  async function davPut(fileUrl,bytes,etag){
    const headers={'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-Requested-With':'XMLHttpRequest'};
    if(etag)headers['If-Match']=etag;
    // Stable Host 13 generic HTTP bridge accepts binary ArrayBuffer request bodies.
    const body=(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)).buffer;
    return remoteHttp({url:fileUrl,method:'PUT',headers,body,responseType:'text',timeoutMs:90000,credentials:'omit'});
  }

  function normHeader(v){return String(v??'').trim().toLowerCase().replace(/[\s_-]+/g,' ');}
  function findColumn(headers,aliases){
    const hs=headers.map(normHeader),as=aliases.map(normHeader);
    for(const a of as){const i=hs.indexOf(a);if(i>=0)return i;}
    for(let i=0;i<hs.length;i++)for(const a of as)if(a.length>=3&&(hs[i].includes(a)||a.includes(hs[i])))return i;
    return-1;
  }
  function inferColumn(rows,score){
    const width=Math.max(0,...rows.map(r=>Array.isArray(r)?r.length:0));let best=-1,bestScore=0;
    for(let c=0;c<width;c++){let total=0,seen=0;for(let r=0;r<Math.min(rows.length,250);r++){const v=rows[r]?.[c];if(v===null||v===undefined||String(v).trim()==='')continue;seen++;total+=Number(score(v)||0);}if(seen&&total>bestScore){bestScore=total;best=c;}}
    return bestScore>0?best:-1;
  }
  function shippingSizeNumber(value){
    const fa='۰۱۲۳۴۵۶۷۸۹',ar='٠١٢٣٤٥٦٧٨٩';const s=String(value??'').replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/[٠-٩]/g,c=>String(ar.indexOf(c)));
    const paren=s.match(/\((\d+)\)/);if(paren)return Number(paren[1]);const any=s.match(/\d+/);return any?Number(any[0]):'';
  }
  function preparePickup(headers,rows){
    let nameIdx=findColumn(headers,['name','coverage polygon','coverage polygon name','polygon name','polygon','title','hub','hub name']);
    if(nameIdx<0)nameIdx=inferColumn(rows,v=>/(FBM|SBS)/i.test(String(v))?5:0);
    if(nameIdx<0)throw new Error(`Pickup Polygons: name column was not found. Headers: ${headers.join(' | ')}`);
    let sizeIdx=findColumn(headers,['shipping size id','shipping size ids','shipping size','size id','size']);
    if(sizeIdx<0)sizeIdx=inferColumn(rows,v=>/(عادی|عادي|متوسط|سنگین|سنگين|\([123]\)|\b[123]\b)/i.test(String(v))?2:0);
    if(sizeIdx<0)throw new Error(`Pickup Polygons: shipping size id column was not found. Headers: ${headers.join(' | ')}`);
    let coordIdx=findColumn(headers,['coordinates','coordinate','polygon coordinates','coverage polygon coordinates','مختصات']);
    if(coordIdx<0)coordIdx=inferColumn(rows,v=>{const x=String(v||'').trim();if(!x)return 0;if(/^\s*[\[{]/.test(x)&&/\d/.test(x)&&(/,/.test(x)||/:/.test(x)))return 3;if(/-?\d{1,3}(?:\.\d+)?\s*[,،]\s*-?\d{1,3}(?:\.\d+)?/.test(x))return 2;return 0;});
    if(coordIdx<0)throw new Error(`Pickup Polygons: coordinates column was not found. Headers: ${headers.join(' | ')}`);
    const out=[];for(const row of rows){const name=String(row?.[nameIdx]||'');if(!/(FBM|SBS)/i.test(name))continue;const copy=[...row];copy[sizeIdx]=shippingSizeNumber(copy[sizeIdx]);out.push(copy);}return{headers:[...headers],rows:out};
  }

  function workbookWithDataset(bytes,headers,rows){
    if(!globalThis.XLSX)throw new Error('XLSX library is not available. Reload DigiExpress and try again.');
    const wb=XLSX.read(bytes,{type:'array',cellDates:false});
    const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
    if(!wb.SheetNames.includes(TARGET_SHEET))wb.SheetNames.push(TARGET_SHEET);
    wb.Sheets[TARGET_SHEET]=ws;
    const out=XLSX.write(wb,{bookType:'xlsx',type:'array',compression:true});
    return new Uint8Array(out);
  }
  function verifyDataset(bytes,headers,rows){
    const wb=XLSX.read(bytes,{type:'array',cellDates:false});const ws=wb.Sheets[TARGET_SHEET];if(!ws)throw new Error(`Verify failed: worksheet "${TARGET_SHEET}" was not found after upload.`);
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
    if(aoa.length!==rows.length+1)throw new Error(`Verify failed: expected ${rows.length} data rows but found ${Math.max(0,aoa.length-1)}.`);
    const expected=[headers,...rows].map(r=>r.map(v=>String(v??'')));
    for(let r=0;r<expected.length;r++)for(let c=0;c<expected[r].length;c++)if(String(aoa[r]?.[c]??'')!==expected[r][c])throw new Error(`Verify failed at row ${r+1}, column ${c+1}.`);
    return true;
  }

  async function run(){
    const x=ui();if(x.run.disabled)return;
    const started=Date.now();x.run.disabled=true;
    try{
      await ensureHostPermission();
      await saveState({running:true,lastMessage:'Starting DSpace update…'});setProgress('Checking Agents access…');
      const access=await window.DigiExpressPlatform.runtime.sendMessage({type:'CHECK_OPERATION_ACCESS',op:'agents-access-gate'});
      if(!access?.ok||!access?.allowed)throw new Error(access?.error||'Access denied for Agents.');
      let shareUrl=String((await storageGet(STORAGE_KEY))||'').trim();
      if(!shareUrl){await configure();shareUrl=String((await storageGet(STORAGE_KEY))||'').trim();if(!shareUrl)throw new Error('DSpace Share URL is not configured.');}
      const davRoot=davRootFromShareUrl(shareUrl);

      setProgress('Extracting Pickup Polygons from Flex…');
      const extracted=await window.DigiExpressPlatform.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:SOURCE_OPERATION,inputs:{},awaitCompletion:true,silentDone:true});
      if(!extracted?.ok)throw new Error(extracted?.error||'Pickup Polygon extraction failed.');
      const result=extracted.result||{},prepared=preparePickup(Array.isArray(result.headers)?result.headers:[],Array.isArray(result.rows)?result.rows:[]);
      if(!prepared.rows.length)throw new Error('No FBM/SBS Pickup Polygon rows were found after extraction.');

      let uploaded=false,lastConflict=false;
      for(let attempt=1;attempt<=2&&!uploaded;attempt++){
        setProgress('Checking DSpace workbook and WebDAV permission…');
        const prop=await davPropfind(davRoot);const file=parsePropfind(prop.data,davRoot);
        setProgress(`Downloading ${file.name}…`);
        const got=await davGet(file.url);const etag=got.etag||file.etag;
        if(!etag)throw new Error('DSpace did not return an ETag. Upload was stopped to prevent unsafe overwrite.');
        setProgress(`Updating ${TARGET_SHEET} in memory…`);
        const updated=workbookWithDataset(got.bytes,prepared.headers,prepared.rows);
        setProgress(`Uploading ${prepared.rows.length.toLocaleString()} rows to DSpace…`);
        try{await davPut(file.url,updated,etag);}catch(e){if(e?.status===412&&attempt<2){lastConflict=true;continue;}throw e;}
        setProgress('Verifying uploaded workbook…');
        const verify=await davGet(file.url);verifyDataset(verify.bytes,prepared.headers,prepared.rows);uploaded=true;lastConflict=false;
      }
      if(!uploaded&&lastConflict)throw new Error('DSpace file changed during the update. Nothing was overwritten. Retry the Agent.');
      const durationMs=Date.now()-started;const msg=`${prepared.rows.length.toLocaleString()} rows saved to DSpace and verified.`;
      await saveState({running:false,lastStatus:'Success',lastRunAt:nowIso(),durationMs,lastMessage:msg,rowCount:prepared.rows.length});setProgress(msg,'success');
    }catch(e){
      const durationMs=Date.now()-started,msg=e?.message||String(e);await saveState({running:false,lastStatus:'Failed',lastRunAt:nowIso(),durationMs,lastMessage:msg});setProgress(msg,'error');
    }finally{x.run.disabled=false;}
  }

  async function init(){
    const x=ui();if(!x.run)return;renderState(await loadState());x.run.addEventListener('click',run);x.config?.addEventListener('click',configure);
  }
  init().catch(console.error);
})();
