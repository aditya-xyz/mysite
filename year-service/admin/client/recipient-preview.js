// Separate entry point: only this admin-authenticated page installs the guest API adapter.
const context=new URLSearchParams(location.search),year=context.get('year');
if(!/^\d{4}$/.test(year||''))throw new Error('Choose a scrapbook in admin.');
context.delete('year');
const base=`/api/editions/${year}/recipient-preview/`,nativeFetch=window.fetch.bind(window);
let delivery=null,checked=null;const photoIds=new Set();
const json=(value,status=200)=>Response.json(value,{status});
const remote=(action,init)=>nativeFetch(base+action+'?'+context,init);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin!==location.origin)return json({error:'External requests are disabled in admin preview.'},403);
 if(!url.pathname.startsWith('/api/')||url.pathname.startsWith('/api/editions/'))return nativeFetch(input,init);
 const action=url.pathname.slice(5);
 const original=/^media\/([a-z0-9-]+)\/(original|viewer)$/.exec(action);
 if(original&&photoIds.has(original[1])&&(!init?.method||init.method==='GET'))return nativeFetch(`/api/editions/${year}/media/${original[1]}/${original[2]}`,init);
 if(action==='delivery-address'){
  if(!delivery){const response=await remote(action,init);if(!response.ok)return response;delivery=await response.json();}return json(delivery);
 }
 if(action==='delivery-address/verify'){
  const response=await remote(action,init);if(!response.ok)return response;checked=await response.json();return json(checked);
 }
 if(action==='delivery-address/save'){
  if(!checked||!delivery)return json({error:'Check the address first.'},409);
  delivery={...delivery,verified:true,address:checked.address};checked=null;return json(delivery);
 }
 if((['journal','gift/deadline','gift/status','gift/catalog','print/status','print/digital'].includes(action)||/^print\/digital\/(image|default\/(starry-night|evergreen|winterlight))$/.test(action))&&(!init?.method||init.method==='GET'))return remote(action,init);
 return json({error:'Admin preview: orders, texts and contact changes are disabled.'},403);
};
const response=await remote('journal');
if(!response.ok){document.querySelector('#app').textContent=(await response.json()).error;}
else{
 const journal=await response.json();journal.photos.forEach(photo=>photoIds.add(photo.id));
 const banner=document.createElement('aside');banner.className='admin-preview-banner';banner.setAttribute('aria-label','Admin preview');
 const label=document.createElement('strong');label.textContent=`Preview for ${journal.name} · ${year}`;
 const note=document.createElement('span');note.textContent='Saved draft · Fresh gift flow · No texts, contact changes or orders';
 const back=document.createElement('a');back.href=`/#scrapbooks/${year}/preview`;back.textContent='Back to studio';banner.append(label,note,back);document.body.prepend(banner);
 // Reuse the loaded journal while the real guest renderer starts.
 const fetchAdapter=window.fetch;window.fetch=(input,init)=>input==='/api/journal'?Promise.resolve(json(journal)):fetchAdapter(input,init);
 await import('../../web/app.js');
}
