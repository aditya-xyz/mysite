import {openMugCustomizer} from './mug-customizer.js';
import {createMugMockups} from './mug-mockups.js';
import {pixelMugOptions,preferredMugOptions,mugStyles,mugOptionsLabel} from './mug-options.js';
import {createDeliveryAddress} from './delivery-address.js';
import {mugPreview,mugLoadingPreview} from './mug-preview.js';
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
  let step='pick',selected=designs[0],configuration=pixelMugOptions(),customizer=null,receipt=null,requestKey=crypto.randomUUID(),busy=false,controller=null,returnFocus;
  let styles=mugStyles,livePricing=false,quote=null,quoteKey='',quoteBusy=false,quoteError='',quoteGeneration=0;
  const mockups=createMugMockups();
  const local=journal.gift.mode==='preview',simulated=journal.gift.mode==='simulation',ordering=local||journal.gift.orderingEnabled===true;
  const closeIcon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const delivery=createDeliveryAddress(()=>{if(modal.open&&step==='address'){render();refreshQuote();}});
  const price=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
  const canConfirm=()=>delivery.ready&&(!livePricing||!!quote?.withinBudget&&!quoteBusy&&!quoteError);
  async function refreshQuote(){
    if(!livePricing||!delivery.ready||step!=='address'||!modal.open)return;
    const key=JSON.stringify([configuration,delivery.state.version]);if(key===quoteKey)return;
    const generation=++quoteGeneration;quoteKey=key;quote=null;quoteBusy=true;quoteError='';render();
    try{const result=await request('quote',{configuration,addressVersion:delivery.state.version});if(generation===quoteGeneration)quote=result;}
    catch(error){if(generation===quoteGeneration&&error.name!=='AbortError')quoteError=error.message;}
    finally{if(generation===quoteGeneration){quoteBusy=false;if(modal.open&&step==='address')render();}}
  }
  const steps=()=>`<ol class="pb-order-steps" aria-label="Gift progress">${['your mugshot','the details','your address'].map((s,i)=>`<li ${['pick','review','address'].indexOf(step)===i?'aria-current="step"':''}><span>${i+1}</span>${s}</li>`).join('')}</ol>`;
  function pickMarkup(){
    return `<p class="pb-dialog-intro">pick your favorite photo of me. i’ve made this very difficult.</p><div class="pb-designs" role="group" aria-label="Choose a mug design">${designs.map(d=>`<button type="button" class="pb-design" data-design="${esc(d.id)}" aria-pressed="${selected?.id===d.id}"><span class="pb-design-image"><img src="${esc(assetPath(d.src))}" alt="${esc(d.alt)}" loading="lazy"><span class="pb-design-check" aria-hidden="true">✓</span></span><span class="pb-design-name">${esc(d.name)}</span><span class="pb-design-caption">${esc(d.caption)}</span></button>`).join('')}</div><p class="pb-dialog-budget">${householdGiftLine}</p>`;
  }
  function addressMarkup(){return delivery.markup()+(livePricing&&delivery.ready?`<p class="delivery-note" role="status">${quoteBusy?'Checking mug availability and delivered price…':quoteError?esc(quoteError):quote?`Estimated delivered price: ${price(quote.totalCents)} · you pay $0${quote.withinBudget?'':' · over the gift budget; go back and customize your mug.'}`:''}</p>${quoteError?'<button type="button" class="text-button" data-retry-quote>Check price again</button>':''}`:'');}
  const previewMarkup=(design,value)=>livePricing&&!design?.mockupSrc?(step==='done'&&!mockups.id(design,value)?'<figure class="pb-mug-preview pb-live-preview"><div class="pb-mockup-wait">Your chosen mug design is saved.</div></figure>':mugLoadingPreview()):mugPreview(design,value);
  function reviewMarkup(){
    return `<div class="pb-order-review">${previewMarkup(selected,configuration)}<div><p class="pb-eyebrow">your chosen mugshot</p><h3>don’t i have excellent taste?</h3><dl class="pb-gift-price"><div><dt>You pay</dt><dd><span class="pb-gift-zero">$0</span> · dad’s got it</dd></div></dl><div class="pb-mug-summary"><p>${esc(mugOptionsLabel(configuration,styles))}${configuration.style===pixelMugOptions().style&&configuration.size===pixelMugOptions().size&&configuration.color===pixelMugOptions().color?' · Pixel recommended':''}</p>${styles.find(s=>s.id===configuration.style)?.careNote?`<p class="delivery-note">${configuration.style==='enamel'?'not dishwasher safe. good thing i lick all my bowls.':esc(styles.find(s=>s.id===configuration.style).careNote)}</p>`:''}</div></div></div>`;
  }
  function doneMarkup(){return `<div class="pb-gift-done"><span class="pb-done-mark" aria-hidden="true">✓</span><p class="pb-eyebrow">${local?'preview claim saved':receipt?.status==='simulated'?'test order saved':'gift request received'}</p><h3>Pixel perfect.</h3><p>excellent choice. one of my favorite photos of me.</p>${previewMarkup(receipt?.design||selected,receipt?.configuration||configuration)}<p>${esc(mugOptionsLabel(receipt?.configuration||configuration))}</p>${['simulated','submitted'].includes(receipt?.status)?'<p class="pb-dialog-budget">text dad if you need a second one. just don’t mention i told you this.</p>':''}${local?'<p>That’s the whole flow. No mug has been ordered or charged.</p>':receipt?.status==='simulated'?'':'<p>Your household’s gift request is saved. Check back here for updates.</p>'}</div>`;}
  function render(){
    const title=step==='pick'?'pick your mugshot.':step==='address'?'where’s home?':step==='review'?'look good?':'that’s a wrap.';
    modal.innerHTML=`<div class="pb-dialog-top"><div><p class="pb-eyebrow">a gift from Pixel</p><h2 id="pb-order-title" tabindex="-1">${title}</h2></div><button type="button" class="pb-close" data-close-gift aria-label="Close gift picker">${closeIcon}</button></div>${local||simulated?'<p class="pb-preview-banner">Orders are simulated · no physical orders or charges</p>':!ordering?'<p class="pb-preview-banner">Gift ordering opens soon. You can browse the mugshots for now.</p>':''}${step==='done'?'':steps()}<div class="pb-dialog-body">${step==='pick'?pickMarkup():step==='address'?addressMarkup():step==='review'?reviewMarkup():doneMarkup()}<p class="pb-gift-status error" role="alert"></p></div><div class="pb-dialog-bottom">${step==='done'?'<button class="button" data-close-gift>back to my scrapbook</button>':`<button class="text-button" data-gift-back>${step==='pick'?'keep browsing':'← back'}</button>${step==='review'?`<button type="button" class="button pb-secondary-button" data-customize-mug>Customize</button>`:''}<button class="button" data-gift-next ${(step==='pick'&&(!selected||!ordering||opening)||step==='address'&&!canConfirm())?'disabled':''}>${step==='pick'?ordering?'this is the one →':'ordering opens soon':step==='review'?'proceed →':local||simulated?'confirm test mug order':'confirm & order'}</button>`}</div>`;
    modal.querySelectorAll('[data-close-gift]').forEach(b=>b.onclick=()=>modal.close());
    modal.querySelectorAll('[data-design]').forEach(b=>b.onclick=()=>{
      selected=designs.find(d=>d.id===b.dataset.design);
      modal.querySelectorAll('[data-design]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.design===selected.id)));
      modal.querySelector('[data-gift-next]').disabled=!ordering||opening;
      if(livePricing)warmSelected();
    });
    modal.querySelector('[data-customize-mug]')?.addEventListener('click',()=>{
      customizer=openMugCustomizer(selected,configuration,value=>{configuration=value;quote=null;quoteKey='';customizer=null;render();modal.querySelector('[data-customize-mug]').focus();},styles,(element,design,value)=>{mockups.update(element,design,value);warmOptions(design,value);},previewMarkup,(design,value)=>mockups.available(design,value));
    });
    modal.querySelector('[data-gift-back]')?.addEventListener('click',()=>{if(step==='pick')modal.close();else{step=step==='address'?'review':'pick';render();}});
    modal.querySelector('[data-edit-address]')?.addEventListener('click',()=>{step='address';render();});
    modal.querySelector('[data-gift-next]')?.addEventListener('click',next);
    modal.querySelector('[data-retry-quote]')?.addEventListener('click',()=>{quoteKey='';refreshQuote();});
    if(step==='address')delivery.bind(modal);
    if(step==='review')mockups.update(modal.querySelector('.pb-mug-preview'),selected,configuration);
    if(step==='done'&&mockups.id(receipt?.design||selected,receipt?.configuration||configuration))mockups.update(modal.querySelector('.pb-mug-preview'),receipt?.design||selected,receipt?.configuration||configuration);
    if(modal.open){modal.scrollTop=0;modal.querySelector('h2').focus({preventScroll:true});}
  }
  async function request(path,data){
    controller?.abort();controller=new AbortController();
    const response=await fetch('/api/gift/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:controller.signal});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Couldn’t save that. Please try again.');return result;
  }
  async function next(){
    if(busy||opening||!contextReady||!ordering)return;
    if(step==='pick'){if(!selected)return;step='review';render();return;}
    if(step==='review'){busy=true;modal.querySelector('[data-gift-next]').disabled=true;await delivery.load();busy=false;if(!modal.open)return;step='address';render();refreshQuote();return;}
    if(step!=='address'||!canConfirm())return;
    busy=true;modal.setAttribute('aria-busy','true');
    modal.querySelectorAll('[data-gift-next],[data-gift-back],[data-edit-address],[data-customize-mug]').forEach(button=>button.disabled=true);
    try{
      await delivery.confirm();
      const result=await request('claim',{designId:selected.id,configuration,addressVersion:delivery.state.version,requestKey,mockupId:mockups.id(selected,configuration),preparedPreviewId:mockups.preparedId(selected,configuration)});receipt={...result.claim,design:result.claim.design||{...selected}};
      if(!modal.isConnected)return;selected=designs.find(d=>d.id===receipt.designId)||selected;step='done';render();launch.textContent='view your household’s gift';
    }catch(error){if(error.name!=='AbortError'&&modal.open){modal.querySelector('.pb-gift-status').textContent=error.message;modal.querySelectorAll('[data-gift-next],[data-gift-back],[data-edit-address],[data-customize-mug]').forEach(button=>button.disabled=false);}}
    finally{busy=false;modal.removeAttribute('aria-busy');}
  }
  function warmOptions(design,options){
    mockups.preload(design,options);if(!livePricing)return;
    const style=styles.find(s=>s.id===options.style);
    for(const color of style?.colors||[])if(!style.variants||style.variants.some(v=>v.size===options.size&&v.color===color))mockups.preload(design,{...options,color});
    for(const other of styles){const v=other.variants?.find(v=>v.size===options.size)||other.variants?.[0];if(v)for(const font of ['clean','serif','handwritten'])mockups.preload(design,{style:other.id,size:v.size,color:v.color,font});}
    for(const font of ['clean','serif','handwritten'])mockups.preload(design,{...options,font});
  }
  function warmSelected(){warmOptions(selected,configuration);}
  let opening=false,contextReady=false,catalogPromise=null,catalogLoadedAt=0;const catalogController=new AbortController();
  function preloadCatalog(){
    if(catalogPromise&&catalogLoadedAt&&Date.now()-catalogLoadedAt>25000){catalogPromise=null;catalogLoadedAt=0;}
    catalogPromise??=fetch('/api/gift/catalog',{signal:catalogController.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load the saved mug collection.');catalogLoadedAt=Date.now();return result;}).catch(error=>{catalogPromise=null;throw error;});
    return catalogPromise;
  }
  function warmCatalog(){if(!journal.gift.livePricing||!ordering)return;preloadCatalog().then(catalog=>{if(modal.open)return;mockups.configure(catalog);const preferred=preferredMugOptions(catalog.styles);for(const design of designs)mockups.preload(design,preferred);}).catch(()=>{});}
  launch.addEventListener('pointerenter',warmCatalog,{once:true});launch.addEventListener('focus',warmCatalog,{once:true});
  const warmTimer=setTimeout(warmCatalog,1500);
  let previewCount=0;
  const catalogTimer=setInterval(()=>{if(!modal.open||!livePricing||receipt)return;preloadCatalog().then(catalog=>{styles=catalog.styles;mockups.configure(catalog);if(previewCount!==(catalog.previews?.length||0)){previewCount=catalog.previews?.length||0;customizer?.refresh(styles);warmSelected();}}).catch(()=>{});},30000);
  launch.onclick=async()=>{
    if(modal.open||busy||opening)return;opening=true;contextReady=false;returnFocus=document.activeElement;
    // Pixel’s preferred design is the first published mugshot, independent of the rotating stack.
    const previewDesign=designs[0];
    configuration=pixelMugOptions();step='pick';selected=previewDesign;render();modal.showModal();modal.querySelector('h2').focus();
    try{
      if(!ordering){contextReady=true;step='pick';selected=previewDesign;render();modal.querySelector('h2').focus();return;}
      const result=await request('status');receipt=result.claim||null;
      livePricing=result.livePricing===true;quote=null;quoteKey='';quoteError='';quoteBusy=false;quoteGeneration++;
      if(livePricing&&!receipt){const catalog=await preloadCatalog();styles=catalog.styles;mockups.configure(catalog);configuration=preferredMugOptions(styles);}
      if(!modal.isConnected)return;
      if(receipt){configuration=receipt.configuration||configuration;selected=receipt.design||designs.find(d=>d.id===receipt.designId);step='done';launch.textContent='view your household’s gift';}else{step='pick';selected=selected||previewDesign;requestKey=crypto.randomUUID();launch.textContent='pick your mugshot';}
      if(!modal.open)return;contextReady=true;if(receipt){render();modal.querySelector('h2').focus();}
      if(livePricing&&!receipt){warmSelected();for(const design of designs)mockups.preload(design,configuration);}
    }catch(error){if(error.name!=='AbortError'){if(modal.open)modal.querySelector('.pb-gift-status').textContent=error.message;let status=root.querySelector('.pb-gift-launch-error');if(!status){status=document.createElement('p');status.className='pb-gift-launch-error error';status.setAttribute('role','alert');launch.after(status);}status.textContent=error.message;}}
    finally{opening=false;launch.disabled=false;if(modal.open&&step==='pick')modal.querySelector('[data-gift-next]').disabled=!selected||!ordering||!contextReady;}
  };
  modal.addEventListener('close',()=>{quoteGeneration++;quoteKey='';quoteBusy=false;controller?.abort();returnFocus?.focus({preventScroll:true});});
  return {destroy(){clearInterval(catalogTimer);clearTimeout(warmTimer);catalogController.abort();controller?.abort();customizer?.destroy();mockups.destroy();delivery.destroy();modal.remove();}};
}
