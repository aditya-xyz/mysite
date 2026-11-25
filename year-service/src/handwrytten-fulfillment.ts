import {isAutomaticPostcard,livePostcardsConfigured} from './live-gifts.ts';
import {PrintProblem,type PrintEnv} from './printing.ts';
import {prepareSavedOrderProof} from './handwrytten-previews.ts';
import {handwryttenBasket,handwryttenTestMutation,handwryttenSender,handwryttenCountry,requireHandwryttenTestMode,handwryttenCheckoutQuote,handwryttenTestOrder,requireHandwryttenLiveMode,handwryttenLiveMutation} from './handwrytten.ts';
import {now} from './security.ts';
export const printOrderLimitCents=1000;
const itemsOf=(basket:any):any[]=>Array.isArray(basket.items)?basket.items:Object.values(basket.items||{});
function cents(value:unknown){if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0)throw new PrintProblem(502,'Checkout pricing is incomplete.');const n=Math.round(Number(value)*100);if(!Number.isSafeInteger(n)||Math.abs(Number(value)*100-n)>.001)throw new PrintProblem(502,'Checkout pricing is invalid.');return n;}
export function checkedBasket(basket:any,expected:{orderId:string;cardId:number;vendorId?:number;country:string;testMode?:boolean;address?:Record<string,unknown>}){
 if(Number(basket.test_mode)!==(expected.testMode===false?0:1))throw new PrintProblem(409,'Handwrytten checkout mode does not match the requested order.');
 const items=itemsOf(basket),item=items[0];
 if(items.length!==1||item.client_metadata!==expected.orderId||Number(item.card_id)!==expected.cardId||Number(item.quantity)!==1||(expected.vendorId&&Number(item.id)!==expected.vendorId)||item.card_orders?.length!==1)throw new PrintProblem(409,'The Handwrytten basket contains a different order.');
 const country=item.address_to?.country||item.children?.[0]?.address_to?.country;
 if(country!==expected.country)throw new PrintProblem(409,'The checkout destination does not match the saved address.');
 if(expected.address){
  const actual=item.address_to?.address1?item.address_to:item.children?.[0]?.address_to;
  const clean=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase();
  for(const [remote,saved] of [['address1','to_address1'],['address2','to_address2'],['city','to_city'],['state','to_state'],['zip','to_zip']])if(!actual||clean(actual[remote])!==clean(expected.address[saved]))throw new PrintProblem(409,'The checkout address does not match the saved gift.');
 }
 const amounts={card:cents(item.totals?.card),postage:cents(item.totals?.delivery_cost),shipping:cents(item.totals?.shipping),inserts:cents(item.totals?.insert),bundles:0,tax:cents(basket.totals?.tax),subtotal:cents(item.totals?.subtotal),total:cents(basket.totals?.total)};
 if(cents(item.totals?.gift_card)!==0||amounts.inserts!==0||amounts.card+amounts.postage+amounts.shipping!==amounts.subtotal||amounts.subtotal!==cents(basket.totals?.grand_total)||amounts.subtotal+amounts.tax!==amounts.total)throw new PrintProblem(502,'Checkout totals could not be verified.');
 const funding:Record<string,number>={money:0,coupon:0,credit1:0,credit2:0};
 for(const group of Object.values(item.price_structure||{}) as any[]){for(const [key,value] of Object.entries(group)){if(key==='total')continue;if(!Object.hasOwn(funding,key)&&cents(value)>0)throw new PrintProblem(502,'Checkout payment structure is unsupported.');if(Object.hasOwn(funding,key))funding[key]+=cents(value);}}
 if(Object.values(funding).reduce((a,b)=>a+b,0)!==amounts.total)throw new PrintProblem(502,'Checkout payment total could not be verified.');
 const vendorId=Number(item.id),basketId=Number(item.card_orders[0].id);
 if(!Number.isSafeInteger(vendorId)||vendorId<=0||!Number.isSafeInteger(basketId)||basketId<=0)throw new PrintProblem(502,'Checkout did not identify the staged order.');
 return {amounts,priceStructure:Object.fromEntries(Object.entries(funding).map(([k,v])=>[k,v/100])),vendorId,basketId};
}
function verifyAcceptedOrder(accepted:any,expected:{orderId:string;vendorId:number;testMode:boolean;approvedLimit:number}){
 if(!accepted||Number(accepted.id)!==expected.vendorId||accepted.client_metadata!==expected.orderId)return false;
 if(expected.testMode?accepted.status!=='test':!['paid','suspended','pending','processing','sent','completed'].includes(String(accepted.status).toLowerCase()))return false;
 if(Number(accepted.test_mode)!==(expected.testMode?1:0)||Number(accepted.quantity)!==1)return false;
 try{if(cents(accepted.payed)>expected.approvedLimit)return false;}catch{return false;}
 return true;
}
function ambiguousOrderMessage(vendorId:number|null|undefined,detail?:string){
 const ref=Number.isSafeInteger(vendorId)&&Number(vendorId)>0?`Handwrytten order #${vendorId}`:'Handwrytten order';
 return `${ref}${detail?`: ${detail}`:' outcome is ambiguous'}. Verify order status, payment, and Handwrytten basket before clearing; it will not be resubmitted automatically.`;
}
function cleanQuoteForSubmit(quote:any,testMode:boolean){
 const base=quote&&typeof quote==='object'&&!Array.isArray(quote)?{...quote}:{};
 delete base.submitAttempted;
 return JSON.stringify({...base,testMode:typeof base.testMode==='boolean'?base.testMode:testMode,submitted:true});
}
async function recordSubmitted(env:PrintEnv,live:boolean,owner:string,orderId:string,vendorId:number,testMode:boolean,quote:any):Promise<boolean>{
 const at=now(),providerId=(testMode?'handwrytten-test-':'handwrytten-live-')+vendorId,savedQuote=cleanQuoteForSubmit(quote,testMode);
 const statements=[
  env.DB.prepare("UPDATE print_orders SET status='submitted',provider_id=?1,handwrytten_quote_json=?2,updated_at=?3 WHERE id=?4 AND status IN ('simulated','unknown','submitted') AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?5 AND blocked=1)").bind(providerId,savedQuote,at,orderId,owner),
  env.DB.prepare("UPDATE print_fulfillment SET state='submitted',error=NULL,updated_at=?1 WHERE order_id=?2 AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?3 AND blocked=1)").bind(at,orderId,owner),
  ...(live?[env.DB.prepare("UPDATE live_gift_orders SET state='submitted',provider_id=?1,quote_json=?2,error=NULL,updated_at=?3 WHERE order_id=?4 AND kind='postcard' AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?5 AND blocked=1)").bind(String(vendorId),savedQuote,at,orderId,owner)]:[]),
  env.DB.prepare('DELETE FROM print_fulfillment_lock WHERE id=1 AND owner=?1 AND blocked=1 RETURNING owner').bind(owner)
 ];
 const results=await env.DB.batch(statements);
 return Boolean(results[results.length-1]?.results?.length);
}
async function markUnknown(env:PrintEnv,live:boolean,owner:string,orderId:string,error:string,allowReconcile:boolean){
 const at=now();
 const statements=[
  env.DB.prepare("UPDATE print_fulfillment SET state='unknown',error=?1,updated_at=?2 WHERE order_id=?3 AND state!='submitted' AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?4 AND blocked=1)").bind(error,at,orderId,owner),
  env.DB.prepare("UPDATE print_orders SET status='unknown',updated_at=?1 WHERE id=?2 AND status='simulated' AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?3 AND blocked=1)").bind(at,orderId,owner),
  ...(live?[env.DB.prepare("UPDATE live_gift_orders SET state='unknown',error=?1,updated_at=?2 WHERE order_id=?3 AND kind='postcard' AND state!='submitted' AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?4 AND blocked=1)").bind(error,at,orderId,owner)]:[]),
  ...(allowReconcile?[env.DB.prepare('UPDATE print_fulfillment_lock SET lease_until=0 WHERE id=1 AND owner=?1 AND blocked=1').bind(owner)]:[])
 ];
 await env.DB.batch(statements);
}
// Reconcile any blocked fulfillment lock before picking up another order. Post-send
// uncertainty only performs a read-only vendor lookup; mutations are never replayed.
async function reconcileBlockedLock(env:PrintEnv,live:boolean):Promise<'clear'|'blocked'>{
 const lock=await env.DB.prepare('SELECT owner,lease_until,blocked FROM print_fulfillment_lock WHERE id=1').first<{owner:string;lease_until:number;blocked:number}>();
 if(!lock||!lock.blocked)return 'clear';
 const sep=lock.owner.lastIndexOf(':'),orderId=sep>0?lock.owner.slice(0,sep):lock.owner;
 const blocked=await env.DB.prepare(`SELECT f.*,o.status AS order_status,o.provider_id AS order_provider_id,o.handwrytten_quote_json,o.budget_approved_cents${live?',l.state AS live_state':''} FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id${live?" LEFT JOIN live_gift_orders l ON l.order_id=o.id AND l.kind='postcard'":''} WHERE f.order_id=?1`).bind(orderId).first<any>();
 if(!blocked)return 'blocked';
 if(blocked.state==='submitted'&&blocked.order_status==='submitted'&&(!live||blocked.live_state==='submitted')){
  await env.DB.prepare('DELETE FROM print_fulfillment_lock WHERE id=1 AND owner=?1 AND blocked=1').bind(lock.owner).run();
  return 'clear';
 }
 if(Number(lock.lease_until)>now())return 'blocked';
 let quote:any=null;try{quote=blocked.handwrytten_quote_json?JSON.parse(blocked.handwrytten_quote_json):null;}catch{}
 const vendorId=Number(blocked.vendor_order_id),hasVendorId=Number.isSafeInteger(vendorId)&&vendorId>0;
 const reconcilableState=blocked.state==='submitting'||blocked.state==='submitted'||blocked.order_status==='submitted'||(blocked.state==='unknown'&&blocked.order_status==='unknown')||Boolean(quote?.submitAttempted)||Boolean(quote?.submitted);
 const inferredTestMode=!live?true:typeof quote?.testMode==='boolean'?quote.testMode:blocked.order_provider_id?.startsWith('handwrytten-test-')?true:blocked.order_provider_id?.startsWith('handwrytten-live-')?false:null;
 if(!hasVendorId||blocked.quote_only||!reconcilableState||inferredTestMode===null){
  if(blocked.state!=='unknown'||blocked.order_status==='simulated'||(live&&blocked.live_state&&blocked.live_state!=='unknown')){
   const recoveryOwner=orderId+':'+crypto.randomUUID();
   const takeover=await env.DB.prepare('UPDATE print_fulfillment_lock SET owner=?1,lease_until=?2 WHERE id=1 AND owner=?3 AND blocked=1 AND lease_until<=?4 RETURNING owner').bind(recoveryOwner,now()+300,lock.owner,now()).first();
   if(!takeover)return 'blocked';
   try{await markUnknown(env,live,recoveryOwner,orderId,ambiguousOrderMessage(hasVendorId?vendorId:null,blocked.error||'Submission stopped before confirmation'),false);}catch{}
  }
  return 'blocked';
 }
 const recoveryOwner=orderId+':'+crypto.randomUUID();
 const takeover=await env.DB.prepare('UPDATE print_fulfillment_lock SET owner=?1,lease_until=?2 WHERE id=1 AND owner=?3 AND blocked=1 AND lease_until<=?4 RETURNING owner').bind(recoveryOwner,now()+300,lock.owner,now()).first();
 if(!takeover)return 'blocked';
 try{
  const approvedLimit=live?printOrderLimitCents:Math.max(printOrderLimitCents,Number(blocked.budget_approved_cents)||0);
  const accepted=await handwryttenTestOrder(env,vendorId);
  if(!verifyAcceptedOrder(accepted,{orderId,vendorId,testMode:inferredTestMode,approvedLimit})){
   const observed=accepted?.status?`observed status "${String(accepted.status)}"`:'order details could not be confirmed';
   await markUnknown(env,live,recoveryOwner,orderId,ambiguousOrderMessage(vendorId,observed),true);
   return 'blocked';
  }
  const recorded=await recordSubmitted(env,live,recoveryOwner,orderId,vendorId,inferredTestMode,quote);
  return recorded?'clear':'blocked';
 }catch(error){
  const detail=error instanceof PrintProblem?error.message:'local persistence or vendor lookup failed';
  try{await markUnknown(env,live,recoveryOwner,orderId,ambiguousOrderMessage(vendorId,detail),true);}catch{}
  return 'blocked';
 }
}
export async function tickPrintFulfillment(env:PrintEnv,preferredId?:string){
 const live=livePostcardsConfigured(env);
 if(!live&&env.PRINT_ORDER_MODE!=='handwrytten_test')return;
 if(await reconcileBlockedLock(env,live)!=='clear')return;
 // Expired non-idempotent calls are never replayed. Their remote result needs reconciliation.
 await env.DB.prepare("UPDATE print_fulfillment SET state='unknown',error='Submission outcome needs review; it will not be retried automatically.',updated_at=?1 WHERE state IN ('staging','staged','submitting') AND updated_at<?2").bind(now(),now()-600).run();
 const job=await env.DB.prepare(`SELECT f.*,o.year,o.handwrytten_order_json,o.address_json FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id
 WHERE ${live?"EXISTS(SELECT 1 FROM live_gift_orders l WHERE l.order_id=o.id AND l.kind='postcard' AND l.state='pending') AND":"NOT EXISTS(SELECT 1 FROM live_gift_orders l WHERE l.order_id=o.id AND l.kind='postcard') AND"} o.status='simulated' AND o.allowance_reset_at IS NULL AND ((f.state='pending' AND f.next_at<=?1) OR (f.state='preparing' AND f.updated_at<?2))
 ORDER BY CASE WHEN f.order_id=?3 THEN 0 ELSE 1 END,f.created_at LIMIT 1`).bind(now(),now()-300,preferredId||'').first<any>();
 if(!job)return;
 const owner=job.order_id+':'+crypto.randomUUID();
 const lock=await env.DB.prepare(`INSERT INTO print_fulfillment_lock(id,owner,lease_until,blocked) VALUES(1,?1,?2,0)
 ON CONFLICT(id) DO UPDATE SET owner=?1,lease_until=?2 WHERE lease_until<?3 AND blocked=0 RETURNING owner`).bind(owner,now()+300,now()).first();
 if(!lock)return;
 let mutated=false,submitting=false,acceptedOrder=false,canRelease=true,stagedVendorId:number|null=null;
 const mutation=(path:'/orders/placeBasket'|'/basket/send'|'/basket/remove',body:Record<string,unknown>)=>live?handwryttenLiveMutation(env,job.order_id,path,body):handwryttenTestMutation(env,path,body);
 const update=async(state:string,error:string|null=null)=>{await env.DB.prepare('UPDATE print_fulfillment SET state=?1,error=?2,updated_at=?3 WHERE order_id=?4').bind(state,error,now(),job.order_id).run();if(live&&['review','unknown','submitted'].includes(state))await env.DB.prepare('UPDATE live_gift_orders SET state=?1,error=?2,updated_at=?3 WHERE order_id=?4').bind(state,error,now(),job.order_id).run();};
 try{
  const current=await env.DB.prepare('SELECT f.state,o.status FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id WHERE f.order_id=?1').bind(job.order_id).first<any>();
  if(!current||current.status!=='simulated'||!['pending','preparing','staged'].includes(current.state)){canRelease=true;return;}
  // The supplier account setting determines whether this household checkout is a test.
  const testMode=live?await requireHandwryttenLiveMode(env,job.order_id):(await requireHandwryttenTestMode(env),true);
  if(live&&testMode&&isAutomaticPostcard(job.order_id)){
   const at=now();
   await env.DB.prepare("UPDATE print_fulfillment SET state='pending',next_at=?1,updated_at=?2,error=?3 WHERE order_id=?4").bind(at+300,at,'Waiting for Handwrytten Test Mode to be turned off.',job.order_id).run();
   return;
  }
  if(!mutated){
   await env.DB.prepare("UPDATE print_fulfillment SET state='preparing',attempts=attempts+1,updated_at=?1 WHERE order_id=?2").bind(now(),job.order_id).run();
   const proof=await prepareSavedOrderProof(env,job.year,job.order_id);
   if(proof.status!=='ready'){await update('pending');return;}
  }
  const saved=await env.DB.prepare("SELECT handwrytten_order_json,address_json,budget_approved_cents FROM print_orders WHERE id=?1 AND status='simulated' AND allowance_reset_at IS NULL").bind(job.order_id).first<any>();
  if(!saved)throw new PrintProblem(409,'The saved order was reset.');
  const payload=JSON.parse(saved.handwrytten_order_json),address=JSON.parse(saved.address_json),country=await handwryttenCountry(env,address.country),sender=await handwryttenSender(env);
  if(payload.addresses?.length!==1||payload.addresses[0].to_country!==country.name)throw new PrintProblem(409,'The saved destination does not match.');
  // The campaign pricing preview accepts only US and Canadian destinations.
  // For other destinations the validated, unsent basket supplies the capped quote.
  if(live&&['US','CA'].includes(address.country)){
   const preview=await handwryttenCheckoutQuote(env,{cardId:payload.card_id,message:payload.addresses[0].message,orderId:job.order_id,country:country.name});
   await env.DB.prepare('UPDATE print_orders SET handwrytten_quote_json=?1,budget_review_required=?2 WHERE id=?3').bind(JSON.stringify({...preview,testMode,maxCents:1000}),Number(preview.amounts.total>1000),job.order_id).run();
   if(preview.amounts.total>1000){await update('review','The postcard preview exceeds $10. No order was submitted.');return;}
  }
  if(!mutated){
   if(itemsOf(await handwryttenBasket(env)).length)throw new PrintProblem(409,'The Handwrytten basket has another unsent order.');
   // Block lease takeover before any non-idempotent call, including after a crash.
   const fenced=await env.DB.prepare("UPDATE print_fulfillment_lock SET blocked=1 WHERE id=1 AND owner=?1 AND blocked=0 AND lease_until>?2 RETURNING owner").bind(owner,now()).first();
   if(!fenced)return;
   await update('staging');
   mutated=true;canRelease=false;
   await mutation('/orders/placeBasket',{...payload,return_address_id:sender.id,shipping_method_id:1,addresses:payload.addresses.map((a:any)=>({...a,return_address_id:sender.id,to_country_id:country.id}))});
  }
  const approvedLimit=live?printOrderLimitCents:Math.max(printOrderLimitCents,Number(saved.budget_approved_cents)||0);
  const basket=await handwryttenBasket(env),checked=checkedBasket(basket,{orderId:job.order_id,cardId:payload.card_id,vendorId:job.vendor_order_id||undefined,country:country.name,testMode,...(live?{address:payload.addresses[0]}:{})});
  stagedVendorId=checked.vendorId;
  const quote={currency:'USD',quantity:1,amounts:checked.amounts,quotedAt:now(),sender,destination:country.name,source:testMode?'handwrytten-test-basket':'handwrytten-live-basket',submitted:false,testMode,quoteOnly:!!job.quote_only,maxCents:printOrderLimitCents,withinBudget:checked.amounts.total<=printOrderLimitCents,approvedMaxCents:saved.budget_approved_cents||null};
  await env.DB.batch([env.DB.prepare("UPDATE print_fulfillment SET state='staged',vendor_order_id=?1,basket_item_id=?2,updated_at=?3 WHERE order_id=?4").bind(checked.vendorId,checked.basketId,now(),job.order_id),env.DB.prepare('UPDATE print_orders SET handwrytten_quote_json=?1,budget_review_required=?3 WHERE id=?2').bind(JSON.stringify(quote),job.order_id,Number(!job.quote_only&&checked.amounts.total>approvedLimit))]);
  if(job.quote_only||checked.amounts.total>approvedLimit){
   await mutation('/basket/remove',{id:checked.basketId});
   if(itemsOf(await handwryttenBasket(env)).some(i=>Number(i.id)===checked.vendorId))throw new PrintProblem(502,'The unsent draft could not be removed.');
   canRelease=true;await env.DB.prepare('UPDATE print_fulfillment SET basket_item_id=NULL WHERE order_id=?1').bind(job.order_id).run();await update('review',job.quote_only?null:live?'The postcard exceeds the $10 limit. No order was submitted.':`Checkout exceeds the ${saved.budget_approved_cents?'approved':'automatic'} $${(approvedLimit/100).toFixed(2)} limit. Admin approval is required. No order was submitted.`);return;
  }
  // Re-read exact basket identities, total and funding immediately before submission.
  const final=checkedBasket(await handwryttenBasket(env),{orderId:job.order_id,cardId:payload.card_id,vendorId:checked.vendorId,country:country.name,testMode,...(live?{address:payload.addresses[0]}:{})});
  if(JSON.stringify(final)!==JSON.stringify(checked))throw new PrintProblem(409,'Checkout changed before submission.');
  const atSubmit=now(),attemptQuote=JSON.stringify({...quote,submitAttempted:true});
  const ready=await env.DB.batch([
   env.DB.prepare("UPDATE print_fulfillment SET state='submitting',updated_at=?1 WHERE order_id=?2 AND state='staged' AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?3 AND blocked=1) RETURNING order_id").bind(atSubmit,job.order_id,owner),
   env.DB.prepare("UPDATE print_orders SET handwrytten_quote_json=?1,updated_at=?2 WHERE id=?3 AND status='simulated' AND EXISTS(SELECT 1 FROM print_fulfillment WHERE order_id=?3 AND state='submitting')").bind(attemptQuote,atSubmit,job.order_id),
   ...(live?[env.DB.prepare("UPDATE live_gift_orders SET state='submitting',provider_id=?1,quote_json=?2,updated_at=?3 WHERE order_id=?4 AND kind='postcard' AND state='pending' AND EXISTS(SELECT 1 FROM print_fulfillment WHERE order_id=?4 AND state='submitting')").bind(String(checked.vendorId),attemptQuote,atSubmit,job.order_id)]:[])
  ]);
  if(!ready[0]?.results?.length)throw new PrintProblem(409,'The checkout lease changed.');
  submitting=true;
  // The vendor may accept payment before a response is lost or has an unusual shape.
  // Reconcile the known parent order ID; never repeat the submit call.
  try{await mutation('/basket/send',{test_mode:testMode?1:0,check_quantity:true,price_structure:checked.priceStructure});}catch{/* Verify the known order record below. */}
  const accepted=await handwryttenTestOrder(env,checked.vendorId);
  if(!verifyAcceptedOrder(accepted,{orderId:job.order_id,vendorId:checked.vendorId,testMode,approvedLimit})){
   const observed=accepted?.status?`observed status "${String(accepted.status)}"`:'acceptance could not be confirmed';
   throw new PrintProblem(502,observed);
  }
  acceptedOrder=true;
  await recordSubmitted(env,live,owner,job.order_id,checked.vendorId,testMode,quote);
  canRelease=false;
 }catch(error){
  try{
   if(!await env.DB.prepare('SELECT owner FROM print_fulfillment_lock WHERE id=1 AND owner=?1').bind(owner).first())return;
   if(submitting){
    const detail=acceptedOrder?'Handwrytten accepted the order, but recording it locally failed':(error instanceof PrintProblem?error.message:'order acceptance could not be confirmed');
    await markUnknown(env,live,owner,job.order_id,ambiguousOrderMessage(stagedVendorId,detail),true);
   }else if(mutated){
    await markUnknown(env,live,owner,job.order_id,ambiguousOrderMessage(stagedVendorId,error instanceof PrintProblem?error.message:'Staging in Handwrytten basket did not complete'),false);
   }else if(Number(job.attempts)<2&&error instanceof PrintProblem&&error.status>=500){
    await update('pending','Preparation will retry automatically.');
    await env.DB.prepare('UPDATE print_fulfillment SET next_at=?1 WHERE order_id=?2').bind(now()+60*(Number(job.attempts)+1),job.order_id).run();
   }else{
    await update('review',error instanceof PrintProblem?error.message:'The saved order needs review before submission.');
   }
  }catch{}
 }finally{
  if(canRelease)try{await env.DB.prepare('DELETE FROM print_fulfillment_lock WHERE id=1 AND owner=?1').bind(owner).run();}catch{}
 }
}
