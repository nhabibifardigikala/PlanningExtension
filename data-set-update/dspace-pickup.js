(()=>{
  'use strict';

  const AGENT_ID='pickup-polygons-dspace';
  const SOURCE_OPERATION='extract-pickup-polygons';
  const TARGET_SHEET='Pick-up Polygons';
  const SHARE_URL='https://dspace.dkservices.ir/s/PjQJZLpewe6yWLf';
  const STATE_KEY='digiexpress.dspace.pickup.state';
  const DSPACE_ORIGIN='https://dspace.dkservices.ir';

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
  function davRootFromShareUrl(input){const token=tokenFromShareUrl(input);return `https://dspace.dkservices.ir/public.php/dav/files/${encodeURIComponent(token)}`;}

  async function configure(){setProgress('DSpace destination is configured in the program.','success');}


  function headersObject(h){
    if(!h)return{};if(Array.isArray(h)){const o={};for(const pair of h)if(Array.isArray(pair)&&pair.length>=2)o[String(pair[0]).toLowerCase()]=String(pair[1]);return o;}
    const o={};for(const [k,v] of Object.entries(h))o[String(k).toLowerCase()]=Array.isArray(v)?v.join(', '):String(v);return o;
  }

  async function remoteHttp(request){
    let r;
    try{
      r=await window.DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request});
    }catch(e){
      throw new Error(`DSpace ${request.method||'GET'} failed: ${e?.message||e}`);
    }
    if(!r) throw new Error(`DSpace ${request.method||'GET'} failed: empty Host response.`);
    const status=Number(r.status||0);
    if(!r.ok || status>=400){
      const err=new Error(r.error||`DSpace returned HTTP ${status||'unknown'}.`);
      err.status=status; err.responseText=String(r.data||r.text||''); throw err;
    }
    return {...r,status,headers:headersObject(r.headers)};
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

  function basicAuth(user,pass=''){
    return 'Basic '+btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
  }
  function davCandidates(){
    const token=tokenFromShareUrl(SHARE_URL);
    const modern=`${DSPACE_ORIGIN}/public.php/dav/files/${encodeURIComponent(token)}`;
    const legacy=`${DSPACE_ORIGIN}/public.php/webdav/`;
    return[
      {name:'Public DAV (modern)',base:modern,headers:{}},
      {name:'Public DAV (modern + token auth)',base:modern,headers:{Authorization:basicAuth(token,'')}},
      {name:'Legacy public WebDAV',base:legacy,headers:{Authorization:basicAuth(token,'')}}
    ];
  }
  const propfindBody='<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><d:getcontenttype/><d:getcontentlength/><d:getetag/><d:resourcetype/><oc:permissions/></d:prop></d:propfind>';
  async function davPropfind(cand,depth){
    return remoteHttp({url:cand.base,method:'PROPFIND',headers:{...cand.headers,Depth:String(depth),'Content-Type':'application/xml; charset=utf-8','X-Requested-With':'XMLHttpRequest'},bodyText:propfindBody,responseType:'text',timeoutMs:30000});
  }
  function firstNs(parent,ns,local){const n=parent.getElementsByTagNameNS(ns,local)[0];return n?n.textContent.trim():'';}
  function parseDavResponses(xmlText,base){
    const doc=new DOMParser().parseFromString(String(xmlText||''),'application/xml');
    if(doc.querySelector('parsererror'))throw new Error('DSpace returned invalid WebDAV XML.');
    return [...doc.getElementsByTagNameNS('DAV:','response')].map(r=>{
      const href=firstNs(r,'DAV:','href'),type=firstNs(r,'DAV:','getcontenttype'),etag=firstNs(r,'DAV:','getetag'),display=firstNs(r,'DAV:','displayname'),permissions=firstNs(r,'http://owncloud.org/ns','permissions');
      const resourceType=r.getElementsByTagNameNS('DAV:','collection').length?'collection':'file';
      let url;try{url=new URL(href,base).href;}catch(_){url=href||base;}
      return{href,url,type,etag,display,permissions,resourceType};
    });
  }
  function isExcel(item){const x=`${item.display} ${item.href} ${item.type}`.toLowerCase();return /\.xlsx(?:$|[?#/])/.test(x)||/spreadsheetml\.sheet/.test(x);}
  function candidateFile(cand,item,discovery,fileUrl){
    return{...cand,fileUrl:fileUrl||item?.url||cand.base,etag:item?.etag||'',displayName:item?.display||'Shared XLSX',permissions:item?.permissions||'',discovery};
  }
  async function probeWorkbook(conn){
    try{
      const got=await davGet(conn);
      return{ok:true,conn,got};
    }catch(e){
      return{ok:false,error:e};
    }
  }
  function headerFilename(headers={}){
    const cd=String(headers['content-disposition']||headers['Content-Disposition']||'');
    let m=cd.match(/filename\*=UTF-8''([^;]+)/i);
    if(m){try{return decodeURIComponent(m[1].trim().replace(/^"|"$/g,''));}catch(_){return m[1].trim().replace(/^"|"$/g,'');}}
    m=cd.match(/filename\s*=\s*"([^"]+)"/i)||cd.match(/filename\s*=\s*([^;]+)/i);
    if(m)return String(m[1]||'').trim().replace(/^"|"$/g,'');
    return'';
  }
  function headerLocation(headers={}){
    return String(headers['content-location']||headers['Content-Location']||'').trim();
  }
  function joinDavFile(base,name){
    const clean=String(name||'').trim().replace(/^\/+/, '');
    if(!clean)return'';
    const folderBase=String(base||'').endsWith('/')?String(base):String(base)+'/';
    return new URL(clean.split('/').map(x=>encodeURIComponent(decodeURIComponent(x))).join('/'),folderBase).href;
  }
  async function discoverFile(){
    const errors=[];
    for(const cand of davCandidates()){
      try{
        // Follow the working reference extension: inspect the single-file root first.
        // The important difference is that metadata alone is never trusted: every
        // candidate must pass a real GET and XLSX signature check before selection.
        try{
          const rootResp=await davPropfind(cand,0),rootItems=parseDavResponses(rootResp.data,cand.base);
          const root=rootItems[0];
          if(root&&root.resourceType==='file'&&(isExcel(root)||!root.type||root.url===cand.base)){
            const rootConn=candidateFile(cand,root,'Depth:0 / single-file root',root.url||cand.base);
            const rootProbe=await probeWorkbook(rootConn);
            if(rootProbe.ok)return{...rootProbe.conn,downloaded:rootProbe.got};
            errors.push(`${cand.name} root GET: ${rootProbe.error?.message||rootProbe.error}`);

            // DSpace/Nextcloud may expose a single-file share at the DAV root while
            // returning the actual filename only in GET response headers. Prefer
            // Content-Disposition / Content-Location over guessed PROPFIND names.
            const hintedNames=[];
            const fromDisposition=headerFilename(rootProbe.error?.headers||{});
            if(fromDisposition)hintedNames.push(fromDisposition);
            if(root.display&&/\.xlsx$/i.test(root.display))hintedNames.push(root.display);
            const seenNames=new Set();
            for(const hintedName of hintedNames){
              const key=String(hintedName).toLowerCase();if(seenNames.has(key))continue;seenNames.add(key);
              const namedUrl=joinDavFile(cand.base,hintedName);
              if(namedUrl&&namedUrl!==rootConn.fileUrl){
                const namedConn=candidateFile(cand,{...root,display:hintedName},fromDisposition===hintedName?'GET Content-Disposition filename':'Depth:0 / display-name URL',namedUrl);
                const namedProbe=await probeWorkbook(namedConn);
                if(namedProbe.ok)return{...namedProbe.conn,downloaded:namedProbe.got};
                errors.push(`${cand.name} named GET (${hintedName}): ${namedProbe.error?.message||namedProbe.error}`);
              }

              // Standard Nextcloud public-share WebDAV uses /public.php/webdav/
              // with Basic auth username=<share token>. A filename learned from the
              // modern root GET is therefore also tested on the legacy DAV endpoint.
              const token=tokenFromShareUrl(SHARE_URL);
              const legacyBase=`${DSPACE_ORIGIN}/public.php/webdav/`;
              const legacyUrl=joinDavFile(legacyBase,hintedName);
              const legacyConn={name:'Legacy public WebDAV (resolved filename)',base:legacyBase,headers:{Authorization:basicAuth(token,'')},fileUrl:legacyUrl,etag:root.etag||'',displayName:hintedName,permissions:root.permissions||'',discovery:'Resolved filename → legacy WebDAV'};
              const legacyProbe=await probeWorkbook(legacyConn);
              if(legacyProbe.ok)return{...legacyProbe.conn,downloaded:legacyProbe.got};
              errors.push(`Legacy resolved GET (${hintedName}): ${legacyProbe.error?.message||legacyProbe.error}`);
            }

            const contentLocation=headerLocation(rootProbe.error?.headers||{});
            if(contentLocation){
              try{
                const resolvedLocation=new URL(contentLocation,cand.base).href;
                if(resolvedLocation!==rootConn.fileUrl){
                  const locConn=candidateFile(cand,root,'GET Content-Location',resolvedLocation);
                  const locProbe=await probeWorkbook(locConn);
                  if(locProbe.ok)return{...locProbe.conn,downloaded:locProbe.got};
                  errors.push(`${cand.name} Content-Location GET: ${locProbe.error?.message||locProbe.error}`);
                }
              }catch(_){errors.push(`${cand.name}: invalid Content-Location header`);}
            }
          }
        }catch(e){errors.push(`${cand.name} Depth:0: ${e?.message||e}`);}

        // Folder-style shares: enumerate direct children and test the XLSX child.
        try{
          const listResp=await davPropfind(cand,1),items=parseDavResponses(listResp.data,cand.base);
          const baseUrl=new URL(cand.base).href;
          const children=items.filter(x=>x.resourceType==='file'&&isExcel(x)&&x.url&&new URL(x.url,cand.base).href!==baseUrl);
          if(children.length>1)throw new Error(`More than one XLSX file was found in the DSpace share (${children.map(x=>x.display||x.href).join(', ')}).`);
          if(children.length===1){
            const excel=children[0],childConn=candidateFile(cand,excel,'Depth:1 / child file',excel.url);
            const childProbe=await probeWorkbook(childConn);
            if(childProbe.ok)return{...childProbe.conn,downloaded:childProbe.got};
            errors.push(`${cand.name} child GET: ${childProbe.error?.message||childProbe.error}`);
          }else errors.push(`${cand.name}: XLSX child not found`);
        }catch(e){
          if(/More than one XLSX/.test(String(e?.message||e)))throw e;
          errors.push(`${cand.name} Depth:1: ${e?.message||e}`);
        }
      }catch(e){errors.push(`${cand.name}: ${e?.message||e}`);}
    }
    throw new Error(`DSpace XLSX file could not be downloaded from any supported WebDAV route. ${errors.join(' | ')}`);
  }
  function requireWritable(conn){
    if(!conn.permissions)return;
    if(!conn.permissions.includes('W'))throw new Error(`DSpace Public Share is not writable. oc:permissions = ${conn.permissions}`);
  }
  async function davGet(conn){
    const requestGet=async extraHeaders=>remoteHttp({url:conn.fileUrl,method:'GET',headers:{...conn.headers,...extraHeaders,'X-Requested-With':'XMLHttpRequest','Cache-Control':'no-cache'},responseType:'base64',timeoutMs:90000});
    let r=await requestGet({});
    let payload=r.bodyBase64??r.data;
    let bytes;
    try{bytes=responseBytes(payload);}catch(_){bytes=new Uint8Array(0);}
    if(!bytes.byteLength && !conn.headers?.Authorization){
      const token=tokenFromShareUrl(SHARE_URL),auth=basicAuth(token,'');
      r=await requestGet({Authorization:auth});
      payload=r.bodyBase64??r.data;
      try{bytes=responseBytes(payload);}catch(_){bytes=new Uint8Array(0);}
      if(bytes.byteLength)conn.headers={...conn.headers,Authorization:auth};
    }
    if(!bytes.byteLength){
      const len=r.byteLength??r.headers?.['content-length']??'unknown';
      const ct=r.contentType||r.headers?.['content-type']||'unknown';
      const err=new Error(`Downloaded DSpace XLSX is empty (HTTP ${r.status||'unknown'}, bytes=${len}, content-type=${ct}, URL=${r.url||conn.fileUrl}).`);
      err.headers=r.headers||{};err.url=r.url||conn.fileUrl;err.status=r.status||0;err.contentType=ct;err.byteLength=len;
      throw err;
    }
    if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error(`DSpace GET did not return an XLSX/ZIP file (HTTP ${r.status||'unknown'}, content-type=${r.contentType||r.headers?.['content-type']||'unknown'}).`);
    return{bytes,etag:r.headers?.etag||conn.etag||''};
  }
  async function davPut(conn,bytes,etag){
    const headers={...conn.headers,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','X-Requested-With':'XMLHttpRequest'};
    if(etag)headers['If-Match']=etag;
    try{return await remoteHttp({url:conn.fileUrl,method:'PUT',headers,bodyBase64:bytesToBase64(bytes),responseType:'text',timeoutMs:90000});}
    catch(e){if(e?.status===412)throw e;throw e;}
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
      await saveState({running:true,lastMessage:'Starting DSpace update…'});setProgress('Checking Agents access…');
      const access=await window.DigiExpressPlatform.runtime.sendMessage({type:'CHECK_OPERATION_ACCESS',op:'agents-access-gate'});
      if(!access?.ok||!access?.allowed)throw new Error(access?.error||'Access denied for Agents.');
      setProgress('Extracting Pickup Polygons from Flex…');
      const extracted=await window.DigiExpressPlatform.runtime.sendMessage({type:'RUN_REMOTE_OPERATION',op:SOURCE_OPERATION,inputs:{},awaitCompletion:true,silentDone:true,timeoutMs:600000});
      if(!extracted?.ok)throw new Error(extracted?.error||'Pickup Polygon extraction failed.');
      const result=extracted.result||{},prepared=preparePickup(Array.isArray(result.headers)?result.headers:[],Array.isArray(result.rows)?result.rows:[]);
      if(!prepared.rows.length)throw new Error('No FBM/SBS Pickup Polygon rows were found after extraction.');

      let uploaded=false,lastConflict=false;
      for(let attempt=1;attempt<=2&&!uploaded;attempt++){
        setProgress('Checking DSpace workbook and WebDAV permission…');
        const file=await discoverFile();requireWritable(file);
        setProgress(`Downloading ${file.displayName}…`);
        const got=file.downloaded||await davGet(file);const etag=got.etag||file.etag;
        if(!etag)throw new Error('DSpace did not return an ETag. Upload was stopped to prevent unsafe overwrite.');
        setProgress(`Updating ${TARGET_SHEET} in memory…`);
        const updated=workbookWithDataset(got.bytes,prepared.headers,prepared.rows);
        setProgress(`Uploading ${prepared.rows.length.toLocaleString()} rows to DSpace…`);
        try{await davPut(file,updated,etag);}catch(e){if(e?.status===412&&attempt<2){lastConflict=true;continue;}throw e;}
        setProgress('Verifying uploaded workbook…');
        const verify=await davGet(file);verifyDataset(verify.bytes,prepared.headers,prepared.rows);uploaded=true;lastConflict=false;
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
