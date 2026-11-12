import {mugStyles,mugFonts,preferredMugOptions,pixelMugOptions} from './mug-options.js';
import {mugPreview} from './mug-preview.js';
import {esc} from './pixelbook.js';

// A focused, nested task dialog. Only Done and Restore finish the task.
export function openMugCustomizer(design,current,finish,styles=mugStyles,preview=()=>{},previewMarkup=mugPreview){
 const dialog=document.createElement('dialog');dialog.className='pb-gift-dialog pb-mug-customizer';dialog.setAttribute('aria-label','Customize your mug');
 let configuration={...current},openKey=null;
 const chevron='<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>';
 function fields(){const style=styles.find(s=>s.id===configuration.style);return [{key:'style',label:'Mug style',values:styles},{key:'size',label:'Size',values:style.sizes},{key:'color',label:'Color',values:style.colors.filter(c=>!style.variants||style.variants.some(v=>v.size===configuration.size&&v.color===c))},{key:'font',label:'Caption font',values:mugFonts}];}
 function focusControl(key){dialog.querySelector(`[data-mug-control="${key}"]`)?.focus();}
 function render(focusKey,optionIndex){
  dialog.innerHTML=`<div class="pb-customizer-body">${previewMarkup(design,configuration)}<div class="pb-mug-options">${fields().map(({key,label,values})=>{
   const selected=values.find(v=>(v.id||v)===configuration[key]);
   const optionLabel=v=>(v.label||v)+(key==='style'&&v.id===pixelMugOptions().style?' · Pixel recommended':'');
   return `<div class="pb-custom-select"><span id="mug-label-${key}">${label}</span><button type="button" class="pb-select-trigger" role="combobox" aria-labelledby="mug-label-${key} mug-value-${key}" aria-haspopup="listbox" aria-expanded="${openKey===key}" aria-controls="mug-list-${key}" data-mug-control="${key}"><span id="mug-value-${key}">${esc(selected.label||selected)}</span>${chevron}</button><div id="mug-list-${key}" class="pb-select-list" role="listbox" aria-labelledby="mug-label-${key}" ${openKey===key?'':'hidden'}>${values.map((v,i)=>`<button type="button" role="option" tabindex="-1" aria-selected="${(v.id||v)===configuration[key]}" data-option-key="${key}" data-option-index="${i}" data-option-value="${esc(v.id||v)}"><span>${esc(optionLabel(v))}</span><span aria-hidden="true">${(v.id||v)===configuration[key]?'✓':''}</span></button>`).join('')}</div></div>`;
  }).join('')}${styles.find(s=>s.id===configuration.style)?.careNote?`<p class="pb-mug-care">${esc(styles.find(s=>s.id===configuration.style).careNote)}</p>`:''}</div></div><div class="pb-dialog-bottom pb-customizer-actions"><button type="button" class="button pb-secondary-button" data-restore-style>Restore Pixel’s Style</button><button type="button" class="button" data-customizer-done>Done</button></div>`;
  dialog.querySelectorAll('[data-mug-control]').forEach(button=>{
   const key=button.dataset.mugControl;
   button.onclick=()=>{openKey=openKey===key?null:key;render(key);};
   button.onkeydown=event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();openKey=key;const values=fields().find(f=>f.key===key).values;const selected=values.findIndex(v=>(v.id||v)===configuration[key]);render(key,event.key==='Home'?0:event.key==='End'?values.length-1:selected);}};
  });
  dialog.querySelectorAll('[data-option-key]').forEach(button=>{
   const key=button.dataset.optionKey;
   button.onclick=()=>{configuration[key]=button.dataset.optionValue;const style=styles.find(s=>s.id===configuration.style);if(!style.sizes.includes(configuration.size))configuration.size=style.sizes[0];const colors=style.colors.filter(c=>!style.variants||style.variants.some(v=>v.size===configuration.size&&v.color===c));if(!colors.includes(configuration.color))configuration.color=colors[0];openKey=null;render(key);};
   button.onkeydown=event=>{const options=[...dialog.querySelectorAll(`[data-option-key="${key}"]`)];const index=options.indexOf(button);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();options[event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();openKey=null;render(key);}else if(event.key==='Tab'){openKey=null;render(key);}};
  });
  dialog.querySelector('[data-customizer-done]').onclick=()=>complete(configuration);
  dialog.querySelector('[data-restore-style]').onclick=()=>complete(preferredMugOptions(styles));
  preview(dialog.querySelector('.pb-mug-preview'),design,configuration);
  if(focusKey){if(optionIndex!==undefined)dialog.querySelector(`[data-option-key="${focusKey}"][data-option-index="${optionIndex}"]`)?.focus();else focusControl(focusKey);}
 }
 function complete(value){dialog.close();dialog.remove();finish({...value});}
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(openKey){const key=openKey;openKey=null;render(key);}});
 dialog.addEventListener('click',event=>{if(openKey&&!event.target.closest('.pb-custom-select')){const key=openKey;openKey=null;render(key);}});
 document.body.append(dialog);render();dialog.showModal();dialog.querySelector('[data-mug-control]').focus();
 return {destroy(){dialog.close();dialog.remove();}};
}
