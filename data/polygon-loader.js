(()=>{
  const DSPACE_SHARE_TOKEN='PjQJZLpewe6yWLf';
  const DSPACE_ORIGIN='https://dspace.dkservices.ir';
  const DSPACE_AUTH='Basic '+btoa(`${DSPACE_SHARE_TOKEN}:`);
  const PROPFIND_BODY='<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><d:getcontenttype/><d:getcontentlength/><d:getetag/><d:resourcetype/><oc:permissions/></d:prop></d:propfind>';
  function clean(v){return String(v??'').replace(/\u200c|\u200d|\u200e|\u200f/g,' ').replace(/\s+/g,' ').trim()}
  function norm(v){return clean(v).toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()}
  function findHeader(headers,aliases){const hs=headers.map(norm),as=aliases.map(norm);for(let i=0;i<hs.length;i++)if(as.includes(hs[i]))return i;for(let i=0;i<hs.length;i++)if(as.some(a=>hs[i].includes(a)))return i;return -1}
  function numberValue(v){if(typeof v==='number')return v;const s=String(v??'').trim().replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[−–—]/g,'-');return s===''?NaN:Number(s)}
  function parseWkt(text){
    if(!/^\s*(MULTI)?POLYGON\s*\(/i.test(text))return null;
    const pairs=[...text.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(m=>[Number(m[2]),Number(m[1])]);
    return pairs.length>=3?[pairs]:null;
  }
  function parseCoordinates(value){
    if(Array.isArray(value))return normalizeRings(value);
    let text=String(value??'').trim();if(!text)return[];
    const wkt=parseWkt(text);if(wkt)return wkt;
    let x=text;
    for(let d=0;d<3&&typeof x==='string';d++){
      try{x=JSON.parse(x);continue}catch(_){}
      try{x=JSON.parse(x.replace(/\(/g,'[').replace(/\)/g,']').replace(/'/g,'"'));continue}catch(_){}
      break;
    }
    return normalizeRings(x);
  }
  function normalizeRings(node){
    const rings=[];
    const isPoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(numberValue(p[0]))&&Number.isFinite(numberValue(p[1]));
    const walk=n=>{if(!Array.isArray(n))return;if(n.length>=3&&n.every(isPoint)){const ring=n.map(p=>[numberValue(p[0]),numberValue(p[1])]).filter(p=>p[0]>=-90&&p[0]<=90&&p[1]>=-180&&p[1]<=180);if(ring.length>=3)rings.push(ring);return}for(const c of n)walk(c)};
    walk(node);return rings;
  }
  function sheetFromSource(source){const s=String(source||'');if(/^sheet:/i.test(s))return s.slice(6).trim();if(/pickup/i.test(s))return 'Pick-up Polygons';return 'Delivery Polygons'}
  function isSuperMarketName(value){
    const s=clean(value).replace(/ي/g,'ی').replace(/ك/g,'ک');
    return /^سوپر\s*مارکت(?:ی)?/.test(s);
  }
  function mapRows(headers,rows,sheetName){
    const nameI=findHeader(headers,['Name','name','title','polygon title','coverage polygon title']);
    const coordI=findHeader(headers,['coordinates','coordinate']);
    const dcI=findHeader(headers,['distribution center id','dc id','distribution center','hub id','id']);
    const stateI=findHeader(headers,['state id']);
    const iataI=findHeader(headers,['IATA','iata','iata code']);
    const districtI=findHeader(headers,['district']);
    const natureI=findHeader(headers,['shipping nature id','shipping nature','shipping size id','shipping size']);
    const submitI=findHeader(headers,['submit type','delivery type','type']);
    const activeI=findHeader(headers,['active','is active']);
    if(nameI<0||coordI<0)throw new Error(`${sheetName}: required Name/title or coordinates column was not found. Received headers: ${headers.join(' | ')}`);
    return rows.map(r=>{
      const name=clean(r[nameI]);
      const natureId=(sheetName==='Delivery Polygons'&&isSuperMarketName(name))?7:(natureI>=0?r[natureI]:'');
      return {name,coordinates:parseCoordinates(r[coordI]),dcId:dcI>=0?r[dcI]:'',stateId:stateI>=0?r[stateI]:'',iata:iataI>=0?r[iataI]:'',district:districtI>=0?r[districtI]:'',natureId,submitType:submitI>=0?r[submitI]:'',active:activeI>=0?r[activeI]:1,timeScope:''};
    }).filter(r=>r.name&&r.coordinates.length);
  }
  function base64ToBytes(s){const raw=atob(String(s||'').replace(/^data:[^,]+,/,''));const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
  function responseBytes(r){const payload=r?.bodyBase64??r?.data;if(payload instanceof ArrayBuffer)return new Uint8Array(payload);if(ArrayBuffer.isView(payload))return new Uint8Array(payload.buffer,payload.byteOffset,payload.byteLength);if(Array.isArray(payload))return new Uint8Array(payload);if(typeof payload==='string'&&payload.length)return base64ToBytes(payload);if(payload&&typeof payload.base64==='string')return base64ToBytes(payload.base64);return new Uint8Array(0);}
  function headersObject(h){
    if(!h)return{};
    if(Array.isArray(h)){const o={};for(const pair of h)if(Array.isArray(pair)&&pair.length>=2)o[String(pair[0]).toLowerCase()]=String(pair[1]);return o;}
    const o={};for(const [k,v] of Object.entries(h))o[String(k).toLowerCase()]=Array.isArray(v)?v.join(', '):String(v);return o;
  }
  async function remoteHttp(request){
    const r=await DigiExpressPlatform.runtime.sendMessage({type:'REMOTE_HTTP_REQUEST',request});
    if(!r)throw new Error('DSpace Host response is empty.');
    if(!r.ok||Number(r.status||0)>=400)throw new Error(r.error||`DSpace returned HTTP ${r.status||'unknown'}.`);
    return {...r,headers:headersObject(r.headers)};
  }
  function candidates(){
    const modern=`${DSPACE_ORIGIN}/public.php/dav/files/${encodeURIComponent(DSPACE_SHARE_TOKEN)}/`;
    const legacy=`${DSPACE_ORIGIN}/public.php/webdav/`;
    return [
      {name:'Public DAV (modern)',base:modern,headers:{}},
      {name:'Public DAV (modern + token auth)',base:modern,headers:{Authorization:DSPACE_AUTH}},
      {name:'Legacy public WebDAV',base:legacy,headers:{Authorization:DSPACE_AUTH}}
    ];
  }
  function firstNs(parent,ns,local){const n=parent.getElementsByTagNameNS(ns,local)[0];return n?n.textContent.trim():''}
  function parseDavResponses(xmlText,base){
    const doc=new DOMParser().parseFromString(String(xmlText||''),'application/xml');
    if(doc.querySelector('parsererror'))throw new Error('DSpace returned invalid WebDAV XML.');
    return [...doc.getElementsByTagNameNS('DAV:','response')].map(r=>{
      const href=firstNs(r,'DAV:','href'),type=firstNs(r,'DAV:','getcontenttype'),display=firstNs(r,'DAV:','displayname');
      const resourceType=r.getElementsByTagNameNS('DAV:','collection').length?'collection':'file';
      let url;try{url=new URL(href,base).href}catch(_){url=href||base}
      return{href,url,type,display,resourceType};
    });
  }
  function isExcel(item){const x=`${item?.display||''} ${item?.href||''} ${item?.type||''}`.toLowerCase();return /\.xlsx(?:$|[?#/])/.test(x)||/spreadsheetml\.sheet/.test(x)}
  async function discoverWorkbook(){
    const errors=[];
    for(const cand of candidates()){
      try{
        const common={...cand.headers,'Content-Type':'application/xml; charset=utf-8','X-Requested-With':'XMLHttpRequest'};
        const r0=await remoteHttp({url:cand.base,method:'PROPFIND',headers:{...common,Depth:'0'},bodyText:PROPFIND_BODY,responseType:'text',timeoutMs:30000});
        const root=parseDavResponses(r0.data??r0.text,cand.base)[0];
        if(root&&root.resourceType==='file'&&(isExcel(root)||!root.type||root.url===cand.base))return{...cand,fileUrl:root.url||cand.base,displayName:root.display||'Shared XLSX'};
        const r1=await remoteHttp({url:cand.base,method:'PROPFIND',headers:{...common,Depth:'1'},bodyText:PROPFIND_BODY,responseType:'text',timeoutMs:30000});
        const excel=parseDavResponses(r1.data??r1.text,cand.base).find(x=>x.resourceType==='file'&&isExcel(x));
        if(excel)return{...cand,fileUrl:excel.url,displayName:excel.display||'XLSX'};
        errors.push(`${cand.name}: XLSX not found`);
      }catch(e){errors.push(`${cand.name}: ${e?.message||e}`)}
    }
    throw new Error(`DSpace XLSX file could not be discovered. ${errors.join(' | ')}`);
  }
  async function downloadWorkbook(){
    if(!globalThis.DigiExpressPlatform?.runtime?.sendMessage)throw new Error('DigiExpress Host bridge is unavailable. Reload the extension page and try again.');
    const conn=await discoverWorkbook();
    const request=async headers=>remoteHttp({url:conn.fileUrl,method:'GET',headers:{...conn.headers,...headers,'X-Requested-With':'XMLHttpRequest','Cache-Control':'no-cache'},responseType:'base64',timeoutMs:90000});
    let r=await request({});let bytes=responseBytes(r);
    if(!bytes.byteLength&&!conn.headers?.Authorization){r=await request({Authorization:DSPACE_AUTH});bytes=responseBytes(r);}
    if(!bytes.byteLength)throw new Error(`DSpace polygon workbook is empty (${conn.displayName}). Run a DSPACE Polygon Agent first.`);
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('DSpace polygon source is not a valid XLSX workbook.');
    return bytes;
  }
  async function load(source){
    const sheetName=sheetFromSource(source);
    if(!globalThis.XLSX)throw new Error('XLSX library is not available. Reload DigiExpress and try again.');
    const bytes=await downloadWorkbook();
    const wb=XLSX.read(bytes,{type:'array',cellDates:false});const ws=wb.Sheets[sheetName];
    if(!ws)throw new Error(`DSpace workbook does not contain worksheet "${sheetName}".`);
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
    if(!aoa.length)throw new Error(`${sheetName}: DSpace worksheet is empty.`);
    const headers=aoa[0].map(v=>String(v??'')),rows=aoa.slice(1);
    return {headers,rows:mapRows(headers,rows,sheetName),sheetName,updatedAt:''};
  }
  window.DXPolygonLoader={load};
})();
