import {readBlob} from './read-resource.js';
// Private display bytes live only in this tab's memory, never browser storage.
export function createSessionImages({maxBytes=32*1024*1024,maxEntries=64,fetchBlob=readBlob,createURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url),now=()=>Date.now()}={}){
 let scope=null,expiresAt=0,allowed=new Set(),generation=0,bytes=0;const entries=new Map(),pending=new Set();let observer=null;
 const key=source=>String(source);
 function discard(id,entry){if(entries.get(id)!==entry)return;entries.delete(id);entry.controller.abort();if(entry.url)revokeURL(entry.url);bytes-=entry.bytes||0;}
 function clear(){generation++;observer?.disconnect();observer=null;pending.clear();for(const [id,entry]of entries)discard(id,entry);bytes=0;scope=null;expiresAt=0;allowed=new Set();}
 function configure(context,sources,until){const next=new Set(sources.filter(source=>typeof source==='string'&&!/\/original(?:[?#]|$)/.test(source)));const valid=typeof context==='string'&&Number(until)*1000>now();
  if(!valid){clear();return;}if(scope!==context||[...allowed].some(source=>!next.has(source))){clear();scope=context;}allowed=next;expiresAt=Number(until)*1000;
 }
 function eligible(source){if(scope&&now()>=expiresAt)clear();return !!scope&&allowed.has(key(source));}
 function touch(id,entry){entries.delete(id);entries.set(id,entry);}
 function trim(keep){for(const [id,entry]of entries){if(bytes<=maxBytes&&entries.size<=maxEntries)break;if(id!==keep&&entry.blob&&entry.users===0)discard(id,entry);}}
 async function get(source,{signal}={}){
  if(signal?.aborted)throw new DOMException('Closed','AbortError');const id=key(source);if(!eligible(id))return null;
  let entry=entries.get(id);if(!entry){const version=generation;entry={controller:new AbortController(),users:0,bytes:0,blob:null,url:null};entries.set(id,entry);const current=entry;
   current.promise=fetchBlob(source,{signal:current.controller.signal}).then(blob=>{if(generation!==version||entries.get(id)!==current)throw new DOMException('Closed','AbortError');current.blob=blob;current.bytes=blob.size;bytes+=blob.size;trim(id);return current;}).catch(error=>{if([401,403].includes(error.status))clear();else if(entries.get(id)===current)discard(id,current);throw error;});
  }touch(id,entry);entry.users++;
  try{return await new Promise((resolve,reject)=>{const abort=()=>{signal?.removeEventListener('abort',abort);reject(new DOMException('Closed','AbortError'));};signal?.addEventListener('abort',abort,{once:true});entry.promise.then(value=>{signal?.removeEventListener('abort',abort);resolve(value);},error=>{signal?.removeEventListener('abort',abort);reject(error);});});}
  finally{entry.users--;if(!entry.users&&!entry.blob&&entries.get(id)===entry)discard(id,entry);trim(id);}
 }
 async function blob(source,options){const entry=await get(source,options);return entry?entry.blob:fetchBlob(source,options);}
 async function url(source,options){const entry=await get(source,options);if(!entry||entries.get(key(source))!==entry)return source;if(!entry.url)entry.url=createURL(entry.blob);return entry.url;}
 function isUsableURL(url){
  if(!url.startsWith('blob:'))return true;
  if(scope&&now()>=expiresAt)clear();
  for(const entry of entries.values())if(entry.url===url)return true;
  return false;
 }
 function load(image){const source=image.dataset.sessionSrc;delete image.dataset.sessionSrc;url(source).then(value=>{if(image.isConnected){image.dataset.loadedSrc=source;image.src=value;}}).catch(()=>{if(image.isConnected)image.alt=image.alt||'This image could not load. Please try again.';});}
 function bind(root){for(const image of pending)if(!image.isConnected){observer?.unobserve(image);pending.delete(image);}for(const image of root?.querySelectorAll?.('img[data-session-src]')||[]){if(image.loading==='lazy'&&typeof IntersectionObserver!=='undefined'){if(!observer)observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){observer.unobserve(item.target);pending.delete(item.target);load(item.target);}},{rootMargin:'200px'});pending.add(image);observer.observe(image);}else load(image);}}

 return {configure,clear,blob,url,isUsableURL,bind,stats:()=>({entries:entries.size,bytes})};
}
export const sessionImages=createSessionImages();
