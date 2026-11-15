import {mugOptionsLabel} from '../../web/mug-options.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
export function budgetApprovalMarkup(order,kind){
 const pending=order.budget_review_required&&order.status==='simulated'&&!order.allowance_reset_at&&(kind==='mug'||order.fulfillment_state==='review'&&!order.quote_only);
 return pending?'<p class="hint">Over budget · Awaiting admin approval</p><button class="secondary" data-review-budget>Review & approve budget</button>':order.budget_approved_cents?`<p class="hint">Approved up to ${usd(order.budget_approved_cents)} by ${esc(order.budget_approved_by)} · ${esc(new Date(order.budget_approved_at*1000).toLocaleString())} · Test only</p>`:'';
}
export function bindBudgetApproval(root,{order,kind,api,showModal,onApproved}){
 const trigger=root?.querySelector('[data-review-budget]');if(!trigger)return;
 trigger.onclick=()=>{
  const raw=kind==='mug'?order.quote_json:order.handwrytten_quote_json,quote=JSON.parse(raw),total=kind==='mug'?quote.totalCents:quote.amounts.total,limit=kind==='mug'?2500:1000,address=JSON.parse(order.address_json||'null');
  const description=kind==='mug'?mugOptionsLabel(JSON.parse(order.configuration_json||'null')):'Saved folded keepsake';
  showModal(`<p class="kicker">Over-budget ${kind==='mug'?'mug':'print'} · Test only</p><h2>Approve ${usd(total)} for ${esc(order.recipient_name)}?</h2><p>${esc(description)}</p>${order.caption?`<p>${esc(order.caption)}</p>`:''}${address?`<address>${esc([address.line1,address.line2,[address.city,address.state,address.postalCode].filter(Boolean).join(' '),address.country].filter(Boolean).join(' · '))}</address>`:''}<p>Quoted total: <strong>${usd(total)}</strong> · ${usd(total-limit)} above the ${usd(limit)} automatic limit.</p><p>${kind==='mug'?'This approves only this saved mug simulation. No Printful order or payment will be created.':'This queues this saved order in Handwrytten Test Mode. No physical mail; temporary payment authorization is possible.'}</p><p>A higher checkout total requires another approval. The selected item, artwork and address stay as saved.</p><div class="actions"><button class="secondary" data-cancel-budget>Cancel</button><button class="button" data-confirm-budget>Approve up to ${usd(total)} · Test only</button></div><p class="error" role="alert" data-budget-error></p>`);
  const modal=document.querySelector('#modal');modal.querySelector('[data-cancel-budget]').onclick=()=>modal.close();
  modal.querySelector('[data-confirm-budget]').onclick=async event=>{
   event.target.disabled=true;try{await api(`${kind}-orders/${order.id}/approve-budget`,{quote:raw,confirm:true});modal.close();await onApproved();}catch(error){modal.querySelector('[data-budget-error]').textContent=error.message;event.target.disabled=false;}
  };
 };
}
