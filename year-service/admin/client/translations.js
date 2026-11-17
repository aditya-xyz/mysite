import {languages} from '../../src/translation-catalog.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openTranslationEditor({api,showModal,root,toast,onSaved=()=>{}}){
 let locale='mr',data,dirty=false;
 async function load(){data=await api('translations/'+locale);dirty=false;draw();}
 function draw(){
  showModal(`<p class="kicker">Optional translations</p><h2>Pixel, in another language.</h2><p>Leave any translation blank to use English. Supplied translations publish with the scrapbook. Accessibility descriptions, card notes, artwork and mugshot captions stay English.</p><label class="field"><span>Language</span><span class="select-control"><select id="translation-language">${Object.entries(languages).filter(([id])=>id!=='en').map(([id,label])=>`<option value="${id}" ${locale===id?'selected':''}>${label}</option>`).join('')}</select></span></label><form id="translation-form">${[...new Set(data.sources.map(s=>s.group))].map(group=>`<details ${group==='Opening & story'?'open':''}><summary><strong>${esc(group)}</strong> · ${data.sources.filter(s=>s.group===group).length} passages</summary>${data.sources.filter(s=>s.group===group).map(s=>{
   const e=data.entries[s.key],current=e?.source===s.source,published=data.publishedEntries[s.key],value=current?e.value:'';
   return `<label class="field translation-field"><span>${esc(s.source)}</span><small class="hint">${value?published?.source===s.source&&published.value===value?'Published':'Ready to publish':'English fallback'}</small><textarea data-translation-key="${esc(s.key)}" lang="${locale}" rows="${s.source.length>180?5:2}" maxlength="${Math.max(2000,s.source.length*5)}">${esc(value)}</textarea></label>`;
  }).join('')}</details>`).join('')}<div class="actions"><button class="button" type="submit">Save translation draft</button></div><p class="hint">Save draft keeps these edits private. Publish the scrapbook once when ready.</p><p class="error" id="translation-error" role="alert"></p></form>`);
  const el=root(),form=el.querySelector('#translation-form');
  el.querySelector('#translation-language').onchange=async e=>{if(dirty&&!confirm('Discard unsaved translation changes?')){e.target.value=locale;return;}locale=e.target.value;try{await load();}catch(error){el.querySelector('#translation-error').textContent=error.message;}};
  form.oninput=()=>dirty=true;
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{
   const entries={};for(const s of data.sources){const input=[...form.querySelectorAll('[data-translation-key]')].find(i=>i.dataset.translationKey===s.key);entries[s.key]={source:s.source,value:input.value};}
   await api('translations/'+locale,{version:data.version,sourceVersion:data.sourceVersion,entries});onSaved();await load();toast('Translation draft saved. Publish the scrapbook when ready.');
  }catch(error){el.querySelector('#translation-error').textContent=error.message;button.disabled=false;}};
 }
 load().catch(error=>toast(error.message));
}
