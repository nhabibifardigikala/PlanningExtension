(()=>{
  const DATASETS_SPREADSHEET_ID='1eOeX-rXyNycXAyCYCHlH8UgW-NkyQ4IsbBOG0iQaB7k';
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
    return rows.map(r=>({
      name:clean(r[nameI]),coordinates:parseCoordinates(r[coordI]),dcId:dcI>=0?r[dcI]:'',stateId:stateI>=0?r[stateI]:'',iata:iataI>=0?r[iataI]:'',district:districtI>=0?r[districtI]:'',natureId:natureI>=0?r[natureI]:'',submitType:submitI>=0?r[submitI]:'',active:activeI>=0?r[activeI]:1,timeScope:''
    })).filter(r=>r.name&&r.coordinates.length);
  }
  async function load(source){
    const sheetName=sheetFromSource(source);
    if(!globalThis.DigiExpressPlatform?.call)throw new Error('DigiExpress Host bridge is unavailable. Reload the extension page and try again.');
    const response=await DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:DATASETS_SPREADSHEET_ID,sheetName,limit:100000});
    const data=response?.result||response;
    if(!data||!Array.isArray(data.headers)||!Array.isArray(data.rows))throw new Error(`${sheetName}: Google Sheets dataset could not be loaded.`);
    return {headers:data.headers,rows:mapRows(data.headers,data.rows,sheetName),sheetName,updatedAt:data.updatedAt||''};
  }
  window.DXPolygonLoader={load};
})();
