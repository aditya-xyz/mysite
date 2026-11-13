import {renderMugPrint} from '../../web/mug-print.js';
const active=new Map();
const endpoint=(year,suffix='')=>`/api/editions/${year}/mug-preview-library${suffix}`;
async function request(year,suffix='',body){
 const response=await fetch(endpoint(year,suffix),{method:body?'POST':'GET',...(body?{body,headers:{'Content-Type':body instanceof Blob?'image/png':'application/json'}}:{})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not prepare mug previews.');return result;
}
export function ensureMugLibrarySources(year,progress=()=>{}){
 if(active.has(year))return active.get(year);
 const work=(async()=>{
  const library=await request(year),missing=library.plans.filter(p=>!p.ready),images=new Map();let done=library.plans.length-missing.length;
  for(const plan of missing){
   progress(`Preparing caption artwork ${done+1} of ${library.plans.length}…`);
   let image=images.get(plan.src);if(!image){image=new Image();image.src=plan.src;await image.decode();images.set(plan.src,image);}
   const png=await renderMugPrint({src:plan.src,caption:plan.caption},{font:plan.font,style:plan.ink==='light'?'black-glossy':'classic'},{printWidth:1200,printHeight:1200,renderWidth:1200,sourceImage:image});
   await request(year,'/sources/'+plan.id,png);done++;
  }
  await request(year,'/sync','{}');progress('Artwork saved. Printful previews are preparing in the background.');return done;
 })().finally(()=>active.delete(year));active.set(year,work);return work;
}
export function mountMugPreviewLibrary({root,state,toast}){
 const panel=document.createElement('section');panel.className='panel';
 panel.innerHTML='<div class="row-head"><div><h2>Saved mug previews</h2><p class="hint" data-library-count>Checking the preview library…</p></div><button class="secondary" data-prepare-library>Prepare previews</button></div><p class="hint" data-library-progress>Prepares every published photo, caption font and affordable mug option. Nightly sync adds new options. No orders or charges.</p>';
 root.querySelector('.mug-summary')?.after(panel);
 const progress=value=>{if(panel.isConnected)panel.querySelector('[data-library-progress]').textContent=value;};
 async function refresh(){
  try{const value=await request(state.year);if(!panel.isConnected)return;panel.querySelector('[data-library-count]').textContent=`${value.sync?.ready_count||0} / ${value.sync?.desired_count||0} saved previews · ${value.plans.filter(p=>p.ready).length}/${value.plans.length} artwork files prepared`;}
  catch(error){progress(error.message);}
 }
 panel.querySelector('[data-prepare-library]').onclick=async event=>{event.target.disabled=true;try{await ensureMugLibrarySources(state.year,progress);await refresh();toast('Caption artwork saved. Preview preparation continues in the background.');}catch(error){progress(error.message);}finally{if(panel.isConnected)event.target.disabled=false;}};
 refresh();const timer=setInterval(()=>{if(!panel.isConnected)clearInterval(timer);else refresh();},15000);
}
