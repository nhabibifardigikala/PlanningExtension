(function(){
  'use strict';
  const DEFAULT_URL='./DX_Polygons.xlsx';
  const aliases={
    stateId:['state id','state','province','استان'],
    name:['name','نام'],
    coordinates:['coordinates','coordinate','polygon','مختصات'],
    dcId:['distribution center id','dc id','distribution_center_id','id','شناسه مرکز'],
    iata:['iata'],
    district:['district','منطقه'],
    active:['active','is active','فعال'],
    timeScope:['time scope','time_scope','بازه زمانی'],
    submitType:['submit type','submit_type','نوع ارسال'],
    natureId:['shipping nature id','nature id','shipping_nature_id','نوع مرکز']
  };
  const canon=v=>String(v??'').trim().toLowerCase().replace(/[\u200c\u200f\u202a-\u202e]/g,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  function findKey(row,names){
    const keys=Object.keys(row||{}); const map=new Map(keys.map(k=>[canon(k),k]));
    for(const n of names){const hit=map.get(canon(n));if(hit!==undefined)return hit;}
    return null;
  }
  function pick(row,names){const k=findKey(row,names);return k===null?'':row[k];}
  function parseCoordinates(value){
    if(Array.isArray(value))return normalizeCoordinates(value);
    const s=String(value??'').trim(); if(!s)return [];
    let parsed=null;
    try{parsed=JSON.parse(s);}catch(_){
      try{parsed=JSON.parse(s.replace(/'/g,'"'));}catch(__){return [];}
    }
    return normalizeCoordinates(parsed);
  }
  function normalizeCoordinates(raw){
    if(!Array.isArray(raw))return [];
    const parts=[];
    for(const part of raw){
      if(!Array.isArray(part))continue;
      const pts=[];
      for(const p of part){
        if(!Array.isArray(p)||p.length<2)continue;
        const lat=Number(p[0]),lon=Number(p[1]);
        if(Number.isFinite(lat)&&Number.isFinite(lon))pts.push([lat,lon]);
      }
      if(pts.length>=3)parts.push(pts);
    }
    return parts;
  }
  function normalizeRow(row,index){
    const out={
      stateId:String(pick(row,aliases.stateId)??'').trim(),
      name:String(pick(row,aliases.name)??'').trim(),
      coordinates:parseCoordinates(pick(row,aliases.coordinates)),
      dcId:pick(row,aliases.dcId),
      iata:String(pick(row,aliases.iata)??'').trim(),
      district:String(pick(row,aliases.district)??'').trim(),
      active:pick(row,aliases.active),
      timeScope:String(pick(row,aliases.timeScope)??'').trim(),
      submitType:String(pick(row,aliases.submitType)??'').trim(),
      natureId:pick(row,aliases.natureId),
      _row:index+2
    };
    const dcNum=Number(out.dcId); if(Number.isFinite(dcNum))out.dcId=dcNum;
    const activeNum=Number(out.active); if(Number.isFinite(activeNum))out.active=activeNum;
    const natureNum=Number(out.natureId); if(Number.isFinite(natureNum))out.natureId=natureNum;
    return out;
  }
  async function load(url=DEFAULT_URL){
    if(!window.XLSX)throw new Error('Excel reader is unavailable.');
    const resolved=new URL(url,location.href); resolved.searchParams.set('_',String(Date.now()));
    const res=await fetch(resolved.href,{cache:'no-store'}); if(!res.ok)throw new Error(`DX_Polygons.xlsx could not be loaded (HTTP ${res.status}).`);
    const buf=await res.arrayBuffer(); const wb=XLSX.read(buf,{type:'array'}); const sheetName=wb.SheetNames[0];
    if(!sheetName)throw new Error('DX_Polygons.xlsx has no worksheet.');
    const raw=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:false});
    const rows=raw.map(normalizeRow).filter(r=>r.name&&r.coordinates.length);
    if(!rows.length)throw new Error('No valid polygons were found in DX_Polygons.xlsx. Check the column titles and coordinates column.');
    return {source:'DX_Polygons.xlsx',sheet:sheetName,rows,rawCount:raw.length,invalidCount:raw.length-rows.length,natureMap:{Normal:1,Medium:2,Large:3,Barbari:4,Business:5,Fast:6}};
  }
  window.DXPolygonLoader={load,normalizeRow,parseCoordinates};
})();
