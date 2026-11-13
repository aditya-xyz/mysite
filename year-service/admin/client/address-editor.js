import {bindAddressAutocomplete} from './address-autocomplete.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function addressIsCurrent(person){return !!person?.address_verified&&(person.address_verifier==='local_mock'||person.address_verifier==='google'&&person.address_verified_until>Date.now()/1000&&person.address_verified_at+28*86400>Date.now()/1000);}
export function mountAddressEditor({app,contacts,requestApi,showModal,updateContacts,mark,render,toast,state}){
 const settings=requestApi('address-verification/settings').catch(()=>({mode:'disabled'}));
 function bind(){app.querySelectorAll('[data-edit-contact]').forEach(button=>{
  const person=contacts.find(p=>p.id===button.dataset.editContact),row=button.closest('.person');if(row.querySelector('[data-address]'))return;
  const action=document.createElement('button');action.className='secondary';action.dataset.address=person.id;
  action.textContent=person.mailing_address?'Edit address':'Mailing address';row.append(action);
  action.onclick=async()=>{
   const config=await settings;let original={country:'US'};try{original=JSON.parse(person.mailing_address)||original;}catch{}
   let suggestion=null;
   showModal(`<p class="kicker">People · Mailing address</p><h2>${esc(person.name)}</h2><p class="hint">US only. The phone-verification contact receives the household’s print. Review the recommended address before saving it.</p><form id="address-form"><fieldset class="address-fields">${[['line1','Street address'],['line2','Apartment / unit (optional)'],['city','City'],['state','State (two letters)'],['postalCode','ZIP code']].map(([key,label])=>`<label class="field"><span>${label}</span><input name="${key}" value="${esc(original[key])}" maxlength="${key==='state'?2:120}" ${key==='line2'?'':'required'}></label>`).join('')}</fieldset><p class="notice">${config.mode==='google'?'Google checks the address against USPS data. Verification lasts 28 days; address edits require a new check.':config.mode==='local_mock'?'Local preview · Suggestions are simulated. No address is sent to Google.':'Google address verification is not configured. You can save an unverified address for now.'}</p>${config.mode==='google'?`<p class="hint">Verification requests: ${config.usage?.today||0} / ${config.limits.daily} today · ${config.usage?.month||0} / ${config.limits.monthly} this month. UTC reset.</p>`:''}<div class="actions" data-address-actions><button class="button" type="submit" name="action" value="verify" ${config.mode==='disabled'?'disabled':''}>Verify & review</button><button class="secondary" type="submit" name="action" value="save">Save unverified</button>${person.mailing_address?'<button class="quiet danger" type="button" data-clear-address>Delete address</button>':''}</div><div id="address-suggestion" hidden></div><p class="error" role="alert" id="address-error"></p></form>`);
   const form=document.querySelector('#address-form'),fields=form.querySelector('fieldset'),review=form.querySelector('#address-suggestion'),actions=form.querySelector('[data-address-actions]'),error=form.querySelector('#address-error');
   function ready(){form.querySelectorAll('button').forEach(b=>b.disabled=false);actions.querySelector('[value="verify"]').disabled=config.mode==='disabled';}
   function done(result,message){updateContacts(result.person);document.querySelector('#modal').close();if(state)mark();render();toast(message||(result.simulated?'Address saved with simulated verification. No Google request was sent.':result.person.address_verified?'Verified address saved. Print permission is managed separately.':'Address saved unverified.'));}
   form.querySelector('[data-clear-address]')?.addEventListener('click',()=>{
    showModal(`<p class="kicker">People · Mailing address</p><h2>Delete ${esc(person.name)}’s address?</h2><p>This removes their saved address and verification. They’ll need to enter and verify an address before ordering a gift. Existing orders keep their original shipping details.</p><div class="actions"><button class="quiet danger" data-confirm-clear>Delete address</button><button class="secondary" data-cancel-clear>Cancel</button></div><p class="error" role="alert" id="clear-address-error"></p>`);
    document.querySelector('[data-cancel-clear]').onclick=()=>action.click();
    document.querySelector('[data-confirm-clear]').onclick=async event=>{
     const confirm=event.currentTarget;confirm.disabled=true;
     try{done(await requestApi(`contacts/${person.id}/address/clear`,{version:person.version}),'Address deleted.');}
     catch(reason){document.querySelector('#clear-address-error').textContent=reason.message;confirm.disabled=false;}
    };
   });
   if(config.autocompleteAvailable)bindAddressAutocomplete({form,person,requestApi,simulated:config.mode==='local_mock'});
   form.onsubmit=async event=>{
    event.preventDefault();error.textContent='';const choice=event.submitter?.value||'verify';
    form.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
     if(choice==='accept'){
      done(await requestApi(`contacts/${person.id}/address`,{version:person.version,verify:true,verificationId:suggestion.verificationId}));return;
     }
     const address={...Object.fromEntries(new FormData(form)),country:'US'};address.state=address.state?.trim().toUpperCase();
     if(choice==='save'){done(await requestApi(`contacts/${person.id}/address`,{version:person.version,verify:false,address}));return;}
     suggestion=await requestApi(`contacts/${person.id}/address/verify`,{version:person.version,address});
     const a=suggestion.address;fields.disabled=true;fields.hidden=true;actions.hidden=true;review.hidden=false;
     review.innerHTML=`<div class="address-suggestion"><p class="kicker">${suggestion.simulated?'Simulated recommendation':'Google Maps recommended address'}</p><h3>Use this address?</h3><address>${[a.line1,a.line2,`${a.city}, ${a.state} ${a.postalCode}`,'US'].filter(Boolean).map(esc).join('<br>')}</address><p class="hint">Confirm this is the mailing address you want saved for ${esc(person.name)}. This suggestion expires in 15 minutes.</p><div class="actions"><button class="button" type="submit" name="action" value="accept">Use address & save</button><button class="secondary" type="button" data-edit-address>Edit address</button></div>${suggestion.simulated?'':'<p class="google-attribution" translate="no">Google Maps</p>'}</div>`;
     ready();review.querySelector('[data-edit-address]').onclick=()=>{suggestion=null;review.hidden=true;review.textContent='';fields.disabled=false;fields.hidden=false;actions.hidden=false;error.textContent='';fields.querySelector('input').focus();};review.querySelector('button').focus();
    }catch(reason){error.textContent=reason.message;ready();}
   };
  };
 });}
 bind();document.querySelector('#directory-search')?.addEventListener('input',bind);
}
