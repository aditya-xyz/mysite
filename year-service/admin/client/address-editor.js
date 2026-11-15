import {bindAddressAutocomplete} from './address-autocomplete.js';
import {countryNames,contactAddressFields,contactAddressValues,contactMailingAddress,mailingLabel} from './contact-address.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function addressIsCurrent(person){return !!person?.address_verified&&(person.address_verifier==='local_mock'||person.address_verifier==='admin'&&(()=>{try{return JSON.parse(person.mailing_address).country==='IN';}catch{return false;}})()||person.address_verifier==='google'&&person.address_verified_until>Date.now()/1000&&person.address_verified_at+28*86400>Date.now()/1000);}

export function openAddressEditor({person,config,requestApi,showModal,onSaved}){
 let original={country:'US'};try{original=JSON.parse(person.mailing_address)||original;}catch{}
 if(!countryNames[original.country])original={...original,country:'US'};
 let country=original.country,suggestion=null,entered=null,busy=false,autocomplete=null;
 const drafts={[country]:contactAddressValues(original)},controller=new AbortController();
 showModal(`<p class="kicker">People · Mailing address</p><h2>${esc(person.name)}</h2><p class="hint" data-address-intro>The phone-verification contact receives the household’s gift. Review the recommended address before saving it.</p><form id="address-form" class="person-create-form"><fieldset class="address-fields"><label class="field"><span>Country</span><select name="country">${Object.entries(countryNames).map(([code,name])=>`<option value="${code}" ${country===code?'selected':''}>${name}</option>`).join('')}</select></label><div data-country-fields>${contactAddressFields(country,drafts[country])}</div><p class="hint" data-country-note></p></fieldset><p class="notice" data-verification-note>${config.mode==='google'?'Google checks the selected country’s address; USPS checks apply to US addresses. Verification lasts 28 days; address edits require a new check.':config.mode==='local_mock'?'Local preview · Recommendations are simulated. No address is sent to Google.':'Google verification is unavailable. You can save without checking.'}</p>${config.mode==='google'?`<p class="hint" data-verification-quota>Verification requests: ${config.usage?.today||0} / ${config.limits.daily} today · ${config.usage?.month||0} / ${config.limits.monthly} this month. UTC reset.</p>`:''}<div class="actions" data-address-actions><button class="button" type="submit" name="action" value="verify" ${config.mode==='disabled'?'disabled':''}>Check & review address</button><button class="secondary" type="submit" name="action" value="save">Save without checking</button>${person.mailing_address?'<button class="quiet danger" type="button" data-clear-address>Delete address</button>':''}</div><div id="address-suggestion" hidden></div><p class="error" role="alert" id="address-error"></p></form>`);
 const form=document.querySelector('#address-form'),modal=form.closest('dialog'),fields=form.querySelector('fieldset'),body=form.querySelector('[data-country-fields]'),review=form.querySelector('#address-suggestion'),actions=form.querySelector('[data-address-actions]'),error=form.querySelector('#address-error');
 const read=()=>Object.fromEntries(new FormData(form));
 function note(){form.querySelector('[data-address-intro]').textContent=country==='IN'?'Enter the mailing address exactly as provided.':'The phone-verification contact receives the household’s gift. Review the recommended address before saving it.';const quota=form.querySelector('[data-verification-quota]');if(quota)quota.hidden=country==='IN';form.querySelector('[data-verification-note]').hidden=country==='IN';form.querySelector('[data-country-note]').textContent=country==='IN'?'Enter the address exactly as provided. Google checking and suggestions are disabled for India.':country==='NL'?'Keep the house number addition intact. A province is not needed.':'Include the apartment or unit where applicable.';}
 function ready(){
  fields.disabled=busy||!!suggestion;fields.hidden=!!suggestion;actions.hidden=!!suggestion;
  form.querySelectorAll('button').forEach(button=>button.disabled=busy);
  actions.querySelector('[value="verify"]').hidden=country==='IN';
  actions.querySelector('[value="save"]').textContent=country==='IN'?'Save address':'Save without checking';
  actions.querySelector('[value="verify"]').disabled=busy||config.mode==='disabled';
 }
 function bindSuggestions(){
  autocomplete?.destroy();autocomplete=null;
  if(config.autocompleteAvailable&&country!=='IN')autocomplete=bindAddressAutocomplete({form,person,requestApi,simulated:config.mode==='local_mock',onAddress:address=>{
   const values=contactAddressValues(address);
   for(const key of ['line1','line2','city','state','postalCode','houseNumber','addition'])if(form.elements[key])form.elements[key].value=values[key]||'';
  }});
 }
 form.elements.country.addEventListener('change',()=>{
  drafts[country]=read();country=form.elements.country.value;
  autocomplete?.destroy();body.innerHTML=contactAddressFields(country,drafts[country]||{});suggestion=null;error.textContent='';note();bindSuggestions();ready();
 });
 function done(result,message){if(form.isConnected)onSaved(result,message);}
 form.querySelector('[data-clear-address]')?.addEventListener('click',()=>{
  if(busy)return;autocomplete?.destroy();controller.abort();
  showModal(`<p class="kicker">People · Mailing address</p><h2>Delete ${esc(person.name)}’s address?</h2><p>This removes their saved address and verification. They’ll need to enter and verify an address before ordering a gift. Existing orders keep their original shipping details.</p><div class="actions"><button class="quiet danger" data-confirm-clear>Delete address</button><button class="secondary" data-cancel-clear>Cancel</button></div><p class="error" role="alert" id="clear-address-error"></p>`);
  document.querySelector('[data-cancel-clear]').onclick=()=>openAddressEditor({person,config,requestApi,showModal,onSaved});
  document.querySelector('[data-confirm-clear]').onclick=async event=>{
   const confirm=event.currentTarget;confirm.disabled=true;
   try{onSaved(await requestApi(`contacts/${person.id}/address/clear`,{version:person.version}),'Address deleted.');}
   catch(reason){if(confirm.isConnected){document.querySelector('#clear-address-error').textContent=reason.message;confirm.disabled=false;}}
  };
 });
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const choice=country==='IN'?'save':event.submitter?.value||'verify';error.textContent='';
  try{
   // Read editable fields before disabling them; FormData omits disabled fields.
   const address=choice==='accept'?null:contactMailingAddress(country,read());
   busy=true;ready();
   if(choice==='accept'){
    done(await requestApi(`contacts/${person.id}/address`,{version:person.version,verify:true,verificationId:suggestion.verificationId},controller.signal));return;
   }
   if(choice==='save'){
    done(await requestApi(`contacts/${person.id}/address`,{version:person.version,verify:false,address},controller.signal));return;
   }
   entered=address;suggestion=await requestApi(`contacts/${person.id}/address/verify`,{version:person.version,address},controller.signal);
   if(!form.isConnected||!modal.open)return;
   review.hidden=false;
   review.innerHTML=`<div class="address-suggestion"><p class="kicker">${suggestion.simulated?'Simulated recommendation':'Google Maps recommended address'}</p><h3>Review the mailing address</h3><div class="contact-address-comparison"><section><h4>You entered</h4><address>${mailingLabel(entered)}</address></section><section><h4>${suggestion.simulated?'Recommendation':'Google recommends'}</h4><address>${mailingLabel(suggestion.address)}</address></section></div><p class="hint">Check every line, especially unit and house number additions. This recommendation expires in 15 minutes.</p><div class="actions"><button class="button" type="submit" name="action" value="accept">Use address & save</button><button class="secondary" type="button" data-edit-address>Edit address</button></div>${suggestion.simulated?'':'<p class="google-attribution" translate="no">Google Maps</p>'}</div>`;
   review.querySelector('[data-edit-address]').onclick=()=>{suggestion=null;review.hidden=true;review.textContent='';error.textContent='';ready();form.elements.line1.focus();};
  }catch(reason){if(reason.name!=='AbortError'&&form.isConnected)error.textContent=reason.message;}
  finally{busy=false;if(form.isConnected){ready();if(choice==='verify'&&suggestion)review.querySelector('button')?.focus();}}
 };
 modal.addEventListener('close',()=>{controller.abort();autocomplete?.destroy();},{once:true});
 note();bindSuggestions();ready();
}

export function mountAddressEditor({app,contacts,requestApi,showModal,updateContacts,mark,render,toast,state}){
 const settings=requestApi('address-verification/settings').catch(()=>({mode:'disabled'}));
 function bind(){app.querySelectorAll('[data-edit-contact]').forEach(button=>{
  const person=contacts.find(p=>p.id===button.dataset.editContact),row=button.closest('.person');if(row.querySelector('[data-address]'))return;
  const action=document.createElement('button');action.className='secondary';action.dataset.address=person.id;
  action.textContent=person.mailing_address?'Edit address':'Mailing address';row.append(action);
  action.onclick=async()=>openAddressEditor({person,config:await settings,requestApi,showModal,onSaved:(result,message)=>{
   updateContacts(result.person);document.querySelector('#modal').close();if(state)mark();render();toast(message||(result.simulated?'Address saved with simulated verification. No Google request was sent.':result.person.address_verifier==='admin'?'Address saved as entered. Google was not used.':result.person.address_verified?'Verified address saved. Print permission is managed separately.':'Address saved unverified.'));
  }});
 });}
 bind();document.querySelector('#directory-search')?.addEventListener('input',bind);
}
