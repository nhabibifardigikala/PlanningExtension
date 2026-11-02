(function(){
  const enc = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    crcTable[n]=c>>>0;
  }
  function crc32(bytes){
    let c=0xFFFFFFFF;
    for(const b of bytes) c=crcTable[(c^b)&0xFF]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0;
  }
  function xmlEscape(v){
    return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  }
  function colName(n){
    let s='';
    while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26); }
    return s;
  }
  function put16(a,o,v){ a[o]=v&255; a[o+1]=(v>>>8)&255; }
  function put32(a,o,v){ a[o]=v&255; a[o+1]=(v>>>8)&255; a[o+2]=(v>>>16)&255; a[o+3]=(v>>>24)&255; }
  function concat(chunks){
    const len=chunks.reduce((n,c)=>n+c.length,0), out=new Uint8Array(len); let p=0;
    for(const c of chunks){ out.set(c,p); p+=c.length; }
    return out;
  }
  function zipStore(files){
    const locals=[], centrals=[]; let offset=0;
    for(const file of files){
      const name=enc.encode(file.name), data=typeof file.data==='string'?enc.encode(file.data):file.data, crc=crc32(data);
      const local=new Uint8Array(30+name.length+data.length);
      put32(local,0,0x04034b50); put16(local,4,20); put16(local,6,0x0800); put16(local,8,0);
      put16(local,10,0); put16(local,12,0); put32(local,14,crc); put32(local,18,data.length); put32(local,22,data.length);
      put16(local,26,name.length); put16(local,28,0); local.set(name,30); local.set(data,30+name.length); locals.push(local);
      const cen=new Uint8Array(46+name.length);
      put32(cen,0,0x02014b50); put16(cen,4,20); put16(cen,6,20); put16(cen,8,0x0800); put16(cen,10,0);
      put16(cen,12,0); put16(cen,14,0); put32(cen,16,crc); put32(cen,20,data.length); put32(cen,24,data.length);
      put16(cen,28,name.length); put16(cen,30,0); put16(cen,32,0); put16(cen,34,0); put16(cen,36,0); put32(cen,38,0); put32(cen,42,offset);
      cen.set(name,46); centrals.push(cen); offset+=local.length;
    }
    const cd=concat(centrals), eocd=new Uint8Array(22);
    put32(eocd,0,0x06054b50); put16(eocd,4,0); put16(eocd,6,0); put16(eocd,8,files.length); put16(eocd,10,files.length);
    put32(eocd,12,cd.length); put32(eocd,16,offset); put16(eocd,20,0);
    return concat([...locals,cd,eocd]);
  }
  function makeSheet(rows){
    const widths=[14,34,14,16,16,18,14,22];
    let xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml+='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    xml+='<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    xml+='<cols>'+widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols><sheetData>';
    for(let r=0;r<rows.length;r++){
      xml+=`<row r="${r+1}">`;
      for(let c=0;c<rows[r].length;c++){
        const ref=`${colName(c+1)}${r+1}`, cell=rows[r][c], header=r===0;
        if(typeof cell==='number' && Number.isFinite(cell)) xml+=`<c r="${ref}" s="${header?1:2}"><v>${cell}</v></c>`;
        else xml+=`<c r="${ref}" t="inlineStr" s="${header?1:0}"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
      }
      xml+='</row>';
    }
    if(rows.length && rows[0].length) xml+=`</sheetData><autoFilter ref="A1:${colName(rows[0].length)}${rows.length}"/>`;
    else xml+='</sheetData>';
    xml+='</worksheet>';
    return xml;
  }
  function buildXlsx(rows){
    const files=[
      {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
      {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="GANJE Follow-up" sheetId="1" r:id="rId1"/></sheets></workbook>'},
      {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
      {name:'xl/styles.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
      {name:'xl/worksheets/sheet1.xml',data:makeSheet(rows)}
    ];
    return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  window.GanjeXlsx={buildXlsx};
})();
