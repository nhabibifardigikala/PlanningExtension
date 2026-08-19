const NOTES_KEY='digiexpress.notes.v2';
const LEGACY_NOTES_KEY='digiexpress.notes.v1';
const CATS_KEY='digiexpress.noteCategories.v2';
const LEGACY_CATS_KEY='digiexpress.noteCategories.v1';
const SETTINGS_KEY='digiexpress.noteSettings.v1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const uid=()=>crypto.randomUUID?.()||('n'+Date.now().toString(36)+Math.random().toString(36).slice(2));
const DEFAULT_CATS=['عمومی','کاری','شخصی'];
const I18N={
 fa:{title:'یادداشت‌ها',subtitle:'یادداشت، چک‌لیست و تصویر',navNotes:'یادداشت‌ها',navSettings:'تنظیمات',searchPlaceholder:'جستجو در عنوان و متن یادداشت‌ها',searchLabel:'جستجو',filterCategory:'دسته‌بندی',allCategories:'همه دسته‌بندی‌ها',clearFilter:'پاک کردن',language:'زبان',categories:'دسته‌بندی‌ها',categoryPlaceholder:'نام دسته‌بندی',add:'اضافه',dataTransfer:'ورود و خروج اطلاعات',exportNotes:'خروجی یادداشت‌ها',importNotes:'ورود یادداشت‌ها',newNote:'یادداشت جدید',editNote:'ویرایش یادداشت',noteTitle:'عنوان',noteTitlePlaceholder:'عنوان یادداشت',color:'رنگ',category:'دسته‌بندی',noteText:'متن',noteTextPlaceholder:'متن یادداشت',checklist:'چک‌لیست',checkPlaceholder:'آیتم چک‌لیست',image:'تصویر',chooseImage:'انتخاب تصویر',removeImage:'حذف تصویر',delete:'حذف',save:'ذخیره',untitled:'بدون عنوان',empty:'هنوز یادداشتی ثبت نشده است.',saved:'یادداشت ذخیره شد',updated:'یادداشت ویرایش شد',deleteConfirm:'این یادداشت حذف شود؟',categoryDeleteConfirm:'این دسته‌بندی حذف شود؟',atLeastCategory:'حداقل یک دسته‌بندی لازم است.',imageTooLarge:'حجم تصویر باید کمتر از 2.5MB باشد',importReplace:'یادداشت‌های فعلی با فایل جایگزین شوند؟',importInvalid:'فایل Import معتبر نیست',textDirection:'جهت متن',directionAuto:'خودکار',directionRtl:'راست به چپ',directionLtr:'چپ به راست'},
 en:{title:'Notes',subtitle:'Notes, checklists and images',navNotes:'Notes',navSettings:'Settings',searchPlaceholder:'Search note title and text',searchLabel:'Search',filterCategory:'Category',allCategories:'All categories',clearFilter:'Clear',language:'Language',categories:'Categories',categoryPlaceholder:'Category name',add:'Add',dataTransfer:'Import / Export',exportNotes:'Export notes',importNotes:'Import notes',newNote:'New note',editNote:'Edit note',noteTitle:'Title',noteTitlePlaceholder:'Note title',color:'Color',category:'Category',noteText:'Text',noteTextPlaceholder:'Note text',checklist:'Checklist',checkPlaceholder:'Checklist item',image:'Image',chooseImage:'Choose image',removeImage:'Remove image',delete:'Delete',save:'Save',untitled:'Untitled',empty:'No notes yet.',saved:'Note saved',updated:'Note updated',deleteConfirm:'Delete this note?',categoryDeleteConfirm:'Delete this category?',atLeastCategory:'At least one category is required.',imageTooLarge:'Image must be smaller than 2.5MB',importReplace:'Replace current notes with the imported file?',importInvalid:'Invalid import file',textDirection:'Text direction',directionAuto:'Auto',directionRtl:'Right to left',directionLtr:'Left to right'}
};
function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
let notes=readJson(NOTES_KEY,readJson(LEGACY_NOTES_KEY,[]));
let cats=readJson(CATS_KEY,readJson(LEGACY_CATS_KEY,DEFAULT_CATS)); if(!Array.isArray(cats)||!cats.length)cats=[...DEFAULT_CATS];
let settings=Object.assign({language:'fa'},readJson(SETTINGS_KEY,{}));
let editing=null,currentPage='notes',draftImage='';
function tr(k){return (I18N[settings.language]||I18N.fa)[k]||k}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function detectDirection(value){const s=String(value||'').trim();if(!s)return settings.language==='fa'?'rtl':'ltr';for(const ch of s){if(/[\u0590-\u08FF]/.test(ch))return'rtl';if(/[A-Za-z\u00C0-\u02AF]/.test(ch))return'ltr';}return settings.language==='fa'?'rtl':'ltr'}
function noteDirection(n){return n?.direction&&n.direction!=='auto'?n.direction:detectDirection(`${n?.title||''} ${n?.text||''} ${(n?.checklist||[]).map(x=>x.text).join(' ')}`)}
function applyEditorDirection(){const mode=$('#noteDirection')?.value||'auto',dir=mode==='auto'?detectDirection(`${$('#noteTitle')?.value||''} ${$('#noteText')?.value||''}`):mode;for(const el of[$('#noteTitle'),$('#noteText'),$('#checkText')])if(el){el.dir=dir;el.style.textAlign=dir==='rtl'?'right':'left'}$$('#checkList input[type=text]').forEach(el=>{el.dir=dir;el.style.textAlign=dir==='rtl'?'right':'left'})}
function persist(){localStorage.setItem(NOTES_KEY,JSON.stringify(notes));localStorage.setItem(CATS_KEY,JSON.stringify(cats));localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings))}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hidden'),1800)}
function applyLanguage(){const en=settings.language==='en';document.documentElement.lang=en?'en':'fa';document.documentElement.dir=en?'ltr':'rtl';$$('[data-i18n]').forEach(x=>x.textContent=tr(x.dataset.i18n));$$('[data-i18n-placeholder]').forEach(x=>x.placeholder=tr(x.dataset.i18nPlaceholder));$$('#noteColor option').forEach(o=>o.textContent=o.dataset[en?'en':'fa']||o.textContent);$('#languageSetting').value=settings.language}
function renderCats(){
 const filter=$('#filterCategory'), noteCat=$('#noteCategory'), fv=filter.value, nv=noteCat.value;
 filter.innerHTML=`<option value="">${esc(tr('allCategories'))}</option>`+cats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
 noteCat.innerHTML=cats.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
 if(cats.includes(fv))filter.value=fv;if(cats.includes(nv))noteCat.value=nv;
 $('#categoryChips').innerHTML=cats.map(x=>`<span class="chip"><span>${esc(x)}</span><button type="button" data-del-cat="${esc(x)}" aria-label="Delete">×</button></span>`).join('');
 $$('[data-del-cat]').forEach(b=>b.onclick=()=>{if(cats.length<=1){toast(tr('atLeastCategory'));return}if(!confirm(tr('categoryDeleteConfirm')))return;const c=b.dataset.delCat;cats=cats.filter(x=>x!==c);notes.forEach(n=>{if(n.category===c)n.category=cats[0]});persist();renderAll()});
}
function renderNotes(){
 const f=$('#filterCategory').value;
 const q=($('#noteSearch')?.value||'').trim().toLocaleLowerCase();
 const arr=notes.filter(n=>(!f||n.category===f)&&(!q||String(n.title||'').toLocaleLowerCase().includes(q)||String(n.text||'').toLocaleLowerCase().includes(q))).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 $('#notesGrid').innerHTML=arr.map(n=>{const dir=noteDirection(n);return `<article class="note-card" data-id="${esc(n.id)}" dir="${dir}" style="background:${esc(n.color||'#fff4cc')};text-align:${dir==='rtl'?'right':'left'}"><h3><span class="title">${esc(n.title||tr('untitled'))}</span><span class="category">${esc(n.category||'')}</span></h3>${n.text?`<p>${esc(n.text)}</p>`:''}${(n.checklist||[]).slice(0,4).map(c=>`<div class="mini-check"><input type="checkbox" ${c.done?'checked':''} disabled><span>${esc(c.text)}</span></div>`).join('')}${n.image?`<img src="${n.image}" alt="">`:''}</article>`}).join('')||`<div style="color:var(--muted);padding:24px;text-align:center">${esc(tr('empty'))}</div>`;
 $$('.note-card').forEach(c=>c.onclick=()=>openNote(c.dataset.id));
}
function renderAll(){applyLanguage();renderCats();renderNotes()}
function renderImage(){const p=$('#imagePreview');p.innerHTML=draftImage?`<img src="${draftImage}" alt=""><div class="image-preview-actions"><button id="removeImage" type="button">${esc(tr('removeImage'))}</button></div>`:'';const b=$('#removeImage');if(b)b.onclick=()=>{draftImage='';$('#noteImage').value='';renderImage()}}
function addCheckRow(item={text:'',done:false}){const d=document.createElement('div');d.className='check-item';d.innerHTML=`<input type="checkbox" ${item.done?'checked':''}><input type="text" value="${esc(item.text)}"><button type="button" aria-label="Delete">×</button>`;d.querySelector('button').onclick=()=>d.remove();$('#checkList').appendChild(d);applyEditorDirection()}
function openNote(id=null){
 editing=id;const n=notes.find(x=>x.id===id)||{title:'',text:'',color:'#fff4cc',category:cats[0],checklist:[],image:'',direction:'auto'};
 $('#editorTitle').textContent=id?tr('editNote'):tr('newNote');$('#noteTitle').value=n.title||'';$('#noteText').value=n.text||'';$('#noteDirection').value=n.direction||'auto';$('#noteColor').value=n.color||'#fff4cc';renderCats();$('#noteCategory').value=cats.includes(n.category)?n.category:cats[0];$('#checkList').innerHTML='';(n.checklist||[]).forEach(addCheckRow);$('#checkText').value='';$('#noteImage').value='';draftImage=n.image||'';renderImage();$('#deleteNote').style.visibility=id?'visible':'hidden';$('#editor').classList.remove('hidden');$('#editor').setAttribute('aria-hidden','false');applyEditorDirection();setTimeout(()=>$('#noteTitle').focus(),0)
}
function closeEditor(){editing=null;draftImage='';$('#editor').classList.add('hidden');$('#editor').setAttribute('aria-hidden','true')}
function collectNote(){const old=notes.find(x=>x.id===editing);const checklist=$$('#checkList .check-item').map(x=>({text:x.querySelector('input[type=text]').value.trim(),done:x.querySelector('input[type=checkbox]').checked})).filter(x=>x.text);return{id:editing||uid(),title:$('#noteTitle').value.trim(),text:$('#noteText').value.trim(),direction:$('#noteDirection').value||'auto',color:$('#noteColor').value,category:$('#noteCategory').value||cats[0],checklist,image:draftImage,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}}
function saveEditor(){const wasEdit=!!editing,n=collectNote();if(wasEdit){const i=notes.findIndex(x=>x.id===editing);if(i>=0)notes[i]=n}else notes.push(n);persist();closeEditor();renderAll();toast(wasEdit?tr('updated'):tr('saved'))}
function navigate(page){currentPage=page;$$('.page').forEach(x=>x.classList.toggle('active',x.dataset.page===page));$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.target===page));if(page==='settings')renderCats()}
$('#newNote').onclick=()=>openNote();$('#closeEditor').onclick=closeEditor;$('#editor').onclick=e=>{if(e.target===$('#editor'))closeEditor()};
$('#noteForm').addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();saveEditor()});
$('#saveNote').addEventListener('click',e=>{e.preventDefault();saveEditor()});
$('#addCheck').onclick=()=>{const t=$('#checkText').value.trim();if(!t)return;addCheckRow({text:t,done:false});$('#checkText').value=''};$('#checkText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#addCheck').click()}});
$('#noteImage').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2_500_000){toast(tr('imageTooLarge'));e.target.value='';return}const r=new FileReader();r.onload=()=>{draftImage=String(r.result||'');renderImage()};r.readAsDataURL(f)};
$('#deleteNote').onclick=()=>{if(!editing||!confirm(tr('deleteConfirm')))return;notes=notes.filter(x=>x.id!==editing);persist();closeEditor();renderAll()};
$('#addCategory').onclick=()=>{const x=$('#newCategory').value.trim();if(x&&!cats.includes(x)){cats.push(x);$('#newCategory').value='';persist();renderCats()}};$('#newCategory').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#addCategory').click()}});
$('#filterCategory').onchange=renderNotes;$('#noteSearch').addEventListener('input',renderNotes);
$('#languageSetting').onchange=()=>{settings.language=$('#languageSetting').value;persist();renderAll();applyEditorDirection()};
$('#noteDirection').onchange=applyEditorDirection;$('#noteTitle').addEventListener('input',applyEditorDirection);$('#noteText').addEventListener('input',applyEditorDirection);$('#checkText').addEventListener('input',applyEditorDirection);
$$('.nav-item').forEach(b=>b.onclick=()=>navigate(b.dataset.target));
$('#exportNotes').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,categories:cats,settings,notes},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Digiexpress_Notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('#importNotes').onchange=async e=>{try{const f=e.target.files?.[0];if(!f)return;const d=JSON.parse(await f.text());if(!Array.isArray(d.notes))throw Error();if(confirm(tr('importReplace'))){notes=d.notes;cats=Array.isArray(d.categories)&&d.categories.length?d.categories:cats;settings=Object.assign(settings,d.settings||{});persist();renderAll()}}catch{toast(tr('importInvalid'))}e.target.value=''};
renderAll();navigate('notes');
