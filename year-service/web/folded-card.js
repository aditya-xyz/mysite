import {drawFoldedNote} from './print-design.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A2 portrait: artwork is contained without cropping; the inside opens to two pages.
export function foldedCardControlsMarkup({frontDesign='personal',canSwap=false,activeView='front'}={}){
 const swapLabel=frontDesign==='default'?'Put your keepsake on the front and Pixel’s pick inside':'Put Pixel’s pick on the front and your keepsake inside';
 return `<div class="fc-views" role="group" aria-label="Card view">${['Front','Inside','Back'].map(name=>`<button type="button" data-card-view="${name.toLowerCase()}" aria-pressed="${activeView===name.toLowerCase()}">${name}</button>`).join('')}${canSwap?`<button type="button" class="fc-swap" data-swap-card aria-label="${esc(swapLabel)}" title="${esc(swapLabel)}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg><span>Swap pictures</span></button>`:''}</div>`;
}
export function foldedCardMarkup({frontSrc,insideSrc,preview={},readableNote=true,pictures=null,frontDesign=insideSrc?'personal':'default',canSwap=false,activeView='front',includeSignoff=true}){
 const frontLabel=frontDesign==='default'?'Pixel’s pick':'your keepsake',insideLabel=frontDesign==='default'?'your keepsake':'Pixel’s pick';
 return `<section class="fc-preview" aria-label="Folded card preview">${foldedCardControlsMarkup({frontDesign,canSwap,activeView})}<div class="fc-surface" data-card-panel="front" ${activeView==='front'?'':'hidden'}><div class="fc-page fc-art ${pictures?'fc-vendor-art':''}"><img src="${esc(pictures?.frontSrc||frontSrc)}" alt="Front of your folded keepsake: ${esc(frontLabel)}" draggable="false"></div></div><div class="fc-surface fc-spread ${readableNote?'fc-readable':''} ${insideSrc?'':'fc-default-inside'}" data-card-panel="inside" ${activeView==='inside'?'':'hidden'}><div class="fc-page fc-art ${pictures?'fc-vendor-inside':''}">${pictures?`<img src="${esc(pictures.insideSrc)}" alt="${insideSrc?'Handwrytten proof of '+esc(insideLabel)+' inside left':'Handwrytten proof of the blank inside left'}" draggable="false">`:insideSrc?`<img src="${esc(insideSrc)}" alt="Inside left: ${esc(insideLabel)} in your chosen border" draggable="false">`:'<span class="fc-blank" aria-label="Blank inside left page"></span>'}</div><div class="fc-page fc-note">${readableNote?`<div class="fc-note-copy"><p>${esc(preview.note)}</p>${includeSignoff?`<p class="fc-note-signoff">With love, ${esc(preview.authors)}</p>`:''}</div>`:`<canvas data-no-signoff="${!includeSignoff}" data-folded-note="${esc(preview.note)}" data-authors="${esc(preview.authors)}" role="img" aria-label="Inside right note: ${esc(preview.note)}${includeSignoff?' With love, '+esc(preview.authors):''}"></canvas>`}</div></div><div class="fc-surface" data-card-panel="back" ${activeView==='back'?'':'hidden'}>${pictures?`<div class="fc-page fc-art fc-vendor-art"><img src="${esc(pictures.backSrc)}" alt="Handwrytten proof of the back signature" draggable="false"></div>`:`<div class="fc-page fc-back"><span>${esc(preview.backText)}</span></div>`}</div></section>`;
}
export function bindFoldedCard(container,{onSwap,onView}={}){
 for(const root of container.querySelectorAll('.fc-preview')){
  root.querySelectorAll('[data-folded-note]').forEach(canvas=>{
   const draw=()=>drawFoldedNote(canvas,{note:canvas.dataset.foldedNote,authors:canvas.dataset.authors,includeSignoff:canvas.dataset.noSignoff!=='true'});draw();
   document.fonts?.ready.then(()=>{if(canvas.isConnected)draw();});
  });
  if(onSwap)root.querySelector('[data-swap-card]')?.addEventListener('click',onSwap);
  root.querySelectorAll('[data-card-view]').forEach(button=>button.onclick=()=>{
   const view=button.dataset.cardView;
   root.querySelectorAll('[data-card-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   root.querySelectorAll('[data-card-panel]').forEach(p=>p.hidden=p.dataset.cardPanel!==view);
   onView?.(view);
  });
 }
}
