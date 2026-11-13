import {renderMugPrint} from './mug-print.js';
export function createMugMockups(){
 const records=new Map(),timers=new Set(),controllers=new Set(),urls=new Set();let catalog=null,disposed=false;let prepared=null;const preloadQueue=[];let preloadActive=0;
 const key=(design,options)=>JSON.stringify([design.id,design.caption,options]);
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
 function recordFor(design,options){const id=key(design,options);let record=records.get(id);if(!record){record={elements:new Set(),started:false};records.set(id,record);}return record;}
 function paint(record){
  for(const element of record.elements){
   if(!element.isConnected){record.elements.delete(element);continue;}
   if(record.imageUrl){
    if(element.dataset.mockupImage===record.imageUrl)continue;
    const image=document.createElement('img');image.className='pb-printful-mockup';image.src=record.imageUrl;image.alt='Printful preview of your selected photo, caption and mug';
    const caption=document.createElement('figcaption');caption.textContent='Printful mockup · final placement may vary';element.replaceChildren(image,caption);element.dataset.mockupImage=record.imageUrl;
   }else{
    const status=element.querySelector('[data-mockup-status]');if(status)status.textContent=record.error||'Preparing your mug preview…';
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
   record.src=result.src;record.imageUrl=url;record.blob=null;record.loadedAt=Date.now();paint(record);
   if(urls.size>32)for(const stale of [...records.values()].filter(r=>r!==record&&r.imageUrl&&!connected(r)).sort((a,b)=>a.loadedAt-b.loadedAt)){
    URL.revokeObjectURL(stale.imageUrl);urls.delete(stale.imageUrl);stale.imageUrl=null;stale.started=false;stale.lookup=null;if(urls.size<=32)break;
   }
  })();
  try{await record.imagePromise;}finally{record.imagePromise=null;}
 }
 async function lookup(record,design,configuration){
  if(prepared){const saved=prepared.get(key(design,configuration));if(saved)await accept(record,{id:saved.id,src:saved.src});return;}
  record.lookup??=(async()=>{const result=await request('/lookup',{designId:design.id,configuration});await accept(record,result);})();
  try{await record.lookup;}catch(error){record.lookup=null;throw error;}
 }
 async function run(record,design,configuration){
  if(prepared){const saved=prepared.get(key(design,configuration));if(!saved){record.error='This preview is being prepared.';paint(record);record.started=false;return;}try{await accept(record,{id:saved.id,src:saved.src});}catch(error){record.error=error.message;record.started=false;paint(record);}return;}
  if(disposed||!connected(record)){record.started=false;return;}
  try{
   await lookup(record,design,configuration);if(record.imageUrl){paint(record);return;}
   if(!connected(record)){record.started=false;return;}
   if(record.nextCheck>Date.now()){later(()=>run(record,design,configuration),record.nextCheck-Date.now());return;}
   if(!record.id){
    const style=catalog.styles.find(s=>s.id===configuration.style),variant=style?.variants.find(v=>v.size===configuration.size&&v.color===configuration.color);
    if(!variant?.printWidth||!variant.printHeight)throw new Error('A preview is unavailable for this mug.');
    record.blob??=await renderMugPrint(design,configuration,variant);if(!connected(record)){record.started=false;return;}
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
 function drain(){while(!disposed&&preloadActive<3&&preloadQueue.length){preloadActive++;preloadQueue.shift()().finally(()=>{preloadActive--;drain();});}}
 return {
  configure(value){catalog=value;prepared=value.prepared?new Map((value.previews||[]).map(p=>[key({id:p.designId,caption:p.caption},p.configuration),p])):null;},
  preparedId(design,configuration){return prepared?.get(key(design,configuration))?.id||null;},
  id(design,configuration){return records.get(key(design,configuration))?.id||null;},
  preload(design,configuration){if(!catalog||disposed)return;const record=recordFor(design,configuration);if(prepared){if(record.imageUrl||record.warming)return;record.warming=true;preloadQueue.push(()=>lookup(record,design,configuration).catch(()=>{}).finally(()=>{record.warming=false;}));drain();}else lookup(record,design,configuration).catch(()=>{});},
  update(element,design,configuration){
   if(!element||!catalog||disposed)return;
   const record=recordFor(design,configuration);record.elements.add(element);paint(record);
   if(!record.started&&!record.imageUrl){record.started=true;later(()=>run(record,design,{...configuration}),0);}
  },
  destroy(){disposed=true;timers.forEach(clearTimeout);controllers.forEach(c=>c.abort());urls.forEach(url=>URL.revokeObjectURL(url));records.clear();}
 };
}
