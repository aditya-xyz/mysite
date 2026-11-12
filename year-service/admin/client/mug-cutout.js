const jobs=new WeakMap();
let backgroundQueue=Promise.resolve();
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const asPNG=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Could not create a PNG.')),'image/png'));
export const mugCutoutSrc=(year,d)=>`/api/editions/${year}/media/${encodeURIComponent(d.id)}/cutout/${d.cutoutVersion}`;
async function photo(url){
 const response=await fetch(url,{redirect:'error'});if(!response.ok)throw new Error('Could not read this photo. Check your admin sign-in and retry.');
 if(!/^image\//.test(response.headers.get('Content-Type')||''))throw new Error('The photo returned an unexpected response.');
 return createImageBitmap(await response.blob());
}
async function removeBackground(source){
 const small=canvas(320,320),ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,320,320);
 const pixels=ctx.getImageData(0,0,320,320).data,worker=new Worker('/cutout-worker.js',{type:'module'});
 const mask=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('Background removal timed out. Retry or upload a prepared PNG.'));},120000);
  const finish=(error,result)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
  worker.onmessage=e=>e.data.error?finish(new Error(e.data.error)):finish(null,e.data.mask);
  worker.onerror=()=>finish(new Error('Background removal could not start. Retry or upload a prepared PNG.'));
  worker.postMessage({pixels},[pixels.buffer]);
 });
 const maskCanvas=canvas(320,320);maskCanvas.getContext('2d').putImageData(new ImageData(mask,320,320),0,0);
 const scale=Math.min(1,2400/Math.max(source.width,source.height)),out=canvas(Math.round(source.width*scale),Math.round(source.height*scale)),outCtx=out.getContext('2d');
 outCtx.drawImage(source,0,0,out.width,out.height);outCtx.globalCompositeOperation='destination-in';outCtx.drawImage(maskCanvas,0,0,out.width,out.height);
 return asPNG(out);
}
export function cutoutTasks({state,request,changed,render}){
 const tasks=jobs.get(state)||new Map();jobs.set(state,tasks);
 function update(id,patch){const d=state.draft.mugDesigns?.find(d=>d.id===id);if(d)Object.assign(d,patch);render();}
 async function save(id,blob,editable=false){const {version}=await request(`media/${id}/cutout${editable?'?editable=1':''}`,blob);const d=state.draft.mugDesigns?.find(d=>d.id===id);if(d){d.cutoutVersion=version;d.cutoutEditable=editable;d.cutoutStatus='ready';delete d.cutoutError;changed();render();}}
 async function generate(id,force=false){
  if(tasks.has(id))return tasks.get(id);
  const d=state.draft.mugDesigns?.find(d=>d.id===id);if(!d||d.cutoutVersion&&!force)return;
  update(id,{cutoutStatus:'queued',cutoutError:''});
  const task=backgroundQueue.then(async()=>{let source;
   try{
    update(id,{cutoutStatus:'processing',cutoutError:''});
    if(!force){const cached=await request(`media/${id}/cutout`);if(cached.version){const current=state.draft.mugDesigns?.find(d=>d.id===id);if(current){current.cutoutVersion=cached.version;current.cutoutEditable=cached.editable===true;current.cutoutStatus='ready';changed();render();}return;}}
    const media=state.media.find(m=>m.id===id);source=await photo(`/api/editions/${state.year}/media/${id}/${media?.has_original?'original':'preview'}`);
    await save(id,await removeBackground(source),true);
   }catch(error){update(id,{cutoutStatus:'failed',cutoutError:error.message});}finally{source?.close();tasks.delete(id);}
  });backgroundQueue=task.catch(()=>{});tasks.set(id,task);return task;
 }
 async function adjust(id){
  const d=state.draft.mugDesigns?.find(d=>d.id===id);if(!d?.cutoutVersion||tasks.has(id))return;
  let source,cutout;const dialog=document.createElement('dialog');dialog.className='cutout-dialog';document.body.append(dialog);
  try{
   dialog.innerHTML='<h2>Touch up the cutout</h2><p>Restore the bowl, couch, or any detail the cutout missed. Erase removes unwanted background.</p><div class="actions"><button data-brush="restore" aria-pressed="true">Restore</button><button data-brush="erase" aria-pressed="false">Erase</button><label>Brush size <input type="range" min="4" max="120" value="35" aria-label="Brush size"></label><button data-undo disabled>Undo stroke</button></div><div class="cutout-canvas"></div><div class="actions"><button data-save>Save cutout</button><button data-cancel>Cancel</button></div><p class="error" role="alert"></p>';
   dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>{source?.close();cutout?.close();dialog.remove();},{once:true});
   dialog.showModal();
   const media=state.media.find(m=>m.id===id);
   [source,cutout]=await Promise.all([photo(`/api/editions/${state.year}/media/${id}/${media?.has_original?'original':'preview'}`),photo(mugCutoutSrc(state.year,d))]);
   if(!dialog.open){source.close();cutout.close();return;}
   const scale=Math.min(1,1600/Math.max(source.width,source.height)),c=canvas(Math.round(source.width*scale),Math.round(source.height*scale)),ctx=c.getContext('2d',{willReadFrequently:true}),original=canvas(c.width,c.height);
   original.getContext('2d').drawImage(source,0,0,c.width,c.height);ctx.drawImage(cutout,0,0,c.width,c.height);dialog.querySelector('.cutout-canvas').append(c);
   let mode='restore',drawing=false,last=null,undo=null;
   dialog.querySelectorAll('[data-brush]').forEach(b=>b.onclick=()=>{mode=b.dataset.brush;dialog.querySelectorAll('[data-brush]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
   const undoButton=dialog.querySelector('[data-undo]');undoButton.onclick=()=>{if(undo)ctx.putImageData(undo,0,0);undo=null;undoButton.disabled=true;};
   const point=e=>{const r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};};
   const paint=e=>{const p=point(e),radius=Number(dialog.querySelector('input').value)*c.width/c.getBoundingClientRect().width/2,from=last||p,dist=Math.hypot(p.x-from.x,p.y-from.y),n=Math.max(1,Math.ceil(dist/Math.max(1,radius/3)));for(let i=0;i<=n;i++){const x=from.x+(p.x-from.x)*i/n,y=from.y+(p.y-from.y)*i/n;ctx.save();ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.clip();if(mode==='restore'){ctx.globalCompositeOperation='source-over';ctx.drawImage(original,0,0);}else ctx.clearRect(x-radius,y-radius,radius*2,radius*2);ctx.restore();}last=p;};
   c.onpointerdown=e=>{if(e.button!==0)return;undo=ctx.getImageData(0,0,c.width,c.height);undoButton.disabled=false;drawing=true;last=null;c.setPointerCapture(e.pointerId);paint(e);};c.onpointermove=e=>{if(drawing)paint(e);};c.onpointerup=c.onpointercancel=()=>{drawing=false;last=null;};
   dialog.querySelector('[data-save]').onclick=async()=>{const b=dialog.querySelector('[data-save]');b.disabled=true;try{await save(id,await asPNG(c),true);dialog.close();}catch(error){dialog.querySelector('.error').textContent=error.message;b.disabled=false;}};
  }catch(error){dialog.querySelector('.error').textContent=error.message;}
 }
 async function upload(id,file){try{if(!file)return;if(file.size>12*1024*1024)throw new Error('Use a PNG up to 12 MB.');const bitmap=await createImageBitmap(file);try{if(Math.max(bitmap.width,bitmap.height)>4096)throw new Error('Use a PNG up to 4096 pixels per side.');const c=canvas(bitmap.width,bitmap.height);c.getContext('2d').drawImage(bitmap,0,0);const rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let transparent=false;for(let i=3;i<rgba.length;i+=4)if(rgba[i]<255){transparent=true;break;}if(!transparent)throw new Error('This PNG has no transparent pixels.');await save(id,await asPNG(c));}finally{bitmap.close();}}catch(error){update(id,{cutoutError:error.message});}}
 return {generate,adjust,upload};
}
