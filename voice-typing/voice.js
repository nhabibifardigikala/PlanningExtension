(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const $=id=>document.getElementById(id), output=$('output'), interim=$('interim'), mic=$('micBtn'), lang=$('language'), status=$('status'), hint=$('hint');
  let rec=null,listening=false,manualStop=false;
  const setDir=()=>{const rtl=/^(fa|ar|he|ur)/i.test(lang.value);output.dir=rtl?'rtl':'ltr';interim.dir=rtl?'rtl':'ltr';}; setDir();lang.addEventListener('change',()=>{setDir();if(rec)rec.lang=lang.value;});
  const setStatus=(text,on=false)=>{status.lastElementChild.textContent=text;status.classList.toggle('listening',on);mic.classList.toggle('listening',on);};
  const toast=t=>{const el=$('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1200)};
  const append=text=>{if(!text)return;const current=output.value;output.value=current+(current&&!/\s$/.test(current)?' ':'')+text.trim();output.scrollTop=output.scrollHeight;};
  if(!Recognition){mic.disabled=true;setStatus('Not supported');hint.textContent='Speech recognition is not available in this browser. Use a Chromium browser with Web Speech support.';return;}
  rec=new Recognition();rec.continuous=true;rec.interimResults=true;rec.lang=lang.value;
  rec.onstart=()=>{listening=true;manualStop=false;setStatus('Listening…',true);mic.title='Stop voice typing';};
  rec.onresult=e=>{let finalText='',partial='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t+' ';else partial+=t;}if(finalText)append(finalText);interim.textContent=partial;};
  rec.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed'){hint.textContent='Microphone or speech recognition permission was denied.';}else if(e.error!=='aborted'&&e.error!=='no-speech'){hint.textContent=`Recognition error: ${e.error}`;}setStatus('Stopped');};
  rec.onend=()=>{listening=false;interim.textContent='';setStatus('Ready');mic.title='Start voice typing';if(!manualStop){try{rec.lang=lang.value;rec.start();}catch(_){}}};
  mic.addEventListener('click',()=>{if(listening){manualStop=true;rec.stop();}else{manualStop=false;rec.lang=lang.value;try{rec.start();}catch(_){}}});
  $('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText(output.value);toast('Copied');}catch(_){output.select();document.execCommand('copy');toast('Copied');}};
  $('clearBtn').onclick=()=>{output.value='';interim.textContent='';output.focus();};
  $('downloadBtn').onclick=()=>{const blob=new Blob([output.value],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`voice-typing-${new Date().toISOString().slice(0,10)}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
})();
