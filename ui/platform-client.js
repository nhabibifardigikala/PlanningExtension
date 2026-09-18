/* DigiExpress Remote Platform Client v1
 * Page-side client for Stable Host 13.0.0. This file is Remote-owned and may
 * evolve without changing the extension Host as long as it uses the stable API.
 */
(() => {
  const ORIGIN=location.origin;
  const pending=new Map();
  let seq=0;
  const runtimeListeners=new Set();
  const storageListeners=new Set();
  function callBridge(method,args={}){
    return new Promise((resolve,reject)=>{
      const requestId=`dxp-${Date.now()}-${++seq}-${Math.random().toString(36).slice(2,7)}`;
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('DigiExpress Host did not respond. Install or reload Stable Host 13.0.0.'));},30000);
      pending.set(requestId,{resolve,reject,timer});
      window.postMessage({type:'DIGIEXPRESS_PLATFORM_CALL',requestId,method,args},ORIGIN);
    });
  }
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==ORIGIN)return;const d=event.data||{};
    if(d.type==='DIGIEXPRESS_PLATFORM_RESULT'&&d.requestId){const p=pending.get(String(d.requestId));if(!p)return;clearTimeout(p.timer);pending.delete(String(d.requestId));d.ok?p.resolve(d.result):p.reject(new Error(d.error||'Platform request failed.'));return;}
    if(d.type==='DIGIEXPRESS_PLATFORM_EVENT'){
      if(d.event==='runtimeMessage')for(const fn of [...runtimeListeners]){try{fn(d.payload,{},()=>{})}catch(_){}}
      if(d.event==='storageChanged'){const payload=d.payload||{};for(const fn of [...storageListeners]){try{fn(payload.changes||{},payload.areaName||'local')}catch(_){}}}
    }
  },false);
  const platform={
    call:async(method,args={})=>{const r=await callBridge('platform.call',{method,args});if(r?.ok===false)throw new Error(r.error||'Platform request failed.');return r?.result??r;},
    runtime:{sendMessage:message=>callBridge('runtime.sendMessage',{message})},
    storage:{
      get:keys=>callBridge('storage.local.get',{keys}),
      set:items=>callBridge('storage.local.set',{items}),
      remove:keys=>callBridge('storage.local.remove',{keys}),
      syncGet:keys=>callBridge('storage.sync.get',{keys}),
      syncSet:items=>callBridge('storage.sync.set',{items}),
      syncRemove:keys=>callBridge('storage.sync.remove',{keys})
    }
  };
  globalThis.DigiExpressPlatform=platform;

  // Compatibility shim lets the existing Remote shell logic run in a normal
  // HTTPS tab. No extension APIs are directly exposed to the page.
  globalThis.chrome={
    runtime:{
      sendMessage:message=>platform.runtime.sendMessage(message),
      onMessage:{addListener:fn=>runtimeListeners.add(fn),removeListener:fn=>runtimeListeners.delete(fn)},
      getURL:path=>`dx-local://${String(path||'').replace(/^\/+/, '')}`
    },
    storage:{
      local:{get:keys=>platform.storage.get(keys),set:items=>platform.storage.set(items),remove:keys=>platform.storage.remove(keys)},
      sync:{get:keys=>platform.storage.syncGet(keys),set:items=>platform.storage.syncSet(items),remove:keys=>platform.storage.syncRemove(keys)},
      onChanged:{addListener:fn=>storageListeners.add(fn),removeListener:fn=>storageListeners.delete(fn)}
    },
    permissions:{
      contains:async spec=>!!(await platform.call('permissions.contains',spec))?.value,
      request:async spec=>!!(await platform.call('permissions.request',spec))?.value
    },
    tabs:{
      create:async spec=>{
        const url=String(spec?.url||'');
        if(url.startsWith('dx-local://'))return platform.call('localPage.open',{path:url.slice('dx-local://'.length),active:spec?.active!==false});
        return platform.call('tabs.open',{url,active:spec?.active!==false});
      }
    }
  };
})();
