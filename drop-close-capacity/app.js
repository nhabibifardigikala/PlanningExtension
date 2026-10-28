const KEY='dropCloseCapacityV1';
const $=id=>document.getElementById(id);
let imported=[];
let currentSession='';
let processing=false;
let pauseRequested=false;
let cancelRequested=false;

const digits=s=>String(s??'').replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c));
function date(s){s=digits(s).trim().replace(/-/g,'/');const m=s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);if(!m)throw Error('تاریخ نامعتبر: '+s);const y=+m[1],mo=+m[2],d=+m[3];if(y<1300||y>1499||mo<1||mo>12||d<1||d>31||(mo>6&&d>30)||(mo===12&&d>30))throw Error('تاریخ شمسی نامعتبر: '+s);return `${y}/${String(mo).padStart(2,'0')}/${String(d).padStart(2,'0')}`}
function timeScope(v){const s=digits(v).trim().replace(/[–—−]/g,'-').replace(/\s+/g,'');if(!s)return '';const m=s.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);if(!m||+m[1]>23||+m[3]>23||+m[2]>59||+m[4]>59)throw Error('تایم اسکوپ نامعتبر: '+s+'؛ مثال: 09:00-12:00');return `${m[1].padStart(2,'0')}:${m[2]}-${m[3].padStart(2,'0')}:${m[4]}`}
function makeItem(network,from,to,time,sourceRow){network=digits(network).trim();from=date(from);to=date(to);time=timeScope(time);if(!/^\d+$/.test(network)||from>to)throw Error('شناسه شبکه یا بازه تاریخ نامعتبر است');return {network,from,to,time,sourceRow,status:'pending',completed:0,closedIds:[],message:''}}
function csvRows(s){let rows=[],row=[],cell='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){cell+='"';i++}else q=!q}else if(c===','&&!q){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
function parse(rows){if(!rows.length)throw Error('فایل خالی است');const h=rows[0].map(x=>String(x||'').trim().toLowerCase());const cols=['network_id','from_date','to_date'].map(x=>h.indexOf(x));if(cols.some(x=>x<0))throw Error('ستون‌ها باید network_id, from_date, to_date باشند');return rows.slice(1).filter(r=>r.some(x=>String(x||'').trim())).map((r,i)=>{try{return makeItem(r[cols[0]],r[cols[1]],r[cols[2]],h.includes('time_scope')?r[h.indexOf('time_scope')]:'',i+2)}catch(e){throw Error(`ردیف اکسل ${i+2}: ${e.message}`)}})}
function normDate(v){return digits(v).replace(/-/g,'/').replace(/\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/g,(_,y,m,d)=>`${y}/${m.padStart(2,'0')}/${d.padStart(2,'0')}`)}
function normScope(v){return digits(v).replace(/[–—−]/g,'-').replace(/\s+/g,'').replace(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/,(_,a,b,c,d)=>`${a.padStart(2,'0')}:${b}-${c.padStart(2,'0')}:${d}`)}
function rowDate(row){return (normDate(row?.[3]||'').match(/(?:13|14|19|20)\d{2}\/\d{2}\/\d{2}/)||[])[0]||''}
function rowId(row){return digits(row?.[0]||'').match(/\d+/)?.[0]||''}
function rowScope(row){return normScope(row?.[2]||'')}
function isClosedText(row){const s=String(row?.[13]||'').toLowerCase();return /✓|✔|closed|yes|true/.test(s)}

async function getState(){const x=await chrome.storage.local.get(KEY);return x?.[KEY]||null}
async function saveState(state){await chrome.storage.local.set({[KEY]:state});renderState(state)}
async function clearState(){await chrome.storage.local.remove(KEY);renderState(null)}

async function universal(definition,inputs={}){
  const r=await chrome.runtime.sendMessage({type:'RUN_UNIVERSAL_WORKFLOW',op:'drop-close-capacity',skipAccess:true,definition,inputs,timeoutMs:150000});
  if(!r?.ok)throw new Error(r?.error||'Browser automation failed.');
  return r.context||{};
}
async function openSession(session,url){
  return universal({id:'drop-close-capacity',workflow:[
    {type:'tab.open',session,url,active:true,timeoutMs:60000},
    {type:'dom.wait',session,selector:'table tbody tr',timeoutMs:45000,intervalMs:350,error:'جدول ظرفیت بارگذاری نشد.'},
    {type:'dom',session,command:{op:'table',selector:'table'},storeAs:'table'}
  ]});
}
async function closeSession(session){if(!session)return;try{await universal({id:'drop-close-capacity',workflow:[{type:'tab.close',session}]})}catch(_){}}
async function domValue(session,command){const c=await universal({id:'drop-close-capacity',workflow:[{type:'dom',session,command,storeAs:'value'}]});return c.value}
async function tableNow(session){
  const c=await universal({id:'drop-close-capacity',workflow:[
    {type:'dom.wait',session,selector:'table tbody tr',timeoutMs:30000,intervalMs:300,error:'جدول ظرفیت پس از عملیات در دسترس نیست.'},
    {type:'dom',session,command:{op:'table',selector:'table'},storeAs:'table'}
  ]});
  return c.table||{headers:[],rows:[]};
}
async function findActionSelector(session,rowNumber){
  const base=`table tbody tr:nth-child(${rowNumber}) td:last-child`;
  const selectors=[`${base} button:last-of-type`,`${base} a:last-of-type`,`${base} [role="button"]:last-of-type`];
  for(const s of selectors){if(await domValue(session,{op:'exists',selector:s}))return s}
  return '';
}
async function clickExactOkIfPresent(session){
  const selector='button.uk-button.uk-button-primary';
  const count=Number(await domValue(session,{op:'count',selector})||0);
  for(let i=0;i<count;i++){
    const text=String(await domValue(session,{op:'text',selector,index:i})||'').trim();
    if(/^ok$/i.test(text)){await universal({id:'drop-close-capacity',workflow:[{type:'dom',session,command:{op:'click',selector,index:i}}]});return true}
  }
  return false;
}
async function closeRow(session,rowNumber,id){
  const selector=await findActionSelector(session,rowNumber);
  if(!selector)return {ok:false,skip:true,message:'Action button not found; row may already be closed.'};
  await universal({id:'drop-close-capacity',workflow:[
    {type:'dom',session,command:{op:'armConfirmOnce',timeoutMs:7000}},
    {type:'dom',session,command:{op:'click',selector}},
    {type:'sleep',ms:650}
  ]});
  await clickExactOkIfPresent(session).catch(()=>false);
  const deadline=Date.now()+28000;
  while(Date.now()<deadline){
    if(cancelRequested)return {ok:false,message:'Cancelled'};
    await new Promise(r=>setTimeout(r,900));
    let table;try{table=await tableNow(session)}catch(_){continue}
    const idx=(table.rows||[]).findIndex(r=>rowId(r)===String(id));
    if(idx<0)return {ok:true,message:'Row disappeared after close.'};
    if(isClosedText(table.rows[idx]))return {ok:true,message:'CLOSED confirmed.'};
    const action=await findActionSelector(session,idx+1).catch(()=> '');
    if(!action)return {ok:true,message:'CLOSED/action state confirmed.'};
  }
  return {ok:false,message:`تأیید CLOSED برای ${id} دیده نشد.`};
}
function setStatus(text,kind=''){const el=$('status');el.textContent=text;el.dataset.kind=kind}
function statusClass(v){return ['done','finished'].includes(v)?'done':v==='running'?'running':['paused','cancelled','failed'].includes(v)?'paused':'pending'}
function statusText(v){return v==='done'?'تکمیل':v==='running'?'در حال اجرا':v==='paused'?'متوقف':v==='cancelled'?'لغو شده':'در انتظار'}
function renderQueueTable(state){
  const rows=state?.items?.length?state.items:imported;
  const body=$('queueRows'); if(!body)return;
  $('queueMeta').textContent=`${rows.length} مورد`;
  if(!rows.length){body.innerHTML='<tr class="empty"><td colspan="8">هنوز موردی به صف اضافه نشده است.</td></tr>';return}
  body.innerHTML=rows.map((x,i)=>`<tr><td>${i+1}</td><td>${x.network||'-'}</td><td>${x.from||'-'}</td><td>${x.to||'-'}</td><td>${x.time||'همه'}</td><td><span class="pill ${statusClass(x.status)}">${statusText(x.status)}</span></td><td>${Number(x.completed||0)}</td><td class="msg" title="${String(x.message||'').replace(/"/g,'&quot;')}">${x.message||'-'}</td></tr>`).join('');
}
function renderQueuePreview(){
  const rows=imported;
  const p=$('preview'); if(p)p.textContent=rows.length?`${rows.length} مورد آماده`:'فایلی انتخاب نشده است.';
  renderQueueTable(null);
}
function renderState(j){
  const total=j?.items?.length||imported.length||0;
  const index=Math.min(Number(j?.index||0),total);
  const pct=total?Math.round(index/total*100):0;
  $('progress').style.width=pct+'%';
  $('countLabel').textContent=`${index}/${total}`;
  $('stateLabel').textContent=j?.state==='running'?'در حال اجرا':j?.state==='paused'?'متوقف موقت':j?.state==='finished'?'پایان یافته':j?.state==='cancelled'?'لغو شده':'آماده';
  const items=j?.items?.length?j.items:imported;
  const success=(j?.log||[]).filter(x=>x.result==='closed').length;
  const failed=(j?.log||[]).filter(x=>x.result==='failed').length;
  const running=items.filter(x=>x.status==='running').length;
  $('statTotal').textContent=String(items.length);
  $('statSuccess').textContent=String(success);
  $('statFail').textContent=String(failed);
  $('statRunning').textContent=String(running);
  $('resume').style.display=j?.state==='paused'?'inline-flex':'none';
  if(j){const x=j.items?.[j.index];setStatus(`${j.message||x?.message||'در حال پردازش'} • شبکه ${x?.network||'-'} • ${success} بسته‌شده`)}
  else setStatus('آماده');
  renderQueueTable(j);
}
function log(j,x,id,result,message){j.log.push({network:x.network,from:x.from,to:x.to,scope:x.time||'',sourceRow:x.sourceRow,id,result,time:new Date().toISOString(),message})}

async function processQueue(){
  if(processing)return;processing=true;pauseRequested=false;cancelRequested=false;
  try{
    let j=await getState();if(!j||!['running','paused'].includes(j.state))return;j.state='running';await saveState(j);
    while(j.index<j.items.length){
      if(cancelRequested){j.state='cancelled';j.message='صف لغو شد.';await saveState(j);break}
      if(pauseRequested){j.state='paused';j.message='صف متوقف موقت است.';await saveState(j);break}
      const x=j.items[j.index];x.status='running';x.message='در حال باز کردن ظرفیت شبکه…';await saveState(j);
      currentSession=`dropcap_${Date.now()}_${j.index}`;
      const url=`https://drop-shipping.digikala.com/shipping-network-capacity/?crud_tab_id=&from_date=&per_page=1000&shipping_network_id=${encodeURIComponent(x.network)}&time_scope_id=0&to_date=`;
      try{
        const ctx=await openSession(currentSession,url);const table=ctx.table||{headers:[],rows:[]};
        const candidates=(table.rows||[]).map((row,idx)=>({row,idx})).filter(({row})=>{const d=rowDate(row);return d&&d>=x.from&&d<=x.to&&(!x.time||rowScope(row)===x.time)&&!x.closedIds.includes(rowId(row))&&!isClosedText(row)});
        if(!candidates.length){x.status='done';x.message='ردیف باز منطبق پیدا نشد.';j.index++;j.message=x.message;await saveState(j);await closeSession(currentSession);currentSession='';continue}
        for(const c of candidates){
          if(cancelRequested||pauseRequested)break;
          const id=rowId(c.row)||`row-${c.idx+1}`;x.message=`در حال بستن ${id}`;j.message=x.message;await saveState(j);
          const res=await closeRow(currentSession,c.idx+1,id);
          if(res.ok){x.completed++;x.closedIds.push(id);log(j,x,id,'closed',res.message);j.message=`${id} بسته شد.`;await saveState(j)}
          else if(res.skip){log(j,x,id,'skipped',res.message);await saveState(j)}
          else{log(j,x,id,'failed',res.message);x.status='paused';x.message=res.message;j.state='paused';j.message=res.message;await saveState(j);pauseRequested=true;break}
        }
        await closeSession(currentSession);currentSession='';
        if(pauseRequested||cancelRequested)continue;
        x.status='done';j.index++;j.message=`شبکه ${x.network} تکمیل شد.`;await saveState(j);
      }catch(e){await closeSession(currentSession);currentSession='';x.status='paused';x.message=String(e.message||e);j.state='paused';j.message=x.message;await saveState(j);pauseRequested=true}
    }
    if(j.index>=j.items.length&&!cancelRequested&&!pauseRequested){j.state='finished';j.message='تمام ردیف‌ها پردازش شدند.';await saveState(j)}
  }finally{processing=false}
}

$('file').onchange=async()=>{try{const f=$('file').files[0];if(!f)return;$('fileName').textContent=f.name;const rows=f.name.toLowerCase().endsWith('.csv')?csvRows(await f.text()):await XlsxReader.read(await f.arrayBuffer());imported=parse(rows);renderQueuePreview();renderState(null)}catch(e){imported=[];$('fileName').textContent='خطا: '+e.message;renderQueuePreview();renderState(null)}};
$('manualAdd').onclick=()=>{try{imported.push(makeItem($('network').value,$('from').value,$('to').value,$('time').value,'manual-'+(imported.length+1)));$('manualStatus').textContent='به صف اضافه شد';renderQueuePreview();renderState(null)}catch(e){$('manualStatus').textContent=e.message}};
$('start').onclick=async()=>{try{if(!imported.length)throw Error('ابتدا ورودی دستی یا Excel اضافه کنید.');const old=await getState();if(old&&['running','paused'].includes(old.state)&&!confirm('صف قبلی جایگزین شود؟'))return;if(!confirm(`بستن ظرفیت‌های ${imported.length} مورد شروع شود؟`))return;const j={items:structuredClone(imported),index:0,state:'running',log:[],started:new Date().toISOString(),message:'شروع صف'};await saveState(j);processQueue()}catch(e){setStatus(e.message,'error')}};
$('pause').onclick=async()=>{pauseRequested=true;const j=await getState();if(j){j.state='paused';j.message='درخواست توقف ثبت شد؛ پس از مرحله جاری متوقف می‌شود.';await saveState(j)}};
$('resume').onclick=async()=>{const j=await getState();if(!j||!['paused','running'].includes(j.state))return;j.state='running';j.message='در حال ادامه صف…';await saveState(j);pauseRequested=false;processQueue()};
$('cancel').onclick=async()=>{const j=await getState();if(!j||!confirm('صف لغو شود؟ گزارش حفظ می‌شود.'))return;cancelRequested=true;j.state='cancelled';j.message='صف لغو شد.';await saveState(j);if(currentSession)await closeSession(currentSession);currentSession=''};
$('clear').onclick=async()=>{const j=await getState();if(j?.state==='running')return alert('ابتدا صف را متوقف کنید.');if(confirm('اطلاعات صف پاک شود؟')){await clearState();imported=[];renderQueuePreview()}};
function csvCell(x){return '"'+String(x??'').replace(/"/g,'""')+'"'}
$('report').onclick=async()=>{const j=await getState();if(!j)return alert('هنوز گزارشی وجود ندارد.');const data=[['network_id','from_date','to_date','time_scope','excel_row','row_id','result','timestamp','details'],...(j.log||[]).map(e=>[e.network,e.from,e.to,e.scope||'',e.sourceRow,e.id,e.result,e.time,e.message]),...j.items.filter(x=>x.status!=='done').map(x=>[x.network,x.from,x.to,x.time||'',x.sourceRow,'',x.status,new Date().toISOString(),x.message])];const blob=new Blob(['\ufeff'+data.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='drop-close-capacity-report-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};

function applyTheme(theme){document.documentElement.dataset.theme=theme==='dark'?'dark':'light'}
window.addEventListener('message',e=>{if(e.data?.type==='DIGIEXPRESS_THEME')applyTheme(e.data.theme)});try{parent.postMessage({type:'DIGIEXPRESS_THEME_REQUEST'},'*')}catch(_){}
(async()=>{const j=await getState();if(j?.items?.length){imported=j.items.map(x=>({...x}));renderQueuePreview()}renderState(j)})();


// Compact source tabs (v481)
document.querySelectorAll('.tab[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
  $('manualPane').classList.toggle('active',btn.dataset.tab==='manual');
  $('excelPane').classList.toggle('active',btn.dataset.tab==='excel');
}));
