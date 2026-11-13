import {createPrintPreviews} from './print-previews.js';
import {foldedCardMarkup,foldedCardControlsMarkup,bindFoldedCard} from './folded-card.js';
import {createDeliveryAddress} from './delivery-address.js';
export function createPrintFlow({getData,onChange,onOrdered=()=>{}}){
 const previews=createPrintPreviews();
 const loadingPictures='<div class="ks-print-loading" role="status"><svg class="ks-preview-paw" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><ellipse cx="6" cy="12" rx="3.2" ry="4.3" transform="rotate(-24 6 12)"/><ellipse cx="12" cy="6.5" rx="3.1" ry="4.3" transform="rotate(-9 12 6.5)"/><ellipse cx="21" cy="6.5" rx="3.1" ry="4.3" transform="rotate(9 21 6.5)"/><ellipse cx="27" cy="12" rx="3.2" ry="4.3" transform="rotate(24 27 12)"/><path d="M8 21c2-2 3-7 8-7s6 5 8 7c5 7-2 9-5 7-2-1-4-1-6 0-4 2-10 0-5-7Z"/></svg><span class="ks-loading-label">Preparing your print previews…</span></div>';
 let status=null,dialog=null,controller=null,closed=false,preparedDelivery=null,deliveryChanged=()=>{},frontDesign='personal';
 function prepareDelivery(){if(!preparedDelivery){preparedDelivery=createDeliveryAddress(()=>deliveryChanged());void preparedDelivery.load();}return preparedDelivery;}
 async function refresh(){
  controller?.abort();const current=controller=new AbortController();
  try{const response=await fetch('/api/print/status',{signal:current.signal});if(!response.ok)throw new Error();const data=await response.json();if(closed||controller!==current)return;status=data;onChange(status);prepare();}catch{if(!closed&&controller===current&&!current.signal.aborted){status=null;onChange(status);}}
 }
 function previewData(){const data=getData();return {...data,recipe:{...data.recipe,frontDesign:data.personalized?frontDesign:'default',picturePreviewVersion:status?.picturePreviewVersion}};}
 function prepare(){if(!closed&&status?.picturePreviews==='handwrytten'&&(status.eligible||status.canOrder))previews.schedule(previewData());else previews.cancelScheduled();}
 function buttonMarkup(){return (status?.eligible||status?.canOrder)?`<button class="ks-print ks-gift" aria-label="Order complimentary print" data-print ${getData().file?'':'disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13M12 8C5 8 4 2 8 3c3 0 4 5 4 5Zm0 0c7 0 8-6 4-5-3 0-4 5-4 5Z"/></svg><span>Print, on us<small>A Christmas gift</small></span></button>`:'';}
 async function open(){
  if(dialog||closed||!(status?.eligible||status?.canOrder))return;
  let data=previewData();if(!data.file)return;
  const snapshot=structuredClone(status);const proofUrl=URL.createObjectURL(data.file);let delivery;let requestKey=crypto.randomUUID(),submitting=false;
  const needsPictures=snapshot.picturePreviews==='handwrytten';let pictures=needsPictures?previews.peek(data):null,previewController=null,activeView='front';
  dialog=document.createElement('dialog');dialog.className='ks-print-dialog';dialog.setAttribute('aria-labelledby','print-title');
  dialog.innerHTML=`<div class="ks-top"><div class="ks-print-heading"><h2 id="print-title" tabindex="-1">Mail this keepsake?</h2>${['local_mock','simulation'].includes(snapshot.mode)?'<span class="ks-simulation">Orders are simulated<span>No physical mail or charges</span></span>':''}</div><button class="ks-icon" data-close-print aria-label="Close order confirmation"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="ks-print-body"><div data-print-pictures>${needsPictures&&!pictures?pendingMarkup():cardMarkup()}</div><div data-delivery-address></div><p class="ks-status" role="status" aria-live="polite"></p></div><div class="ks-bottom"><button class="ks-secondary" data-cancel-print>Not yet</button><button class="ks-primary" data-submit-print>${['local_mock','simulation'].includes(snapshot.mode)?'Confirm test order':'Yes, mail it'}</button></div>`;
  const sheet=dialog;document.body.append(dialog);bindFoldedCard(dialog,{onSwap:swapPictures,onView:view=>activeView=view});
  const message=text=>{sheet.querySelector('.ks-status').textContent=text;};
  const submit=dialog.querySelector('[data-submit-print]');
  function renderAddress(){if(!sheet.isConnected)return;const region=sheet.querySelector('[data-delivery-address]');region.innerHTML=delivery.markup();delivery.bind(region);submit.disabled=submitting||!delivery.ready||(needsPictures&&!pictures);}
  delivery=prepareDelivery();deliveryChanged=renderAddress;renderAddress();
  function release(){previewController?.abort();URL.revokeObjectURL(proofUrl);deliveryChanged=()=>{};delivery.destroy();if(preparedDelivery===delivery)preparedDelivery=null;sheet.remove();if(dialog===sheet)dialog=null;}
  dialog.addEventListener('close',release,{once:true});
  dialog.querySelector('[data-close-print]').onclick=()=>sheet.close();
  dialog.querySelector('[data-cancel-print]').onclick=()=>sheet.close();
  function pendingMarkup(){return `<section class="fc-preview" aria-label="Folded card preview">${foldedCardControlsMarkup({frontDesign:data.recipe.frontDesign,canSwap:data.personalized&&!submitting,activeView})}${loadingPictures}</section>`;}
  function bindPictures(region){bindFoldedCard(region,{onSwap:swapPictures,onView:view=>activeView=view});}
  function cardMarkup(){
   const swapped=data.personalized&&data.recipe.frontDesign==='default';
   return foldedCardMarkup({frontSrc:swapped?data.defaultSrc:proofUrl,insideSrc:data.personalized?(swapped?proofUrl:data.defaultSrc):null,preview:snapshot.preview,pictures,frontDesign:data.recipe.frontDesign,canSwap:data.personalized&&!submitting,activeView});
  }
  function renderCard(){const region=sheet.querySelector('[data-print-pictures]'),swap=region.querySelector('[data-swap-card]'),restore=swap&&document.activeElement===swap;region.innerHTML=cardMarkup();bindPictures(region);renderAddress();if(restore)region.querySelector('[data-swap-card]')?.focus({preventScroll:true});}
  function swapPictures(){
   if(submitting||!data.personalized)return;
   previewController?.abort();frontDesign=data.recipe.frontDesign==='personal'?'default':'personal';data=previewData();pictures=needsPictures?previews.peek(data):null;requestKey=crypto.randomUUID();message('');
   if(needsPictures&&!pictures)void preparePictures();else renderCard();
   sheet.querySelector('[data-swap-card]')?.focus({preventScroll:true});
  }
  async function preparePictures(){
   previewController?.abort();const current=previewController=new AbortController(),input=data,region=sheet.querySelector('[data-print-pictures]');
   region.innerHTML=pendingMarkup();bindPictures(region);pictures=null;renderAddress();
   try{
    const prepared=await previews.load(input,{retry:true});
    if(dialog!==sheet||current.signal.aborted||data!==input)return;
    pictures=prepared;renderCard();
   }catch(error){
    if(dialog!==sheet||current.signal.aborted||data!==input)return;
    region.innerHTML=`<section class="fc-preview">${foldedCardControlsMarkup({frontDesign:data.recipe.frontDesign,canSwap:data.personalized,activeView})}<p class="ks-description" role="status"></p><button type="button" class="ks-secondary" data-retry-pictures>Retry picture previews</button></section>`;bindPictures(region);
    region.querySelector('p').textContent=error.message||'The picture previews could not be prepared.';region.querySelector('[data-retry-pictures]').onclick=preparePictures;renderAddress();
   }
  }
  function finish(order){
   status={...status,eligible:false,canOrder:false,order,remaining:0};onChange(status);sheet.close();
   onOrdered(order.status==='simulated'?'Test keepsake order saved. No physical mail or charges.':order.status==='submitted'?'Keep an eye on your mailbox—your keepsake gift is headed your way 💌':'Your print request is recorded.',order.status==='simulated',order);
  }
  submit.onclick=async()=>{
   if(submitting||!delivery.ready||(needsPictures&&!pictures))return;submitting=true;submit.disabled=true;if(data.personalized)sheet.querySelector('[data-swap-card]')?.setAttribute('disabled','');message('Saving your order…');
   try{
    await delivery.confirm();await refresh();
    if(dialog!==sheet)return;
    if(status?.order){finish(status.order);return;}
    if(!status?.eligible||status.contentVersion!==snapshot.contentVersion||status.addressVersion!==delivery.state.version)throw new Error('The address, permissions or scrapbook changed. Reopen the order confirmation.');
    const form=new FormData();form.set('artwork',data.file);form.set('recipe',JSON.stringify({...data.recipe,...(pictures?{previewId:pictures.id}:{}),requestKey,confirmationKey:status.confirmationKey,addressVersion:delivery.state.version}));
    const response=await fetch('/api/print/orders',{method:'POST',body:form,signal:AbortSignal.timeout(30000)}),result=await response.json();
    if(!response.ok)throw new Error(result.error||'The order could not be confirmed.');
    if(dialog!==sheet){await refresh();return;}
    finish(result.order);
   }catch(error){await refresh();if(dialog!==sheet)return;if(status?.order){finish(status.order);}else{requestKey=crypto.randomUUID();submitting=false;if(data.personalized)sheet.querySelector('[data-swap-card]')?.removeAttribute('disabled');submit.disabled=!delivery.ready||(needsPictures&&!pictures);message(error.message+' No additional order will be created if one is already recorded.');}}

  };
  dialog.showModal();dialog.querySelector('#print-title').focus({preventScroll:true});if(needsPictures&&!pictures)void preparePictures();
 }
 return {buttonMarkup,prepare,bind:container=>{const b=container.querySelector('[data-print]');if(b)b.onclick=open;},refresh:()=>{closed=false;prepareDelivery();return refresh();},close:()=>{closed=true;controller?.abort();previews.close();deliveryChanged=()=>{};preparedDelivery?.destroy();preparedDelivery=null;if(dialog?.open)dialog.close();}};
}
