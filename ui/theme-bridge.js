/* DigiExpress Theme Bridge v328 — one theme state across shell and every workspace. */
(()=>{
  const normalize=v=>String(v||'').toLowerCase()==='dark'?'dark':'light';
  let current='';
  const apply=value=>{
    const theme=normalize(value);
    current=theme;
    const root=document.documentElement;
    root.dataset.theme=theme;
    root.style.colorScheme=theme;
    try{document.body?.setAttribute('data-theme',theme)}catch(_){}
    try{document.body?.style.setProperty('color-scheme',theme)}catch(_){}
    return theme;
  };
  // Query-string theme is only a bootstrap fallback. The shell is authoritative.
  const qp=new URLSearchParams(location.search);
  apply(qp.get('theme') || (matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'));
  addEventListener('message',event=>{
    const data=event.data||{};
    if(data.type==='DIGIEXPRESS_THEME') apply(data.theme);
  });
  const request=()=>{try{parent!==window&&parent.postMessage({type:'DIGIEXPRESS_THEME_REQUEST'},'*')}catch(_){}};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{request();setTimeout(request,60)},{once:true});
  else {request();setTimeout(request,60)}
  addEventListener('pageshow',request);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)request()});
})();
