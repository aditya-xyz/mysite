export function bindAddressAutocomplete({form,person,requestApi,simulated}){
 const input=form.elements.line1,field=input.closest('.field'),modal=form.closest('dialog');
 const area=document.createElement('div');area.className='address-entry';field.before(area);
 const anchor=document.createElement('div');anchor.className='address-search';area.append(anchor);anchor.append(field);
 const wrap=document.createElement('div');wrap.className='address-autocomplete';wrap.hidden=true;
 const list=document.createElement('div');list.id='address-suggestions';list.setAttribute('role','listbox');list.setAttribute('aria-label','Address suggestions');
 const credit=document.createElement('p');credit.className='google-attribution';credit.translate=false;credit.textContent=simulated?'Simulated suggestions':'Google Maps';wrap.append(list,credit);anchor.append(wrap);
 const status=document.createElement('p');status.className='hint address-autocomplete-status';status.setAttribute('role','status');area.append(status);
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
 let timer,controller,revision=0,active=-1,suggestions=[],sessionToken=crypto.randomUUID(),disposed=false;
 function hide(){wrap.hidden=true;active=-1;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
 function highlight(){list.querySelectorAll('[role=option]').forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));if(active>=0){input.setAttribute('aria-activedescendant','address-option-'+active);list.children[active]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 async function choose(index){
  const selection=suggestions[index];if(!selection)return;
  clearTimeout(timer);controller?.abort();controller=new AbortController();const stamp=++revision;hide();status.textContent='Filling address…';
  try{
   const result=await requestApi(`contacts/${person.id}/address/place`,{version:person.version,placeId:selection.placeId,sessionToken,...(form.elements.country?{country:form.elements.country.value}:{})},controller.signal);
   if(disposed||stamp!==revision)return;
   for(const key of ['line1','line2','city','state','postalCode'])form.elements[key].value=result.address[key]||'';
   sessionToken=crypto.randomUUID();status.textContent='Address filled. Add a unit if needed, then verify.';form.elements.line2.focus();
  }catch(error){if(!disposed&&stamp===revision&&error.name!=='AbortError')status.textContent='Suggestions unavailable. Enter the address manually.';}
 }
 form.elements.country?.addEventListener('change',()=>{clearTimeout(timer);controller?.abort();revision++;sessionToken=crypto.randomUUID();hide();status.textContent='';});
 input.addEventListener('input',()=>{
  clearTimeout(timer);controller?.abort();const stamp=++revision;hide();status.textContent='';
  if(input.value.trim().length<3)return;
  timer=setTimeout(async()=>{
   if(disposed||form.querySelector('fieldset').disabled)return;
   controller=new AbortController();
   try{
    const result=await requestApi(`contacts/${person.id}/address/autocomplete`,{version:person.version,input:input.value,sessionToken,...(form.elements.country?{country:form.elements.country.value}:{})},controller.signal);
    if(disposed||stamp!==revision)return;
    suggestions=result.suggestions;list.replaceChildren();
    suggestions.forEach((s,i)=>{const option=document.createElement('button');option.type='button';option.id='address-option-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.tabIndex=-1;option.textContent=s.text;option.onpointerdown=e=>e.preventDefault();option.onclick=()=>choose(i);list.append(option);});
    wrap.hidden=!suggestions.length;input.setAttribute('aria-expanded',String(!!suggestions.length));status.textContent=suggestions.length?`${suggestions.length} address suggestions. Use arrow keys to choose.`:'';
   }catch(error){if(!disposed&&stamp===revision&&error.name!=='AbortError')status.textContent='Suggestions unavailable. Enter the address manually.';}
  },350);
 });
 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'){const wasOpen=!wrap.hidden;clearTimeout(timer);controller?.abort();revision++;hide();if(wasOpen){event.preventDefault();event.stopPropagation();}return;}
  if(wrap.hidden)return;
  if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;highlight();}
  else if(event.key==='Enter'&&active>=0){event.preventDefault();choose(active);}
  else if(event.key==='Tab')hide();
 });
 const outside=event=>{if(!area.contains(event.target))hide();};document.addEventListener('pointerdown',outside);
 function dispose(){if(disposed)return;disposed=true;revision++;clearTimeout(timer);controller?.abort();observer.disconnect();document.removeEventListener('pointerdown',outside);modal?.removeEventListener('close',dispose);}
 const observer=new MutationObserver(()=>{if(!form.isConnected)dispose();else if(form.querySelector('fieldset').disabled){clearTimeout(timer);controller?.abort();revision++;hide();status.textContent='';}});
 observer.observe(modal,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});modal.addEventListener('close',dispose,{once:true});
}
