const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const captionLanguages=[['mr','Marathi zinger · मराठी'],['zh-TW','Traditional Chinese zinger · 繁體中文']];
export function captionTranslationMarkup(state,photo){
 const store=state.captionTranslations;
 if(!store?.loaded)return '<p class="hint" data-caption-loading>Loading translated zingers…</p>';
 return captionLanguages.map(([locale,label])=>{
  const key=`photo:${photo.id}:caption`,data=store.locales[locale],pending=store.pending[locale][key],e=pending||data.entries[key];
  return `<label class="field"><span>${label}</span><textarea data-caption-language="${locale}" lang="${locale}" rows="2" maxlength="2500">${esc(e?.value||'')}</textarea><small class="hint" data-caption-status="${locale}">${esc(captionTranslationStatus(store,photo,locale))}</small></label>`;
 }).join('')+'<p class="hint">Save draft to keep these edits private. Approve translations from Review & publish when ready.</p>';
}
export function inlineTranslationStatus(store,key,source,locale){
 const pending=store.pending[locale][key],data=store.locales[locale],e=pending||data.entries[key],published=data.publishedEntries[key];
 if(pending)return pending.source===source?'Unsaved translation draft':'English changed · Check this translation again';
 if(!e?.value)return 'Needs translation';
 if(e.source!==source)return 'English changed · Needs review';
 return published?.source===source&&published.value===e.value?'Approved':'Draft · Needs review';
}
export function captionTranslationStatus(store,photo,locale){return inlineTranslationStatus(store,`photo:${photo.id}:caption`,photo.caption,locale);}
export async function loadCaptionTranslations(state,request){
 if(state.captionTranslations?.loaded)return;
 if(state.captionTranslations?.loading)return state.captionTranslations.loading;
 const store=state.captionTranslations||{loaded:false,locales:{},pending:{mr:{},'zh-TW':{}}};state.captionTranslations=store;
 store.loading=Promise.all(captionLanguages.map(async([locale])=>{store.locales[locale]=await request(`translations/${locale}`);})).then(()=>{store.loaded=true;}).finally(()=>{store.loading=null;});
 return store.loading;
}
export async function saveCaptionTranslations(state,request){
 const store=state.captionTranslations;if(!store?.loaded)return;
 const available=new Set(['intro','note','sharedTitle',...state.draft.stories.flatMap(s=>[`story:${s.id}:title`,`story:${s.id}:body`]),...state.draft.photos.map(p=>`photo:${p.id}:caption`)]);
 for(const locale of Object.keys(store.pending))for(const key of Object.keys(store.pending[locale]))if(!available.has(key))delete store.pending[locale][key];
 for(const [locale] of captionLanguages){
  const pending=store.pending[locale],keys=Object.keys(pending);if(!keys.length)continue;
  const entries=structuredClone(pending),data=store.locales[locale];
  const result=await request(`translations/${locale}`,{patch:true,version:data.version,sourceVersion:state.version,entries});
  data.version=result.version;Object.assign(data.entries,entries);
  for(const key of keys)if(pending[key]?.source===entries[key].source&&pending[key]?.value===entries[key].value)delete pending[key];
 }
}
export function bindCaptionTranslations({state,app,request,mark}){
 const target=app.querySelector('[data-caption-translations]');if(!target)return;
 const photo=state.draft.photos.find(p=>p.id===target.dataset.captionTranslations);if(!photo)return;
 const draw=()=>{
  if(!target.isConnected)return;target.innerHTML=captionTranslationMarkup(state,photo);
  target.querySelectorAll('[data-caption-language]').forEach(input=>input.oninput=()=>{
   const locale=input.dataset.captionLanguage;state.captionTranslations.pending[locale][`photo:${photo.id}:caption`]={source:photo.caption,value:input.value};mark();refreshCaptionStatuses(state,app,photo);
  });
 };
 loadCaptionTranslations(state,request).then(draw).catch(()=>{
  if(!target.isConnected)return;target.innerHTML='<p class="error">Could not load translated zingers. Your English caption is unchanged.</p><button type="button" class="secondary" data-retry-caption-translations>Retry translations</button>';
  target.querySelector('button').onclick=()=>bindCaptionTranslations({state,app,request,mark});
 });
}
export function refreshCaptionStatuses(state,app,photo){
 if(!state.captionTranslations?.loaded)return;
 app.querySelectorAll('[data-caption-status]').forEach(status=>{status.textContent=captionTranslationStatus(state.captionTranslations,photo,status.dataset.captionStatus);});
}
