import {languages} from '../../src/translation-catalog.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openTranslationReview({api,showModal,root,toast,onSaved=()=>{}}){
 let locale='mr',data,dirty=false;
 async function load(){
  data=await api('translations/'+locale);dirty=false;draw();
 }
 function draw(){
  showModal(`<p class="kicker">Translation review</p><h2>Pixel, in another language.</h2><p>Supplied photo captions and descriptions publish with the English scrapbook, without a separate approval. Other text uses the review controls below. Missing or outdated translations fall back to English. Card notes, artwork, mugshot captions and names stay English.</p><label class="field"><span>Review language</span><span class="select-control"><select id="translation-language">${Object.entries(languages).filter(([id])=>id!=='en').map(([id,label])=>`<option value="${id}" ${locale===id?'selected':''}>${label}</option>`).join('')}</select></span></label><p class="hint">${data.publishedAt?`Last published ${esc(new Date(data.publishedAt*1000).toLocaleString())} · ${esc(data.reviewedBy)}`:'Private draft · Nothing translated has been published.'} Save drafts freely. Photo text publishes with the scrapbook; other translations can be approved separately.</p><form id="translation-form">${[...new Set(data.sources.map(s=>s.group))].map(group=>`<details ${group==='Opening & story'?'open':''}><summary><strong>${esc(group)}</strong> · ${data.sources.filter(s=>s.group===group).length} passages</summary>${data.sources.filter(s=>s.group===group).map(s=>{
   const e=data.entries[s.key],current=e?.source===s.source,published=data.publishedEntries[s.key],live=published?.source===s.source&&published.value;
   return `<label class="field translation-field"><span>${esc(s.source)}</span><small class="hint">${current&&e.value?live===e.value?'Published':s.key.startsWith('photo:')?'Ready to publish with scrapbook':'Draft · Needs review':e?'English changed · Needs review':'Needs translation'}</small><textarea data-translation-key="${esc(s.key)}" lang="${locale}" rows="${s.source.length>180?5:2}" maxlength="${Math.max(2000,s.source.length*5)}">${esc(e?.value||'')}</textarea></label>`;
  }).join('')}</details>`).join('')}<div class="actions"><button class="button" type="submit">Save translation draft</button></div><p class="hint">For a full preview, save the draft, choose this language on an invitation, then open its full Pixelbook from Review & publish. Preview is admin-only; final order buttons stay disabled.</p><label class="socials-toggle"><input type="checkbox" id="translation-reviewed"><span>I reviewed the remaining site and story text and approve this language for guests.</span></label><button type="button" class="secondary" id="publish-translation" disabled>Approve & publish this language</button><p class="error" id="translation-error" role="alert"></p></form>`);
  const el=root(),form=el.querySelector('#translation-form'),publish=el.querySelector('#publish-translation'),reviewed=el.querySelector('#translation-reviewed');
  el.querySelector('#translation-language').onchange=async e=>{if(dirty&&!confirm('Discard unsaved translation changes?')){e.target.value=locale;return;}locale=e.target.value;try{await load();}catch(error){el.querySelector('#translation-error').textContent=error.message;}};
  form.oninput=e=>{if(e.target!==reviewed){dirty=true;reviewed.checked=false;}publish.disabled=dirty||!reviewed.checked;};
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{
   const entries={};for(const s of data.sources){const input=[...form.querySelectorAll('[data-translation-key]')].find(i=>i.dataset.translationKey===s.key);entries[s.key]={source:s.source,value:input.value};}
   await api('translations/'+locale,{version:data.version,sourceVersion:data.sourceVersion,entries});onSaved();await load();toast('Translation draft saved. Photo text is ready for the next scrapbook publication.');
  }catch(error){el.querySelector('#translation-error').textContent=error.message;button.disabled=false;}};
  publish.onclick=async()=>{publish.disabled=true;try{await api('translations/'+locale+'/publish',{version:data.version,sourceVersion:data.sourceVersion,reviewed:reviewed.checked});onSaved();await load();toast('Reviewed translation published.');}catch(error){el.querySelector('#translation-error').textContent=error.message;publish.disabled=false;}};
 }
 load().catch(error=>toast(error.message));
}
