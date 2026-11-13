import {foldedCardMarkup,bindFoldedCard} from './folded-card.js';
import {createDeliveryAddress} from './delivery-address.js';
export function createPrintFlow({getData,onChange,onOrdered=()=>{}}){
 let status=null,dialog=null,controller=null,closed=false,preparedDelivery=null,deliveryChanged=()=>{},frontDesign='personal';
 function prepareDelivery(){if(!preparedDelivery){preparedDelivery=createDeliveryAddress(()=>deliveryChanged());void preparedDelivery.load();}return preparedDelivery;}
 async function refresh(){
  controller?.abort();const current=controller=new AbortController();
  try{const response=await fetch('/api/print/status',{signal:current.signal});if(!response.ok)throw new Error();const data=await response.json();if(closed||controller!==current)return;status=data;onChange(status);prepare();}catch{if(!closed&&controller===current&&!current.signal.aborted){status=null;onChange(status);}}
 }
 function previewData(){const data=getData();return {...data,recipe:{...data.recipe,frontDesign:data.personalized?frontDesign:'default'}};}
 function prepare(){} // Local artwork is already prepared by the editor.
 function buttonMarkup(){return (status?.eligible||status?.canOrder)?`<button class="ks-print ks-gift" aria-label="Order complimentary print" data-print ${getData().file?'':'disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13M12 8C5 8 4 2 8 3c3 0 4 5 4 5Zm0 0c7 0 8-6 4-5-3 0-4 5-4 5Z"/></svg><span>Print, on us<small>A Christmas gift</small></span></button>`:'';}
 async function open(){
  if(dialog||closed||!(status?.eligible||status?.canOrder))return;
  let data=previewData();if(!data.file)return;
  const snapshot=structuredClone(status);const proofUrl=URL.createObjectURL(data.file);let delivery;let requestKey=crypto.randomUUID(),submitting=false;
  let activeView='front';
  dialog=document.createElement('dialog');dialog.className='ks-print-dialog';dialog.setAttribute('aria-labelledby','print-title');
  dialog.innerHTML=`<div class="ks-top"><div class="ks-print-heading"><h2 id="print-title" tabindex="-1">Mail this keepsake?</h2>${['local_mock','simulation','handwrytten_test'].includes(snapshot.mode)?`<span class="ks-simulation">${snapshot.mode==='handwrytten_test'?'Handwrytten Test Mode<span>No physical mail · temporary card authorization possible</span>':'Orders are simulated<span>No physical mail or charges</span>'}</span>`:''}</div><button class="ks-icon" data-close-print aria-label="Close order confirmation"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="ks-print-body"><div data-print-pictures>${cardMarkup()}</div><div data-delivery-address></div><p class="ks-status" role="status" aria-live="polite"></p></div><div class="ks-bottom"><button class="ks-secondary" data-cancel-print>Not yet</button><button class="ks-primary" data-submit-print>${['local_mock','simulation','handwrytten_test'].includes(snapshot.mode)?'Confirm test order':'Yes, mail it'}</button></div>`;
  const sheet=dialog;document.body.append(dialog);bindFoldedCard(dialog,{onSwap:swapPictures,onView:view=>activeView=view});
  const message=text=>{sheet.querySelector('.ks-status').textContent=text;};
  const submit=dialog.querySelector('[data-submit-print]');
  function renderAddress(){if(!sheet.isConnected)return;const region=sheet.querySelector('[data-delivery-address]');region.innerHTML=delivery.markup();delivery.bind(region);submit.disabled=submitting||!delivery.ready;}
  delivery=prepareDelivery();deliveryChanged=renderAddress;renderAddress();
  function release(){URL.revokeObjectURL(proofUrl);deliveryChanged=()=>{};delivery.destroy();if(preparedDelivery===delivery)preparedDelivery=null;sheet.remove();if(dialog===sheet)dialog=null;}
  dialog.addEventListener('close',release,{once:true});
  dialog.querySelector('[data-close-print]').onclick=()=>sheet.close();
  dialog.querySelector('[data-cancel-print]').onclick=()=>sheet.close();
  function bindPictures(region){bindFoldedCard(region,{onSwap:swapPictures,onView:view=>activeView=view});}
  function cardMarkup(){
   const swapped=data.personalized&&data.recipe.frontDesign==='default';
   return foldedCardMarkup({frontSrc:swapped?data.defaultSrc:proofUrl,insideSrc:data.personalized?(swapped?proofUrl:data.defaultSrc):null,preview:snapshot.preview,frontDesign:data.recipe.frontDesign,canSwap:data.personalized&&!submitting,activeView});
  }
  function renderCard(){const region=sheet.querySelector('[data-print-pictures]'),swap=region.querySelector('[data-swap-card]'),restore=swap&&document.activeElement===swap;region.innerHTML=cardMarkup();bindPictures(region);renderAddress();if(restore)region.querySelector('[data-swap-card]')?.focus({preventScroll:true});}
  function swapPictures(){
   if(submitting||!data.personalized)return;
   frontDesign=data.recipe.frontDesign==='personal'?'default':'personal';data=previewData();requestKey=crypto.randomUUID();message('');
   renderCard();
   sheet.querySelector('[data-swap-card]')?.focus({preventScroll:true});
  }
  function finish(order){
   status={...status,eligible:false,canOrder:false,order,remaining:0};onChange(status);sheet.close();
   onOrdered(order.testMode?'Test keepsake ordered. No physical mail will be sent.':order.status==='simulated'?'Test keepsake order saved. No physical mail or charges.':order.status==='submitted'?'Keep an eye on your mailbox—your keepsake gift is headed your way 💌':'Your print request is recorded.',!order.testMode&&order.status==='simulated',order);
  }
  submit.onclick=async()=>{
   if(submitting||!delivery.ready)return;submitting=true;submit.disabled=true;if(data.personalized)sheet.querySelector('[data-swap-card]')?.setAttribute('disabled','');message('Saving your order…');
   try{
    await delivery.confirm();await refresh();
    if(dialog!==sheet)return;
    if(status?.order){finish(status.order);return;}
    if(!status?.eligible||status.contentVersion!==snapshot.contentVersion||status.addressVersion!==delivery.state.version)throw new Error('The address, permissions or scrapbook changed. Reopen the order confirmation.');
    const form=new FormData();form.set('artwork',data.file);form.set('recipe',JSON.stringify({...data.recipe,requestKey,confirmationKey:status.confirmationKey,addressVersion:delivery.state.version}));
    const response=await fetch('/api/print/orders',{method:'POST',body:form,signal:AbortSignal.timeout(30000)}),result=await response.json();
    if(!response.ok)throw new Error(result.error||'The order could not be confirmed.');
    if(dialog!==sheet){await refresh();return;}
    finish(result.order);
   }catch(error){await refresh();if(dialog!==sheet)return;if(status?.order){finish(status.order);}else{requestKey=crypto.randomUUID();submitting=false;if(data.personalized)sheet.querySelector('[data-swap-card]')?.removeAttribute('disabled');submit.disabled=!delivery.ready;message(error.message+' No additional order will be created if one is already recorded.');}}

  };
  dialog.showModal();dialog.querySelector('#print-title').focus({preventScroll:true});
 }
 return {buttonMarkup,prepare,bind:container=>{const b=container.querySelector('[data-print]');if(b)b.onclick=open;},refresh:()=>{closed=false;prepareDelivery();return refresh();},close:()=>{closed=true;controller?.abort();deliveryChanged=()=>{};preparedDelivery?.destroy();preparedDelivery=null;if(dialog?.open)dialog.close();}};
}
