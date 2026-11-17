import {sessionImages} from './session-images.js';
import {readResource} from './read-resource.js';
import {openMugCustomizer} from './mug-customizer.js';
import {createMugMockups} from './mug-mockups.js';
import {pixelMugOptions,preferredMugOptions,mugStyles,mugOptionsLabel} from './mug-options.js';
import {createDeliveryAddress} from './delivery-address.js';
import {mugPreview,mugLoadingPreview} from './mug-preview.js';
import {esc,assetPath,hasMugChoices,householdOrderNote} from './pixelbook.js';

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
  let step='pick',selected=designs[0],configuration=pixelMugOptions(),customizer=null,receipt=journal.gift.claim||null,requestKey=crypto.randomUUID(),busy=false,controller=null,returnFocus;
  let styles=mugStyles,livePricing=journal.gift.livePricing===true,receiptPreview=null;
  const mockups=createMugMockups();
  const local=journal.gift.mode==='preview',simulated=journal.gift.mode==='simulation',ordering=local||journal.gift.orderingEnabled===true;
  const closeIcon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const delivery=createDeliveryAddress(()=>{if(modal.open&&step==='address')render();});
  const canConfirm=()=>delivery.ready&&!journal.adminPreview;
  const steps=()=>`<ol class="pb-order-steps" aria-label="Gift progress">${['your mugshot','the details','your address'].map((s,i)=>`<li ${['pick','review','address'].indexOf(step)===i?'aria-current="step"':''}><span>${i+1}</span>${s}</li>`).join('')}</ol>`;
  function pickMarkup(){
    return `<p class="pb-dialog-intro">pick your favorite photo of me. i’ve made this very difficult.</p><div class="pb-designs" data-design-count="${designs.length}" role="group" aria-label="Choose a mug design">${designs.map(d=>`<button type="button" class="pb-design" data-design="${esc(d.id)}" aria-pressed="${selected?.id===d.id}"><span class="pb-design-image"><img data-session-src="${esc(assetPath(d.src))}" alt="${esc(d.alt)}" loading="eager" decoding="async"><span class="pb-design-check" aria-hidden="true">✓</span></span><span class="pb-design-caption">${esc(d.caption)}</span></button>`).join('')}</div><p class="pb-dialog-budget">${householdGiftLine}</p>`;
  }
  function addressMarkup(){return delivery.markup();}
  function warmReceipt(){
    const src=assetPath(receipt?.design?.mockupSrc)||(!livePricing?assetPath(receipt?.design?.src):'');
    if(!src){receiptPreview=null;return;}
    if(receiptPreview?.src===src)return;
    const image=document.createElement('img');image.decoding='async';image.src=src;
    image.decode?.().catch(()=>{});receiptPreview={src,image};
  }
  function selectReceipt(){
    configuration=receipt.configuration||configuration;selected=receipt.design||designs.find(d=>d.id===receipt.designId)||selected;
    step='done';launch.textContent='view your household’s gift';root.querySelector('#pb-gift .pb-present-copy>p').textContent='your morning coffee is about to become more pawesome';warmReceipt();
  }
  const receiptKey=value=>JSON.stringify([value?.designId,value?.status,value?.configuration,value?.design]);
  const previewMarkup=(design,value)=>{
    const markup=livePricing&&!design?.mockupSrc?(step==='done'&&!mockups.id(design,value)?'<figure class="pb-mug-preview pb-live-preview"><div class="pb-mockup-wait">Your chosen mug design is saved.</div></figure>':mugLoadingPreview()):mugPreview(design,value);
    // Reuse the decoded image element, even when private responses are no-store.
    return step==='done'&&receiptPreview?markup.replace(`src="${esc(receiptPreview.src)}"`,'data-saved-gift-image'):markup;
  };
  function reviewMarkup(){
    return `<div class="pb-order-review">${previewMarkup(selected,configuration)}<div><p class="pb-eyebrow">your chosen mugshot</p><h3>don’t i have excellent taste?</h3><dl class="pb-gift-price"><div><dt>You pay</dt><dd><span class="pb-gift-zero">$0</span> · dad’s got it</dd></div></dl><div class="pb-mug-summary"><p>${esc(mugOptionsLabel(configuration,styles))}</p>${styles.find(s=>s.id===configuration.style)?.careNote?`<p class="delivery-note">${configuration.style==='enamel'?'not dishwasher safe':esc(styles.find(s=>s.id===configuration.style).careNote)}</p>`:''}</div></div></div>`;
  }
  function doneMarkup(){return `<div class="pb-gift-done"><span class="pb-done-mark" aria-hidden="true">✓</span><p class="pb-eyebrow">${receipt?.approvalRequired?'awaiting approval':local?'preview claim saved':receipt?.status==='simulated'?'test order saved':'gift request received'}</p><h3>Pixel perfect.</h3><p>excellent choice. one of my favorite photos of me.</p>${receipt?.approvalRequired?'<p>Your chosen mug is saved. Mom or dad will review the delivery cost before approving it.</p>':''}${previewMarkup(receipt?.design||selected,receipt?.configuration||configuration)}<p>${esc(mugOptionsLabel(receipt?.configuration||configuration))}</p>${['simulated','submitted'].includes(receipt?.status)?'<p class="pb-dialog-budget">text dad if you need a second one. just don’t mention i told you this.</p>':''}${local?'<p>That’s the whole flow. No mug has been ordered or charged.</p>':receipt?.status==='simulated'?'':'<p>Your household’s gift request is saved. Check back here for updates.</p>'}</div>`;}
  function render(){
    modal.className=step==='review'?'pb-gift-dialog pb-mug-review':'pb-gift-dialog';
    const householdNote=step==='address'&&delivery.ready?householdOrderNote(journal.name,journal.householdSize):'';
    const pending=step==='loading'||step==='error',finished=step==='done'||pending;
    const title=step==='loading'?'your household’s gift.':step==='error'?'couldn’t load your gift.':step==='pick'?'pick your mugshot.':step==='address'?'where’s home?':step==='review'?'the details':'that’s a wrap.';
    modal.innerHTML=`<div class="pb-dialog-top"><div><p class="pb-eyebrow">a gift from Pixel</p><h2 id="pb-order-title" tabindex="-1">${title}</h2></div><button type="button" class="pb-close" data-close-gift aria-label="Close gift picker">${closeIcon}</button></div>${!ordering&&!finished?'<p class="pb-preview-banner">Gift ordering opens soon. You can browse the mugshots for now.</p>':''}${journal.adminPreview?'<p class="pb-preview-banner">Admin preview · Final ordering is disabled. No allowance is used.</p>':''}${finished?'':steps()}<div class="pb-dialog-body">${pending?(step==='loading'?'<p role="status">Loading your gift…</p>':''):step==='pick'?pickMarkup():step==='address'?addressMarkup():step==='review'?reviewMarkup():doneMarkup()}<p class="pb-gift-status error" role="alert"></p></div><div class="pb-dialog-bottom">${householdNote?`<p class="pb-household-note" id="pb-household-note">${esc(householdNote)} <img class="pb-dog-face-emoji" src="/pixel-face-emoji.png" width="30" height="30" alt="" aria-hidden="true"></p>`:''}${finished?'<button class="button" data-close-gift>back to my scrapbook</button>':`<button class="button pb-secondary-button" data-gift-back>${step==='pick'?'keep browsing':'← back'}</button>${step==='review'?`<button type="button" class="button pb-secondary-button" data-customize-mug>Customize</button>`:''}${step==='address'&&!delivery.ready?'':`<button class="button" data-gift-next ${householdNote?'aria-describedby="pb-household-note"':''} ${(step==='pick'&&(!selected||!ordering||opening)||step==='address'&&!canConfirm())?'disabled':''}>${step==='pick'?ordering?'this is the one →':'ordering opens soon':step==='review'?'proceed →':'confirm & order'}</button>`}`}</div>`;
    modal.querySelectorAll('[data-close-gift]').forEach(b=>b.onclick=()=>modal.close());
    modal.querySelectorAll('[data-design]').forEach(b=>b.onclick=()=>{
      selected=designs.find(d=>d.id===b.dataset.design);
      modal.querySelectorAll('[data-design]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.design===selected.id)));
      modal.querySelector('[data-gift-next]').disabled=!ordering||opening;
      // Cutout selection does not need a decoded supplier mockup.
    });
    modal.querySelector('[data-customize-mug]')?.addEventListener('click',()=>{
      customizer=openMugCustomizer(selected,configuration,value=>{configuration=value;customizer=null;render();modal.querySelector('[data-customize-mug]').focus();},styles,(element,design,value)=>{mockups.update(element,design,value);warmOptions(design,value);},previewMarkup,(design,value)=>mockups.available(design,value));
    });
    modal.querySelector('[data-gift-back]')?.addEventListener('click',()=>{if(step==='pick')modal.close();else{step=step==='address'?'review':'pick';render();}});
    modal.querySelector('[data-edit-address]')?.addEventListener('click',()=>{step='address';render();});
    modal.querySelector('[data-gift-next]')?.addEventListener('click',next);
    sessionImages.bind(modal);
    if(step==='address')delivery.bind(modal);
    const savedImage=modal.querySelector('[data-saved-gift-image]');
    if(savedImage&&receiptPreview){receiptPreview.image.className=savedImage.className;receiptPreview.image.alt=savedImage.alt;savedImage.replaceWith(receiptPreview.image);}
    if(step==='review')mockups.update(modal.querySelector('.pb-mug-preview'),selected,configuration);
    if(step==='done'&&mockups.id(receipt?.design||selected,receipt?.configuration||configuration))mockups.update(modal.querySelector('.pb-mug-preview'),receipt?.design||selected,receipt?.configuration||configuration);
    if(modal.open){modal.scrollTop=0;modal.querySelector('h2').focus({preventScroll:true});}
  }
  async function request(path,data){
    controller?.abort();controller=new AbortController();
    if(data===undefined)return readResource('/api/gift/'+path,{signal:controller.signal});
    const response=await fetch('/api/gift/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:controller.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Couldn’t save that. Please try again.');return result;
  }
  async function next(){
    if(busy||opening||!contextReady||!ordering)return;
    if(step==='pick'){if(!selected)return;step='review';render();return;}
    if(step==='review'){busy=true;modal.querySelector('[data-gift-next]').disabled=true;await delivery.load();busy=false;if(!modal.open)return;step='address';render();return;}
    if(step!=='address'||!canConfirm()||journal.adminPreview)return;
    busy=true;modal.setAttribute('aria-busy','true');
    modal.querySelectorAll('[data-gift-next],[data-gift-back],[data-edit-address],[data-customize-mug]').forEach(button=>button.disabled=true);
    try{
      await delivery.confirm();
      const result=await request('claim',{designId:selected.id,configuration,addressVersion:delivery.state.version,requestKey,mockupId:mockups.id(selected,configuration),preparedPreviewId:mockups.preparedId(selected,configuration)});receipt={...result.claim,design:result.claim.design||{...selected}};
      if(!modal.isConnected)return;selectReceipt();render();
    }catch(error){if(error.name!=='AbortError'&&modal.open){modal.querySelector('.pb-gift-status').textContent=error.message;modal.querySelectorAll('[data-gift-next],[data-gift-back],[data-edit-address],[data-customize-mug]').forEach(button=>button.disabled=false);}}
    finally{busy=false;modal.removeAttribute('aria-busy');}
  }
  function warmOptions(design,options){
    mockups.preload(design,options);
  }
  function warmSelected(){warmOptions(selected,configuration);}
  let opening=false,contextReady=false,catalogPromise=null,catalogLoadedAt=0;const catalogController=new AbortController();
  function preloadCatalog(){
    if(catalogPromise&&catalogLoadedAt&&Date.now()-catalogLoadedAt>25000){catalogPromise=null;catalogLoadedAt=0;}
    catalogPromise??=readResource('/api/gift/catalog',{signal:catalogController.signal}).then(result=>{catalogLoadedAt=Date.now();return result;}).catch(error=>{catalogPromise=null;throw error;});
    return catalogPromise;
  }
  function warmCatalog(){if(!journal.gift.livePricing||!ordering)return;preloadCatalog().then(catalog=>{if(modal.open)return;mockups.configure(catalog);}).catch(()=>{});}
  launch.addEventListener('pointerenter',warmCatalog,{once:true});launch.addEventListener('focus',warmCatalog,{once:true});
  let previewCount=0;
  const catalogTimer=setInterval(()=>{if(!modal.open||!livePricing||receipt)return;preloadCatalog().then(catalog=>{styles=catalog.styles;mockups.configure(catalog);if(previewCount!==(catalog.previews?.length||0)){previewCount=catalog.previews?.length||0;customizer?.refresh(styles);if(step==='review')warmSelected();}}).catch(()=>{});},30000);
  launch.onclick=async()=>{
    if(modal.open||busy||opening)return;opening=true;contextReady=false;returnFocus=document.activeElement;
    root.querySelector('.pb-gift-launch-error')?.remove();
    // Pixel’s preferred design is the first published mugshot, independent of the rotating stack.
    const previewDesign=designs[0];
    // The authorized journal already includes the saved gift; refresh it in the background.
    configuration=pixelMugOptions();selected=previewDesign;
    if(receipt)selectReceipt();else step=ordering||journal.gift.hasOrder?'loading':'pick';
    // A new selection opens once its status is known, without a household-receipt flash.
    const deferOpen=ordering&&!receipt&&!journal.gift.hasOrder;
    if(deferOpen)launch.disabled=true;
    else{render();modal.showModal();modal.querySelector('h2').focus();}
    try{
      if(!ordering&&!journal.gift.hasOrder&&!receipt){contextReady=true;step='pick';selected=previewDesign;render();modal.querySelector('h2').focus();return;}
      const displayedReceipt=receipt;
      const result=await request('status');receipt=result.claim||null;
      livePricing=result.livePricing===true;
      if(livePricing&&!receipt){const catalog=await preloadCatalog();styles=catalog.styles;mockups.configure(catalog);configuration=preferredMugOptions(styles);}
      if(!modal.isConnected)return;
      if(receipt)selectReceipt();else{step='pick';selected=selected||previewDesign;requestKey=crypto.randomUUID();launch.textContent='pick your mugshot';}
      if(deferOpen){render();modal.showModal();}
      if(!modal.open)return;contextReady=true;
      if(!deferOpen&&(!displayedReceipt||receiptKey(displayedReceipt)!==receiptKey(receipt)))render();
      // The chooser needs only small cutouts. Supplier mockups load when review opens.
    }catch(error){if(error.name!=='AbortError'){if(deferOpen&&modal.isConnected&&!modal.open){step='error';render();modal.showModal();}if(modal.open){if(!receipt){step='error';render();}modal.querySelector('.pb-gift-status').textContent=error.message;}if(!receipt){let status=root.querySelector('.pb-gift-launch-error');if(!status){status=document.createElement('p');status.className='pb-gift-launch-error error';status.setAttribute('role','alert');launch.after(status);}status.textContent=error.message;}}}
    finally{opening=false;launch.disabled=false;if(modal.open&&step==='pick')modal.querySelector('[data-gift-next]').disabled=!selected||!ordering||!contextReady;}
  };
  modal.addEventListener('close',()=>{controller?.abort();returnFocus?.focus({preventScroll:true});});
  warmReceipt();
  return {destroy(){clearInterval(catalogTimer);catalogController.abort();controller?.abort();customizer?.destroy();mockups.destroy();delivery.destroy();modal.remove();}};
}
