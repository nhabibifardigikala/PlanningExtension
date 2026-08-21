const K='digiexpress.workHealthy.v4';
const exercises=[
  {id:'neck',title:'Neck stretch',text:'Sit upright. Place one hand gently over the side of your head and tilt toward the shoulder until you feel a light stretch. Do not pull or force the neck.',image:'images/neck.jpg',interval:60,duration:30},
  {id:'shoulders',title:'Shoulder stretch',text:'Sit or stand tall. Bring one arm across the chest and support it with the opposite arm. Keep the shoulder low and relaxed.',image:'images/shoulders.jpg',interval:60,duration:30},
  {id:'back',title:'Back & chest reset',text:'Move away from the screen, sit tall and gently open the chest and upper back. Keep the movement comfortable and breathe normally.',image:'images/back.jpg',interval:90,duration:40},
  {id:'wrists',title:'Wrist stretch',text:'Extend one arm in front of you. With the other hand, gently guide the fingers back until you feel a mild stretch through the wrist and forearm.',image:'images/wrists.jpg',interval:60,duration:30},
  {id:'eyes',title:'Eye relaxation',text:'Look away from the monitor toward a distant point. Relax your focus, blink slowly several times and avoid staring at the screen during the break.',image:'images/eyes.jpg',interval:30,duration:20},
  {id:'tea',title:'Tea break',text:'Pause your work, sit comfortably and drink a cup of tea slowly. Use the short break to relax your shoulders, eyes and breathing.',image:'images/tea.jpg',interval:120,duration:120}
];
const defaults={enabled:true,start:'08:00',end:'18:00',items:Object.fromEntries(exercises.map(x=>[x.id,{enabled:true,interval:x.interval,duration:x.duration}]))};
function load(){
  let raw={};try{raw=JSON.parse(localStorage.getItem(K)||'{}')}catch(_){}
  if(!Object.keys(raw).length){
    try{const old=JSON.parse(localStorage.getItem('digiexpress.workHealthy.v3')||localStorage.getItem('digiexpress.workHealthy.v2')||'{}');
      raw={enabled:old.enabled!==false,start:old.start||'08:00',end:old.end||'18:00',items:{}};
      exercises.forEach(e=>raw.items[e.id]={enabled:Array.isArray(old.groups)?old.groups.includes(e.id):true,interval:Math.max(1,Number(old.interval)||e.interval),duration:Math.max(10,Number(old.duration)||e.duration)});
    }catch(_){}
  }
  const s={enabled:raw.enabled!==false,start:raw.start||defaults.start,end:raw.end||defaults.end,items:{}};
  exercises.forEach(e=>{const r=raw.items?.[e.id]||{};s.items[e.id]={enabled:r.enabled!==false,interval:Math.max(1,Number(r.interval)||e.interval),duration:Math.max(10,Number(r.duration)||e.duration)}});
  return s;
}
let state=load(),active=null,countTimer=null;
const $=q=>document.querySelector(q);const save=()=>localStorage.setItem(K,JSON.stringify(state));
function featureId(id){return `work-healthy-${id}`}
function postReminder(ex){
  const item=state.items[ex.id];
  try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:'DIGIEXPRESS_REMOTE_REMINDER_CONFIG',config:{featureId:featureId(ex.id),enabled:state.enabled&&item.enabled,intervalMinutes:Math.max(1,item.interval),start:state.start,end:state.end,durationSeconds:item.duration,groups:[ex.id],path:'work-healthy/index.html'}},'*')}catch(_){}
}
function syncAll(){exercises.forEach(postReminder)}
function reminderAction(action){
  const params=new URLSearchParams(location.search);if(params.get('reminder')!=='1')return;
  const id=active?.id||params.get('exercise')||'neck';
  try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:'DIGIEXPRESS_REMINDER_ACTION',featureId:featureId(id),action},'*')}catch(_){}
  setTimeout(()=>window.close(),80);
}
function card(ex){const it=state.items[ex.id];return `<article class="movement-card" data-id="${ex.id}">
  <img src="${ex.image}?v=229" alt="Office employee demonstrating ${ex.title}">
  <div class="movement-copy"><div class="movement-title"><strong>${ex.title}</strong><label class="switch"><input class="movement-enabled" type="checkbox" ${it.enabled?'checked':''}><span></span></label></div><p>${ex.text}</p>
  <div class="timing"><label>Every <span><input class="movement-interval" type="number" min="1" step="1" value="${it.interval}"> min</span></label><label>Show for <span><input class="movement-duration" type="number" min="10" step="5" value="${it.duration}"> sec</span></label></div>
  <button class="preview" type="button">Show now</button></div></article>`}
function render(){
  $('#enabled').checked=state.enabled;$('#start').value=state.start;$('#end').value=state.end;
  $('#library').innerHTML=exercises.map(card).join('');
  $('#library').querySelectorAll('.movement-card').forEach(el=>{
    const id=el.dataset.id,ex=exercises.find(x=>x.id===id),it=state.items[id];
    el.querySelector('.movement-enabled').onchange=e=>{it.enabled=e.target.checked;save();postReminder(ex)};
    el.querySelector('.movement-interval').onchange=e=>{it.interval=Math.max(1,Number(e.target.value)||1);e.target.value=it.interval;save();postReminder(ex)};
    el.querySelector('.movement-duration').onchange=e=>{it.duration=Math.max(10,Number(e.target.value)||10);e.target.value=it.duration;save();postReminder(ex)};
    el.querySelector('.preview').onclick=()=>showExercise(id);
  });
}
function showExercise(id){
  active=exercises.find(x=>x.id===id)||exercises[0];const it=state.items[active.id];
  $('#picture').innerHTML=`<img src="${active.image}?v=229" alt="${active.title}">`;
  $('#title').textContent=active.title;$('#text').textContent=active.text;$('#modal').classList.remove('hidden');
  let sec=it.duration;$('#count').textContent=`${sec}s`;clearInterval(countTimer);countTimer=setInterval(()=>{sec--;$('#count').textContent=`${Math.max(0,sec)}s`;if(sec<=0)clearInterval(countTimer)},1000);
}
$('#enabled').onchange=()=>{state.enabled=$('#enabled').checked;save();syncAll()};
$('#save').onclick=()=>{state.start=$('#start').value||'08:00';state.end=$('#end').value||'18:00';save();syncAll();$('#saved').textContent='Saved';setTimeout(()=>$('#saved').textContent='',1200)};
$('#done').onclick=()=>{$('#modal').classList.add('hidden');clearInterval(countTimer);reminderAction('done')};
$('#snooze').onclick=()=>{$('#modal').classList.add('hidden');clearInterval(countTimer);reminderAction('snooze')};
$('#close').onclick=()=>{$('#modal').classList.add('hidden');clearInterval(countTimer);reminderAction('dismiss')};
const qs=new URLSearchParams(location.search);if(qs.get('reminder')==='1'){document.getElementById('mainApp').classList.add('hidden');const id=qs.get('exercise')||'neck';const d=Number(qs.get('duration'));if(Number.isFinite(d)&&d>0&&state.items[id])state.items[id].duration=d;requestAnimationFrame(()=>showExercise(id))}
render();syncAll();
