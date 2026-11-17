import {bindAddressAutocomplete} from './address-autocomplete.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createDeliveryAddress(changed=()=>{}){
 let state=null,fields={},preview=null,error='',busy=false,controller=null,disposed=false,editing=false;
 async function request(action,data,signal){
  const response=await fetch('/api/delivery-address'+(action?'/'+action:''),{method:data===undefined?'GET':'POST',...(data===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),signal});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not check the address. Please try again.');return result;
 }
 function notify(){if(!disposed)changed();}
 async function run(action){if(busy)return;busy=true;error='';notify();controller?.abort();controller=new AbortController();try{await action(controller.signal);}catch(e){if(e.name!=='AbortError')error=e.message;}finally{busy=false;notify();}}
 async function load(){await run(async signal=>{state=await request('',undefined,signal);preview=null;editing=false;fields={...(state.address||{}),country:state.country||'US'};});}
 function addressMarkup(address,name){return `<address>${esc(name)}<br>${esc(address.line1)}${address.line2?'<br>'+esc(address.line2):''}<br>${esc(address.country==='NL'?`${address.postalCode}  ${address.city}`:`${address.city}, ${address.state} ${address.postalCode}`)}<br>${esc(({US:'United States',IN:'India',NL:'Netherlands'})[address.country]||address.country)}</address>`;}
 function summaryMarkup({showNote=true}={}){return state?.verified?`<section class="delivery-panel delivery-summary" aria-label="Shipping address"><h3>Sending to</h3><div class="delivery-address-row">${addressMarkup(state.address,state.recipientName)}${showNote?(state.country==='US'?'<button type="button" class="button delivery-secondary" data-address-edit>Edit address</button>':'<p class="delivery-note">Contact mom or dad if this address needs to change.</p>'):''}</div></section>`:'';}
 function markup(){
  if(!state)return `<p class="delivery-note">${error?esc(error):'Checking your saved address…'}</p><button type="button" class="text-button" data-address-reload>Try again</button>`;
  if(state.verified&&!editing)return summaryMarkup();
  if(state.country&&state.country!=='US')return '<section class="delivery-panel"><p class="delivery-note">Contact mom or dad to finish your saved mailing address. International addresses are managed by them.</p></section>';
  if(preview)return `<section class="delivery-panel"><h3>Does this address look right?</h3>${addressMarkup(preview.address,state.recipientName)}<p class="delivery-note">${state.previewOnly?'This address is used only in this preview. Your contact record stays unchanged.':'We’ll save this verified address to your contact record for next year.'}</p><div class="delivery-actions"><button type="button" class="button" data-address-save ${busy?'disabled':''}>${state.previewOnly?'Use in preview':'Use address & save'}</button><button type="button" class="button delivery-secondary" data-address-edit ${busy?'disabled':''}>Edit address</button></div>${error?`<p class="error" role="alert">${esc(error)}</p>`:''}</section>`;
  const field=(key,label,autocomplete,required=true,pattern='')=>`<label class="field delivery-field"><span>${label}</span><input name="${key}" autocomplete="${autocomplete}" maxlength="120" value="${esc(fields[key])}" ${required?'required':''} ${pattern?`pattern="${pattern}"`:''}></label>`;
  return `<section class="delivery-panel"><form class="delivery-form"><fieldset ${busy?'disabled':''}><input name="country" type="hidden" value="US">${field('line1','Street address','shipping address-line1')}${field('line2','Apartment / unit (optional)','shipping address-line2',false)}<div class="delivery-row">${field('city','City','shipping address-level2')}${field('state','State','shipping address-level1',true,'[A-Za-z]{2}')}${field('postalCode','ZIP code','shipping postal-code',true,'[0-9]{5}(-[0-9]{4})?')}</div></fieldset>${state.mode==='local_mock'?'<p class="delivery-note">Local simulated verification</p>':''}<div class="delivery-actions"><button type="submit" class="button" ${busy||state.mode==='disabled'?'disabled':''}>${busy?'Checking address…':'Verify & review address'}</button>${state.verified&&editing?`<button type="button" class="button delivery-secondary" data-address-cancel ${busy?'disabled':''}>Cancel edit</button>`:''}</div></form>${state.mode==='disabled'?'<p class="error">Address verification is temporarily unavailable. Please try later.</p>':''}${error?`<p class="error" role="alert">${esc(error)}</p>`:''}</section>`;
 }
 function bind(root){
  root.querySelector('[data-address-reload]')?.addEventListener('click',load);
  root.querySelector('[data-address-edit]')?.addEventListener('click',()=>{if(!editing&&!preview)fields={...(state.address||{}),country:'US'};editing=true;preview=null;error='';notify();});
  root.querySelector('[data-address-cancel]')?.addEventListener('click',()=>{editing=false;preview=null;error='';fields={...(state.address||{}),country:state.country||'US'};notify();});
  root.querySelector('[data-address-save]')?.addEventListener('click',()=>run(async signal=>{state=await request('save',{version:state.version,verify:true,verificationId:preview.verificationId},signal);preview=null;editing=false;fields={...(state.address||{}),country:state.country||'US'};}));
  const form=root.querySelector('.delivery-form');if(!form)return;

  if(state.autocompleteAvailable)bindAddressAutocomplete({form,person:{id:'delivery',version:state.version},simulated:state.mode==='local_mock',requestApi:(path,data,signal)=>request(path.split('/').pop(),data,signal)});
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;fields=Object.fromEntries(new FormData(form));fields.state=fields.state.toUpperCase();run(async signal=>{preview=await request('verify',{version:state.version,address:fields},signal);});};
 }
 async function confirm(){if(!state?.verified||editing)throw new Error('Verify and save your mailing address first.');state=await request('confirm',{version:state.version});return state;}
 return {load,markup,summaryMarkup,bind,confirm,get state(){return state;},get ready(){return !!state?.verified&&!busy&&!editing;},destroy(){disposed=true;controller?.abort();}};
}
