import {CARD_WIDTH,CARD_HEIGHT,cardSlots,coverCrop,anchoredCrop,personalPhotos} from './keepsake-layout.js';
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
  if(!section||photos.length<3)return {destroy(){}};
  const entry=document.createElement('div');entry.className='ks-entry';
  entry.innerHTML='<div><p class="kicker">A little something to keep</p><h2>Good company. In a frame.</h2><p>Pick three of your photos and make a little keepsake. Pixel insists on joining.</p></div><button class="button" type="button">Make a keepsake <span aria-hidden="true">↗</span></button>';
  section.prepend(entry);
  const launch=entry.querySelector('button'),modal=document.createElement('dialog');
  modal.id='keepsake';modal.setAttribute('aria-labelledby','ks-title');document.body.append(modal);
  let chosen=[],crops=new Map(),frame='moss',step='pick',editing=0,file=null,busy=false,revision=0,abort=null,returnFocus;
  const images=new Map(),urls=new Set();let cropImage=null;
  const currentPhotos=()=>chosen.map(id=>photos.find(p=>p.id===id));
  const setStatus=text=>{const status=modal.querySelector('.ks-status');if(status)status.textContent=text;};
  function cleanup(){
    revision++;abort?.abort();abort=null;images.forEach(p=>p.then(image=>image.close?.()).catch(()=>{}));images.clear();file=null;
    urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();modal.querySelectorAll('canvas').forEach(canvas=>{canvas.width=0;canvas.height=0;});cropImage=null;busy=false;returnFocus?.focus({preventScroll:true});
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
    if(step==='pick')return `<span class="ks-count" role="status">${chosen.length} of 3 selected</span><button class="ks-primary" data-continue ${chosen.length===3?'':'disabled'}>Continue ${arrow}</button>`;
    if(step==='crop')return '<span class="ks-count">Make room for the good bits.</span><button class="ks-primary" data-done>Done</button>';
    return `<button class="ks-primary" data-save ${file?'':'disabled'}>${busy?'Preparing your card…':'Save image'} <span aria-hidden="true">↓</span></button><button class="ks-secondary" data-share ${file?'':'disabled'}>Share…</button>`;
  }
  function pickMarkup(){return `<p class="ks-description">Choose three from the photos picked for you.</p><div class="ks-picks">${photos.map(p=>{const n=chosen.indexOf(p.id);return `<button class="ks-pick" data-pick="${esc(p.id)}" aria-label="${esc(p.caption||p.alt)}" aria-pressed="${n>=0}"><img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy" decoding="async"><span class="ks-badge" ${n<0?'hidden':''}>${n+1}</span></button>`;}).join('')}</div>`;}
  function editorMarkup(){return `<div class="ks-preview-wrap"><canvas class="ks-preview" width="1200" height="1500" role="img" aria-label="Your four-by-five keepsake: three selected photos, excellent company, and Pixel in a Santa hat"></canvas><div class="ks-tap-slots">${cardSlots.map((s,i)=>`<button data-crop="${i}" aria-label="Adjust crop of photo ${i+1}"></button>`).join('')}</div></div><p class="ks-crop-hint">Tap a photo to adjust its crop.</p><div class="ks-options" role="group" aria-label="Frame style"><button class="ks-frame" data-frame="moss" aria-pressed="${frame==='moss'}"><span class="ks-swatch moss"></span>Moss</button><button class="ks-frame" data-frame="classic" aria-pressed="${frame==='classic'}"><span class="ks-swatch classic"></span>Classic</button></div><div class="ks-order" role="group" aria-label="Photo order">${currentPhotos().map((p,i)=>`<button data-hero="${i}" aria-pressed="${i===0}" aria-label="${i===0?'Main photo':'Make photo '+(i+1)+' the main photo'}"><img src="${esc(p.src)}" alt=""><span>${i===0?'Main':'Make main'}</span></button>`).join('')}<button class="ks-swap" data-swap aria-label="Swap the two bottom photos">Swap<br>bottom two</button></div>`;}
  function cropMarkup(){return `<p class="ks-description ks-gesture-hint"><svg class="ks-drag-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18m-12-6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/></svg><span>Drag to move. Pinch or scroll to zoom.</span></p><canvas class="ks-crop-preview" tabindex="0" role="img" aria-label="Crop photo ${editing+1}. Drag to move, pinch or scroll to zoom. Use arrow keys to move, plus and minus to zoom." aria-describedby="ks-crop-help"></canvas><p id="ks-crop-help" class="ks-crop-help">Find your favorite framing.</p><div class="ks-crop-controls"><button class="ks-text" data-reset>Reset crop</button></div>`;}
  function render(){
    revision++;file=null;busy=step==='edit';
    modal.innerHTML=`<div class="ks-shell"><div class="ks-top"><button class="ks-icon" data-back aria-label="${step==='pick'?'Close keepsake':'Back'}">${arrow}</button><h2 id="ks-title" tabindex="-1">${step==='pick'?'Make a little keepsake':step==='crop'?'A little reframing':'Your keepsake'}</h2><button class="ks-icon" data-close aria-label="Close keepsake">${cross}</button></div><div class="ks-body ${step==='pick'?'ks-select-body':step==='crop'?'ks-crop-body':''}">${step==='pick'?pickMarkup():step==='crop'?cropMarkup():editorMarkup()}<p class="ks-status" role="status" aria-live="polite"></p></div><div class="ks-bottom">${actions()}</div></div>`;
    modal.querySelector('[data-close]').onclick=close;
    modal.querySelector('[data-back]').onclick=()=>{if(step==='pick')close();else{step=step==='crop'?'edit':'pick';render();modal.querySelector('h2').focus();}};
    modal.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.pick,index=chosen.indexOf(id);
      if(index>=0)chosen.splice(index,1);else if(chosen.length<3){chosen.push(id);if(!crops.has(id))crops.set(id,{x:.5,y:.5,zoom:1});}else{setStatus('Three’s the sweet spot. Deselect one to choose another.');return;}
      modal.querySelectorAll('[data-pick]').forEach(b=>{const n=chosen.indexOf(b.dataset.pick);b.setAttribute('aria-pressed',String(n>=0));b.querySelector('span').hidden=n<0;b.querySelector('span').textContent=n+1;});
      modal.querySelector('.ks-count').textContent=`${chosen.length} of 3 selected`;modal.querySelector('[data-continue]').disabled=chosen.length!==3;setStatus('');
    });
    const next=modal.querySelector('[data-continue]');if(next)next.onclick=()=>{if(chosen.length===3){step='edit';render();}};
    modal.querySelectorAll('[data-frame]').forEach(b=>b.onclick=()=>{frame=b.dataset.frame;modal.querySelectorAll('[data-frame]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.frame===frame)));paintCard();});
    modal.querySelectorAll('[data-crop]').forEach(b=>b.onclick=()=>{editing=Number(b.dataset.crop);step='crop';render();});
    modal.querySelectorAll('[data-hero]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.hero);[chosen[0],chosen[i]]=[chosen[i],chosen[0]];render();});
    const swap=modal.querySelector('[data-swap]');if(swap)swap.onclick=()=>{[chosen[1],chosen[2]]=[chosen[2],chosen[1]];render();};
    const done=modal.querySelector('[data-done]');if(done)done.onclick=()=>{step='edit';render();};
    const reset=modal.querySelector('[data-reset]');if(reset)reset.onclick=()=>{crops.set(chosen[editing],{x:.5,y:.5,zoom:1});render();};
    const save=modal.querySelector('[data-save]');if(save)save.onclick=download;
    const share=modal.querySelector('[data-share]');if(share)share.onclick=shareCard;
    if(step==='edit')paintCard();
    if(step==='crop'){cropImage=null;paintCrop();bindDrag();}
    if(modal.open)modal.querySelector('h2').focus();
  }
  function updateExport(){const bottom=modal.querySelector('.ks-bottom');if(bottom&&step==='edit'){bottom.innerHTML=actions();bottom.querySelector('[data-save]').onclick=download;bottom.querySelector('[data-share]').onclick=shareCard;}}
  async function paintCard(){
    const stamp=++revision;file=null;busy=true;updateExport();setStatus('');
    const canvas=modal.querySelector('.ks-preview');if(!canvas)return;
    const ctx=canvas.getContext('2d');ctx.fillStyle=frame==='moss'?'#f8f6ec':'#fff';ctx.fillRect(0,0,CARD_WIDTH,CARD_HEIGHT);
    try{
      const selected=currentPhotos(),wanted=new Set([...selected.map(p=>p.viewerSrc||p.src),'/pixel-santa.png']);
      images.forEach((promise,src)=>{if(!wanted.has(src)){images.delete(src);promise.then(image=>image.close?.()).catch(()=>{});}});
      const loaded=await Promise.all([...selected.map(p=>loadImage(p.viewerSrc||p.src)),loadImage('/pixel-santa.png')]);
      if(stamp!==revision||!modal.open)return;
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      selected.forEach((p,i)=>drawPhoto(ctx,loaded[i],cardSlots[i],crops.get(p.id)));
      ctx.fillStyle=frame==='moss'?'#20392f':'#272727';ctx.textAlign='center';
      fittedText(ctx,'excellent company.',530,1300,890,64,'italic $px Georgia, serif');
      fittedText(ctx,`${(journal.authors||'Aditya & Angela').toLowerCase()} · ${journal.year||''}`,530,1363,890,30,'$px system-ui, sans-serif');
      ctx.font='24px Georgia, serif';ctx.fillText('♥',530,1420);
      const pixel=loaded[3],height=176,width=height*pixel.width/pixel.height;
      ctx.drawImage(pixel,1090-width/2,1248,width,height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
      if(stamp!==revision||!modal.open)return;
      if(!blob)throw new Error('Your card couldn’t be prepared. Please try again.');
      file=new File([blob],`a-little-keepsake-${journal.year||'our-year'}.jpg`,{type:'image/jpeg'});busy=false;updateExport();
    }catch(error){if(stamp!==revision||error.name==='AbortError')return;busy=false;updateExport();setStatus(error.message);const retry=document.createElement('button');retry.className='ks-text';retry.textContent='Try again';retry.onclick=paintCard;modal.querySelector('.ks-status').append(' ',retry);}
  }
  async function paintCrop(){
    const stamp=++revision,canvas=modal.querySelector('.ks-crop-preview'),photo=currentPhotos()[editing],slot=cardSlots[editing];
    canvas.width=720;canvas.height=Math.round(720*slot.height/slot.width);
    try{const image=await loadImage(photo.viewerSrc||photo.src);if(stamp!==revision||step!=='crop'||!modal.open)return;cropImage=image;drawPhoto(canvas.getContext('2d'),image,{x:0,y:0,width:canvas.width,height:canvas.height},crops.get(photo.id));}catch(error){if(stamp===revision&&error.name!=='AbortError')setStatus(error.message);}
  }
  function bindDrag(){
    const canvas=modal.querySelector('.ks-crop-preview'),points=new Map();let gesture=null;
    const midpoint=()=>{const p=[...points.values()];return {x:p.reduce((n,v)=>n+v.x,0)/p.length,y:p.reduce((n,v)=>n+v.y,0)/p.length,distance:p.length>1?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0};};
    function begin(){
      if(!cropImage||!points.size){gesture=null;return;}
      const crop={...crops.get(chosen[editing])},r=canvas.getBoundingClientRect(),m=midpoint(),g=coverCrop(cropImage.width,cropImage.height,canvas.width,canvas.height,crop);
      gesture={crop,distance:m.distance,sourceX:g.x+(m.x-r.x)/r.width*g.width,sourceY:g.y+(m.y-r.y)/r.height*g.height};
    }
    function applyAt(x,y,zoom,sourceX,sourceY){
      const crop=crops.get(chosen[editing]),r=canvas.getBoundingClientRect();
      Object.assign(crop,anchoredCrop(cropImage.width,cropImage.height,canvas.width,canvas.height,zoom,sourceX,sourceY,(x-r.x)/r.width,(y-r.y)/r.height));
      paintCrop();
    }
    canvas.onpointerdown=e=>{if(e.button!==0||points.size>=2)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);begin();};
    canvas.onpointermove=e=>{if(!points.has(e.pointerId)||!gesture||!cropImage)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});const m=midpoint(),zoom=gesture.distance>0?gesture.crop.zoom*m.distance/gesture.distance:gesture.crop.zoom;applyAt(m.x,m.y,zoom,gesture.sourceX,gesture.sourceY);};
    canvas.onpointerup=canvas.onpointercancel=e=>{points.delete(e.pointerId);begin();};
    canvas.addEventListener('wheel',e=>{if(!cropImage)return;e.preventDefault();const crop=crops.get(chosen[editing]),r=canvas.getBoundingClientRect(),g=coverCrop(cropImage.width,cropImage.height,canvas.width,canvas.height,crop);const unit=e.deltaMode===1?16:e.deltaMode===2?r.height:1;applyAt(e.clientX,e.clientY,crop.zoom*Math.exp(-e.deltaY*unit*.002),g.x+(e.clientX-r.x)/r.width*g.width,g.y+(e.clientY-r.y)/r.height*g.height);},{passive:false});
    canvas.onkeydown=e=>{const crop=crops.get(chosen[editing]);if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')crop.x=Math.max(0,crop.x-.04);if(e.key==='ArrowRight')crop.x=Math.min(1,crop.x+.04);if(e.key==='ArrowUp')crop.y=Math.max(0,crop.y-.04);if(e.key==='ArrowDown')crop.y=Math.min(1,crop.y+.04);if(['+','='].includes(e.key))crop.zoom=Math.min(2.5,crop.zoom+.1);if(['-','_'].includes(e.key))crop.zoom=Math.max(1,crop.zoom-.1);paintCrop();};
  }
  function download(){if(!file)return;const url=URL.createObjectURL(file);urls.add(url);const a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setStatus('Your keepsake is ready. Your browser chooses where it saves.');setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000);}
  async function shareCard(){if(!file)return;try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'A little keepsake'});else{download();setStatus('Image downloaded. You can share it from your saved files.');}}catch(error){if(error.name!=='AbortError')setStatus('Sharing couldn’t open. Use Save image instead.');}}
  launch.onclick=()=>{returnFocus=document.activeElement;abort=new AbortController();step='pick';render();modal.showModal();};
  return {destroy(){if(modal.open)modal.close();else cleanup();modal.remove();entry.remove();}};
}
