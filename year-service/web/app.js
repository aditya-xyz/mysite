import {scrapbookConfig} from './config.js';
import {winterLights,winterSnowflake} from './seasonal.js';
import {photoOrder,adjacentIndex,swipeStep,wheelNavigation} from './photo-navigation.js';
const app = document.querySelector('#app');
const dialog = document.querySelector('#photo');
const save = document.querySelector('#save');
const fullResolution=document.querySelector('#full-resolution');
const previousPhoto=document.querySelector('#previous-photo'),nextPhoto=document.querySelector('#next-photo'),photoStage=dialog.querySelector('.photo-stage');
let viewerPhotos=[],viewerIndex=-1,viewerReturnFocus;
let preparedFile, selected, journal, saveMode = 'share', generation = 0, fullImageUrl, originalRequest, downloadPending=false, imageObserver, layoutObserver, closeTimer;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again.');
  return result;
}
function applyBrand(authors='Aditya & Angela',year) { document.querySelector('.signature').textContent=authors.toLowerCase()+'.'; document.title=(year?year+' · ':'')+authors; document.querySelector('.edition-label').textContent=year||''; }
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
  if(!document.querySelector('.header-pixel'))document.querySelector('#theme-toggle').insertAdjacentHTML('beforebegin','<img class="header-pixel" src="/pixel-santa.png" alt="Pixel wearing a Santa hat" width="369" height="400" decoding="async">');
  document.querySelector('.footer-ornament').innerHTML=winterSnowflake;
  const links=shareSocials?scrapbookConfig.instagram:{};
  document.querySelector('footer > span').replaceChildren('By ',footerProfile('Aditya',links.aditya),' & ',footerProfile('Angela',links.angela),', with help from ',footerProfile('Pixel',links.pixel));
}
function sharedHeading(title){return !title||['A little of our year','A little of our year.'].includes(title.trim())?'Meanwhile, in our camera roll…':title;}
function message(error) { app.innerHTML = `<section class="entry"><p class="kicker">A private edition</p><h1>A little<br><em>patience.</em></h1><p>${escape(error.message)}</p><button class="text-button" id="retry">Try again</button></section>`; document.querySelector('#retry').onclick = start; }
async function start() {
  renderFooter(false);
  try {
    // Invitation secrets travel in the fragment, never the request URL or Referer.
    const raw = location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(raw)) { history.replaceState(null, '', location.pathname); const opened=await api('open', {token:raw}); if(opened.redirectUrl){location.replace(opened.redirectUrl);return;} }
    try { journal = await api('journal'); showJournal(); return; } catch {}
    const invite = await api('invitation');
    applyBrand(invite.authors,invite.year);
    app.innerHTML = `<section class="entry"><h1 class="invitation-greeting">A little something for <em>${escape(invite.name)}</em>.</h1><p class="intro">${escape(invite.intro || "A few places, some familiar faces, and the everyday things worth keeping. We’d love to share them with you.")}</p><p>We’ll send a code to ${escape(invite.verificationName || invite.name)}’s phone ending in <strong>${escape(invite.phoneHint)}</strong>.</p><button class="button" id="send">Text me a code →</button><p class="error" role="alert" id="error"></p><p class="signoff">With love, ${escape(invite.authors || "Aditya & Angela")}</p></section>`;
    document.querySelector('#send').onclick = async e => { e.target.disabled = true; try { await api('send', {}); showCode(invite); } catch (error) { document.querySelector('#error').textContent = error.message; e.target.disabled = false; } };
  } catch (error) { message(error); }
}
function showCode(invite) {
  app.innerHTML = `<form class="entry"><p class="kicker">Your invitation</p><h1>Welcome <em>in.</em></h1><p>A text is on its way to ${escape(invite.verificationName || invite.name)}’s phone ending in ${escape(invite.phoneHint)}.</p><label for="code">Six-digit access code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="error"/><p id="error" class="error" role="alert"></p><button class="button" type="submit">Step inside →</button><br><button class="text-button" id="resend" type="button" disabled>Resend available in 60 seconds</button><p class="hint">Your code expires in ten minutes.</p></form>`;
  let remaining = 60;
  const resend = document.querySelector('#resend');
  const timer = setInterval(() => { if (!resend.isConnected) {clearInterval(timer); return;} remaining--; resend.textContent = remaining > 0 ? `Resend available in ${remaining} seconds` : 'Text me a new code'; if (remaining <= 0) {resend.disabled=false; clearInterval(timer);} },1000);
  resend.onclick = async () => {resend.disabled=true; try {await api('send',{}); showCode(invite);} catch(error) {document.querySelector('#error').textContent=error.message;resend.disabled=false;} };
  const input = document.querySelector('#code'); input.focus(); input.oninput = () => {input.value=input.value.replace(/\D/g,'');};
  app.querySelector('form').onsubmit = async e => {e.preventDefault(); const button=app.querySelector('[type=submit]');button.disabled=true;try {await api('verify',{code:input.value});journal=await api('journal');showJournal();} catch(error){document.querySelector('#error').textContent=error.message;button.disabled=false;}};
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
  renderFooter(journal.shareSocials===true);
  imageObserver?.disconnect();layoutObserver?.disconnect();
  applyBrand(journal.authors,journal.year);
  const cards = personal => journal.photos.filter(p=>p.personal===personal).map(p=>`<button class="card" data-photo="${escape(p.id)}" aria-label="Open photo: ${escape(p.caption)}"><img data-src="${escape(p.src)}" alt="${escape(p.alt)}" loading="eager" decoding="async" ${p.width&&p.height?`width="${p.width}" height="${p.height}"`:'class="pending-dimensions"'}/><span>${escape(p.caption)}</span></button>`).join('');
  const hasPersonal=journal.photos.some(p=>p.personal), sharedTitle=sharedHeading(journal.sharedTitle);
  const stories=(journal.stories || []).map(s=>`<section class="letter"><h2>${escape(s.title)}</h2><p class="prose">${escape(s.body)}</p></section>`).join('');
  app.innerHTML = `<section class="letter"><div class="opening-note-top"><p class="kicker">The opening note</p>${winterLights}</div><div class="recipient-greeting"><h1 class="recipient-name">Hey <strong>${escape(journal.name)}</strong>,</h1><p class="recipient-welcome">we’re glad you’re here.</p></div><p class="prose">${escape(journal.note || 'We wanted to make a little space for the photos with a story behind them, the ordinary days worth remembering, and the people who make it all feel like home.')}</p><p class="signoff">With love, ${escape(journal.authors || 'Aditya & Angela')}</p>${!journal.title?'<p class="hint">These are illustrative samples while we test your invitation. Real memories will come later.</p>':''}</section>${hasPersonal?`<section class="personal-photos" aria-label="Photos selected for ${escape(journal.name)}"><div class="grid">${cards(true)}</div></section>`:''}<section class="shared-photos" aria-labelledby="shared-title"><h2 id="shared-title">${escape(sharedTitle)}</h2><div class="grid">${cards(false)}</div></section>${stories}`;
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
        if(image.isConnected){image.classList.remove('pending-dimensions');image.classList.add('is-ready');}
        finish();
      };
      image.onerror=()=>{image.classList.add('is-ready');finish();};
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
  requestAnimationFrame(()=>grids.forEach(layoutPhotoGrid));
  app.querySelectorAll('[data-photo]').forEach(button => button.onclick=()=>openPhoto(journal.photos.find(p=>p.id===button.dataset.photo)));
  window.scrollTo(0,0);
}
function openPhoto(photo) {
  if(dialog.open)return;
  viewerPhotos=photoOrder(journal.photos);viewerIndex=viewerPhotos.findIndex(p=>p.id===photo.id);
  if(viewerIndex<0)return;
  viewerReturnFocus=document.activeElement;
  clearTimeout(closeTimer);dialog.classList.remove('is-closing');
  showPhoto(photo);dialog.showModal();
}
function showPhoto(photo,direction=0){
  originalRequest?.abort();originalRequest=null;
  if(fullImageUrl){URL.revokeObjectURL(fullImageUrl);fullImageUrl=null;}
  selected=photo;preparedFile=null;saveMode='share';const current=++generation;
  const image=dialog.querySelector('img');image.draggable=false;image.src=photo.src;image.alt=photo.alt;document.querySelector('#photo-caption').textContent=photo.caption;
  if(photo.viewerSrc&&photo.viewerSrc!==photo.src){
    const detailed=new Image();detailed.decoding='async';detailed.onload=()=>{if(current===generation&&!preparedFile)image.src=photo.viewerSrc;};detailed.src=photo.viewerSrc;
  }
  document.querySelector('#save-status').textContent='';save.hidden=!photo.canSave;save.disabled=false;downloadPending=false;save.setAttribute('aria-label','Download preview photo');save.title='Download preview photo';fullResolution.hidden=!photo.canSave;fullResolution.disabled=false;fullResolution.textContent='Full resolution';fullResolution.classList.remove('is-ready');fullResolution.removeAttribute('aria-busy');
  previousPhoto.disabled=viewerIndex===0;nextPhoto.disabled=viewerIndex===viewerPhotos.length-1;
  document.querySelector('#photo-count').textContent=`Photo ${viewerIndex+1} of ${viewerPhotos.length}`;
  previousPhoto.hidden=nextPhoto.hidden=viewerPhotos.length<2;
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
photoStage.addEventListener('pointerdown',event=>{
  pointers.add(event.pointerId);
  if(pointers.size>1){swipeStart=null;return;}
  if(event.button!==0||event.target.closest('button')||(window.visualViewport?.scale||1)>1)return;
  swipeStart={id:event.pointerId,x:event.clientX,y:event.clientY};photoStage.setPointerCapture(event.pointerId);
});
photoStage.addEventListener('pointerup',event=>{
  pointers.delete(event.pointerId);
  if(!swipeStart||swipeStart.id!==event.pointerId)return;
  const step=swipeStep(event.clientX-swipeStart.x,event.clientY-swipeStart.y);swipeStart=null;
  if(step)movePhoto(step);
});
photoStage.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);swipeStart=null;});
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
  document.querySelector('#save-status').textContent='Preview downloaded. Load Full resolution if you’d like the original.';
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
    fullResolution.textContent='Full resolution ✓';fullResolution.classList.add('is-ready');
    save.disabled=false;save.setAttribute('aria-label','Save original photo');save.title='Save original photo';
    status.textContent='Full resolution loaded. Tap the download icon to save or share.';
  }catch(error){if(current===generation&&error.name!=='AbortError'){status.textContent=error.message;fullResolution.disabled=limited;fullResolution.textContent=limited?'Limit reached':'Retry full resolution';}}
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
dialog.addEventListener('close',()=>{clearTimeout(closeTimer);dialog.classList.remove('is-closing');generation++;originalRequest?.abort();downloadPending=false;preparedFile=null;selected=null;swipeStart=null;pointers.clear();viewerPhotos=[];viewerIndex=-1;dialog.querySelector('img').removeAttribute('src');if(fullImageUrl){URL.revokeObjectURL(fullImageUrl);fullImageUrl=null;}const restore=viewerReturnFocus;viewerReturnFocus=null;restore?.focus({preventScroll:true});});
renderFooter();
start();
