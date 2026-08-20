(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const $=id=>document.getElementById(id), output=$('output'), interim=$('interim'), mic=$('micBtn'), status=$('status'), hint=$('hint');
  let lang='fa-IR',rec=null,listening=false,wantListening=false,starting=false;
  const setDir=()=>{const rtl=/^(fa|ar|he|ur)/i.test(lang);output.dir=rtl?'rtl':'ltr';output.style.textAlign=rtl?'right':'left'};
  const setState=(title,detail,on=false,error=false)=>{status.textContent=title;hint.textContent=detail||'';hint.classList.toggle('error',error);mic.classList.toggle('listening',on);document.body.classList.toggle('listening-state',on)};
  const toast=t=>{const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1200)};
  const append=text=>{text=String(text||'').trim();if(!text)return;const cur=output.value;output.value=cur+(cur&&!/\s$/.test(cur)?' ':'')+text;output.scrollTop=output.scrollHeight};
  setDir();
  document.querySelectorAll('[data-lang]').forEach(btn=>btn.addEventListener('click',()=>{lang=btn.dataset.lang;document.querySelectorAll('[data-lang]').forEach(x=>x.classList.toggle('active',x===btn));setDir();if(rec)rec.lang=lang;if(listening||wantListening){stop();setTimeout(start,180)}}));
  function ensureRecognition(){
    if(rec)return rec;if(!Recognition)throw new Error('Speech Recognition is not available in this browser.');
    rec=new Recognition();rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;rec.lang=lang;
    rec.onstart=()=>{starting=false;listening=true;setState('Listening…','Speak naturally. Your words will appear in the transcript.',true)};
    rec.onaudiostart=()=>setState('Listening…','Microphone is receiving audio.',true);
    rec.onspeechstart=()=>setState('Speech detected','Keep speaking; transcription is live.',true);
    rec.onresult=e=>{let finalText='',partial='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t+' ';else partial+=t}if(finalText)append(finalText);interim.textContent=partial};
    rec.onerror=e=>{starting=false;listening=false;const code=String(e.error||'unknown');const help={
      'not-allowed':'Microphone or speech permission was blocked. Allow microphone access for this page and try again.',
      'service-not-allowed':'The browser speech service is blocked by policy.',
      'audio-capture':'No usable microphone was found.',
      'network':'The speech recognition service could not be reached.',
      'language-not-supported':'This recognition language is not available.'
    }[code]||`Recognition error: ${code}`;if(code!=='aborted'&&code!=='no-speech')setState('Could not start',help,false,true);else setState('Ready to listen','Press the microphone and start speaking.');};
    rec.onend=()=>{starting=false;listening=false;interim.textContent='';if(wantListening){setState('Reconnecting…','Keeping dictation active.');setTimeout(()=>{if(!wantListening)return;try{rec.lang=lang;rec.start();starting=true}catch(_){wantListening=false;setState('Ready to listen','Press the microphone and start speaking.')}},220)}else setState('Ready to listen','Press the microphone and start speaking.')};
    return rec;
  }
  function start(){if(starting||listening)return;try{const r=ensureRecognition();wantListening=true;starting=true;r.lang=lang;setState('Starting microphone…','If Chrome asks for microphone permission, choose Allow.');r.start()}catch(e){wantListening=false;starting=false;setState('Voice Typing unavailable',e.message||String(e),false,true)}}
  function stop(){wantListening=false;starting=false;if(rec){try{rec.stop()}catch(_){}}listening=false;setState('Ready to listen','Press the microphone and start speaking.')}
  mic.addEventListener('click',()=>{if(listening||starting||wantListening)stop();else start()});
  $('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(output.value);toast('Copied')}catch(_){output.select();document.execCommand('copy');toast('Copied')}};
  $('clearBtn').onclick=()=>{output.value='';interim.textContent='';output.focus()};
  $('downloadBtn').onclick=()=>{const blob=new Blob([output.value],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`voice-typing-${new Date().toISOString().slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  if(!window.isSecureContext)setState('Secure context required','Voice Typing needs HTTPS.',false,true);else if(!Recognition)setState('Speech Recognition unavailable','This browser does not expose the Web Speech recognition API.',false,true);
})();
