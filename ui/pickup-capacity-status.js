/* DigiExpress Pickup Capacity status helper v513
 * Remote-owned helper. Reads Pickup Capacity through Stable Host sheets.readRows.
 */
(() => {
  const SPREADSHEET_ID='1Lmi-6SgJdC2O91KDeqrobPHq_jIKvdDSlZ3_NLgFVJg';
  const SHEET_NAME='Pickup Capacity';
  let cachePromise=null;

  const clean=v=>String(v??'').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[\s_\-]+/g,' ');
  const digits=v=>clean(v).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  function headerIndex(headers, wanted){
    const target=norm(wanted);
    return (headers||[]).findIndex(h=>norm(h)===target);
  }
  function parseActive(v){
    const s=norm(v);
    if(['1','true','yes','active','فعال'].includes(s))return true;
    if(['0','false','no','inactive','غیرفعال','غيرفعال'].includes(s))return false;
    return null;
  }
  function dateKey(v){
    const s=digits(v).replace(/[^0-9]/g,'');
    const n=Number(s);
    return Number.isFinite(n)?n:0;
  }
  function polygonId(v){
    const s=digits(v).trim();
    if(!s)return'';
    const n=Number(s);
    return Number.isFinite(n)?String(n):s;
  }
  async function load({force=false}={}){
    if(cachePromise&&!force)return cachePromise;
    cachePromise=(async()=>{
      if(!globalThis.DigiExpressPlatform?.call)throw new Error('DigiExpress Host bridge is unavailable.');
      const response=await DigiExpressPlatform.call('sheets.readRows',{spreadsheetId:SPREADSHEET_ID,sheetName:SHEET_NAME,limit:100000});
      const data=response?.result||response;
      const headers=Array.isArray(data?.headers)?data.headers:[];
      const rows=Array.isArray(data?.rows)?data.rows:[];
      const idI=headerIndex(headers,'Hub Coverage Polygon ID');
      const activeI=headerIndex(headers,'Active');
      const creationI=headerIndex(headers,'Creation Date');
      if(idI<0||activeI<0)throw new Error('Pickup Capacity: Hub Coverage Polygon ID or Active column was not found.');
      const latest=new Map();
      rows.forEach((row,rowIndex)=>{
        const id=polygonId(row?.[idI]);
        if(!id)return;
        const active=parseActive(row?.[activeI]);
        if(active===null)return;
        const creation=creationI>=0?dateKey(row?.[creationI]):0;
        const prev=latest.get(id);
        if(!prev||creation>prev.creation||(creation===prev.creation&&rowIndex>prev.rowIndex)){
          latest.set(id,{active,creation,rowIndex});
        }
      });
      const statusById=new Map();
      let activeCount=0,inactiveCount=0;
      for(const [id,item] of latest){statusById.set(id,item.active);item.active?activeCount++:inactiveCount++;}
      return {statusById,activeCount,inactiveCount,totalRows:Number(data?.totalRows||rows.length),updatedAt:data?.updatedAt||'',sourceRows:rows.length};
    })();
    try{return await cachePromise;}catch(e){cachePromise=null;throw e;}
  }
  function attach(rows,status){
    const map=status?.statusById instanceof Map?status.statusById:new Map();
    return (rows||[]).map(r=>{
      const id=polygonId(r?.dcId??r?.stateId);
      const known=map.has(id);
      return {...r,pickupActiveKnown:known,pickupActive:known?map.get(id):null};
    });
  }
  function label(row){
    if(row?.pickupActive===true)return'Active';
    if(row?.pickupActive===false)return'Inactive';
    return'Unknown';
  }
  globalThis.DXPickupCapacityStatus={load,attach,label,spreadsheetId:SPREADSHEET_ID,sheetName:SHEET_NAME};
})();
