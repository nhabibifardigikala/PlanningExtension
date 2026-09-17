/* DigiExpress Theme Bridge v327 — keeps every remote workspace in sync with the shell theme. */
(()=>{
  const normalize=v=>String(v||'').toLowerCase()==='dark'?'dark':'light';
  const apply=value=>{
    const theme=normalize(value);
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
    try{document.body?.setAttribute('data-theme',theme)}catch(_){}
    return theme;
  };
  const qp=new URLSearchParams(location.search);
  const initial=qp.get('theme') || (matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light');
  apply(initial);
  addEventListener('message',event=>{
    const data=event.data||{};
    if(data.type==='DIGIEXPRESS_THEME') apply(data.theme);
  });
  const request=()=>{try{parent!==window&&parent.postMessage({type:'DIGIEXPRESS_THEME_REQUEST'},'*')}catch(_){}};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',request,{once:true}); else request();
})();
