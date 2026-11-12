import {reorderButton,reorderHandle} from './reorder.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const MIN_MUG_PHOTOS=4,MAX_MUG_PHOTOS=12;
export function mugsMarkup(state,{reordering=false}={}){
  const designs=state.draft.mugDesigns||[];
  const src=d=>`/api/editions/${state.year}/media/${encodeURIComponent(d.id)}/cutout/${d.cutoutVersion}`;
  return `<section class="panel mug-summary"><div><h2>Pixel’s mugshot collection</h2><p class="hint">${designs.length} curated designs. The photos and transparent artwork are fixed; the captions and order are yours to edit.</p></div><div class="actions mug-collection-actions">${!reordering?reorderButton('mugs',designs.length):''}<span class="badge active-badge">Mugshot studio</span></div></section><p class="notice">Save your captions and order as a draft, then publish to update the guest mug collection. Manage mug-order permissions in Invitations.</p><section aria-label="Selected mug designs"><div class="mug-design-grid">${designs.map((d,index)=>`<article class="panel mug-design-card" data-mug-design="${esc(d.id)}" data-reorder-id="${esc(d.id)}"><img src="${src(d)}" alt="${esc(d.alt)}" loading="lazy"><div><p class="kicker">Mugshot ${index+1}</p>${reordering?`<p class="reorder-caption">${esc(d.caption||'Untitled mugshot')}</p>`:''}<label class="field"><span>Caption</span><textarea ${reordering?'disabled':''} data-mug-caption="${esc(d.id)}" maxlength="500" rows="3" placeholder="Pixel has thoughts…">${esc(d.caption)}</textarea></label>${reordering?reorderHandle(d.id,`mugshot ${index+1}: ${d.caption||'Untitled mugshot'}`):''}</div></article>`).join('')||'<div class="empty">The curated collection is not configured for this scrapbook yet.</div>'}</div></section>`;
}
export function addMugPhoto(state,media){
  state.draft.mugDesigns??=[];
  if(state.draft.mugDesigns.some(d=>d.id===media.id))return false;
  if(state.draft.mugDesigns.length>=MAX_MUG_PHOTOS)throw new Error(`Choose up to ${MAX_MUG_PHOTOS} mug photos.`);
  const gallery=state.draft.photos.find(p=>p.id===media.id);
  state.draft.mugDesigns.push({id:media.id,caption:'',alt:gallery?.alt||'Pixel in a photograph selected for a mug'});return true;
}
export function bindMugEditor({root,state,mark}){
  root.querySelectorAll('[data-mug-caption]').forEach(input=>input.oninput=()=>{state.draft.mugDesigns.find(d=>d.id===input.dataset.mugCaption).caption=input.value;mark();});
}
