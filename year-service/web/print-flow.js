import {slideStep} from './step-motion.js';
import {openDialog,closeDialog} from './dialog-motion.js';
import {readResource} from './read-resource.js';
import {esc,householdOrderNote} from './pixelbook.js';
import {foldedCardMarkup,bindFoldedCard} from './folded-card.js';
import {createDeliveryAddress} from './delivery-address.js';
export function createPrintFlow({getData,onChange,householdName='',householdSize=0,previewOnly=false,onOrdered=()=>{}}){
 let status=null,dialog=null,controller=null,closed=false,preparedDelivery=null,deliveryChanged=()=>{},frontDesign='personal';
 function prepareDelivery(){if(!preparedDelivery){preparedDelivery=createDeliveryAddress(()=>deliveryChanged());void preparedDelivery.load();}return preparedDelivery;}
 async function refresh(){
  controller?.abort();const current=controller=new AbortController();
  try{const data=await readResource('/api/print/status',{signal:current.signal});if(closed||controller!==current)return;status=data;if(status.eligible||status.canOrder)prepareDelivery();onChange(status);prepare();}catch{if(!closed&&controller===current&&!current.signal.aborted){status=null;onChange(status);}}
 }
 function previewData(){const data=getData();return {...data,recipe:{...data.recipe,frontDesign:data.personalized?frontDesign:'default'}};}
 function prepare(){} // Local artwork is already prepared by the editor.
 function buttonMarkup(){return (status?.eligible||status?.canOrder)?`<button class="ks-print ks-gift" aria-label="Order complimentary print" data-print ${getData().file?'':'disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13M12 8C5 8 4 2 8 3c3 0 4 5 4 5Zm0 0c7 0 8-6 4-5-3 0-4 5-4 5Z"/></svg><span>A Christmas gift</span></button>`:'';}
 async function open(){
  if(dialog||closed||!(status?.eligible||status?.canOrder))return;
  let data=previewData();if(!data.file)return;
  const householdNote=householdOrderNote(householdName,householdSize);
  const snapshot=structuredClone(status);const proofUrl=URL.createObjectURL(data.file);let delivery;let requestKey=crypto.randomUUID(),submitting=false;
  let activeView='front';
  dialog=document.createElement('dialog');dialog.className='ks-print-dialog';dialog.setAttribute('aria-labelledby','print-title');
  dialog.innerHTML=`<div class="ks-top"><div class="ks-print-heading"><h2 id="print-title" tabindex="-1">Mail this postcard?</h2></div><button class="ks-icon" data-close-print aria-label="Close order confirmation"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="ks-print-body"><div data-print-pictures>${cardMarkup()}</div><div data-delivery-address></div><p class="ks-status" role="status" aria-live="polite"></p></div><div class="ks-bottom">${householdNote?`<p class="ks-household-note" id="ks-household-note">${esc(householdNote)} <img class="pb-dog-face-emoji" src="/pixel-face-emoji.png" width="30" height="30" alt="" aria-hidden="true"></p>`:''}<button class="ks-secondary" data-cancel-print>Not yet</button><button class="ks-primary" data-submit-print ${householdNote?'aria-describedby="ks-household-note"':''}>Yes, mail it</button></div>`;
  const sheet=dialog;document.body.append(dialog);bindFoldedCard(dialog,{onSwap:swapPictures,onView:view=>activeView=view});
  const message=text=>{sheet.querySelector('.ks-status').textContent=text;};
  const submit=dialog.querySelector('[data-submit-print]');
  const previewMessage=previewOnly?'Admin preview · Final ordering is disabled. No allowance is used.':'';
  message(previewMessage);
  let addressStep=false;
  function renderAddress(){
   if(!sheet.isConnected)return;
   const previous=addressStep;addressStep=!delivery.ready;
   sheet.className=addressStep?'ks-print-dialog ks-address-step':'ks-print-dialog';
   sheet.querySelector('#print-title').textContent=addressStep?(delivery.state?.verified?'Edit address':'where’s home?'):'Mail this postcard?';
   const region=sheet.querySelector('[data-delivery-address]');region.innerHTML=delivery.markup();delivery.bind(region);
   submit.disabled=previewOnly||submitting||!delivery.ready;
   slideStep(sheet,addressStep?'address':'review',addressStep?0:1,'.ks-print-body');
   if(previous!==addressStep&&sheet.open){sheet.scrollTop=0;(addressStep?region.querySelector('input:not([type="hidden"])'):sheet.querySelector('#print-title'))?.focus({preventScroll:true});}
  }
  delivery=prepareDelivery();deliveryChanged=renderAddress;renderAddress();
  function release(){URL.revokeObjectURL(proofUrl);deliveryChanged=()=>{};delivery.destroy();if(preparedDelivery===delivery)preparedDelivery=null;sheet.remove();if(dialog===sheet)dialog=null;}
  dialog.addEventListener('close',release,{once:true});
  dialog.querySelector('[data-close-print]').onclick=()=>closeDialog(sheet);
  dialog.querySelector('[data-cancel-print]').onclick=()=>closeDialog(sheet);
  function bindPictures(region){bindFoldedCard(region,{onSwap:swapPictures,onView:view=>activeView=view});}
  function cardMarkup(){
   const swapped=data.personalized&&data.recipe.frontDesign==='default';
   return foldedCardMarkup({frontSrc:swapped?data.defaultSrc:proofUrl,insideSrc:data.personalized?(swapped?proofUrl:data.defaultSrc):null,preview:snapshot.preview,frontDesign:data.recipe.frontDesign,canSwap:data.personalized&&!submitting,activeView});
  }
  function renderCard(){const region=sheet.querySelector('[data-print-pictures]'),swap=region.querySelector('[data-swap-card]'),restore=swap&&document.activeElement===swap;region.innerHTML=cardMarkup();bindPictures(region);renderAddress();if(restore)region.querySelector('[data-swap-card]')?.focus({preventScroll:true});}
  function swapPictures(){
   if(submitting||!data.personalized)return;
   frontDesign=data.recipe.frontDesign==='personal'?'default':'personal';data=previewData();requestKey=crypto.randomUUID();message(previewMessage);
   renderCard();
   sheet.querySelector('[data-swap-card]')?.focus({preventScroll:true});
  }
  function finish(order){
   status={...status,eligible:false,canOrder:false,order,remaining:0};onChange(status);closeDialog(sheet);
   onOrdered(order.live?(order.status==='submitted'?'Your postcard order is with Handwrytten.':'Your postcard request is saved. Pixel is checking the final total and preparing your card. Please don’t submit another order.'):order.testMode?'Test postcard ordered. No physical mail will be sent.':order.status==='simulated'?'Test postcard order saved. No physical mail or charges.':order.status==='submitted'?'Keep an eye on your mailbox—your postcard gift is headed your way 💌':'Your print request is recorded.',!order.live&&!order.testMode&&order.status==='simulated',order);
  }
  submit.onclick=async()=>{
   if(previewOnly||submitting||!delivery.ready)return;submitting=true;submit.disabled=true;if(data.personalized)sheet.querySelector('[data-swap-card]')?.setAttribute('disabled','');message('Saving your order…');
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
  openDialog(dialog);dialog.querySelector('#print-title').focus({preventScroll:true});
 }
 return {buttonMarkup,prepare,bind:container=>{const b=container.querySelector('[data-print]');if(b)b.onclick=open;},refresh:()=>{closed=false;return refresh();},close:()=>{closed=true;controller?.abort();deliveryChanged=()=>{};preparedDelivery?.destroy();preparedDelivery=null;if(dialog?.open)dialog.close();}};
}
