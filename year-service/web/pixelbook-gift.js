import {createDeliveryAddress} from './delivery-address.js';
import {mugPreview} from './mug-preview.js';
import {esc,assetPath,hasMugChoices} from './pixelbook.js';

const householdGiftLine='seriously, one per household. couch surfing only pays so much.';

// Provider-neutral UI. The server owns eligibility, address storage and the one-per-invite allowance.
// The production journal must explicitly enable this capability before the UI is shown.
export function mountPixelGift(journal,root){
  const launch=root.querySelector('[data-open-gift]');
  if(!launch||!hasMugChoices(journal))return {destroy(){}};
  const designs=(journal.gift.designs||[]).filter(d=>d.id&&assetPath(d.src));
  if(!designs.length){launch.disabled=true;launch.textContent='mugshots coming soon';return {destroy(){}};}
  const modal=document.createElement('dialog');modal.className='pb-gift-dialog';modal.setAttribute('aria-labelledby','pb-order-title');
  document.body.append(modal);
  let step='pick',selected=null,receipt=null,requestKey=crypto.randomUUID(),busy=false,controller=null,returnFocus;
  const local=journal.gift.mode==='preview',simulated=journal.gift.mode==='simulation',ordering=local||journal.gift.orderingEnabled===true;
  const closeIcon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const delivery=createDeliveryAddress(()=>{if(modal.open&&step==='address')render();});
  const steps=()=>`<ol class="pb-order-steps" aria-label="Gift progress">${['your mugshot','your address','the details'].map((s,i)=>`<li ${['pick','address','review'].indexOf(step)===i?'aria-current="step"':''}><span>${i+1}</span>${s}</li>`).join('')}</ol>`;
  function pickMarkup(){return `<p class="pb-dialog-intro">${designs.length} excellent photos of me. one difficult decision for you.</p><div class="pb-designs" role="group" aria-label="Choose a mug design">${designs.map(d=>`<button type="button" class="pb-design" data-design="${esc(d.id)}" aria-pressed="${selected?.id===d.id}"><span class="pb-design-image"><img src="${esc(assetPath(d.src))}" alt="${esc(d.alt)}" loading="lazy"><span class="pb-design-check" aria-hidden="true">✓</span></span><span class="pb-design-name">${esc(d.name)}</span><span class="pb-design-caption">${esc(d.caption)}</span></button>`).join('')}</div><p class="pb-dialog-budget">${householdGiftLine}</p>`;}
  function addressMarkup(){return delivery.markup();}
  function reviewMarkup(){return `<div class="pb-order-review">${mugPreview(selected)}<div><p class="pb-eyebrow">your chosen mugshot</p><h3>${esc(selected.name)}</h3><p>${esc(selected.caption)}</p><dl><div><dt>Gift</dt><dd>1 photo mug</dd></div><div><dt>You pay</dt><dd>$0 · dad’s got it</dd></div></dl></div></div>${delivery.summaryMarkup()}`;}
  function doneMarkup(){return `<div class="pb-gift-done"><span class="pb-done-mark" aria-hidden="true">✓</span><p class="pb-eyebrow">${local?'preview claim saved':receipt?.status==='simulated'?'test order saved':'gift request received'}</p><h3>Pixel perfect.</h3><p>excellent choice. one of my favorite photos of me.</p>${mugPreview(receipt?.design||selected)}${['simulated','submitted'].includes(receipt?.status)?'<p class="pb-dialog-budget">text dad if you need a second one. just don’t mention i told you this.</p>':''}${local?'<p>That’s the whole flow. No mug has been ordered or charged.</p>':receipt?.status==='simulated'?'':'<p>Your household’s gift request is saved. Check back here for updates.</p>'}</div>`;}
  function render(){
    const title=step==='pick'?'pick your mugshot.':step==='address'?'where’s home?':step==='review'?'look good?':'that’s a wrap.';
    modal.innerHTML=`<div class="pb-dialog-top"><div><p class="pb-eyebrow">a gift from Pixel</p><h2 id="pb-order-title" tabindex="-1">${title}</h2></div><button type="button" class="pb-close" data-close-gift aria-label="Close gift picker">${closeIcon}</button></div>${local||simulated?'<p class="pb-preview-banner">Orders are simulated · no physical orders or charges</p>':!ordering?'<p class="pb-preview-banner">Gift ordering opens soon. You can browse the mugshots for now.</p>':''}${step==='done'?'':steps()}<div class="pb-dialog-body">${step==='pick'?pickMarkup():step==='address'?addressMarkup():step==='review'?reviewMarkup():doneMarkup()}<p class="pb-gift-status error" role="alert"></p></div><div class="pb-dialog-bottom">${step==='done'?'<button class="button" data-close-gift>back to my scrapbook</button>':`<button class="text-button" data-gift-back>${step==='pick'?'keep browsing':'← back'}</button><button class="button" data-gift-next ${(step==='pick'&&(!selected||!ordering)||step==='address'&&!delivery.ready)?'disabled':''}>${step==='pick'?ordering?'this is the one →':'ordering opens soon':step==='address'?'review my gift →':local?'save preview claim':simulated?'confirm test mug order':'send me this one'}</button>`}</div>`;
    modal.querySelectorAll('[data-close-gift]').forEach(b=>b.onclick=()=>modal.close());
    modal.querySelectorAll('[data-design]').forEach(b=>b.onclick=()=>{
      selected=designs.find(d=>d.id===b.dataset.design);
      modal.querySelectorAll('[data-design]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.design===selected.id)));
      modal.querySelector('[data-gift-next]').disabled=!ordering;
    });
    modal.querySelector('[data-gift-back]')?.addEventListener('click',()=>{if(step==='pick')modal.close();else{step=step==='review'?'address':'pick';render();}});
    modal.querySelector('[data-edit-address]')?.addEventListener('click',()=>{step='address';render();});
    modal.querySelector('[data-gift-next]')?.addEventListener('click',next);
    if(step==='address')delivery.bind(modal);
    if(modal.open){modal.scrollTop=0;modal.querySelector('h2').focus({preventScroll:true});}
  }
  async function request(path,data){
    controller?.abort();controller=new AbortController();
    const response=await fetch('/api/gift/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:controller.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Couldn’t save that. Please try again.');return result;
  }
  async function next(){
    if(busy||!ordering)return;
    if(step==='pick'){if(!selected)return;busy=true;modal.querySelector('[data-gift-next]').disabled=true;await delivery.load();busy=false;if(!modal.open)return;step='address';render();return;}
    if(step==='address'){if(!delivery.ready)return;try{await delivery.confirm();step='review';render();}catch(error){modal.querySelector('.pb-gift-status').textContent=error.message;}return;}
    if(step!=='review')return;
    busy=true;modal.setAttribute('aria-busy','true');
    modal.querySelectorAll('[data-gift-next],[data-gift-back],[data-edit-address]').forEach(button=>button.disabled=true);
    try{
      const result=await request('claim',{designId:selected.id,addressVersion:delivery.state.version,requestKey});receipt={...result.claim,design:result.claim.design||{...selected}};
      if(!modal.isConnected)return;selected=designs.find(d=>d.id===receipt.designId)||selected;step='done';render();launch.textContent='view your household’s gift';
    }catch(error){if(error.name!=='AbortError'&&modal.open){modal.querySelector('.pb-gift-status').textContent=error.message;modal.querySelectorAll('[data-gift-next],[data-gift-back],[data-edit-address]').forEach(button=>button.disabled=false);}}
    finally{busy=false;modal.removeAttribute('aria-busy');}
  }
  launch.onclick=async()=>{
    if(modal.open||busy)return;returnFocus=document.activeElement;launch.disabled=true;
    // Capture the preview at the click, before the status request or next cycle.
    const previewId=root.querySelector('.pb-mugshot-stack')?.dataset.previewDesign;
    const previewDesign=designs.find(d=>d.id===previewId)||null;
    try{
      if(!ordering){step='pick';selected=previewDesign;render();modal.showModal();modal.querySelector('h2').focus();return;}
      const result=await request('status');receipt=result.claim||null;
      if(!modal.isConnected)return;
      if(receipt){selected=receipt.design||designs.find(d=>d.id===receipt.designId);step='done';launch.textContent='view your household’s gift';}else{step='pick';selected=previewDesign;requestKey=crypto.randomUUID();launch.textContent='pick your mugshot';}
      render();modal.showModal();modal.querySelector('h2').focus();
    }catch(error){if(error.name!=='AbortError'){let status=root.querySelector('.pb-gift-launch-error');if(!status){status=document.createElement('p');status.className='pb-gift-launch-error error';status.setAttribute('role','alert');launch.after(status);}status.textContent=error.message;}}
    finally{launch.disabled=false;}
  };
  modal.addEventListener('close',()=>{returnFocus?.focus({preventScroll:true});});
  return {destroy(){controller?.abort();delivery.destroy();modal.remove();}};
}
