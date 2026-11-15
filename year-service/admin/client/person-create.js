import {bindAddressAutocomplete} from './address-autocomplete.js';
import {countryNames,contactAddressFields,contactAddressValues,contactMailingAddress,mailingLabel} from './contact-address.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function openPersonCreate({name='',photoId='',showModal,requestApi,onSaved}){
 const draftKey=crypto.randomUUID(),controller=new AbortController();
 let config={mode:'loading'},busy=false,suggestion=null,original=null,country='US',autocomplete=null;
 const drafts={};
 showModal(`<p class="kicker">People directory</p><h2>Add a person</h2><form id="person-form" class="person-create-form"><fieldset data-person-fields><label class="field"><span>Name</span><input name="name" value="${esc(name)}" required maxlength="100" autocomplete="off"></label><label class="field"><span>Phone, optional · include country code</span><input name="phone" type="tel" placeholder="+1, +91 or +31…" autocomplete="off"></label></fieldset><label class="person-address-toggle"><input type="checkbox" name="withAddress" checked> Add a mailing address</label><fieldset class="address-fields" data-address-fields><label class="field"><span>Country</span><select name="country">${Object.entries(countryNames).map(([code,label])=>`<option value="${code}">${label}</option>`).join('')}</select></label><div data-country-fields>${contactAddressFields('US')}</div><p class="hint" data-country-note></p></fieldset><p class="notice" data-verification-note role="status">Checking address verification availability…</p><div data-address-review hidden></div><p class="hint">Saves them to People${photoId?' and selects them for this photo':''}. Only the verification contact needs a phone number. Adding a person doesn’t send a text, create an invitation, or enable gifts.</p><div class="actions" data-create-actions><button class="button" type="submit" value="verify" disabled>Check & review address</button><button class="secondary" type="submit" value="save">Save without checking</button></div><p class="error" id="modal-error" role="alert"></p></form>`);
 const form=document.querySelector('#person-form'),modal=form.closest('dialog'),fields=form.querySelector('[data-address-fields]'),body=form.querySelector('[data-country-fields]'),review=form.querySelector('[data-address-review]'),actions=form.querySelector('[data-create-actions]'),error=form.querySelector('#modal-error');
 const withAddress=form.elements.withAddress;
 const read=()=>Object.fromEntries(new FormData(form));
 function note(){
  form.querySelector('[data-country-note]').textContent=country==='IN'?'India validation is in preview. If Google cannot confirm your address, save without checking and review it later. Include a delivery phone before shipping.':country==='NL'?'Keep the house number addition intact. A province is not needed.':'Include your apartment or unit where applicable.';
 }
 function ready(){
  form.querySelector('[data-person-fields]').disabled=busy;
  withAddress.disabled=busy||!!suggestion;form.elements.country.disabled=busy||!!suggestion;
  fields.disabled=busy||!withAddress.checked||!!suggestion;
  fields.hidden=!withAddress.checked||!!suggestion;
  form.querySelector('[data-verification-note]').hidden=!withAddress.checked||!!suggestion;
  actions.hidden=!!suggestion;
  actions.querySelector('[value="verify"]').disabled=busy||withAddress.checked&&['loading','disabled'].includes(config.mode);
  actions.querySelector('[value="verify"]').textContent=withAddress.checked?'Check & review address':photoId?'Add & select person':'Add person';
  actions.querySelector('[value="save"]').hidden=!withAddress.checked;
  form.querySelectorAll('button').forEach(button=>{if(!actions.contains(button))button.disabled=busy;});
  actions.querySelector('[value="save"]').disabled=busy;
 }
 function bindSuggestions(){
  autocomplete?.destroy();autocomplete=null;
  if(!config.autocompleteAvailable)return;
  autocomplete=bindAddressAutocomplete({form,person:{id:'new',version:0},simulated:config.mode==='local_mock',requestApi:(path,data,signal)=>requestApi(path,{...data,draftKey},signal),onAddress:address=>{
   const values=contactAddressValues(address);
   for(const key of ['line1','line2','city','state','postalCode','houseNumber','addition'])if(form.elements[key])form.elements[key].value=values[key]||'';
  }});
 }
 withAddress.onchange=()=>{error.textContent='';ready();};
 form.elements.country.addEventListener('change',()=>{
  drafts[country]=read();country=form.elements.country.value;
  autocomplete?.destroy();body.innerHTML=contactAddressFields(country,drafts[country]||{});suggestion=null;error.textContent='';note();bindSuggestions();
 });
 function showReview(){
  fields.disabled=true;fields.hidden=true;actions.hidden=true;review.hidden=false;
  review.innerHTML=`<div class="address-suggestion"><p class="kicker">${suggestion.simulated?'Simulated recommendation':'Google Maps recommended address'}</p><h3>Review the mailing address</h3><div class="contact-address-comparison"><section><h4>You entered</h4><address>${mailingLabel(original)}</address></section><section><h4>${suggestion.simulated?'Recommendation':'Google recommends'}</h4><address>${mailingLabel(suggestion.address)}</address></section></div><p class="hint">Check every line, especially unit and house number additions. This recommendation expires in 15 minutes.</p><div class="actions"><button class="button" type="submit" value="accept">Accept & ${photoId?'add and select person':'add person'}</button><button class="secondary" type="button" data-edit-new-address>Edit address</button></div>${suggestion.simulated?'':'<p class="google-attribution" translate="no">Google Maps</p>'}</div>`;
  review.querySelector('[data-edit-new-address]').onclick=()=>{suggestion=null;review.hidden=true;review.textContent='';error.textContent='';ready();form.elements.line1.focus();};
  ready();review.querySelector('button').focus();
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const choice=event.submitter?.value||'verify',person={name:form.elements.name.value,phone:form.elements.phone.value};
  error.textContent='';
  try{
   let address=null;
   if(withAddress.checked&&choice!=='accept')address=contactMailingAddress(country,read());
   busy=true;ready();
   if(choice==='verify'&&withAddress.checked){
    original=address;suggestion=await requestApi('contacts/new/address/verify',{draftKey,address},controller.signal);
    if(!form.isConnected)return;showReview();
   }else{
    const data={...person,draftKey,verify:choice==='accept',...(choice==='accept'?{verificationId:suggestion.verificationId}:{address})};
    const result=await requestApi('contacts',data,controller.signal);
    if(!form.isConnected)return;onSaved(result.person);
   }
  }catch(reason){if(reason.name!=='AbortError'&&form.isConnected)error.textContent=reason.message;}
  finally{busy=false;if(form.isConnected){ready();if(choice==='verify'&&suggestion)review.querySelector('button').focus();}}
 };
 modal.addEventListener('close',()=>{controller.abort();autocomplete?.destroy();},{once:true});
 note();ready();
 requestApi('address-verification/settings',undefined,controller.signal).then(settings=>{
  if(!form.isConnected)return;config=settings;
  form.querySelector('[data-verification-note]').textContent=config.mode==='google'?'Google checks your address after you choose Check & review. Review the recommendation before saving. Verification lasts 28 days.':config.mode==='local_mock'?'Local preview: recommendations are simulated. No Google request is sent.':'Google verification is unavailable. You can save without checking.';
  ready();bindSuggestions();
 }).catch(reason=>{if(reason.name!=='AbortError'&&form.isConnected){config={mode:'disabled'};form.querySelector('[data-verification-note]').textContent='Google verification is unavailable. You can save without checking.';ready();}});
}
