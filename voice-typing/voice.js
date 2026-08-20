(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const $=id=>document.getElementById(id), output=$('output'), interim=$('interim'), mic=$('micBtn'), lang=$('language'), status=$('status'), hint=$('hint');
  let rec=null,listening=false,wantListening=false,starting=false;
  const setDir=()=>{const rtl=/^(fa|ar|he|ur)/i.test(lang.value);output.dir=rtl?'rtl':'ltr';interim.dir=rtl?'rtl':'ltr';};
  const setStatus=(text,on=false)=>{status.lastElementChild.textContent=text;status.classList.toggle('listening',on);mic.classList.toggle('listening',on);};
  const setHint=(text,error=false)=>{hint.textContent=text;hint.classList.toggle('error',error)};
  const toast=t=>{const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1200)};
  const append=text=>{if(!text)return;const current=output.value;output.value=current+(current&&!/\s$/.test(current)?' ':'')+text.trim();output.scrollTop=output.scrollHeight;};
  setDir();lang.addEventListener('change',()=>{setDir();if(rec)rec.lang=lang.value;});
  async function ensureMicrophone(){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access is not available in this browser.');
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}
    catch(e){throw new Error(e?.name==='NotAllowedError'?'Microphone permission was denied. Allow microphone access for Voice Typing.':`Microphone error: ${e?.message||e}`)}
    stream.getTracks().forEach(t=>t.stop());
  }
  function ensureRecognition(){
    if(rec)return rec;
    if(!Recognition)throw new Error('Speech recognition is not supported by this browser.');
    rec=new Recognition();rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;rec.lang=lang.value;
    rec.onstart=()=>{starting=false;listening=true;setStatus('Listening…',true);setHint('Speak naturally. Text is added as phrases are recognized.');mic.title='Stop voice typing';};
    rec.onresult=e=>{let finalText='',partial='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t+' ';else partial+=t;}if(finalText)append(finalText);interim.textContent=partial;};
    rec.onerror=e=>{starting=false;listening=false;interim.textContent='';const code=String(e.error||'unknown');if(code==='not-allowed'||code==='service-not-allowed')setHint('Speech recognition permission was blocked. Check microphone/site permission and try again.',true);else if(code!=='aborted'&&code!=='no-speech')setHint(`Recognition error: ${code}`,true);setStatus('Stopped');};
    rec.onend=()=>{starting=false;listening=false;interim.textContent='';mic.title='Start voice typing';if(wantListening){setStatus('Reconnecting…');setTimeout(()=>{if(!wantListening)return;try{rec.lang=lang.value;rec.start();starting=true}catch(_){wantListening=false;setStatus('Ready')}},250)}else setStatus('Ready');};
    return rec;
  }
  async function start(){
    if(starting||listening)return;starting=true;mic.disabled=true;setStatus('Requesting microphone…');setHint('Waiting for microphone permission…');
    try{await ensureMicrophone();const r=ensureRecognition();wantListening=true;r.lang=lang.value;r.start();setStatus('Starting…');setHint('Starting speech recognition…');}
    catch(e){wantListening=false;starting=false;setStatus('Ready');setHint(e.message||String(e),true)}finally{mic.disabled=false;}
  }
  function stop(){wantListening=false;starting=false;if(rec&&listening){try{rec.stop()}catch(_){}}else setStatus('Ready');}
  mic.addEventListener('click',()=>{if(listening||starting||wantListening)stop();else start();});
  $('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(output.value);toast('Copied');}catch(_){output.select();document.execCommand('copy');toast('Copied');}};
  $('clearBtn').onclick=()=>{output.value='';interim.textContent='';output.focus();};
  $('downloadBtn').onclick=()=>{const blob=new Blob([output.value],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`voice-typing-${new Date().toISOString().slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  if(!window.isSecureContext)setHint('Voice Typing requires a secure HTTPS context.',true);
  else if(!Recognition)setHint('This browser does not expose the Web Speech recognition service.',true);
})();
