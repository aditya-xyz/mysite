const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value*1000).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
export function lastChoiceDate(cutoff){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts((cutoff-1)*1000).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function fallbackReport(rows){
 const groups=new Map();
 const rank=row=>['scheduled','due'].includes(row.decision)?3:row.decision==='failed'?2:!row.address?1:0;
 for(const row of rows){
  const key=row.orderId?'order:'+row.orderId:'household:'+(row.householdKey||row.invitationId),existing=groups.get(key);
  if(existing){existing.names=[...new Set([...existing.names,row.name])];if(rank(row)>rank(existing.row))existing.row=row;}
  else groups.set(key,{names:[row.name],row});
 }
 const counts={ready:0,ordered:0,missing:0,attention:0,other:0};
 for(const group of groups.values()){
  const r=group.row;
  group.category=['failed','needs-review','awaiting-approval'].includes(r.decision)?'attention':r.orderId?'ordered':['scheduled','due'].includes(r.decision)?'ready':!r.address?'missing':'other';
  counts[group.category]++;
 }
 return {groups:[...groups.values()],counts};
}
export function mountCardFallback({panel,year,api,toast}){
 const section=document.createElement('section');section.className='panel form-panel card-fallback';
 section.innerHTML=`<div class="row-head"><div><h2>Automatic cards</h2><p class="hint">Choose when gift selection ends. The next morning at 6 a.m. Pacific, eligible households that haven’t ordered get a default Starry Night card.</p></div><span class="badge">Test mode · nothing mailed</span></div><div data-fallback-policy></div><p class="hint">No address + no existing order = no card sent. Mugs are never ordered automatically. Both gift options disappear after the cutoff. Cards over $10 still need your or Angela’s approval.</p><div class="actions"><button class="secondary" data-fallback-preview>Check recipients</button><a class="quiet" href="#people">Manage addresses in People</a></div><p class="hint" role="status" data-fallback-status></p><div data-fallback-results></div>`;
 panel.after(section);
 const button=section.querySelector('[data-fallback-preview]'),status=section.querySelector('[data-fallback-status]'),results=section.querySelector('[data-fallback-results]'),policy=section.querySelector('[data-fallback-policy]');
 async function load(){
  button.disabled=true;status.textContent='Checking recipients…';
  try{
   const data=await api('card-fallback');if(!section.isConnected)return;
   if(!data.policy){policy.innerHTML='<p class="hint">No automatic card schedule is configured for this edition.</p>';results.innerHTML='';status.textContent='Nothing will be ordered automatically.';return;}
   const values={internationalLastDay:lastChoiceDate(data.policy.international_cutoff),usLastDay:lastChoiceDate(data.policy.us_cutoff)};
   policy.innerHTML=`<form data-cutoff-form><p class="hint"><strong>Last day to choose gifts</strong> · through 11:59 p.m. Pacific</p><div class="form-grid">${[['internationalLastDay','India & Netherlands',data.policy.international_run_at],['usLastDay','United States',data.policy.us_run_at]].map(([key,label,runAt])=>`<label class="field"><span>${label}</span><input type="date" name="${key}" aria-label="${label} cutoff date" value="${values[key]}" min="${year}-01-01" max="${year}-12-31" required ${data.policyEditable?'':'disabled'}><small class="hint">Automatic cards start ${esc(date(runAt))}.</small></label>`).join('')}</div><div class="actions"><button type="submit" class="button" data-save-cutoffs disabled>Save cutoff dates</button></div><p class="hint" role="status" data-cutoff-status>${data.policyEditable?'Dates are saved. You only need to change them if you want a different deadline.':'A cutoff has started. These dates are locked to preserve recorded decisions and existing orders.'}</p></form>`;
   const form=policy.querySelector('form'),save=form.querySelector('[data-save-cutoffs]'),message=form.querySelector('[data-cutoff-status]');
   form.oninput=()=>{const changed=Object.keys(values).some(key=>form.elements.namedItem(key).value!==values[key]);save.disabled=!changed||!data.policyEditable;button.disabled=changed;message.textContent=changed?'Save the dates to update the schedule and recipient check.':'Dates are saved.';};
   form.onsubmit=async event=>{
    event.preventDefault();save.disabled=true;button.disabled=true;message.textContent='Saving cutoff dates…';
    try{await api('card-fallback/dates',{internationalLastDay:form.elements.namedItem('internationalLastDay').value,usLastDay:form.elements.namedItem('usLastDay').value,previousPolicy:data.policy});await load();toast('Cutoff dates saved. People and existing orders are unchanged.');}
    catch(error){message.textContent=error.message;save.disabled=false;}
   };
   const {groups,counts}=fallbackReport(data.rows);
   status.textContent=`${counts.ready} ready for automatic cards · ${counts.ordered} already ordered · ${counts.missing} missing an address${counts.attention?' · '+counts.attention+' need attention':''}${counts.other?' · '+counts.other+' not eligible':''}. Checking recipients does not place orders.${data.submissionEnabled?'':' Automatic test submission is currently disabled.'}`;
   results.innerHTML=`<details class="print-history"><summary>View recipients <span class="badge">${groups.length} households</span></summary>${groups.map(({names,row,category})=>{
    const label=category==='ordered'?'Already ordered · Test Mode':category==='ready'?'Will receive an automatic card if still unclaimed':category==='missing'?(row.closed?'Not sent — no address at cutoff':'Needs an address before the cutoff'):row.decision==='awaiting-approval'?'Needs your approval':category==='attention'?'Order needs attention':'Not eligible for an automatic card';
    const explanation=category==='ordered'?(names.length>1?'These invitations are covered by the same existing card.':'No second card will be ordered.'):category==='missing'?'Without an address on file, this household is automatically left out.':category==='ready'?'Default Starry Night card with the published default note.':row.fulfillmentError||row.reason;
    return `<article class="print-order"><div><strong>${esc(names.join(' / '))}</strong><p class="hint">${esc(label)}</p><p class="hint">${esc(explanation)}</p>${row.orderId?'<p class="hint">See print order history above for the saved card and approvals.</p>':''}</div>${row.decision==='failed'?`<button class="secondary" data-fallback-retry="${esc(row.invitationId)}">Retry preparation</button>`:''}</article>`;
   }).join('')||'<p class="hint">No invitations yet.</p>'}</details>`;
   for(const b of results.querySelectorAll('[data-fallback-retry]'))b.onclick=async()=>{b.disabled=true;try{await api('card-fallback/retry/'+b.dataset.fallbackRetry,{});await load();toast('Card preparation queued in Test Mode.');}catch(error){status.textContent=error.message;b.disabled=false;}};
  }catch(error){status.textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}
 }
 button.onclick=load;load();
}
