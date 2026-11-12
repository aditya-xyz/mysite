import {renderMugPrint} from './mug-print.js';
export function createMugMockups(){
 const records=new Map(),timers=new Set(),controllers=new Set();let catalog=null,disposed=false;
 const key=(design,options)=>JSON.stringify([design.id,design.caption,options]);
 function later(action,ms){const timer=setTimeout(()=>{timers.delete(timer);if(!disposed)action();},ms);timers.add(timer);}
 async function request(path,body){
  const controller=new AbortController();controllers.add(controller);
  try{const response=await fetch('/api/gift/mockup'+path,{method:body?'POST':'GET',...(body?{body}:{}),signal:controller.signal});const result=await response.json();if(!response.ok){const error=new Error(result.error||'The realistic preview is temporarily unavailable.');error.status=response.status;throw error;}return result;}
  finally{controllers.delete(controller);}
 }
 function paint(record){
  for(const element of record.elements){
   if(!element.isConnected){record.elements.delete(element);continue;}
   if(record.src){
    const image=document.createElement('img');image.className='pb-printful-mockup';image.src=record.src;image.alt='Printful preview of your selected photo, caption and mug';
    const caption=document.createElement('figcaption');caption.textContent='Printful mockup · final placement may vary';element.replaceChildren(image,caption);
   }else{
    let status=element.querySelector('.pb-mockup-status');if(!status){status=document.createElement('span');status.className='pb-mockup-status';status.setAttribute('role','status');element.append(status);}
    status.textContent=record.error||'Preparing your Printful preview…';
   }
  }
 }
 async function run(record,design,configuration){
  if(disposed||![...record.elements].some(e=>e.isConnected)){record.started=false;return;}
  try{
   if(!record.id){
    const style=catalog.styles.find(s=>s.id===configuration.style),variant=style?.variants.find(v=>v.size===configuration.size&&v.color===configuration.color);
    if(!variant?.printWidth||!variant.printHeight)throw new Error('A realistic preview is unavailable for this mug.');
    const blob=record.blob||await renderMugPrint(design,configuration,variant);record.blob=blob;
    const form=new FormData();form.append('designId',design.id);form.append('configuration',JSON.stringify(configuration));form.append('artwork',blob,'mug-print.png');
    const result=await request('',form);record.id=result.id;if(result.src){record.src=result.src;record.blob=null;paint(record);return;}
    later(()=>run(record,design,configuration),Math.max(10,result.retryAfter||10)*1000);return;
   }
   const result=await request('/'+record.id);
   if(result.status==='ready'){record.src=result.src;record.blob=null;paint(record);}
   else if(result.status==='failed'){record.id=null;throw new Error('Printful could not prepare this preview.');}
   else later(()=>run(record,design,configuration),Math.max(10,result.retryAfter||10)*1000);
  }catch(error){
   if(disposed||error.name==='AbortError')return;
   record.error=error.status===429?'Your Printful preview is queued…':error.message;paint(record);
   if([429,503].includes(error.status)){later(()=>{record.error='';run(record,design,configuration);},60000);}else record.started=false;
  }
 }
 return {
  configure(value){catalog=value;},
  id(design,configuration){return records.get(key(design,configuration))?.id||null;},
  update(element,design,configuration){
   if(!element||!catalog||disposed)return;
   const id=key(design,configuration);let record=records.get(id);if(!record){record={elements:new Set(),started:false};records.set(id,record);}
   record.elements.add(element);paint(record);
   if(!record.started&&!record.src){record.started=true;later(()=>run(record,design,{...configuration}),700);}
  },
  destroy(){disposed=true;timers.forEach(clearTimeout);controllers.forEach(c=>c.abort());records.clear();}
 };
}
