// One preparation per exact editor snapshot, shared by background work and checkout.
export function createPrintPreviews({debounceMs=1000}={}){
 const files=new WeakMap(),cache=new Map();let nextFile=0,timer=null,scheduledKey=null;
 function key(data){
  if(!data?.file)return null;
  if(!files.has(data.file))files.set(data.file,++nextFile);
  return files.get(data.file)+':'+JSON.stringify(data.recipe);
 }
 function cancelScheduled(){clearTimeout(timer);timer=null;scheduledKey=null;}
 function trim(){for(const [id,record] of cache){if(cache.size<=4)break;if(record.done)cache.delete(id);}}
 function load(data,{retry=false}={}){
  const id=key(data);if(!id)return Promise.reject(new Error('Choose your keepsake first.'));
  if(scheduledKey===id)cancelScheduled();
  const previous=cache.get(id);if(previous&&(!previous.error||!retry))return previous.promise;
  const input={file:data.file,recipe:structuredClone(data.recipe)},controller=new AbortController();
  const record={controller,promise:null,pictures:null,error:null,done:false};cache.set(id,record);
  record.promise=(async()=>{
   try{
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]),form=new FormData();form.set('artwork',input.file);form.set('recipe',JSON.stringify(input.recipe));
    let response=await fetch('/api/print/previews',{method:'POST',body:form,signal}),result=await response.json();
    if(!response.ok)throw new Error(result.error||'The picture previews could not be prepared.');
    while(result.status==='preparing'){
     await new Promise((resolve,reject)=>{const cancel=()=>{clearTimeout(wait);reject(new Error('Preview cancelled.'));};const wait=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},2000);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
     response=await fetch('/api/print/previews/'+result.id,{signal});result=await response.json();if(!response.ok)throw new Error(result.error||'The picture preview could not be loaded.');
    }
    if(result.status!=='ready'||!result.pictures)throw new Error('The picture previews could not be prepared.');
    await Promise.all(['frontSrc','insideSrc','backSrc'].map(async name=>{const image=new Image();image.src=result.pictures[name];await image.decode();}));
    if(signal.aborted)throw new Error('Preview cancelled.');
    record.pictures=result.pictures;return result.pictures;
   }catch(error){record.error=error;throw error;}
   finally{record.done=true;trim();}
  })();
  // Background failures stay quiet; checkout exposes a retry when needed.
  record.promise.catch(()=>{});return record.promise;
 }
 function schedule(data){
  const id=key(data);
  if(!id){cancelScheduled();return;}
  if(scheduledKey===id)return;
  cancelScheduled();if(cache.has(id))return;
  scheduledKey=id;const input={file:data.file,recipe:structuredClone(data.recipe)};
  timer=setTimeout(()=>{timer=null;scheduledKey=null;void load(input).catch(()=>{});},debounceMs);
 }
 return {schedule,load,peek:data=>cache.get(key(data))?.pictures||null,cancelScheduled,close(){cancelScheduled();for(const record of cache.values())record.controller.abort();cache.clear();}};
}
