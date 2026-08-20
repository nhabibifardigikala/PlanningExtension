(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const $=id=>document.getElementById(id), output=$('output'), interim=$('interim'), mic=$('micBtn'), status=$('status'), hint=$('hint');
  const qs=new URLSearchParams(location.search),standalone=qs.get('standalone')==='1';
  let lang=qs.get('lang')||'fa-IR',rec=null,listening=false,starting=false,hadResult=false,sessionStartedAt=0;
  let bc=null;try{bc=new BroadcastChannel('digiexpress-voice-typing-v1')}catch(_){}
  const setDir=()=>{const rtl=/^(fa|ar|he|ur)/i.test(lang);output.dir=rtl?'rtl':'ltr';output.style.textAlign=rtl?'right':'left'};
  const setState=(title,detail,on=false,error=false)=>{status.textContent=title;hint.textContent=detail||'';hint.classList.toggle('error',error);mic.classList.toggle('listening',on);document.body.classList.toggle('listening-state',on)};
  const toast=t=>{const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1200)};
  const append=(text,fromChannel=false)=>{text=String(text||'').trim();if(!text)return;const cur=output.value;output.value=cur+(cur&&!/\s$/.test(cur)?' ':'')+text;output.scrollTop=output.scrollHeight;if(!fromChannel&&standalone)bc?.postMessage({type:'final',text,lang})};
  bc?.addEventListener('message',e=>{const d=e.data||{};if(d.type==='final'&&!standalone)append(d.text,true);if(d.type==='status'&&!standalone)setState(d.title||'Voice Typing',d.detail||'',d.listening===true,d.error===true)});
  setDir();
  document.querySelectorAll('[data-lang]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.lang===lang);btn.addEventListener('click',()=>{lang=btn.dataset.lang;document.querySelectorAll('[data-lang]').forEach(x=>x.classList.toggle('active',x===btn));setDir();if(rec)rec.lang=lang})});
  function sendStatus(title,detail,on=false,error=false){setState(title,detail,on,error);if(standalone)bc?.postMessage({type:'status',title,detail,listening:on,error})}
  function ensureRecognition(){
    if(rec)return rec;if(!Recognition)throw new Error('Speech Recognition is not available in this browser.');
    rec=new Recognition();rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;rec.lang=lang;
    rec.onstart=()=>{starting=false;listening=true;hadResult=false;sessionStartedAt=Date.now();sendStatus('Listening…','Speak naturally. Your words will appear in the transcript.',true)};
    rec.onaudiostart=()=>sendStatus('Listening…','Microphone is receiving audio.',true);
    rec.onspeechstart=()=>sendStatus('Speech detected','Keep speaking; transcription is live.',true);
    rec.onresult=e=>{hadResult=true;let finalText='',partial='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t+' ';else partial+=t}if(finalText)append(finalText);interim.textContent=partial};
    rec.onerror=e=>{starting=false;listening=false;const code=String(e.error||'unknown');const help={
      'not-allowed':'Microphone or speech permission was blocked. Allow microphone access and try again.',
      'service-not-allowed':'The browser speech service is blocked by policy.',
      'audio-capture':'No usable microphone was found.',
      'network':'The browser speech service could not be reached. Check your connection and try again.',
      'language-not-supported':'This language is not available for speech recognition.',
      'no-speech':'No speech was detected. Press the microphone and try again.',
      'aborted':'Recording stopped.'
    }[code]||`Recognition error: ${code}`;sendStatus(code==='aborted'?'Stopped':'Could not continue',help,false,code!=='aborted')};
    rec.onend=()=>{starting=false;listening=false;interim.textContent='';const elapsed=Date.now()-sessionStartedAt;if(!hadResult&&elapsed<2500)sendStatus('Microphone session ended','The browser ended recognition immediately. Press the microphone to try again.',false,true);else sendStatus('Ready to listen','Press the microphone to continue dictation.')};
    return rec;
  }
  async function startLocal(){
    if(starting||listening)return;
    try{
      const r=ensureRecognition();starting=true;r.lang=lang;sendStatus('Starting microphone…','Waiting for microphone and speech service.');
      if(standalone&&navigator.mediaDevices?.getUserMedia){try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop())}catch(e){starting=false;sendStatus('Microphone permission required','Allow microphone access in this window, then press the microphone again.',false,true);return}}
      r.start();
    }catch(e){starting=false;sendStatus('Voice Typing unavailable',e.message||String(e),false,true)}
  }
  function stop(){starting=false;if(rec){try{rec.stop()}catch(_){}}listening=false;sendStatus('Ready to listen','Press the microphone to continue dictation.')}
  function openStandalone(){
    const u=new URL(location.href);u.searchParams.set('standalone','1');u.searchParams.set('lang',lang);u.searchParams.set('autostart','1');
    const w=window.open(u.href,'digiexpressVoiceTyping','popup,width=520,height=720,resizable=yes,scrollbars=yes');
    if(w){sendStatus('Microphone window opened','Press the microphone in the dedicated window. Transcribed text will appear here automatically.');}
    else sendStatus('Popup blocked','Allow popups for this page, then press the microphone again.',false,true);
  }
  mic.addEventListener('click',()=>{if(!standalone&&window.top!==window.self){openStandalone();return}if(listening||starting)stop();else startLocal()});
  $('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(output.value);toast('Copied')}catch(_){output.select();document.execCommand('copy');toast('Copied')}};
  $('clearBtn').onclick=()=>{output.value='';interim.textContent='';output.focus()};
  $('downloadBtn').onclick=()=>{const blob=new Blob([output.value],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`voice-typing-${new Date().toISOString().slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  if(!window.isSecureContext)sendStatus('Secure context required','Voice Typing needs HTTPS.',false,true);else if(!Recognition)sendStatus('Speech Recognition unavailable','This browser does not expose the Web Speech recognition API.',false,true);else if(standalone){sendStatus('Ready to listen','Press the microphone to begin.');if(qs.get('autostart')==='1')setTimeout(startLocal,350);}
})();
