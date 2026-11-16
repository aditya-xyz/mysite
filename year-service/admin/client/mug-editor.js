import {reorderButton,reorderHandle} from './reorder.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const MIN_MUG_PHOTOS=4,MAX_MUG_PHOTOS=12;
export function mugsMarkup(state,{reordering=false}={}){
  const designs=state.draft.mugDesigns||[];
  const src=d=>`/api/editions/${state.year}/media/${encodeURIComponent(d.id)}/cutout/${d.cutoutVersion}/display`;
  return `<section class="panel mug-summary"><div><h2>Pixel’s mugshot collection</h2><p class="hint">${designs.length} curated designs. Edit captions, reorder or remove mugshots. New photos and transparent artwork are prepared separately.</p></div><div class="actions mug-collection-actions">${!reordering?reorderButton('mugs',designs.length):''}<span class="badge active-badge">Mugshot studio</span></div></section><p class="notice">Save your changes as a draft, then publish to update the guest mug collection. Manage mug-order permissions in Invitations.</p>${designs.length<MIN_MUG_PHOTOS?'<p class="notice">Keep at least four mugshots to offer mugs. Publishing fewer than four hides the mug gift; saved orders stay intact.</p>':''}${removedMugsMarkup(state)}<section aria-label="Selected mug designs"><div class="mug-design-grid">${designs.map((d,index)=>`<article class="panel mug-design-card" data-mug-design="${esc(d.id)}" data-reorder-id="${esc(d.id)}"><img src="${src(d)}" alt="${esc(d.alt)}" loading="lazy"><div><p class="kicker">Mugshot ${index+1}</p>${reordering?`<p class="reorder-caption">${esc(d.caption||'Untitled mugshot')}</p>`:''}<label class="field"><span>Caption</span><textarea ${reordering?'disabled':''} data-mug-caption="${esc(d.id)}" maxlength="500" rows="3" placeholder="Pixel has thoughts…">${esc(d.caption)}</textarea></label>${reordering?reorderHandle(d.id,`mugshot ${index+1}: ${d.caption||'Untitled mugshot'}`):`<button type="button" class="quiet danger" data-busy data-remove-mug="${esc(d.id)}">Remove mugshot</button>`}</div></article>`).join('')||'<div class="empty">No mugshots in this draft. Saved artwork and existing orders are unchanged.</div>'}</div></section>`;
}
export function addMugPhoto(state,media){
  state.draft.mugDesigns??=[];
  if(state.draft.mugDesigns.some(d=>d.id===media.id))return false;
  if(state.draft.mugDesigns.length>=MAX_MUG_PHOTOS)throw new Error(`Choose up to ${MAX_MUG_PHOTOS} mug photos.`);
  const gallery=state.draft.photos.find(p=>p.id===media.id);
  state.draft.mugDesigns.push({id:media.id,caption:'',alt:gallery?.alt||'Pixel in a photograph selected for a mug'});return true;
}
export function removeMugPhoto(state,id){
 const designs=state.draft.mugDesigns||[],index=designs.findIndex(d=>d.id===id);if(index<0)return false;
 state.removedMugDesigns??=[];state.removedMugDesigns.push({design:structuredClone(designs[index]),index,nextId:designs[index+1]?.id,previousId:designs[index-1]?.id});
 state.draft.mugDesigns=designs.filter(d=>d.id!==id);return true;
}
export function restoreMugPhoto(state,id){
 const removed=state.removedMugDesigns||[],item=removed.find(d=>d.design.id===id);if(!item)return false;
 if(state.draft.mugDesigns.some(d=>d.id===id))return false;
 const next=state.draft.mugDesigns.findIndex(d=>d.id===item.nextId),previous=state.draft.mugDesigns.findIndex(d=>d.id===item.previousId);
 state.draft.mugDesigns.splice(next>=0?next:previous>=0?previous+1:Math.min(item.index,state.draft.mugDesigns.length),0,item.design);
 state.removedMugDesigns=removed.filter(d=>d!==item);return true;
}
function removedMugsMarkup(state){
 const removed=state.removedMugDesigns||[];if(!removed.length)return '';
 return `<div class="notice mug-removed-list"><p>Removed from this draft. Files and saved orders are kept. Undo is available until you save the draft.</p>${removed.map(({design})=>`<div><span>${esc(design.caption||'Mugshot')}</span><button type="button" class="quiet" data-busy data-restore-mug="${esc(design.id)}">Undo removal</button></div>`).join('')}</div>`;
}
export function bindMugEditor({root,state,mark,render}){
  root.querySelectorAll('[data-remove-mug]').forEach(button=>button.onclick=()=>{if(removeMugPhoto(state,button.dataset.removeMug)){mark();render();}});
  root.querySelectorAll('[data-restore-mug]').forEach(button=>button.onclick=()=>{if(restoreMugPhoto(state,button.dataset.restoreMug)){mark();render();}});
  root.querySelectorAll('[data-mug-caption]').forEach(input=>input.oninput=()=>{state.draft.mugDesigns.find(d=>d.id===input.dataset.mugCaption).caption=input.value;mark();});
}
