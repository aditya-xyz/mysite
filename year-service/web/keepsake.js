import {foldedCardMarkup,bindFoldedCard} from './folded-card.js';
import {bindKeepsakeEditor} from './keepsake-editor.js';
import {drawKeepsakeFrame} from './keepsake-frame.js';
import {assembleKeepsake} from './scrapbook-motion.js';
import {createPrintFlow} from './print-flow.js';
import {CARD_WIDTH,CARD_HEIGHT,cardSlots,coverCrop,personalPhotos} from './keepsake-layout.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12"/></svg>';
const cross='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
function drawPhoto(ctx,image,slot,crop){const s=coverCrop(image.width,image.height,slot.width,slot.height,crop);ctx.drawImage(image,s.x,s.y,s.width,s.height,slot.x,slot.y,slot.width,slot.height);}
function fittedText(ctx,text,x,y,maxWidth,size,font){
  do{ctx.font=font.replace('$',size--);}while(ctx.measureText(text).width>maxWidth&&size>12);
  ctx.fillText(text,x,y);
}
export function mountKeepsake(journal,section){
  const photos=personalPhotos(journal.photos);
  if(!section||!journal.keepsake?.enabled)return {destroy(){}};
  let frame='santa',ordered=journal.keepsake.order||null;
  const fixed=journal.keepsake.mode==='default',defaultSrc=()=>fixed&&ordered?ordered.artworkSrc:journal.keepsake.defaultSrc+frame;
  const entry=document.createElement('div');entry.className='pb-keepsake-content';section.classList.add('ks-entry');
  entry.innerHTML=`<figure class="pb-keepsake-art pb-present-art"><img src="${esc(defaultSrc())}" width="1200" height="1500" loading="lazy" decoding="async" alt="A keepsake from our little pack to yours"></figure><div class="pb-present-copy"><h3 id="pb-keepsake-title">for your fridge.</h3><p>${fixed?'a little piece of our year, from our pack to yours.<br>pick a border. i handled the rest.':'three favorite photos, made for your fridge.<br>our pack’s pick inside. a little note, too.'}</p><button class="button" type="button">make a keepsake</button><p class="pb-gift-allowance">${fixed?'one complimentary keepsake':'one complimentary folded keepsake'} for ${esc(journal.name)}</p></div>`;
  section.append(entry);
  const launch=entry.querySelector('button'),modal=document.createElement('dialog');
  modal.id='keepsake';modal.setAttribute('aria-labelledby','ks-title');document.body.append(modal);
  let assembleNext=false,chosen=[],crops=new Map(),step='pick',file=null,busy=false,revision=0,abort=null,returnFocus,shareFallback=false;
  const images=new Map(),urls=new Set();let cardImages=[],editorCleanup=null,previewFrame=0,orderToast=null,toastTimer=null;
  const printFlow=createPrintFlow({getData:()=>({file,defaultSrc:defaultSrc(),cardCount:1,personalized:!fixed,recipe:{format:'folded',mode:fixed?'default':'personal',defaultRevision:journal.keepsake.defaultRevision,photoIds:fixed?[]:[...chosen],crops:fixed?{}:Object.fromEntries(chosen.map(id=>[id,crops.get(id)])),frame}}),onChange:status=>{if(fixed&&status?.order&&!status.order.personalized)setOrdered(status.order);if(modal.open&&step==='edit')updateExport();},onOrdered:(message,simulated,order)=>{if(fixed)setOrdered(order);if(modal.open){showOrderToast(message,simulated);modal.querySelector(fixed?'[data-close]':'[data-share],[data-save]')?.focus();}}});
  function updateEntry(){
    if(!fixed||!ordered)return;
    entry.querySelector('img').src=ordered.artworkSrc;
    entry.querySelector('.pb-present-copy>p').textContent='Your keepsake order is saved. Here’s the one you chose.';
    launch.textContent='View your keepsake';
    entry.querySelector('.pb-gift-allowance').textContent=`Keepsake ordered for ${journal.name}`;
  }
  function setOrdered(order){
    if(!fixed||!order?.artworkSrc)return;
    const changed=ordered?.id!==order.id;ordered=order;updateEntry();
    if(changed&&modal.open){step='edit';render();}
  }
  updateEntry();
  const currentPhotos=()=>chosen.map(id=>photos.find(p=>p.id===id));
  const setStatus=text=>{const status=modal.querySelector('.ks-status');if(status)status.textContent=text;};
  function clearOrderToast(){clearTimeout(toastTimer);toastTimer=null;orderToast?.remove();orderToast=null;}
  function showOrderToast(message,simulated){
    clearOrderToast();orderToast=document.createElement('div');orderToast.className='ks-order-toast';orderToast.setAttribute('role','status');orderToast.setAttribute('aria-live','polite');
    const text=document.createElement('p');text.textContent=message;orderToast.append(text);
    if(simulated){const note=document.createElement('small');note.textContent='Local preview only · Nothing mailed';orderToast.append(note);}
    modal.append(orderToast);toastTimer=setTimeout(clearOrderToast,8000);
  }
  function cleanup(){
    editorCleanup?.();editorCleanup=null;cancelAnimationFrame(previewFrame);previewFrame=0;cardImages=[];
    clearOrderToast();printFlow.close();revision++;abort?.abort();abort=null;images.forEach(p=>p.then(image=>image.close?.()).catch(()=>{}));images.clear();file=null;
    urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();modal.querySelectorAll('canvas').forEach(canvas=>{canvas.width=0;canvas.height=0;});busy=false;returnFocus?.focus({preventScroll:true});
  }
  function close(){modal.close();}
  modal.addEventListener('close',cleanup);
  modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  async function loadImage(src){
    if(images.has(src))return images.get(src);
    const signal=abort.signal;
    const promise=(async()=>{
      const response=await fetch(src,{signal});
      if(!response.ok)throw new Error(response.status===401?'Your session has ended. Reopen your invitation to continue.':'A photo couldn’t load. Go back and try again.');
      const blob=await response.blob();
      if('createImageBitmap' in window)return createImageBitmap(blob);
      const url=URL.createObjectURL(blob);urls.add(url);
      try{const image=new Image();image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);urls.delete(url);}
    })();
    images.set(src,promise);promise.catch(()=>{if(images.get(src)===promise)images.delete(src);});return promise;
  }
  function actions(){
    if(fixed&&ordered)return '';
    if(step==='pick')return `<span class="ks-count" role="status">${chosen.length} of 3 selected</span><button class="ks-primary" data-continue ${chosen.length===3?'':'disabled'}>Continue ${arrow}</button>`;
    return frameMarkup()+`<div class="ks-export-actions">${exportActions()}</div>`;
  }
  function exportActions(){
    if(fixed)return ordered?'':printFlow.buttonMarkup();
    const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<=600;
    const useShare=mobile&&!shareFallback;
    const icon=useShare?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg>';
    return printFlow.buttonMarkup()+`<button class="ks-primary ks-digital" ${useShare?'data-share':'data-save'} ${file?'':'disabled'}>${icon}<span>${busy?'Preparing…':useShare?'Share':mobile?'Save file instead':'Save image'}</span></button>`;

  }
  function pickMarkup(){return `<p class="ks-description">Choose three from the photos picked for you.</p><div class="ks-picks">${photos.map(p=>{const n=chosen.indexOf(p.id);return `<button class="ks-pick" data-pick="${esc(p.id)}" aria-label="${esc(p.caption||p.alt)}" aria-pressed="${n>=0}"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async"><span class="ks-badge" ${n<0?'hidden':''}>${n+1}</span></button>`;}).join('')}</div>`;}
  function frameMarkup(){return `<div class="ks-paper-tabs" role="group" aria-label="Frame style">${[['moss','Moss'],['classic','Classic'],['santa','Candy cane']].map(([value,label])=>`<button class="ks-frame" data-frame="${value}" aria-pressed="${frame===value}"><span class="ks-swatch ${value}" aria-hidden="true"></span><span>${label}</span></button>`).join('')}</div>`;}
  function editorMarkup(){if(fixed&&ordered?.format==='folded')return `<div class="ks-default-editor"><p class="ks-description">Ordered on: ${esc(new Date(ordered.created_at*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}))}</p>${foldedCardMarkup({frontSrc:ordered.artworkSrc,insideSrc:null,preview:ordered.preview,pictures:ordered.pictures,frontDesign:ordered.frontDesign})}</div>`;if(fixed)return `<div class="ks-default-editor"><p class="ks-description">${ordered?'Ordered on: '+esc(new Date(ordered.created_at*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})):'Pixel picked these for you. Choose your border.'}</p><div class="ks-preview-wrap"><img class="ks-default-image" data-default-image src="${esc(defaultSrc())}" alt="Pixel’s fixed keepsake: family photo above, dogs on the lower left and family on the lower right"></div></div>`;return `<div class="ks-editor-stage"><div class="ks-preview-wrap"><canvas class="ks-preview" width="1200" height="1500" role="img" aria-label="Your four-by-five keepsake: three selected photos, a few of our favorite humans, and Pixel in a Santa hat"></canvas><div class="ks-tap-slots">${cardSlots.map((s,i)=>`<button data-crop="${i}" data-photo-id="${esc(chosen[i])}" aria-pressed="false" aria-label="Photo ${i+1}: drag vertically to reframe, drag onto another photo to swap" aria-describedby="ks-direct-help"></button>`).join('')}</div></div><p id="ks-direct-help" class="ks-crop-hint">Drag up or down to reframe. Drop onto another photo to swap.<br><span>Keyboard: Space to swap, arrows to choose, Space to confirm.</span></p><span class="ks-editor-announcement" role="status" aria-live="polite"></span></div>`;}
  function render(){
    editorCleanup?.();editorCleanup=null;cancelAnimationFrame(previewFrame);previewFrame=0;cardImages=[];
    revision++;file=null;busy=step==='edit';printFlow.prepare();
    modal.innerHTML=`<div class="ks-shell"><div class="ks-top"><button class="ks-icon" data-back aria-label="${step==='pick'?'Close keepsake':'Back'}">${arrow}</button><h2 id="ks-title" tabindex="-1">${step==='pick'?'Make a little keepsake':'Your keepsake'}</h2><button class="ks-icon" data-close aria-label="Close keepsake">${cross}</button></div><div class="ks-body ${step==='pick'?'ks-select-body':'ks-edit-body'}">${step==='pick'?pickMarkup():editorMarkup()}<p class="ks-status" role="status" aria-live="polite"></p></div>${fixed&&ordered?'':`<div class="ks-bottom">${actions()}</div>`}</div>`;
    modal.querySelector('[data-close]').onclick=close;
    modal.querySelector('[data-back]').onclick=()=>{if(step==='pick'||fixed)close();else{step='pick';render();modal.querySelector('h2').focus();}};
    modal.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.pick,index=chosen.indexOf(id);
      if(index>=0)chosen.splice(index,1);else if(chosen.length<3){chosen.push(id);if(!crops.has(id))crops.set(id,{x:.5,y:.5,zoom:1});}else{setStatus('Three’s the sweet spot. Deselect one to choose another.');return;}
      modal.querySelectorAll('[data-pick]').forEach(b=>{const n=chosen.indexOf(b.dataset.pick);b.setAttribute('aria-pressed',String(n>=0));b.querySelector('span').hidden=n<0;b.querySelector('span').textContent=n+1;});
      button.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      modal.querySelector('.ks-count').textContent=`${chosen.length} of 3 selected`;modal.querySelector('[data-continue]').disabled=chosen.length!==3;setStatus('');
    });
    const next=modal.querySelector('[data-continue]');if(next)next.onclick=()=>{if(chosen.length===3){assembleNext=true;step='edit';render();}};
    modal.querySelectorAll('[data-frame]').forEach(b=>b.onclick=()=>{frame=b.dataset.frame;modal.querySelectorAll('[data-frame]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.frame===frame)));paintCard();});
    const save=modal.querySelector('[data-save]');if(save)save.onclick=download;
    const share=modal.querySelector('[data-share]');if(share)share.onclick=shareCard;
    printFlow.bind(modal);bindFoldedCard(modal);
    if(step==='edit'){
      if(!fixed)editorCleanup=bindKeepsakeEditor({wrap:modal.querySelector('.ks-preview-wrap'),slots:cardSlots,
        getImage:index=>cardImages[index],getCrop:index=>crops.get(chosen[index]),setCrop:(index,crop)=>crops.set(chosen[index],crop),
        canStart:()=>!!file&&!busy&&modal.open&&step==='edit',
        onStart:()=>{file=null;busy=true;updateExport();modal.querySelector('.ks-assembly')?.remove();},
        onPreview:()=>{if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;const canvas=modal.querySelector('.ks-preview');if(canvas&&cardImages.length)drawCard(canvas,cardImages);});},
        onCrop:()=>paintCard(true),onSwap:(first,second)=>{
          [chosen[first],chosen[second]]=[chosen[second],chosen[first]];
          [cardImages[first],cardImages[second]]=[cardImages[second],cardImages[first]];
          drawCard(modal.querySelector('.ks-preview'),cardImages);
          modal.querySelectorAll('[data-crop]').forEach((button,i)=>button.dataset.photoId=chosen[i]);
          modal.querySelectorAll('[data-crop]')[second]?.focus({preventScroll:true});paintCard(true);
        },onStatus:text=>{const announcement=modal.querySelector('.ks-editor-announcement');if(announcement)announcement.textContent=text;}});
      paintCard();
    }
    if(modal.open)modal.querySelector('h2').focus();
  }
  function updateExport(){printFlow.prepare();const bottom=modal.querySelector('.ks-export-actions');if(bottom&&step==='edit'){bottom.innerHTML=exportActions();bottom.querySelector('[data-save]')?.addEventListener('click',download);bottom.querySelector('[data-share]')?.addEventListener('click',shareCard);printFlow.bind(bottom);}}
  function drawCard(canvas,loaded){
    const ctx=canvas.getContext('2d');canvas.dataset.paper=drawKeepsakeFrame(ctx,frame);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    currentPhotos().forEach((p,i)=>drawPhoto(ctx,loaded[i],cardSlots[i],crops.get(p.id)));
    ctx.fillStyle=frame==='moss'?'#20392f':frame==='santa'?'#793b32':'#272727';ctx.textAlign='center';
    fittedText(ctx,'a few of our favorite humans',530,1300,890,64,'700 $px Asap, sans-serif');
    fittedText(ctx,`${(journal.authors||'Aditya & Angela').toLowerCase()} · ${journal.year||''}`,530,1363,890,30,'$px Asap, sans-serif');
    ctx.font='24px Georgia, serif';ctx.fillText('♥',530,1420);
    const pixel=loaded[3],height=176,width=height*pixel.width/pixel.height;
    ctx.drawImage(pixel,1090-width/2,1248,width,height);
  }
  async function paintCard(keepPreview=false){
    const assemble=assembleNext;assembleNext=false;
    const stamp=++revision;file=null;busy=true;updateExport();setStatus('');
    modal.querySelectorAll('[data-default-image]').forEach(image=>image.src=defaultSrc());
    if(fixed&&ordered){busy=false;updateExport();return;}
    if(fixed){
      try{const response=await fetch(defaultSrc(),{signal:abort.signal});if(!response.ok)throw new Error('Your keepsake could not load. Please try again.');const blob=await response.blob();if(stamp!==revision||!modal.open)return;file=new File([blob],`pixel-picked-${journal.year}.jpg`,{type:'image/jpeg'});busy=false;updateExport();}
      catch(error){if(error.name==='AbortError'||stamp!==revision)return;busy=false;setStatus(error.message);updateExport();}
      return;
    }
    const canvas=modal.querySelector('.ks-preview');if(!canvas)return;
    canvas.parentElement.querySelector('.ks-assembly')?.remove();
    if(!keepPreview)drawKeepsakeFrame(canvas.getContext('2d'),frame);
    try{
      const selected=currentPhotos(),wanted=new Set([...selected.map(p=>p.viewerSrc||p.src),'/pixel-santa.png']);
      images.forEach((promise,src)=>{if(!wanted.has(src)){images.delete(src);promise.then(image=>image.close?.()).catch(()=>{});}});
      const loaded=await Promise.all([...selected.map(p=>loadImage(p.viewerSrc||p.src)),loadImage('/pixel-santa.png')]);
      if(stamp!==revision||!modal.open)return;
      // Typography is optional: a missing or slow font must not block the photos/export.
      let fontTimer;
      try{await Promise.race([Promise.allSettled([document.fonts.load('700 64px Asap'),document.fonts.load('400 30px Asap')]),new Promise(resolve=>{fontTimer=setTimeout(resolve,1500);})]);}
      finally{clearTimeout(fontTimer);}
      if(stamp!==revision||!modal.open)return;
      cardImages=loaded;
      drawCard(canvas,loaded);
      if(assemble)assembleKeepsake(canvas,cardSlots);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
      if(stamp!==revision||!modal.open)return;
      if(!blob)throw new Error('Your card couldn’t be prepared. Please try again.');
      file=new File([blob],`a-little-keepsake-${journal.year||'our-year'}.jpg`,{type:'image/jpeg'});busy=false;updateExport();
    }catch(error){if(stamp!==revision||error.name==='AbortError')return;busy=false;updateExport();setStatus(error.message);const retry=document.createElement('button');retry.className='ks-text';retry.textContent='Try again';retry.onclick=paintCard;modal.querySelector('.ks-status').append(' ',retry);}
  }
  function exportFile(){
    const texture=frame==='santa'?'candy-cane':frame,timestamp=new Date().toISOString().replace(/[:.]/g,'-');
    return new File([file],`pixelbook-${journal.year||'our-year'}-${texture}-${timestamp}.jpg`,{type:'image/jpeg'});
  }
  function download(){if(fixed||!file)return;const exported=exportFile(),url=URL.createObjectURL(exported);urls.add(url);const a=document.createElement('a');a.href=url;a.download=exported.name;document.body.append(a);a.click();a.remove();setStatus('Your keepsake is ready. Your browser chooses where it saves.');setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000);}
  async function shareCard(){if(fixed||!file)return;const exported=exportFile();try{if(navigator.canShare?.({files:[exported]}))await navigator.share({files:[exported],title:'A little keepsake'});else{shareFallback=true;updateExport();setStatus('File sharing isn’t supported in this browser. You can save the image as a file instead.');}}catch(error){if(error.name!=='AbortError'){shareFallback=true;updateExport();setStatus('Sharing couldn’t open. You can save the image as a file instead.');}}}
  launch.onclick=()=>{returnFocus=document.activeElement;abort=new AbortController();shareFallback=false;step=fixed?'edit':'pick';render();modal.showModal();modal.querySelector('#ks-title').focus({preventScroll:true});if(!fixed||!ordered)printFlow.refresh();};
  return {destroy(){if(modal.open)modal.close();else cleanup();modal.remove();entry.remove();}};
}
