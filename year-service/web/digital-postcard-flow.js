import {readBlob,readResource} from './read-resource.js';
import {digitalCardFile} from './digital-card.js';
import {translateText} from './localization.js';
import {digitalDictionary} from './digital-copy.js';
export function createDigitalFlow({journal,getData,loadImage,onChange,onSaved}){
 let state=null,closed=false,dialog=null,controller=null,working=false,preparedRecipe=null,cancelConfirmation=null,cachedFile=null,cachedKey=null,preparing=null;
 async function refresh(){controller?.abort();const current=controller=new AbortController();try{const data=await readResource('/api/print/digital',{signal:current.signal});if(!closed&&controller===current){state=data;onChange(state);}}catch{if(!closed&&controller===current&&!current.signal.aborted){state=null;onChange(state);}}}
 const copy=value=>translateText(value,{...digitalDictionary(journal.language),...journal.uiTranslations});
 const recipeKey=()=>{const d=getData();return JSON.stringify([d.frame,d.photoIds,d.cropMap,state?.note,state?.artworkSrc,state?.defaultRevision,state?.contentVersion,state?.personalized]);};
 async function prewarm(){if(!canUse())return;const key=recipeKey();if(cachedFile&&cachedKey===key)return cachedFile;if(preparing){await preparing;return prewarm();}const d=getData();if(state.personalized&&d.images.length!==3)return;preparing=prepare().then(file=>{if(!closed&&recipeKey()===key){cachedFile=file;cachedKey=key;}return file;}).finally(()=>preparing=null);await preparing;return cachedKey===recipeKey()?cachedFile:prewarm();}
 const canUse=()=>!!(state?.eligible||state?.claimed)&&!closed;
 async function prepare(){if(!canUse())throw new Error('Your digital postcard is not available. Reopen it and try again.');
  const d=getData();preparedRecipe={frame:d.frame,photoIds:[...d.photoIds],crops:structuredClone(d.cropMap)};if(state.claimed&&!state.personalized){const blob=await readBlob(state.artworkSrc,{signal:controller?.signal});return new File([blob],`pixelbook-${journal.year}-digital.jpg`,{type:'image/jpeg'});}
  const defaultImage=await loadImage(state.defaultFrames?.[d.frame]||state.defaultSrc+d.frame),background=await loadImage(d.background);
  return digitalCardFile({personalized:state.personalized,images:d.images,crops:d.crops,defaultImage,background,note:state.note,authors:state.authors,year:journal.year});
 }
 function confirm(file,recipe,share){return new Promise(resolve=>{const url=URL.createObjectURL(file),d=document.createElement('dialog');dialog=d;d.className='ks-digital-confirm';d.setAttribute('aria-labelledby','digital-title');
  d.innerHTML=`<div class="ks-top"><h2 id="digital-title" tabindex="-1">joining the paperless fan club? 🌿</h2><button class="ks-icon" data-cancel aria-label="Close digital postcard confirmation">×</button></div><div class="ks-digital-confirm-body"><img src="${url}" alt="Your complete digital postcard"><p>all the Pixel, none of the postage. save your postcard and we’ll skip mailing one to your household.</p><p class="ks-status" role="status"></p></div><div class="ks-bottom"><button class="ks-secondary" data-cancel>Not yet</button><button class="ks-primary" data-confirm ${journal.adminPreview?'disabled':''}>paperless fans, that’s us</button></div>`;
  let finished=false,committing=false;const finish=result=>{if(finished)return;finished=true;cancelConfirmation=null;URL.revokeObjectURL(url);d.close();d.remove();dialog=null;resolve(result);};
  cancelConfirmation=()=>finish(null);d.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>finish(null));d.addEventListener('cancel',e=>{e.preventDefault();if(!committing)finish(null);});
  d.querySelector('[data-confirm]').onclick=async()=>{committing=true;const button=d.querySelector('[data-confirm]');button.disabled=true;d.querySelectorAll('[data-cancel]').forEach(b=>b.disabled=true);d.querySelector('.ks-status').textContent='Saving your digital-only choice…';
   try{const form=new FormData();form.set('artwork',file);form.set('recipe',JSON.stringify({confirmed:true,contentVersion:state.contentVersion,defaultRevision:state.defaultRevision,frame:recipe.frame,photoIds:recipe.photoIds,crops:recipe.crops}));const saving=fetch('/api/print/digital',{method:'POST',body:form,signal:controller?.signal});
    // Start native sharing in this confirmation tap; waiting for storage loses activation on iOS.
    let sharing=Promise.resolve('unavailable');if(share&&navigator.canShare?.({files:[file]})){try{sharing=Promise.resolve(navigator.share({files:[file],title:copy('Your postcard')})).then(()=>'shared',error=>error.name==='AbortError'?'canceled':'failed');}catch{sharing=Promise.resolve('failed');}}
    const r=await saving,result=await r.json();if(closed)return;if(!r.ok)throw new Error(result.error||'Your choice could not be saved. Please try again.');state=result;if(!result.reused){cachedFile=file;cachedKey=recipeKey();}onChange(state);onSaved(state);const shareResult=await sharing;finish({...result,shareResult});}
   catch(error){committing=false;d.querySelector('.ks-status').textContent=error instanceof TypeError?'Your choice could not be saved. Please try again.':error.message;button.disabled=false;d.querySelectorAll('[data-cancel]').forEach(b=>b.disabled=false);}
  };
  document.body.append(d);d.showModal();d.querySelector('h2').focus();
 });}
 async function requestCopy(share=false){
  if(!canUse()||working)return;working=true;
  try{
   // Native mobile sharing must run directly in the tap, before any asynchronous work.
   if(share&&state.claimed&&cachedFile&&cachedKey===recipeKey()){
    if(!navigator.canShare?.({files:[cachedFile]})){onSaved(null,'Image sharing isn’t available in this browser.');return;}
    try{await navigator.share({files:[cachedFile],title:copy('Your postcard')});}
    catch(error){if(error.name!=='AbortError')onSaved(null,'Sharing couldn’t open. Tap Share to try again.');}
    return;
   }
   const file=await prewarm();if(!file||closed)return;
   if(!state.claimed){
    const confirmed=await confirm(file,preparedRecipe,share);if(!confirmed)return;
    if(share){if(confirmed.shareResult==='failed')onSaved(state,'Sharing couldn’t open. Tap Share to try again.');else if(confirmed.shareResult==='unavailable')onSaved(state,'Image sharing isn’t available in this browser.');return;}
    if(!state.personalized){cachedFile=await prepare();cachedKey=recipeKey();}
    else{cachedFile=file;cachedKey=recipeKey();}
   }
   if(share){onSaved(state,'Your postcard is ready. Tap Share, then Save Image to add it to Photos.');return;}
   save(cachedFile);
  }catch(error){if(!closed)onSaved(null,error instanceof TypeError?'Your digital postcard could not be prepared. Please try again.':error.message);}finally{working=false;}
 }

 function save(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);onSaved(state,'Your postcard is ready. You can save or share it again until the gift deadline.');}
 return {prepare:prewarm,prewarm:()=>prewarm().catch(()=>{}),refresh:()=>{closed=false;return refresh();},canUse,claimed:()=>!!state?.claimed,state:()=>state,requestCopy,close(){closed=true;controller?.abort();cancelConfirmation?.();cachedFile=null;cachedKey=null;}};
}
