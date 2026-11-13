import {printQuoteMarkup} from './print-quote.js';
import {loadingPaw} from '../../web/loading.js';
import {foldedCardMarkup,bindFoldedCard} from '../../web/folded-card.js';
import {mountAddressEditor,addressIsCurrent} from './address-editor.js';
import {drawFoldedNote} from '../../web/print-design.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function invitationPrintEligibility(state,contacts,invite){
 const person=contacts.find(p=>p.id===invite.person_id),ids=new Set([invite.id,...(invite.memberIds||[invite.person_id])]);
 const count=new Set(state.draft.photos.filter(p=>!p.hidden&&p.recipients.length&&p.recipients.some(id=>ids.has(id))).map(p=>p.id)).size;
 const reason=!addressIsCurrent(person)?'Mailing contact needs a current verified US address':invite.revoked_at||invite.expires_at<=Date.now()/1000?'Invitation is inactive':'';
 return {count,person,reason};
}
export function prunePrintPermissions(state,contacts){
 if(!state?.draft)return;const keys=state.draft.printAddressKeys||{};
 state.draft.printInvitations=(state.draft.printInvitations||[]).filter(id=>{const i=state.people.find(i=>i.id===id);if(!i)return false;const e=invitationPrintEligibility(state,contacts,i);return !e.reason&&keys[id]===e.person.address_verification_key;});
 state.draft.printAddressKeys=Object.fromEntries(state.draft.printInvitations.map(id=>[id,keys[id]]));
}
export function mountPrintAdmin({view,state,contacts,api,requestApi,mark,saveDraft,showModal,updateContacts,render,toast}){
 const app=document.querySelector('#app');
 if(view==='directory')mountAddressEditor({app,contacts,requestApi,showModal,updateContacts,mark,render,toast,state});
 if(view==='story'){
  const panel=document.createElement('section');panel.className='panel form-panel';
  panel.innerHTML=`<h2>Printed folded card notes</h2><p class="hint">Save and publish the complete shared messages, including your closing, with the scrapbook. We automatically add “Dear {invitation addressed to},” above either note. Each message supports up to 350 characters and 10 line breaks.</p>${[['printNote','Personalized keepsake note','Inside right of the folded card made from the guest’s own photos.'],['defaultPrintNote','Default keepsake note','Inside right for guests receiving only Pixel’s pick. Leave blank to reuse the personalized note.']].map(([key,label,hint])=>`<label class="field"><span>${label}</span><textarea maxlength="350" rows="5" data-print-note="${key}">${esc(state.draft[key]||'')}</textarea></label><p class="hint">${hint}</p><button class="secondary" type="button" data-preview-note="${key}">Preview ${key==='printNote'?'personalized':'default'} inside right page</button>`).join('')}<p class="hint">Written in Merry Madeline. Your closing is printed exactly as entered; no signature is added. Layout previews are illustrative. Emojis appear using your browser’s fonts; physical print rendering has not been verified.</p>`;
  app.querySelector('.editor-width').append(panel);
  panel.querySelectorAll('[data-print-note]').forEach(input=>input.oninput=()=>{state.draft[input.dataset.printNote]=input.value;mark();});
  panel.querySelectorAll('[data-preview-note]').forEach(button=>button.onclick=()=>{
   const isDefault=button.dataset.previewNote==='defaultPrintNote';
   showModal(`<p class="kicker">Draft folded card note</p><h2>${isDefault?'Default':'Personalized'} keepsake note</h2><canvas id="print-note-proof" class="print-note-proof" role="img" aria-label="Draft inside right note"></canvas><p class="hint">The inside right page; the back is signed pixelbook ’${String(state.year).slice(-2)}. Save and publish to use this note on future orders.</p>`);
   drawFoldedNote(document.querySelector('#print-note-proof'),{note:'Dear [invitation name],\n\n'+((isDefault?state.draft.defaultPrintNote?.trim():null)||state.draft.printNote||''),authors:state.draft.authors,includeSignoff:false});
  });
 }
 if(view!=='sharing')return;
 const panel=document.createElement('section');panel.className='panel form-panel print-settings';panel.innerHTML=`<div class="row-head"><div><h2>Complimentary prints</h2><p class="hint">One automatically approved print per invitation, per year. The phone-verification contact is the mailing recipient.</p></div><span class="badge">${state.printMode==='local_mock'?'Simulation · No mail or charges':'Provider not connected'}</span></div><label class="socials-toggle"><input type="checkbox" id="allow-print-orders" ${state.allowPrintOrders?'checked':''} ${state.printMode==='local_mock'?'':'disabled'}><span><strong>Allow print orders · ${state.year}</strong><span>Off by default. Takes effect immediately. Turning this off preserves existing orders.</span></span></label><p class="hint">Manage each household’s permission in Edit invitation. Changes apply immediately. A published note is required. Everyone receives one A2 portrait folded card. Fewer than three personal photos: Pixel’s pick on the front and a blank inside left. Three or more: personalized front and Pixel’s pick inside left. Both have the note inside right and a small Pixelbook signature on the back.</p><p class="hint" data-handwrytten-status>Checking Handwrytten connection…</p><details class="print-history"><summary>Print order history <span class="badge" data-order-total>0</span></summary><div class="print-order-list"></div></details>`;
 (app.querySelector('.mug-settings')||app.querySelector('.people-panel')).after(panel);
 panel.querySelector('#allow-print-orders').onchange=async e=>{const button=e.target;button.disabled=true;try{const r=await api('print-settings',{allowPrintOrders:button.checked});state.allowPrintOrders=r.allowPrintOrders;toast(r.allowPrintOrders?'Test ordering enabled. No real mail will be sent.':'New print orders disabled. Existing orders preserved.');}catch(error){button.checked=state.allowPrintOrders;toast(error.message);}finally{button.disabled=state.printMode!=='local_mock';}};
 function rows(){prunePrintPermissions(state,contacts);app.querySelectorAll('[data-print-invitation]').forEach(row=>{
  if(row.querySelector('.print-permission'))return;const box=document.createElement('div');box.className='print-permission';
  box.innerHTML='<div class="print-allowance allowance-row"><span class="hint" data-print-count>Prints ordered: 0 · Allowance available</span><button class="secondary allowance-reset" data-reset-print hidden>Reset print allowance</button></div>';
  row.querySelector('.invitation-options').append(box);
 });}
 rows();document.querySelector('#sharing-search')?.addEventListener('input',()=>{rows();loadOrders();});
 function showFoldedOrder(o){
  const savedFont=JSON.parse(o.handwrytten_order_json||'{}'),fontLabel=({hwDavid:'Casual David',hwMadeline:'Merry Madeline'})[savedFont.font]||savedFont.font,handwriting=fontLabel?`Handwriting: ${fontLabel} · ${savedFont.font_size} pt${savedFont.auto_font_size?', automatic fit':''}.`:'Handwriting settings were not recorded.';
  let quote=o.handwrytten_quote_json?JSON.parse(o.handwrytten_quote_json):null;
  const frontDesign=JSON.parse(o.recipe_json||'{}').frontDesign||(o.card_count===2?'personal':'default');
  const markup=()=>foldedCardMarkup({readableNote:false,includeSignoff:!o.handwrytten_order_json||!!savedFont.addresses?.[0]?.wishes,frontDesign,pictures:o.handwrytten_preview_id?{frontSrc:`/api/editions/${state.year}/print-orders/${o.id}/vendor-front`,insideSrc:`/api/editions/${state.year}/print-orders/${o.id}/vendor-inside`,backSrc:`/api/editions/${state.year}/print-orders/${o.id}/vendor-back`}:null,frontSrc:`/api/editions/${state.year}/print-orders/${o.id}/artwork`,insideSrc:o.card_count===2?`/api/editions/${state.year}/print-orders/${o.id}/default-artwork`:null,preview:{note:o.note,authors:o.authors,backText:o.back_text}});
  showModal(`<p class="kicker">Folded card · ${esc(o.status)}</p><h2>${esc(o.recipient_name)}</h2><div data-saved-card>${markup()}</div><p class="hint" data-proof-status role="status">${o.handwrytten_preview_id?'Handwrytten picture proof · note illustrated locally.':'Local preview of the saved order.'}</p>${!o.handwrytten_preview_id&&o.status==='simulated'?'<button class="secondary" data-prepare-proof>Prepare Handwrytten proof</button>':''}<p class="hint">The artwork, note, back signature and mailing address were frozen when this order was created. ${esc(handwriting)} ${o.provider_id?'Reference: '+esc(o.provider_id)+'. ':''}${o.fulfillment_state?`Handwrytten Test Mode · ${esc(o.fulfillment_state)}${o.fulfillment_error?' · '+esc(o.fulfillment_error):''}`:'Local simulation; not submitted to Handwrytten.'}</p><div data-quote>${printQuoteMarkup(quote)}</div>${o.status==='simulated'?'<button class="secondary" data-get-quote>'+(quote?'Refresh checkout total':'Get checkout total')+'</button>':''}<p class="hint" data-quote-status role="status"></p>`);
  const modal=document.querySelector('#modal'),region=modal.querySelector('[data-saved-card]'),message=modal.querySelector('[data-proof-status]'),button=modal.querySelector('[data-prepare-proof]'),quoteButton=modal.querySelector('[data-get-quote]'),quoteRegion=modal.querySelector('[data-quote]'),quoteMessage=modal.querySelector('[data-quote-status]');bindFoldedCard(region);
  if(button)button.onclick=async()=>{
   button.disabled=true;if(quoteButton)quoteButton.disabled=true;message.innerHTML=loadingPaw()+' Preparing Handwrytten picture proofs… No order is submitted.';
   try{
    const result=await api(`print-orders/${o.id}/prepare-proof`,{});
    if(!region.isConnected)return;
    if(result.status==='ready'){
     o.handwrytten_preview_id=result.id;region.innerHTML=markup();bindFoldedCard(region);button.remove();message.textContent='Handwrytten picture proof · note illustrated locally. No mail or charges.';
    }else{message.textContent='The proof is still being prepared. Check again shortly.';button.disabled=false;button.textContent='Check Handwrytten proof';}
   }catch(error){if(region.isConnected){message.textContent=error.message;button.disabled=false;button.textContent='Retry Handwrytten proof';}}finally{if(quoteButton?.isConnected)quoteButton.disabled=false;}
  };
  if(quoteButton)quoteButton.onclick=async()=>{
   quoteButton.disabled=true;if(button?.isConnected)button.disabled=true;quoteMessage.innerHTML=loadingPaw()+' Getting the card, postage and tax total…';
   try{
    const result=await api(`print-orders/${o.id}/quote`,{});if(!quoteRegion.isConnected)return;
    if(result.status==='ready'){
     quote=result.quote;o.handwrytten_quote_json=JSON.stringify(quote);o.handwrytten_preview_id=result.proofId;
     region.innerHTML=markup();bindFoldedCard(region);button?.remove();message.textContent='Handwrytten picture proof · note illustrated locally.';
     quoteRegion.innerHTML=printQuoteMarkup(quote);quoteMessage.textContent='Quote ready. Nothing submitted; orders remain simulated.';quoteButton.textContent='Refresh checkout total';
    }else{quoteMessage.textContent='The saved card proof is still preparing. Check the total again shortly.';quoteButton.textContent='Check checkout total';}
   }catch(error){if(quoteRegion.isConnected){quoteMessage.textContent=error.message;quoteButton.textContent='Retry checkout total';}}
   finally{if(quoteButton.isConnected)quoteButton.disabled=false;if(button?.isConnected)button.disabled=false;}
  };
 }
 async function loadOrders(){try{const result=await api('print-orders');if(!panel.isConnected)return;for(const row of app.querySelectorAll('[data-print-invitation]')){const used=result.counts.find(o=>o.invitation_id===row.dataset.printInvitation);row.querySelector('[data-print-count]').textContent=`Prints ordered: ${used?.count||0} · ${used?.used?'Allowance used':'Allowance available'}`;
   const reset=row.querySelector('[data-reset-print]');reset.hidden=!used?.used;reset.disabled=!used?.can_reset;reset.title=reset.disabled?'Wait until the current order has a confirmed status.':'';
   reset.onclick=()=>{showModal('<p class="kicker">Complimentary print</p><h2>Reset print allowance?</h2><p>This lets this invitation order one more complimentary print. Previous orders, saved designs, notes, addresses and order history are kept. Existing orders are not canceled or sent again.</p><div class="actions"><button class="secondary" id="cancel-reset-print">Cancel</button><button class="button" id="confirm-reset-print">Allow another print</button></div><p class="error" role="alert" id="reset-print-error"></p>');document.querySelector('#cancel-reset-print').onclick=()=>document.querySelector('#modal').close();document.querySelector('#confirm-reset-print').onclick=async event=>{event.target.disabled=true;try{await api(`invitations/${row.dataset.printInvitation}/reset-print-allowance`,{orderId:used.active_order_id,confirm:true});document.querySelector('#modal').close();await loadOrders();toast('One more print allowed. Previous orders and proofs preserved.');}catch(error){document.querySelector('#reset-print-error').textContent=error.message;event.target.disabled=false;}};};}
  panel.querySelector('[data-order-total]').textContent=String(result.orders.length);
  panel.querySelector('.print-order-list').innerHTML=result.orders.length?`${result.orders.map(o=>`<article class="print-order"><div><strong>${esc(o.recipient_name)}</strong><p class="hint">${esc(o.fulfillment_state?'Test · '+o.fulfillment_state:o.status)} · ${new Date(o.created_at*1000).toLocaleString(undefined,{year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})}${o.allowance_reset_at?' · Allowance reset':''}</p></div><button class="quiet" data-order="${esc(o.id)}">View saved proof</button></article>`).join('')}`:'<p class="hint">No print orders yet.</p>';
  panel.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>{const o=result.orders.find(o=>o.id===b.dataset.order);if(o.format==='folded'){showFoldedOrder(o);return;}showModal(`<p class="kicker">Print order · ${esc(o.status)}</p><h2>${esc(o.recipient_name)}</h2><img class="print-history-proof" src="/api/editions/${state.year}/print-orders/${esc(o.id)}/artwork" alt="Saved keepsake artwork">${o.card_count===2?`<p class="hint">Also included · same border</p><img class="print-history-proof" src="/api/editions/${state.year}/print-orders/${esc(o.id)}/default-artwork" alt="Saved default keepsake artwork">`: ''}<p class="prose">${esc(o.note)}</p>${o.card_count===2?`<h3>Default keepsake note</h3><p class="prose">${esc(o.default_note??o.note)}</p>`:''}<p class="hint">The note and mailing address were frozen when this order was created.</p>`);});
 }catch(error){if(panel.isConnected)panel.querySelector('.print-order-list').textContent=error.message;}}
 loadOrders();
 api('handwrytten/status').then(status=>{if(panel.isConnected)panel.querySelector('[data-handwrytten-status]').textContent=status.connected?`Handwrytten connected · ${status.testMode?'Test Mode on':'Test Mode off'} · ${status.ordering==='handwrytten_test'?'Automatic test orders, up to $10 per household. No physical mail; temporary payment authorization possible.':'Submission disabled; guest orders stay simulated.'}`:'Handwrytten is not connected. Automatic test orders cannot submit.';}).catch(()=>{if(panel.isConnected)panel.querySelector('[data-handwrytten-status]').textContent='Could not check Handwrytten. Guest orders stay simulated.';});
}
