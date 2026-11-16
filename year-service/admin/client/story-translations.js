import {loadCaptionTranslations,inlineTranslationStatus} from './caption-translations.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locales=[['mr','Marathi · मराठी'],['zh-TW','Traditional Chinese · 繁體中文']];
export function storyTranslationSource(state,key){
 if(['intro','note','sharedTitle'].includes(key))return state.draft[key];
 const match=/^story:(.+):(title|body)$/.exec(key);
 return match?state.draft.stories.find(s=>s.id===match[1])?.[match[2]]:undefined;
}
export function storyTranslationMarkup(state,key){
 const source=storyTranslationSource(state,key)||'',store=state.captionTranslations;
 const fields=!store?.loaded?'<p class="hint">Loading translations…</p>':locales.map(([locale,label])=>{
  const entry=store.pending[locale][key]||store.locales[locale].entries[key];
  return `<label class="field"><span>${label}</span><textarea data-story-translation-language="${locale}" lang="${locale}" rows="${source.length>180?5:2}" maxlength="${Math.max(2000,source.length*5)}">${esc(entry?.value||'')}</textarea><small class="hint" data-story-translation-status="${locale}">${esc(inlineTranslationStatus(store,key,source,locale))}</small></label>`;
 }).join('');
 return `<div data-story-translation-key="${esc(key)}">${fields}</div>`;
}
export function refreshStoryTranslationStatuses(state,app){
 if(!state.captionTranslations?.loaded)return;
 for(const target of app.querySelectorAll('[data-story-translation-key]')){
  const key=target.dataset.storyTranslationKey,source=storyTranslationSource(state,key)||'';
  target.querySelectorAll('[data-story-translation-status]').forEach(status=>{status.textContent=inlineTranslationStatus(state.captionTranslations,key,source,status.dataset.storyTranslationStatus);});
 }
}
export function bindStoryTranslations({state,app,request,mark}){
 const targets=[...app.querySelectorAll('[data-story-translation-key]')];if(!targets.length)return;
 loadCaptionTranslations(state,request).then(()=>{
  for(const target of targets){
   if(!target.isConnected)continue;
   const key=target.dataset.storyTranslationKey;
   // Replace only translation fields, preserving the English editor and focus.
   const container=document.createElement('div');container.innerHTML=storyTranslationMarkup(state,key);target.replaceChildren(...container.firstElementChild.childNodes);
   target.querySelectorAll('[data-story-translation-language]').forEach(input=>input.oninput=()=>{
    state.captionTranslations.pending[input.dataset.storyTranslationLanguage][key]={source:storyTranslationSource(state,key)||'',value:input.value};mark();refreshStoryTranslationStatuses(state,app);
   });
  }
 }).catch(()=>{
  for(const target of targets){if(!target.isConnected)continue;target.innerHTML='<p class="error">Could not load translations. Your English text is unchanged.</p><button type="button" class="secondary">Retry translations</button>';target.querySelector('button').onclick=()=>bindStoryTranslations({state,app,request,mark});}
 });
}
