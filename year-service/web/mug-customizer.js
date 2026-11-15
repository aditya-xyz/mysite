import {mugStyles,mugFonts,preferredMugOptions,pixelMugOptions} from './mug-options.js';
import {mugPreview} from './mug-preview.js';
import {customSelectMarkup,bindCustomSelect} from './custom-select.js';
import {esc} from './pixelbook.js';

// A focused, nested task dialog. Only Done and Restore finish the task.
export function openMugCustomizer(design,current,finish,styles=mugStyles,preview=()=>{},previewMarkup=mugPreview,available=()=>true){
 const dialog=document.createElement('dialog');dialog.className='pb-gift-dialog pb-mug-customizer';dialog.setAttribute('aria-label','Customize your mug');
 let configuration={...current},selectBinding=null;
 function fields(){const style=styles.find(s=>s.id===configuration.style);return [{key:'style',label:'Mug style',values:styles},{key:'size',label:'Size',values:style.sizes},{key:'color',label:'Color',values:style.colors.filter(c=>!style.variants||style.variants.some(v=>v.size===configuration.size&&v.color===c))},{key:'font',label:'Caption font',values:mugFonts}];}
 function candidate(key,value){const next={...configuration,[key]:value},style=styles.find(s=>s.id===next.style);if(key==='style')return preferredMugOptions([style]);if(!style.sizes.includes(next.size))next.size=style.sizes[0];const colors=style.colors.filter(c=>!style.variants||style.variants.some(v=>v.size===next.size&&v.color===c));if(!colors.includes(next.color))next.color=colors[0];return next;}
 function focusControl(key){dialog.querySelector(`[data-select-control="${key}"]`)?.focus();}
 function render(focusKey){
  const openKey=selectBinding?.openKey;selectBinding?.destroy();
  dialog.innerHTML=`<div class="pb-customizer-body">${previewMarkup(design,configuration)}<div class="pb-mug-options">${fields().map(({key,label,values})=>{
   const optionLabel=v=>(v.label||v)+(key==='style'&&v.id===pixelMugOptions().style?' · Pixel recommended':'');
   return customSelectMarkup({key,label,value:configuration[key],open:openKey===key,options:values.map(v=>({value:v.id||v,selectedLabel:v.label||v,label:optionLabel(v)+(available(design,candidate(key,v.id||v))?'':' · preparing'),disabled:!available(design,candidate(key,v.id||v))}))});
  }).join('')}${styles.find(s=>s.id===configuration.style)?.careNote?`<p class="pb-mug-care">${esc(styles.find(s=>s.id===configuration.style).careNote)}</p>`:''}</div></div><div class="pb-dialog-bottom pb-customizer-actions"><button type="button" class="button pb-secondary-button" data-restore-style>Restore Pixel’s Style</button><button type="button" class="button" data-customizer-done>Done</button></div>`;
  selectBinding=bindCustomSelect(dialog,(key,value)=>{configuration=candidate(key,value);render(key);});
  dialog.querySelector('[data-customizer-done]').onclick=()=>complete(configuration);
  dialog.querySelector('[data-restore-style]').onclick=()=>complete(preferredMugOptions(styles));
  preview(dialog.querySelector('.pb-mug-preview'),design,configuration);
  if(focusKey)focusControl(focusKey);
 }
 function complete(value){selectBinding?.destroy();dialog.close();dialog.remove();finish({...value});}
 dialog.addEventListener('cancel',event=>event.preventDefault());
 document.body.append(dialog);render();dialog.showModal();dialog.querySelector('[data-select-control]').focus();
 return {refresh(nextStyles=styles){styles=nextStyles;const key=document.activeElement?.closest('[data-select-control],[data-select-option]')?.dataset;render(key?.selectControl||key?.selectOption);},destroy(){selectBinding?.destroy();dialog.close();dialog.remove();}};
}
