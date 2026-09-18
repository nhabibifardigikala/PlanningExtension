/* DigiExpress Theme Bridge v334 — the Host theme is authoritative everywhere, including standalone Remote tabs. */
(()=>{
  const normalize=v=>String(v||'').toLowerCase()==='dark'?'dark':'light';
  const HOST_REQ='DIGIEXPRESS_REMOTE_THEME_REQUEST';
  const HOST_RES='DIGIEXPRESS_REMOTE_THEME_RESULT';
  let current='';
  let seq=0;
  let pendingHostRequest='';

  const apply=value=>{
    const theme=normalize(value);
    const changed=current!==theme;
    current=theme;
    const root=document.documentElement;
    root.dataset.theme=theme;
    root.style.colorScheme=theme;
    try{document.body?.setAttribute('data-theme',theme)}catch(_){}
    try{document.body?.style.setProperty('color-scheme',theme)}catch(_){}
    if(changed){
      try{window.dispatchEvent(new CustomEvent('digiexpress:themechange',{detail:{theme}}))}catch(_){}
    }
    return theme;
  };

  const requestParent=()=>{
    try{if(parent!==window)parent.postMessage({type:'DIGIEXPRESS_THEME_REQUEST'},'*')}catch(_){}
  };

  // Standalone Remote pages are not children of app.html. The Host content script
  // already exposes this narrow request and returns the real global opsTheme.
  const requestHostTheme=()=>{
    try{
      if(location.origin!=='https://nhabibifardigikala.github.io')return;
      const requestId=`dx-theme-${Date.now()}-${++seq}`;
      pendingHostRequest=requestId;
      window.postMessage({type:HOST_REQ,requestId},location.origin);
    }catch(_){}
  };

  const request=()=>{requestParent();requestHostTheme();};

  const qp=new URLSearchParams(location.search);
  apply(qp.get('theme') || 'light');

  addEventListener('message',event=>{
    const data=event.data||{};
    if(data.type==='DIGIEXPRESS_THEME'){
      apply(data.theme);
      return;
    }
    if(data.type===HOST_RES && (!pendingHostRequest || String(data.requestId||'')===pendingHostRequest) && data.ok!==false){
      pendingHostRequest='';
      apply(data.theme);
    }
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{request();setTimeout(request,60);setTimeout(request,350)},{once:true});
  else {request();setTimeout(request,60);setTimeout(request,350)}
  addEventListener('pageshow',request);
  addEventListener('focus',request);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)request()});
})();
