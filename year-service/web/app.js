import {installFocusModality} from './focus.js';
installFocusModality();
import {openingMarkup,sectionHeading,giftMarkup,footerMarkup} from './pixelbook.js';
import {mountPixelGift} from './pixelbook-gift.js';
import {mountScrapbookMotion} from './scrapbook-motion.js';
import {mountKeepsake} from './keepsake.js';
import {scrapbookConfig} from './config.js';
import {photoOrder,adjacentIndex,swipeStep,wheelNavigation,paginationDots,dismissDrag} from './photo-navigation.js';
const app = document.querySelector('#app');
const dialog = document.querySelector('#photo');
const save = document.querySelector('#save');
const fullResolution=document.querySelector('#full-resolution');
const previousPhoto=document.querySelector('#previous-photo'),nextPhoto=document.querySelector('#next-photo'),photoStage=dialog.querySelector('.photo-stage');
let viewerPhotos=[],viewerIndex=-1,viewerReturnFocus,keepsake,pixelGift,scrapbookMotion;
let preparedFile, selected, journal, saveMode = 'share', generation = 0, fullImageUrl, originalRequest, downloadPending=false, imageObserver, layoutObserver, closeTimer;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) {const error=new Error(result.error || 'Please try again.');error.code=result.code;throw error;}
  return result;
}
function applyBrand(authors='Aditya & Angela',year) {
  const signature=document.querySelector('.signature');
  signature.innerHTML=`<svg class="pb-header-paw" viewBox="0 0 32 32" width="18" height="18" fill="currentColor" aria-hidden="true"><ellipse cx="6" cy="12" rx="3.2" ry="4.3" transform="rotate(-24 6 12)"/><ellipse cx="12" cy="6.5" rx="3.1" ry="4.3" transform="rotate(-9 12 6.5)"/><ellipse cx="21" cy="6.5" rx="3.1" ry="4.3" transform="rotate(9 21 6.5)"/><ellipse cx="27" cy="12" rx="3.2" ry="4.3" transform="rotate(24 27 12)"/><path d="M8 21c2-2 3-7 8-7s6 5 8 7c5 7-2 9-5 7-2-1-4-1-6 0-4 2-10 0-5-7Z"/></svg>${year?`<span class="pb-header-volume">vol. ${escape(year)}</span>`:''}`;
  const volume=signature.querySelector('.pb-header-volume');
  document.querySelector('header > .pb-header-volume')?.remove();
  if(volume)signature.after(volume);
  signature.href='#';signature.setAttribute('aria-label','Pixelbook — back to the top');signature.hidden=false;
  document.title='pixelbook'+(year?' · '+year:'');
}
function clearBrand(){
  const signature=document.querySelector('.signature');
  document.querySelector('header > .pb-header-volume')?.remove();signature.hidden=true;signature.replaceChildren();signature.removeAttribute('href');signature.removeAttribute('aria-label');
  document.title='A private scrapbook';
}
function footerProfile(name,profileUrl){
  if(!profileUrl)return document.createTextNode(name);
  try{
    const url=new URL(profileUrl);
    if(url.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(url.hostname))return document.createTextNode(name);
    const link=document.createElement('a');link.textContent=name;link.href=url.href;
    link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',name+' on Instagram');return link;
  }catch{return document.createTextNode(name);}
}
function renderFooter(shareSocials=false){
  const footer=document.querySelector('footer');
  footer.innerHTML=footerMarkup(journal || {});
  const links=shareSocials?scrapbookConfig.instagram:{};
  footer.querySelector('.pb-footer-credits').replaceChildren('vibecoded by ',footerProfile('Pixel',links.pixel),', technical support & design by ',footerProfile('dad',links.aditya));
  footer.hidden=false;
}
function sharedHeading(title){return !title||['A little of our year','A little of our year.'].includes(title.trim())?'the group project.':title;}
function showOffline(){
  clearBrand();const footer=document.querySelector('footer');footer.hidden=true;footer.replaceChildren();
  app.innerHTML='<section class="entry"><p class="kicker">A private edition</p><h1>This scrapbook has<br><em>been taken offline.</em></h1><p>It’s unavailable to guests right now. Please check back later.</p><button class="text-button" id="retry">Check again</button></section>';
  document.querySelector('#retry').onclick=start;
}
function message(error) { if(error.code==='SCRAPBOOK_OFFLINE'){showOffline();return;} app.innerHTML = `<section class="entry"><p class="kicker">A private edition</p><h1>A little<br><em>patience.</em></h1><p>${escape(error.message)}</p><button class="text-button" id="retry">Try again</button></section>`; document.querySelector('#retry').onclick = start; }
async function start() {
  clearBrand();
  const footer=document.querySelector('footer');footer.hidden=true;footer.replaceChildren();
  try {
    // Invitation secrets travel in the fragment, never the request URL or Referer.
    const raw = location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(raw)) { history.replaceState(null, '', location.pathname); const opened=await api('open', {token:raw}); if(opened.redirectUrl){location.replace(opened.redirectUrl);return;} if(opened.offline){showOffline();return;} }
    try { journal = await api('journal'); showJournal(); return; } catch(error) {if(error.code==='SCRAPBOOK_OFFLINE'){showOffline();return;}}
    const invite = await api('invitation');
    applyBrand(invite.authors,invite.year);
    renderFooter();
    app.innerHTML = `<section class="entry"><div class="invitation-delivery"><img src="/pixel-santa.png" width="92" height="100" alt="Pixel wearing a Santa hat"><div><p class="handwritten">special delivery. from me.</p><p class="kicker">the Pixelbook annual</p></div></div><h1 class="invitation-greeting">oh good,<br><em>${escape(invite.name)}</em>.</h1><p class="intro">i made you a scrapbook. there are photos, there are memories, and yes, there is a lot of me.</p><p>We’ll send a code to ${escape(invite.verificationName || invite.name)}’s phone ending in <strong>${escape(invite.phoneHint)}</strong>.</p><button class="button" id="send">Text me a code →</button><p class="error" role="alert" id="error"></p><p class="signoff">love, Pixel</p></section>`;
    document.querySelector('#send').onclick = async e => { e.target.disabled = true; try { await api('send', {}); showCode(invite); } catch (error) { if(error.code==='SCRAPBOOK_OFFLINE'){showOffline();return;} document.querySelector('#error').textContent = error.message; e.target.disabled = false; } };
  } catch (error) { message(error); }
}
function showCode(invite) {
  app.innerHTML = `<form class="entry"><p class="kicker">one tiny thing first…</p><h1>Just making sure<br>it’s you.</h1><p>A text is on its way to ${escape(invite.verificationName || invite.name)}’s phone ending in ${escape(invite.phoneHint)}.</p><label for="code">Six-digit access code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="error"/><p id="error" class="error" role="alert"></p><button class="button" type="submit">Step inside →</button><br><button class="text-button" id="resend" type="button" disabled>Resend available in 60 seconds</button><p class="hint">Your code expires in ten minutes.</p></form>`;
  let remaining = 60;
  const resend = document.querySelector('#resend');
  const timer = setInterval(() => { if (!resend.isConnected) {clearInterval(timer); return;} remaining--; resend.textContent = remaining > 0 ? `Resend available in ${remaining} seconds` : 'Text me a new code'; if (remaining <= 0) {resend.disabled=false; clearInterval(timer);} },1000);
  resend.onclick = async () => {resend.disabled=true; try {await api('send',{}); showCode(invite);} catch(error) {if(error.code==='SCRAPBOOK_OFFLINE'){showOffline();return;}document.querySelector('#error').textContent=error.message;resend.disabled=false;} };
  const input = document.querySelector('#code'); input.focus(); input.oninput = () => {input.value=input.value.replace(/\D/g,'');};
  app.querySelector('form').onsubmit = async e => {e.preventDefault(); const button=app.querySelector('[type=submit]');button.disabled=true;try {await api('verify',{code:input.value});journal=await api('journal');showJournal();} catch(error){if(error.code==='SCRAPBOOK_OFFLINE'){showOffline();return;}document.querySelector('#error').textContent=error.message;button.disabled=false;}};
}
function layoutPhotoGrid(grid){
  if(!grid)return;
  const style=getComputedStyle(grid),unit=parseFloat(style.gridAutoRows),gap=parseFloat(style.rowGap);
  if(!Number.isFinite(unit))return;
  // Read all heights before writing spans to avoid a layout flush per card.
  const spans=[...grid.querySelectorAll('.card')].map(card=>[card,'span '+Math.ceil((card.getBoundingClientRect().height+gap)/(unit+gap))]);
  spans.forEach(([card,span])=>{if(card.style.gridRowEnd!==span)card.style.gridRowEnd=span;});
}
function showJournal() {
  keepsake?.destroy();pixelGift?.destroy();scrapbookMotion?.destroy();
  renderFooter(journal.shareSocials===true);
  imageObserver?.disconnect();layoutObserver?.disconnect();
  applyBrand(journal.authors,journal.year);
  const cards = personal => journal.photos.filter(p=>p.personal===personal).map(p=>`<button class="card" data-photo="${escape(p.id)}" aria-label="Open photo: ${escape(p.caption)}"><img data-src="${escape(p.src)}" alt="${escape(p.alt)}" loading="eager" decoding="async" ${p.width&&p.height?`width="${p.width}" height="${p.height}"`:'class="pending-dimensions"'}/><span>${escape(p.caption)}</span></button>`).join('');
  const hasPersonal=journal.photos.some(p=>p.personal), sharedTitle=sharedHeading(journal.sharedTitle);
  const stories=(journal.stories || []).map(s=>`<section class="letter"><h2>${escape(s.title)}</h2><p class="prose">${escape(s.body)}</p></section>`).join('');
  app.innerHTML = `${openingMarkup(journal)}${hasPersonal?`<section class="personal-photos" aria-label="Photos selected for ${escape(journal.name)}">${sectionHeading('01','humans’ friends','a few photos picked especially for you.','','my friends')}<div class="grid">${cards(true)}</div></section>`:''}<section class="shared-photos" aria-labelledby="shared-title">${sectionHeading(hasPersonal?'02':'',sharedTitle,'the adventures. the people. the photographic evidence.','shared-title')}<div class="grid">${cards(false)}</div></section>${stories}${giftMarkup(journal)}`;
  keepsake=mountKeepsake(journal,app.querySelector('.keepsake-section'));
  const pending=new Set(),dirtyGrids=new Set();let active=0,layoutFrame;
  const scheduleLayout=grid=>{
    if(grid)dirtyGrids.add(grid);
    if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;dirtyGrids.forEach(layoutPhotoGrid);dirtyGrids.clear();});
  };
  const pumpImages=()=>{
    // Start a few previews ahead, without downloading the whole scrapbook.
    const distance=image=>{const r=image.getBoundingClientRect();return Math.max(0,r.top-innerHeight,-r.bottom);};
    const next=[...pending].filter(image=>image.isConnected).sort((a,b)=>distance(a)-distance(b));
    while(active<4&&next.length){
      const image=next.shift();pending.delete(image);imageObserver?.unobserve(image);active++;
      const finish=()=>{active--;image.onload=null;image.onerror=null;scheduleLayout(image.closest('.grid'));pumpImages();};
      image.onload=async()=>{
        try{await image.decode();}catch{}
        if(image.isConnected){image.classList.remove('pending-dimensions');image.classList.add('is-ready');scrapbookMotion?.photoReady(image.closest('.card'));}
        finish();
      };
      image.onerror=()=>{image.classList.add('is-ready');scrapbookMotion?.photoReady(image.closest('.card'));finish();};
      image.fetchPriority=distance(image)===0?'high':'low';
      image.src=image.dataset.src;delete image.dataset.src;
    }
  };
  const images=app.querySelectorAll('img[data-src]');
  if ('IntersectionObserver' in window) {
    imageObserver=new IntersectionObserver(entries=>{
      entries.forEach(({target,isIntersecting})=>{if(!target.dataset.src)return;if(isIntersecting)pending.add(target);else pending.delete(target);});
      pumpImages();
    },{rootMargin:'1200px 0px'});
    images.forEach(image=>imageObserver.observe(image));
  } else {images.forEach(image=>pending.add(image));pumpImages();}
  const grids=app.querySelectorAll('.grid');
  if('ResizeObserver' in window){
    const widths=new WeakMap();
    layoutObserver=new ResizeObserver(entries=>entries.forEach(({target,contentRect})=>{
      if(widths.get(target)!==contentRect.width){widths.set(target,contentRect.width);layoutPhotoGrid(target);}
    }));
    grids.forEach(grid=>layoutObserver.observe(grid));
  }
  // Reserve the gallery's full height before observing the gift cards below it.
  grids.forEach(layoutPhotoGrid);
  scrapbookMotion=mountScrapbookMotion(app);
  document.fonts?.ready.then(()=>{if(grids[0]?.isConnected)grids.forEach(layoutPhotoGrid);});
  app.querySelectorAll('[data-photo]').forEach(button => button.onclick=()=>openPhoto(journal.photos.find(p=>p.id===button.dataset.photo)));
  pixelGift=mountPixelGift(journal,app);
  window.scrollTo(0,0);
}
function openPhoto(photo) {
  if(dialog.open)return;
  viewerPhotos=photoOrder(journal.photos);viewerIndex=viewerPhotos.findIndex(p=>p.id===photo.id);
  if(viewerIndex<0)return;
  viewerReturnFocus=document.activeElement;
  clearTimeout(closeTimer);dialog.classList.remove('is-closing');
  showPhoto(photo);dialog.showModal();dialog.focus({preventScroll:true});
}
function showPhoto(photo,direction=0){
  originalRequest?.abort();originalRequest=null;
  if(fullImageUrl){URL.revokeObjectURL(fullImageUrl);fullImageUrl=null;}
  selected=photo;preparedFile=null;saveMode='share';const current=++generation;
  const image=dialog.querySelector('img');image.draggable=false;image.src=photo.src;image.alt=photo.alt;document.querySelector('#photo-caption').textContent=photo.caption;
  if(photo.viewerSrc&&photo.viewerSrc!==photo.src){
    const detailed=new Image();detailed.decoding='async';detailed.onload=()=>{if(current===generation&&!preparedFile)image.src=photo.viewerSrc;};detailed.src=photo.viewerSrc;
  }
  document.querySelector('#save-status').textContent='';save.hidden=!photo.canSave;save.disabled=false;downloadPending=false;save.setAttribute('aria-label','Download preview photo');save.title='Download preview photo';fullResolution.hidden=!photo.canSave;fullResolution.disabled=false;fullResolution.textContent='Full res';fullResolution.classList.remove('is-ready');fullResolution.removeAttribute('aria-busy');
  previousPhoto.disabled=viewerIndex===0;nextPhoto.disabled=viewerIndex===viewerPhotos.length-1;
  document.querySelector('#photo-count').textContent=`Photo ${viewerIndex+1} of ${viewerPhotos.length}`;
  previousPhoto.hidden=nextPhoto.hidden=viewerPhotos.length<2;
  const dots=dialog.querySelector('.photo-pagination');dots.hidden=viewerPhotos.length<2;dots.replaceChildren(...paginationDots(viewerIndex,viewerPhotos.length).map(dot=>{const marker=document.createElement('span');marker.className='photo-dot'+(dot.active?' is-current':'')+(dot.small?' is-small':'');return marker;}));
  if(direction&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    photoStage.getAnimations().forEach(a=>a.cancel());
    photoStage.animate([{opacity:.45,transform:`translateX(${direction*24}px)`},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'ease-out'});
  }
}
function movePhoto(step){
  if(!dialog.open||dialog.classList.contains('is-closing'))return;
  const next=adjacentIndex(viewerIndex,step,viewerPhotos.length);if(next===viewerIndex)return;
  viewerIndex=next;showPhoto(viewerPhotos[next],step);
}
previousPhoto.onclick=()=>movePhoto(-1);nextPhoto.onclick=()=>movePhoto(1);
document.addEventListener('keydown',event=>{
  if(!dialog.open||dialog.classList.contains('is-closing'))return;
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();movePhoto(event.key==='ArrowRight'?1:-1);}
});
let swipeStart=null;const pointers=new Set();
function resetPhotoDrag(animate=false){
  const transform=photoStage.style.transform,opacity=photoStage.style.opacity;
  photoStage.style.transform='';photoStage.style.opacity='';
  if(animate&&transform&&!matchMedia('(prefers-reduced-motion: reduce)').matches)photoStage.animate([{transform,opacity},{transform:'none',opacity:1}],{duration:180,easing:'ease-out'});
}
function syncPhotoZoom(){const zoomed=(window.visualViewport?.scale||1)>1;dialog.classList.toggle('is-zoomed',zoomed);if(zoomed){swipeStart=null;resetPhotoDrag();}}
window.visualViewport?.addEventListener('resize',syncPhotoZoom);syncPhotoZoom();
photoStage.addEventListener('pointerdown',event=>{
  pointers.add(event.pointerId);
  if(pointers.size>1){swipeStart=null;resetPhotoDrag();return;}
  if(event.button!==0||event.target.closest('button')||(window.visualViewport?.scale||1)>1)return;
  photoStage.getAnimations().forEach(animation=>animation.cancel());resetPhotoDrag();
  swipeStart={id:event.pointerId,x:event.clientX,y:event.clientY,dismiss:event.pointerType==='touch'&&!!event.target.closest('.photo-image'),dragging:false,horizontal:false};photoStage.setPointerCapture(event.pointerId);
});
photoStage.addEventListener('pointermove',event=>{
  if(!swipeStart||swipeStart.id!==event.pointerId||!swipeStart.dismiss||pointers.size!==1)return;
  const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
  if(!swipeStart.dragging&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.2)swipeStart.horizontal=true;
  if(!swipeStart.horizontal&&dy>8&&dy>Math.abs(dx)*1.2)swipeStart.dragging=true;
  if(!swipeStart.dragging)return;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){photoStage.style.transform=`translateY(${Math.max(0,dy)}px)`;photoStage.style.opacity=String(Math.max(.55,1-Math.max(0,dy)/700));}
});
photoStage.addEventListener('pointerup',event=>{
  pointers.delete(event.pointerId);
  if(!swipeStart||swipeStart.id!==event.pointerId)return;
  const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y,dragging=swipeStart.dragging,dismiss=swipeStart.dismiss&&swipeStart.dragging&&!swipeStart.horizontal&&dismissDrag(dx,dy);swipeStart=null;
  if(dismiss){closePhoto();return;}
  resetPhotoDrag(true);
  if(!dragging){const step=swipeStep(dx,dy);if(step)movePhoto(step);}
});
photoStage.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);swipeStart=null;resetPhotoDrag();});
const wheelStep=wheelNavigation(movePhoto);
dialog.addEventListener('wheel',event=>{if((window.visualViewport?.scale||1)===1&&wheelStep(event))event.preventDefault();},{passive:false});

async function deliverOriginal(){
  if(!preparedFile)return;
  const file=preparedFile;
  try{
    if(saveMode==='share'&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});return;}
    const url=URL.createObjectURL(file),anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    document.querySelector('#save-status').textContent='Original downloaded. Your browser chooses where it saves.';
  }catch(error){if(error.name!=='AbortError'){saveMode='download';document.querySelector('#save-status').textContent='Tap the download icon again to save the original.';}}
}
save.onclick=async()=>{
  if(!selected?.canSave)return;
  if(preparedFile){await deliverOriginal();return;}
  // A same-origin download starts directly from the tap, without fetching an original.
  const anchor=document.createElement('a');anchor.href=selected.viewerSrc||selected.src;
  anchor.download='photo-preview.jpg';document.body.append(anchor);anchor.click();anchor.remove();
  document.querySelector('#save-status').textContent='Preview downloaded. Load Full res if you’d like the original.';
};
fullResolution.onclick=async()=>{
  if(!selected?.canSave||downloadPending||preparedFile)return;
  const photo=selected,current=generation,status=document.querySelector('#save-status');
  downloadPending=true;fullResolution.disabled=true;fullResolution.setAttribute('aria-busy','true');fullResolution.textContent='Loading…';status.textContent='Loading the full-resolution photo…';
  originalRequest=new AbortController();let limited=false;
  try{
    const response=await fetch(photo.src+'/original',{signal:originalRequest.signal});
    if(!response.ok){
      const error=await response.json();limited=response.status===429;
      const reset=error.retryAfter?new Date(Date.now()+error.retryAfter*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
      throw new Error(limited&&reset?`You’ve reached this photo’s full-resolution limit. Try again after ${reset}, or ask us to reset it.`:error.error||'Could not load full resolution. Please try again.');
    }
    const blob=await response.blob();if(current!==generation)return;
    const filename=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'photo.jpg';
    preparedFile=new File([blob],filename,{type:blob.type});
    fullImageUrl=URL.createObjectURL(preparedFile);dialog.querySelector('img').src=fullImageUrl;
    fullResolution.textContent='Full res ✓';fullResolution.classList.add('is-ready');
    save.disabled=false;save.setAttribute('aria-label','Save original photo');save.title='Save original photo';
    status.textContent='Full resolution loaded. Tap the download icon to save or share.';
  }catch(error){if(current===generation&&error.name!=='AbortError'){status.textContent=error.message;fullResolution.disabled=limited;fullResolution.textContent=limited?'Limit reached':'Retry full res';}}
  finally{if(current===generation){downloadPending=false;fullResolution.removeAttribute('aria-busy');}}
};
function closePhoto(){
  if(!dialog.open||dialog.classList.contains('is-closing'))return;
  generation++;originalRequest?.abort();downloadPending=false;preparedFile=null;save.disabled=true;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.close();return;}
  dialog.classList.add('is-closing');
  // Fallback if the browser suppresses animationend (for example, a hidden tab).
  closeTimer=setTimeout(()=>{if(dialog.open)dialog.close();},260);
}
dialog.querySelector('.close').onclick=closePhoto;
dialog.addEventListener('cancel',event=>{event.preventDefault();closePhoto();});
dialog.addEventListener('animationend',event=>{if(event.target===dialog&&event.animationName==='photo-exit'&&dialog.classList.contains('is-closing'))dialog.close();});
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closePhoto();}});
dialog.addEventListener('close',()=>{clearTimeout(closeTimer);dialog.classList.remove('is-closing');resetPhotoDrag();generation++;originalRequest?.abort();downloadPending=false;preparedFile=null;selected=null;swipeStart=null;pointers.clear();viewerPhotos=[];viewerIndex=-1;dialog.querySelector('img').removeAttribute('src');if(fullImageUrl){URL.revokeObjectURL(fullImageUrl);fullImageUrl=null;}const restore=viewerReturnFocus;viewerReturnFocus=null;restore?.focus({preventScroll:true});});
start();
