import {drawFoldedNote} from './print-design.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A2 portrait: artwork is contained without cropping; the inside opens to two pages.
export function foldedCardMarkup({frontSrc,insideSrc,preview={},readableNote=true,pictures=null}){
 return `<section class="fc-preview" aria-label="Folded card preview"><div class="fc-views" role="group" aria-label="Card view">${['Front','Inside','Back'].map((name,i)=>`<button type="button" data-card-view="${name.toLowerCase()}" aria-pressed="${i===0}">${name}</button>`).join('')}</div><div class="fc-surface" data-card-panel="front"><div class="fc-page fc-art ${pictures?'fc-vendor-art':''}"><img src="${esc(pictures?.frontSrc||frontSrc)}" alt="Front of your folded keepsake" draggable="false"></div></div><div class="fc-surface fc-spread ${readableNote?'fc-readable':''} ${insideSrc?'':'fc-default-inside'}" data-card-panel="inside" hidden><div class="fc-page fc-art ${pictures?'fc-vendor-inside':''}">${pictures?`<img src="${esc(pictures.insideSrc)}" alt="${insideSrc?'Handwrytten proof of Pixel’s pick inside left':'Handwrytten proof of the blank inside left'}" draggable="false">`:insideSrc?`<img src="${esc(insideSrc)}" alt="Inside left: Pixel’s pick in your chosen border" draggable="false">`:'<span class="fc-blank" aria-label="Blank inside left page"></span>'}</div><div class="fc-page fc-note">${readableNote?`<div class="fc-note-copy"><p>${esc(preview.note)}</p><p class="fc-note-signoff">With love, ${esc(preview.authors)}</p></div>`:`<canvas data-folded-note="${esc(preview.note)}" data-authors="${esc(preview.authors)}" role="img" aria-label="Inside right note: ${esc(preview.note)} With love, ${esc(preview.authors)}"></canvas>`}</div></div><div class="fc-surface" data-card-panel="back" hidden>${pictures?`<div class="fc-page fc-art fc-vendor-art"><img src="${esc(pictures.backSrc)}" alt="Handwrytten proof of the back signature" draggable="false"></div>`:`<div class="fc-page fc-back"><span>${esc(preview.backText)}</span></div>`}</div></section>`;
}
export function bindFoldedCard(container){
 for(const root of container.querySelectorAll('.fc-preview')){
  root.querySelectorAll('[data-folded-note]').forEach(canvas=>{
   const draw=()=>drawFoldedNote(canvas,{note:canvas.dataset.foldedNote,authors:canvas.dataset.authors});draw();
   document.fonts?.ready.then(()=>{if(canvas.isConnected)draw();});
  });
  root.querySelectorAll('[data-card-view]').forEach(button=>button.onclick=()=>{
   const view=button.dataset.cardView;
   root.querySelectorAll('[data-card-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   root.querySelectorAll('[data-card-panel]').forEach(p=>p.hidden=p.dataset.cardPanel!==view);
  });
 }
}
