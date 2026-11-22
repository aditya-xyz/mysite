import {renderMugPrint} from './mug-print.js';
export function createMugMockups(){
 const records=new Map(),timers=new Set(),controllers=new Set(),urls=new Set();let catalog=null,disposed=false;let prepared=null,view='handle-left';const angleControls=new WeakMap();const preloadQueue=[];let preloadActive=0;
 const key=(design,options,angle='handle-left')=>JSON.stringify([design.id,design.caption,options.style,options.size,options.color,options.font,angle]);
 const selectedView=(design,options)=>prepared?.has(key(design,options,view))?view:'handle-left';
 const savedFor=(design,options)=>prepared?.get(key(design,options,selectedView(design,options)));
 const connected=record=>[...record.elements].some(e=>e.isConnected);
 function later(action,ms){const timer=setTimeout(()=>{timers.delete(timer);if(!disposed)action();},ms);timers.add(timer);}
 async function fetchResponse(path,body){
  const controller=new AbortController();controllers.add(controller);
  try{
   const multipart=body instanceof FormData;
   const response=await fetch(path,{method:body?'POST':'GET',...(body?{body:multipart?body:JSON.stringify(body),...(multipart?{}:{headers:{'Content-Type':'application/json'}})}:{}),signal:controller.signal});
   if(!response.ok){let result;try{result=await response.json();}catch{}const error=new Error(result?.error||'Your mug preview is temporarily unavailable.');error.status=response.status;error.retryAfter=Math.max(1,Number(result?.retryAfter)||Number(response.headers.get('Retry-After'))||60);throw error;}
   return response;
  }finally{controllers.delete(controller);}
 }
 const request=async(path,body)=>(await fetchResponse('/api/gift/mockup'+path,body)).json();
 function recordFor(design,options,angle=selectedView(design,options)){const id=key(design,options,angle);let record=records.get(id);if(!record){record={elements:new Set(),started:false,design,configuration:{...options},view:angle};records.set(id,record);}return record;}
 function controlsFor(element,record){
     let cached=angleControls.get(element);
     if(!cached){
      const controls=document.createElement('div');controls.className='pb-mockup-views pb-segments';controls.role='group';controls.ariaLabel='Mug preview angle';
      const buttons=[['handle-left','Handle left'],['handle-right','Handle right']].map(([angle,label])=>{const button=document.createElement('button');button.type='button';button.className='pb-mockup-view';button.textContent=label;controls.append(button);return {angle,button};});
      cached={controls,buttons};angleControls.set(element,cached);
     }
     for(const {angle,button} of cached.buttons){
      button.ariaPressed=String(record.view===angle);button.disabled=!prepared.has(key(record.design,record.configuration,angle));
      button.onclick=()=>{view=angle;update(element,record.design,record.configuration);button.focus?.({preventScroll:true});};
     }
     return cached;
 }
 function paint(record){
  for(const element of record.elements){
   if(!element.isConnected){record.elements.delete(element);continue;}
   const loading=!record.imageUrl&&!record.waiting&&!record.error;
   element.setAttribute?.('aria-busy',String(loading));
   if(prepared&&angleControls.has(element))controlsFor(element,record);
   const previousImage=element.querySelector('img.pb-printful-mockup');
   if(previousImage?.tagName==='IMG'){
    const caption=element.querySelector('figcaption');
    if(caption)caption.textContent=record.error?'Preview unavailable. Tap the handle option to retry.':loading?`Loading ${record.view==='handle-right'?'right':'left'} handle…`:'';
   }
   if(record.imageUrl){
    if(element.dataset.mockupImage===record.imageUrl)continue;
    const image=document.createElement('img');image.className='pb-printful-mockup';image.src=record.imageUrl;image.alt=record.view==='handle-right'?'Printful preview of Santa Pixel and pixelbook ’26, handle on right':'Printful preview of your selected mugshot and caption, handle on left';
    const caption=document.createElement('figcaption');caption.role='status';caption.ariaLive='polite';caption.textContent='';
    if(prepared){
     const cached=controlsFor(element,record);
     const previous=element.querySelector('img.pb-printful-mockup');
     if(previous?.tagName==='IMG'&&cached.controls.isConnected){
      const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
      let ghost;
      if(animate){
       element.querySelectorAll('.pb-mockup-crossfade').forEach(node=>node.remove());
       const r=previous.getBoundingClientRect(),parent=element.getBoundingClientRect();
       ghost=previous.cloneNode();ghost.className='pb-mockup-crossfade';ghost.alt='';ghost.setAttribute('aria-hidden','true');
       const style=getComputedStyle(previous);
       Object.assign(ghost.style,{left:(r.left-parent.left)+'px',top:(r.top-parent.top)+'px',width:r.width+'px',height:r.height+'px',objectFit:style.objectFit,objectPosition:style.objectPosition,clipPath:style.clipPath});
      }
      previous.replaceWith(image);
      if(ghost){
       element.append(ghost);
       const direction=record.view==='handle-right'?1:-1,baseline=getComputedStyle(image).transform,base=baseline&&baseline!=='none'?baseline:'';
       const turn=(degrees,scale=1)=>`perspective(900px) rotateY(${degrees}deg) scale(${scale}) ${base}`;
       const options={duration:440,easing:'cubic-bezier(.2,.75,.25,1)'};
       image.animate([{opacity:0,transform:turn(direction*38,.96)},{opacity:.85,transform:turn(direction*10,.99),offset:.55},{opacity:1,transform:turn(0)}],options);
       ghost.animate([{opacity:1,transform:'perspective(900px) rotateY(0deg)'},{opacity:.8,transform:`perspective(900px) rotateY(${-direction*10}deg)`,offset:.35},{opacity:0,transform:`perspective(900px) rotateY(${-direction*32}deg) scale(.96)`}],options).finished.then(()=>ghost.remove()).catch(()=>ghost.remove());
      }
     }else element.replaceChildren(image,cached.controls,caption);
    }else element.replaceChildren(image,caption);
    element.dataset.mockupImage=record.imageUrl;
   }else{
    if(record.waiting){const status=document.createElement('div');status.className='pb-mockup-wait';status.textContent=record.waitingMessage||'This mug preview is still being prepared. Ready options are available in Customize.';element.replaceChildren(status);}else{const status=element.querySelector('[data-mockup-status]');if(status)status.textContent=record.error||'Preparing your mug preview…';}
   }
  }
 }
 async function accept(record,result){
  if(result.id)record.id=result.id;
  record.nextCheck=Date.now()+Math.max(0,result.retryAfter||0)*1000;
  if(!result.src||record.imageUrl)return;
  if(record.imagePromise){await record.imagePromise;return;}
  record.imagePromise=(async()=>{
   const response=await fetchResponse(result.src),blob=await response.blob();if(disposed)return;
   const url=URL.createObjectURL(blob);urls.add(url);const image=new Image();image.src=url;await image.decode();
   if(disposed){URL.revokeObjectURL(url);urls.delete(url);return;}
   record.src=result.src;record.imageUrl=url;record.error='';record.blob=null;record.loadedAt=Date.now();paint(record);
   if(urls.size>32)for(const stale of [...records.values()].filter(r=>r!==record&&r.imageUrl&&!connected(r)).sort((a,b)=>a.loadedAt-b.loadedAt)){
    URL.revokeObjectURL(stale.imageUrl);urls.delete(stale.imageUrl);stale.imageUrl=null;stale.started=false;stale.lookup=null;if(urls.size<=32)break;
   }
  })();
  try{await record.imagePromise;}finally{record.imagePromise=null;}
 }
 async function lookup(record,design,configuration){
  if(prepared){const saved=prepared.get(key(design,configuration,record.view));if(saved)await accept(record,{id:saved.id,src:saved.src});return;}
  record.lookup??=(async()=>{const result=await request('/lookup',{designId:design.id,configuration});await accept(record,result);})();
  try{await record.lookup;}catch(error){record.lookup=null;throw error;}
 }
 async function run(record,design,configuration){
  if(disposed||!connected(record)){record.started=false;return;}
  if(prepared){const saved=prepared.get(key(design,configuration,record.view));if(!saved){record.waiting=true;record.waitingMessage=[...prepared.values()].some(p=>p.designId===design.id&&p.caption!==design.caption)?'This mugshot was updated. Refresh Pixelbook to load the current preview.':'';paint(record);later(()=>run(record,design,configuration),30000);return;}record.waiting=false;try{await accept(record,{id:saved.id,src:saved.src});}catch(error){record.error=error.message;record.started=false;paint(record);}return;}
  try{
   await lookup(record,design,configuration);if(record.imageUrl){paint(record);return;}
   if(!connected(record)){record.started=false;return;}
   if(record.nextCheck>Date.now()){later(()=>run(record,design,configuration),record.nextCheck-Date.now());return;}
   if(!record.id){
    const style=catalog.styles.find(s=>s.id===configuration.style),variant=style?.variants.find(v=>v.size===configuration.size&&v.color===configuration.color);
    if(!variant?.printWidth||!variant.printHeight)throw new Error('A preview is unavailable for this mug.');
    record.blob??=await renderMugPrint(design,configuration,{...variant,productId:style.productId});if(!connected(record)){record.started=false;return;}
    const form=new FormData();form.append('designId',design.id);form.append('configuration',JSON.stringify(configuration));form.append('artwork',record.blob,'mug-print.png');
    const result=await request('',form);await accept(record,result);if(!record.imageUrl)later(()=>run(record,design,configuration),Math.max(0,result.retryAfter??10)*1000);return;
   }
   const result=await request('/'+record.id);await accept(record,result);
   if(result.status==='failed'){record.id=null;record.lookup=null;throw new Error('Your mug preview could not be prepared.');}
   if(!record.imageUrl)later(()=>run(record,design,configuration),Math.max(1,result.retryAfter??10)*1000);
  }catch(error){
   if(disposed||error.name==='AbortError')return;
   record.error=error.status===429?'Your mug preview is queued…':error.message;paint(record);
   if([429,503].includes(error.status)){later(()=>{record.error='';run(record,design,configuration);},(error.retryAfter||60)*1000);}else record.started=false;
  }
 }
 function update(element,design,configuration){
  if(!element||!catalog||disposed)return;
  for(const record of records.values())record.elements.delete(element);
  const record=recordFor(design,configuration);record.elements.add(element);
  // A refreshed saved catalog can make a waiting preview ready. Resume it now,
  // without requiring a hover/preload or another 30-second retry timer.
  if(record.waiting&&prepared?.has(key(design,configuration,record.view))){record.waiting=false;record.started=false;}
  if(!record.started&&!record.imageUrl){record.error='';record.started=true;later(()=>run(record,design,{...configuration}),0);}
  paint(record);
 }
 function drain(){while(!disposed&&preloadActive<3&&preloadQueue.length){preloadActive++;preloadQueue.shift()().finally(()=>{preloadActive--;drain();});}}
 return {
  configure(value){
   const active=[...records.values()].flatMap(r=>[...r.elements].filter(e=>e.isConnected).map(element=>({element,design:r.design,configuration:r.configuration})));
   if(value.prepared&&!prepared){preloadQueue.length=0;urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();records.clear();}
   catalog=value;prepared=value.prepared?new Map((value.previews||[]).map(p=>[key({id:p.designId,caption:p.caption},p.configuration,p.view||'handle-left'),p])):null;
   for(const item of active){item.element.dataset.mockupImage='';update(item.element,item.design,item.configuration);}
  },
  available(design,configuration){return !prepared||!!savedFor(design,configuration);},
  preparedId(design,configuration){return savedFor(design,configuration)?.id||null;},
  id(design,configuration){return records.get(key(design,configuration,selectedView(design,configuration)))?.id||null;},
  preload(design,configuration){
   if(!catalog||disposed)return;
   if(prepared){
    const selected=selectedView(design,configuration);
    for(const angle of [selected,selected==='handle-left'?'handle-right':'handle-left']){
     if(!prepared.has(key(design,configuration,angle)))continue;
     const record=recordFor(design,configuration,angle);
     if(record.imageUrl||record.warming)continue;
     record.warming=true;
     preloadQueue.push(()=>lookup(record,design,configuration).catch(()=>{}).finally(()=>{record.warming=false;}));
    }
    drain();
   }else lookup(recordFor(design,configuration),design,configuration).catch(()=>{});
  },
  update,
  destroy(){disposed=true;timers.forEach(clearTimeout);controllers.forEach(c=>c.abort());urls.forEach(url=>URL.revokeObjectURL(url));records.clear();}
 };
}
