(() => {
  const TRUSTED_ORIGIN='https://nhabibifardigikala.github.io';
  const pending=new Map();
  const listeners=[];
  let seq=0;

  function request(type,payload,resultType,timeoutMs=120000){
    return new Promise((resolve,reject)=>{
      const requestId=`rs-ui-${Date.now()}-${++seq}`;
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Digiexpress Host did not respond.'));},timeoutMs);
      pending.set(requestId,{resolve,reject,timer,resultType});
      window.postMessage({type,requestId,...payload},TRUSTED_ORIGIN);
    });
  }

  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==TRUSTED_ORIGIN)return;
    const d=event.data||{};
    if(d.type==='DIGIEXPRESS_REJECTED_RUNTIME_EVENT'){
      for(const fn of [...listeners]){try{fn(d.message||{}, {}, ()=>{});}catch(_){}}
      return;
    }
    const p=pending.get(String(d.requestId||''));
    if(!p||d.type!==p.resultType)return;
    clearTimeout(p.timer);pending.delete(String(d.requestId));
    if(d.ok===false)p.reject(new Error(d.error||'Digiexpress Host request failed.'));else p.resolve(d.result);
  },false);

  const runtime={
    onMessage:{addListener(fn){if(typeof fn==='function')listeners.push(fn);}},
    async sendMessage(message){return request('DIGIEXPRESS_REJECTED_RUNTIME_REQUEST',{message},'DIGIEXPRESS_REJECTED_RUNTIME_RESULT');}
  };
  const sync={
    async get(keys){return request('DIGIEXPRESS_REJECTED_STORAGE_GET',{keys},'DIGIEXPRESS_REJECTED_STORAGE_RESULT',30000);},
    async set(items){await request('DIGIEXPRESS_REJECTED_STORAGE_SET',{items},'DIGIEXPRESS_REJECTED_STORAGE_RESULT',30000);}
  };
  Object.defineProperty(window,'chrome',{value:{runtime,storage:{sync}},configurable:true});
})();
