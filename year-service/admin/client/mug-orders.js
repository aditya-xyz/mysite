import {mugOptionsLabel} from '../../web/mug-options.js';
import {mugPreview} from '../../web/mug-preview.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function estimateMarkup(raw){
 if(!raw)return '';
 const q=JSON.parse(raw),usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
 return `<p class="hint">Printful estimate: ${usd(q.totalCents)} delivered · mug ${usd(q.subtotalCents)} + shipping ${usd(q.shippingCents)} + tax ${usd(q.taxCents)}${q.otherCents?` + fees/discounts ${usd(q.otherCents)}`:''}. Checked ${esc(new Date(q.estimatedAt*1000).toLocaleString())}. No physical order or charge.</p>`;
}
export const mugSettingsMarkup=state=>`<label class="socials-toggle"><input type="checkbox" data-allow-mug-orders ${state.allowMugOrders?'checked':''} ${state.printMode==='local_mock'?'':'disabled'}><span><strong>Allow mug orders · ${state.year}</strong><span>Off by default. Also enable Allow complimentary mug on each eligible invitation. Applies immediately; existing orders are preserved.</span></span></label>`;
export function bindMugSettings({root,state,api,toast}){
 const input=root.querySelector('[data-allow-mug-orders]');if(!input)return;
 input.onchange=async()=>{input.disabled=true;try{const result=await api('mug-settings',{allowMugOrders:input.checked});state.allowMugOrders=result.allowMugOrders;toast(input.checked?'Simulated mug orders enabled for this scrapbook. Invitation permission is also required.':'New mug orders disabled. Existing orders preserved.');}catch(error){input.checked=state.allowMugOrders;toast(error.message);}finally{input.disabled=state.printMode!=='local_mock';}};
}
export function mountMugOrders({view,state,api,showModal,toast}){
 if(view!=='sharing')return;
 const app=document.querySelector('#app'),panel=document.createElement('section');panel.className='panel form-panel print-settings mug-settings';
 panel.innerHTML=`<div class="row-head"><div><h2>Complimentary mugs</h2><p class="hint">One complimentary mug per invitation / household. US delivery only.</p></div><span class="badge">${state.printMode==='local_mock'?'Simulation · No mail or charges':'Provider not connected'}</span></div>${mugSettingsMarkup(state)}<p class="hint">Invitation mug permissions apply immediately. At least four published mugshots are required. Reset clears the simulated order, saved design and history, and returns the counter to 0.</p><details class="print-history"><summary>Mug order history <span class="badge" data-mug-total>…</span></summary><div data-mug-orders>Loading orders…</div></details>`;
 app.querySelector('.people-panel').after(panel);bindMugSettings({root:panel,state,api,toast});
 let latest;
 async function load(){
  try{latest=await api('mug-orders');if(!panel.isConnected)return;
   panel.querySelector('[data-mug-total]').textContent=String(latest.orders.length);
   panel.querySelector('[data-mug-orders]').innerHTML=latest.orders.map(o=>`<article class="print-order"><div><strong>${esc(o.recipient_name)}</strong><p class="hint">${esc(o.status)} · ${new Date(o.created_at*1000).toLocaleDateString()}</p><p>${esc(o.caption)}</p><p class="hint">${esc(mugOptionsLabel(JSON.parse(o.configuration_json||'null')))}</p>${estimateMarkup(o.quote_json)}</div><button class="quiet" data-mug-proof="${esc(o.id)}">View saved mug design</button></article>`).join('')||'<p class="hint">No mug orders.</p>';
   panel.querySelectorAll('[data-mug-proof]').forEach(b=>b.onclick=()=>{const o=latest.orders.find(o=>o.id===b.dataset.mugProof);showModal(`<p class="kicker">Mug order · ${esc(o.status)}</p><h2>${esc(o.recipient_name)}</h2>${mugPreview({src:`/api/editions/${state.year}/mug-orders/${o.id}/artwork`,caption:o.caption,alt:o.alt,...(o.mockup_key?{mockupSrc:`/api/editions/${state.year}/mug-orders/${o.id}/mockup`}:{})},JSON.parse(o.configuration_json||'null'))}<p class="hint">Saved artwork and caption from this order. Resetting the allowance deletes this order and its proof.</p>`);});
   for(const row of app.querySelectorAll('[data-print-invitation]')){
    let box=row.querySelector('[data-mug-allowance]');if(!box){box=document.createElement('div');box.className='mug-allowance allowance-row';box.dataset.mugAllowance='';row.querySelector('.invitation-options').append(box);}
    const count=latest.counts.find(c=>c.invitation_id===row.dataset.printInvitation);
    box.innerHTML=`<span class="hint">Mugs ordered: ${count?.count||0} · ${count?.count?'Allowance used':'Allowance available'}</span>${count?.count?`<button class="secondary allowance-reset" data-reset-mug ${count.status!=='simulated'?'disabled':''}>Reset mug allowance</button>`:''}`;
    box.querySelector('[data-reset-mug]')?.addEventListener('click',()=>{
     showModal('<p class="kicker">Complimentary mug</p><h2>Reset mug allowance?</h2><p>This clears the simulated order, its saved mug design, and order history. The counter returns to 0. Review the order details first; this cannot be undone.</p><div class="actions"><button class="secondary" data-cancel-mug-reset>Cancel</button><button class="button" data-confirm-mug-reset>Reset allowance & clear history</button></div><p class="error" data-reset-error role="alert"></p>');
     const modal=document.querySelector('#modal');modal.querySelector('[data-cancel-mug-reset]').onclick=()=>modal.close();modal.querySelector('[data-confirm-mug-reset]').onclick=async event=>{event.target.disabled=true;try{await api(`invitations/${row.dataset.printInvitation}/reset-mug-allowance`,{orderId:count.active_order_id,confirm:true});modal.close();await load();toast('Mug counter reset to 0. Simulated order and history cleared.');}catch(error){modal.querySelector('[data-reset-error]').textContent=error.message;event.target.disabled=false;}};
    });
   }
  }catch(error){if(panel.isConnected)panel.querySelector('[data-mug-orders]').textContent=error.message;}
 }
 document.querySelector('#sharing-search')?.addEventListener('input',load);load();
}
