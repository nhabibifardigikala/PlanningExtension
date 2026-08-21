(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const $=id=>document.getElementById(id), output=$('output'), interim=$('interim'), mic=$('micBtn'), status=$('status'), hint=$('hint');
  let lang='fa-IR',rec=null,listening=false,starting=false,hadResult=false,sessionStartedAt=0,startWatchdog=null;
  const setDir=()=>{const rtl=/^(fa|ar|he|ur)/i.test(lang);output.dir=rtl?'rtl':'ltr';output.style.textAlign=rtl?'right':'left'};
  const setState=(title,detail,on=false,error=false)=>{status.textContent=title;hint.textContent=detail||'';hint.classList.toggle('error',error);mic.classList.toggle('listening',on);document.body.classList.toggle('listening-state',on)};
  const toast=t=>{const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1200)};
  const append=text=>{text=String(text||'').trim();if(!text)return;const cur=output.value;output.value=cur+(cur&&!/\s$/.test(cur)?' ':'')+text;output.scrollTop=output.scrollHeight};
  const clearWatchdog=()=>{if(startWatchdog){clearTimeout(startWatchdog);startWatchdog=null}};
  setDir();

  document.querySelectorAll('[data-lang]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.lang===lang);btn.addEventListener('click',()=>{lang=btn.dataset.lang;document.querySelectorAll('[data-lang]').forEach(x=>x.classList.toggle('active',x===btn));setDir();if(rec)rec.lang=lang})});

  async function verifyMicrophone(){
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone API is unavailable in this embedded page.');
    setState('Checking microphone…','Allow microphone access if Chrome asks.');
    let stream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      const tracks=stream.getAudioTracks();
      if(!tracks.length) throw new Error('No microphone audio track was returned.');
      const t=tracks[0];
      if(t.readyState!=='live') throw new Error('Microphone track is not active.');
      setState('Microphone ready',t.label?`Using: ${t.label}`:'Microphone access granted.');
      await new Promise(r=>setTimeout(r,180));
      return true;
    } catch(err){
      const name=String(err?.name||'');
      const msg=name==='NotAllowedError'?'Microphone permission was blocked. Allow microphone access for this site/extension and press Start again.':
        name==='NotFoundError'?'No microphone was found on this device.':
        name==='NotReadableError'?'The microphone is busy or cannot be opened by Chrome.':
        name==='SecurityError'?'Chrome blocked microphone access in this embedded page.':(err?.message||String(err));
      throw new Error(msg);
    } finally {
      if(stream) stream.getTracks().forEach(t=>t.stop());
    }
  }

  function ensureRecognition(){
    if(rec)return rec;
    if(!Recognition)throw new Error('Speech Recognition is not available in this browser.');
    rec=new Recognition();
    rec.continuous=true;
    rec.interimResults=true;
    rec.maxAlternatives=1;
    rec.lang=lang;
    rec.onstart=()=>{clearWatchdog();starting=false;listening=true;hadResult=false;sessionStartedAt=Date.now();setState('Listening…','Speak normally. Your words will appear below.',true)};
    rec.onaudiostart=()=>setState('Listening…','Microphone is active.',true);
    rec.onspeechstart=()=>setState('Speech detected','Keep speaking.',true);
    rec.onresult=e=>{hadResult=true;let finalText='',partial='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t+' ';else partial+=t}if(finalText)append(finalText);interim.textContent=partial};
    rec.onerror=e=>{clearWatchdog();starting=false;listening=false;const code=String(e.error||'unknown');const help={
      'not-allowed':'Speech recognition permission was blocked by Chrome.',
      'service-not-allowed':'Chrome speech recognition service is blocked by browser or organization policy.',
      'audio-capture':'Speech Recognition could not access the microphone even though the microphone test ran.',
      'network':'Chrome could not reach its speech recognition service. Check network/proxy access.',
      'language-not-supported':'The selected language is not available for speech recognition.',
      'no-speech':'Microphone works, but no speech was detected. Press Start and speak again.',
      'aborted':'Recording stopped.'
    }[code]||`Recognition error: ${code}`;setState(code==='aborted'?'Stopped':'Speech recognition failed',help,false,code!=='aborted')};
    rec.onend=()=>{clearWatchdog();starting=false;listening=false;interim.textContent='';const elapsed=Date.now()-sessionStartedAt;if(!hadResult&&elapsed>0&&elapsed<2200)setState('Recognition ended immediately','Microphone permission is OK, but Chrome ended the speech service immediately.',false,true);else if(!hadResult&&elapsed===0)setState('Recognition did not start','Chrome never fired the SpeechRecognition onstart event.',false,true);else setState('Ready to listen','Press the microphone to continue dictation.')};
    return rec;
  }

  async function start(){
    if(starting||listening)return;
    starting=true;
    try{
      if(!window.isSecureContext) throw new Error('Voice Typing requires a secure HTTPS context.');
      await verifyMicrophone();
      const r=ensureRecognition();
      r.lang=lang;
      setState('Starting speech recognition…','Microphone test passed. Waiting for Chrome speech service.');
      startWatchdog=setTimeout(()=>{
        if(starting&&!listening){starting=false;setState('Speech service did not start','Microphone works, but Chrome did not start SpeechRecognition in this embedded page. This points to a browser/policy limitation rather than the microphone.',false,true);try{r.abort()}catch(_){}}
      },5000);
      r.start();
    }catch(e){clearWatchdog();starting=false;setState('Could not start Voice Typing',e.message||String(e),false,true)}
  }
  function stop(){clearWatchdog();starting=false;if(rec){try{rec.stop()}catch(_){}}listening=false;setState('Ready to listen','Press the microphone to continue dictation.')}
  mic.addEventListener('click',()=>{if(listening||starting)stop();else start()});
  $('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(output.value);toast('Copied')}catch(_){output.select();document.execCommand('copy');toast('Copied')}};
  $('clearBtn').onclick=()=>{output.value='';interim.textContent='';output.focus()};
  $('downloadBtn').onclick=()=>{const blob=new Blob([output.value],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`voice-typing-${new Date().toISOString().slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  if(!window.isSecureContext)setState('Secure context required','Voice Typing needs HTTPS.',false,true);else if(!Recognition)setState('Speech Recognition unavailable','This browser does not expose the Web Speech recognition API.',false,true);else setState('Ready to listen','Press the microphone and start speaking.');
})();
