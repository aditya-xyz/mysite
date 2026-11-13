import {PrintProblem,type PrintEnv} from './printing.ts';
import {prepareSavedOrderProof} from './handwrytten-previews.ts';
import {handwryttenBasket,handwryttenTestMutation,handwryttenSender,handwryttenCountry,requireHandwryttenTestMode,handwryttenTestOrder} from './handwrytten.ts';
import {now} from './security.ts';
export const printOrderLimitCents=1000;
const itemsOf=(basket:any):any[]=>Array.isArray(basket.items)?basket.items:Object.values(basket.items||{});
function cents(value:unknown){if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0)throw new PrintProblem(502,'Checkout pricing is incomplete.');const n=Math.round(Number(value)*100);if(!Number.isSafeInteger(n)||Math.abs(Number(value)*100-n)>.001)throw new PrintProblem(502,'Checkout pricing is invalid.');return n;}
export function checkedBasket(basket:any,expected:{orderId:string;cardId:number;vendorId?:number;country:string}){
 if(Number(basket.test_mode)!==1)throw new PrintProblem(409,'Handwrytten Test Mode is required.');
 const items=itemsOf(basket),item=items[0];
 if(items.length!==1||item.client_metadata!==expected.orderId||Number(item.card_id)!==expected.cardId||Number(item.quantity)!==1||(expected.vendorId&&Number(item.id)!==expected.vendorId)||item.card_orders?.length!==1)throw new PrintProblem(409,'The Handwrytten basket contains a different order.');
 const country=item.address_to?.country||item.children?.[0]?.address_to?.country;
 if(country!==expected.country)throw new PrintProblem(409,'The checkout destination does not match the saved address.');
 const amounts={card:cents(item.totals?.card),postage:cents(item.totals?.delivery_cost),shipping:cents(item.totals?.shipping),inserts:cents(item.totals?.insert),bundles:0,tax:cents(basket.totals?.tax),subtotal:cents(item.totals?.subtotal),total:cents(basket.totals?.total)};
 if(cents(item.totals?.gift_card)!==0||amounts.inserts!==0||amounts.card+amounts.postage+amounts.shipping!==amounts.subtotal||amounts.subtotal!==cents(basket.totals?.grand_total)||amounts.subtotal+amounts.tax!==amounts.total)throw new PrintProblem(502,'Checkout totals could not be verified.');
 const funding:Record<string,number>={money:0,coupon:0,credit1:0,credit2:0};
 for(const group of Object.values(item.price_structure||{}) as any[]){for(const [key,value] of Object.entries(group)){if(key==='total')continue;if(!Object.hasOwn(funding,key)&&cents(value)>0)throw new PrintProblem(502,'Checkout payment structure is unsupported.');if(Object.hasOwn(funding,key))funding[key]+=cents(value);}}
 if(Object.values(funding).reduce((a,b)=>a+b,0)!==amounts.total)throw new PrintProblem(502,'Checkout payment total could not be verified.');
 const vendorId=Number(item.id),basketId=Number(item.card_orders[0].id);
 if(!Number.isSafeInteger(vendorId)||vendorId<=0||!Number.isSafeInteger(basketId)||basketId<=0)throw new PrintProblem(502,'Checkout did not identify the staged order.');
 return {amounts,priceStructure:Object.fromEntries(Object.entries(funding).map(([k,v])=>[k,v/100])),vendorId,basketId};
}
export async function tickPrintFulfillment(env:PrintEnv,preferredId?:string){
 if(env.PRINT_ORDER_MODE!=='handwrytten_test')return;
 await env.DB.prepare("DELETE FROM print_fulfillment_lock WHERE EXISTS (SELECT 1 FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id WHERE print_fulfillment_lock.owner LIKE f.order_id||':%' AND f.state='submitted' AND o.status='submitted')").run();
 // Expired non-idempotent calls are never replayed. Their remote result needs reconciliation.
 await env.DB.prepare("UPDATE print_fulfillment SET state='unknown',error='Submission outcome needs review; it will not be retried automatically.',updated_at=?1 WHERE state IN ('staging','staged','submitting') AND updated_at<?2").bind(now(),now()-600).run();
 const job=await env.DB.prepare(`SELECT f.*,o.year,o.handwrytten_order_json,o.address_json FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id
 WHERE o.status='simulated' AND o.allowance_reset_at IS NULL AND ((f.state='pending' AND f.next_at<=?1) OR (f.state='preparing' AND f.updated_at<?2))
 ORDER BY CASE WHEN f.order_id=?3 THEN 0 ELSE 1 END,f.created_at LIMIT 1`).bind(now(),now()-300,preferredId||'').first<any>();
 if(!job)return;
 const owner=job.order_id+':'+crypto.randomUUID();
 const lock=await env.DB.prepare(`INSERT INTO print_fulfillment_lock(id,owner,lease_until,blocked) VALUES(1,?1,?2,0)
 ON CONFLICT(id) DO UPDATE SET owner=?1,lease_until=?2 WHERE lease_until<?3 AND blocked=0 RETURNING owner`).bind(owner,now()+300,now()).first();
 if(!lock)return;
 let mutated=false,canRelease=true;
 const update=async(state:string,error:string|null=null)=>{await env.DB.prepare('UPDATE print_fulfillment SET state=?1,error=?2,updated_at=?3 WHERE order_id=?4').bind(state,error,now(),job.order_id).run();};
 try{
  const current=await env.DB.prepare('SELECT f.state,o.status FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id WHERE f.order_id=?1').bind(job.order_id).first<any>();
  if(!current||current.status!=='simulated'||!['pending','preparing','staged'].includes(current.state)){canRelease=true;return;}
  await requireHandwryttenTestMode(env);
  if(!mutated){
   await env.DB.prepare("UPDATE print_fulfillment SET state='preparing',attempts=attempts+1,updated_at=?1 WHERE order_id=?2").bind(now(),job.order_id).run();
   const proof=await prepareSavedOrderProof(env,job.year,job.order_id);
   if(proof.status!=='ready'){await update('pending');return;}
  }
  const saved=await env.DB.prepare("SELECT handwrytten_order_json,address_json FROM print_orders WHERE id=?1 AND status='simulated' AND allowance_reset_at IS NULL").bind(job.order_id).first<any>();
  if(!saved)throw new PrintProblem(409,'The saved order was reset.');
  const payload=JSON.parse(saved.handwrytten_order_json),address=JSON.parse(saved.address_json),country=await handwryttenCountry(env,address.country),sender=await handwryttenSender(env);
  if(payload.addresses?.length!==1||payload.addresses[0].to_country!==country.name)throw new PrintProblem(409,'The saved destination does not match.');
  if(!mutated){
   if(itemsOf(await handwryttenBasket(env)).length)throw new PrintProblem(409,'The Handwrytten basket has another unsent order.');
   // Block lease takeover before any non-idempotent call, including after a crash.
   const fenced=await env.DB.prepare("UPDATE print_fulfillment_lock SET blocked=1 WHERE id=1 AND owner=?1 AND blocked=0 AND lease_until>?2 RETURNING owner").bind(owner,now()).first();
   if(!fenced)return;
   await update('staging');
   mutated=true;canRelease=false;
   await handwryttenTestMutation(env,'/orders/placeBasket',{...payload,return_address_id:sender.id,shipping_method_id:1,addresses:payload.addresses.map((a:any)=>({...a,return_address_id:sender.id,to_country_id:country.id}))});
  }
  const basket=await handwryttenBasket(env),checked=checkedBasket(basket,{orderId:job.order_id,cardId:payload.card_id,vendorId:job.vendor_order_id||undefined,country:country.name});
  const quote={currency:'USD',quantity:1,amounts:checked.amounts,quotedAt:now(),sender,destination:country.name,source:'handwrytten-test-basket',submitted:false};
  await env.DB.batch([env.DB.prepare("UPDATE print_fulfillment SET state='staged',vendor_order_id=?1,basket_item_id=?2,updated_at=?3 WHERE order_id=?4").bind(checked.vendorId,checked.basketId,now(),job.order_id),env.DB.prepare('UPDATE print_orders SET handwrytten_quote_json=?1 WHERE id=?2').bind(JSON.stringify(quote),job.order_id)]);
  if(checked.amounts.total>printOrderLimitCents){
   await handwryttenTestMutation(env,'/basket/remove',{id:checked.basketId});
   if(itemsOf(await handwryttenBasket(env)).some(i=>Number(i.id)===checked.vendorId))throw new PrintProblem(502,'The over-limit draft could not be removed.');
   canRelease=true;await env.DB.prepare('UPDATE print_fulfillment SET basket_item_id=NULL WHERE order_id=?1').bind(job.order_id).run();await update('review','Checkout exceeds the $10 household limit. No order was submitted.');return;
  }
  // Re-read exact basket identities, total and funding immediately before submission.
  const final=checkedBasket(await handwryttenBasket(env),{orderId:job.order_id,cardId:payload.card_id,vendorId:checked.vendorId,country:country.name});
  if(JSON.stringify(final)!==JSON.stringify(checked))throw new PrintProblem(409,'Checkout changed before submission.');
  const ready=await env.DB.prepare("UPDATE print_fulfillment SET state='submitting',updated_at=?1 WHERE order_id=?2 AND state='staged' AND EXISTS(SELECT 1 FROM print_fulfillment_lock WHERE id=1 AND owner=?3 AND blocked=1) RETURNING order_id").bind(now(),job.order_id,owner).first();
  if(!ready)throw new PrintProblem(409,'The checkout lease changed.');
  // The vendor may accept payment before a response is lost or has an unusual shape.
  // Reconcile the known parent order ID; never repeat the submit call.
  try{await handwryttenTestMutation(env,'/basket/send',{test_mode:1,check_quantity:true,price_structure:checked.priceStructure});}catch{/* Verify the known order record below. */}
  const accepted=await handwryttenTestOrder(env,checked.vendorId);
  if(Number(accepted?.id)!==checked.vendorId||accepted.client_metadata!==job.order_id||accepted.status!=='test'||Number(accepted.test_mode)!==1||Number(accepted.quantity)!==1||cents(accepted.payed)>printOrderLimitCents)throw new PrintProblem(502,'The Test Mode order acceptance could not be confirmed.');
  await env.DB.batch([env.DB.prepare("UPDATE print_orders SET status='submitted',provider_id=?1,handwrytten_quote_json=?2,updated_at=?3 WHERE id=?4 AND status='simulated'").bind('handwrytten-test-'+checked.vendorId,JSON.stringify({...quote,submitted:true}),now(),job.order_id),env.DB.prepare("UPDATE print_fulfillment SET state='submitted',error=NULL,updated_at=?1 WHERE order_id=?2").bind(now(),job.order_id)]);
  canRelease=true;
 }catch(error){
  if(!await env.DB.prepare('SELECT owner FROM print_fulfillment_lock WHERE id=1 AND owner=?1').bind(owner).first())return;
  if(mutated){await update('unknown','Handwrytten needs review. This order will not be submitted again automatically.');await env.DB.prepare("UPDATE print_orders SET status='unknown',updated_at=?1 WHERE id=?2 AND status='simulated'").bind(now(),job.order_id).run();}
  else if(Number(job.attempts)<2&&error instanceof PrintProblem&&error.status>=500){await update('pending','Preparation will retry automatically.');await env.DB.prepare('UPDATE print_fulfillment SET next_at=?1 WHERE order_id=?2').bind(now()+60*(Number(job.attempts)+1),job.order_id).run();}
  else await update('review',error instanceof PrintProblem?error.message:'The saved order needs review before submission.');
 }finally{
  if(canRelease)await env.DB.prepare('DELETE FROM print_fulfillment_lock WHERE id=1 AND owner=?1').bind(owner).run();
 }
}
