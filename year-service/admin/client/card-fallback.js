const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value*1000).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
export function lastChoiceDate(cutoff){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts((cutoff-1)*1000).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function mountCardFallback({panel,year,api,toast}){
 const section=document.createElement('section');section.className='panel form-panel card-fallback';
 section.innerHTML=`<div class="row-head"><div><h2>Automatic cards</h2><p class="hint">Choose when gift selection ends. The next morning at 6 a.m. Pacific, eligible households that haven’t ordered get a default Starry Night card.</p></div><span class="badge">Test mode · nothing mailed</span></div><div data-fallback-policy></div><p class="hint">No address + no existing order = no card sent. Mugs are never ordered automatically. Both gift options disappear after the cutoff. Cards over $10 still need your or Angela’s approval.</p><p class="hint" role="status" data-fallback-status></p>`;
 panel.after(section);
 const status=section.querySelector('[data-fallback-status]'),policy=section.querySelector('[data-fallback-policy]');
 async function load(){
  status.textContent='Loading saved cutoff dates…';
  try{
   const data=await api('card-fallback/schedule');if(!section.isConnected)return;
   if(!data.policy){policy.innerHTML='<p class="hint">No automatic card schedule is configured for this edition.</p>';status.textContent='Nothing will be ordered automatically.';return;}
   const values={internationalLastDay:lastChoiceDate(data.policy.international_cutoff),usLastDay:lastChoiceDate(data.policy.us_cutoff)};
   policy.innerHTML=`<form data-cutoff-form><p class="hint"><strong>Last day to choose gifts</strong> · through 11:59 p.m. Pacific</p><div class="form-grid">${[['internationalLastDay','India & Netherlands',data.policy.international_run_at],['usLastDay','United States',data.policy.us_run_at]].map(([key,label,runAt])=>`<label class="field"><span>${label}</span><input type="date" name="${key}" aria-label="${label} cutoff date" value="${values[key]}" min="${year}-01-01" max="${year}-12-31" required ${data.policyEditable?'':'disabled'}><small class="hint">Automatic cards start ${esc(date(runAt))}.</small></label>`).join('')}</div><div class="actions"><button type="submit" class="button" data-save-cutoffs disabled>Save cutoff dates</button></div><p class="hint" role="status" data-cutoff-status>${data.policyEditable?'Dates are saved. You only need to change them if you want a different deadline.':'A cutoff has started. These dates are locked to preserve recorded decisions and existing orders.'}</p></form>`;
   const form=policy.querySelector('form'),save=form.querySelector('[data-save-cutoffs]'),message=form.querySelector('[data-cutoff-status]');
   form.oninput=()=>{const changed=Object.keys(values).some(key=>form.elements.namedItem(key).value!==values[key]);save.disabled=!changed||!data.policyEditable;message.textContent=changed?'Save the dates to update the schedule.':'Dates are saved.';};
   form.onsubmit=async event=>{
    event.preventDefault();save.disabled=true;message.textContent='Saving cutoff dates…';
    try{await api('card-fallback/dates',{internationalLastDay:form.elements.namedItem('internationalLastDay').value,usLastDay:form.elements.namedItem('usLastDay').value,previousPolicy:data.policy});await load();toast('Cutoff dates saved. People and existing orders are unchanged.');}
    catch(error){message.textContent=error.message;save.disabled=false;}
   };
   status.textContent=data.submissionEnabled?'':'Automatic test submission is currently disabled.';
  }catch(error){status.textContent=error.message;}
 }
 load();
}
