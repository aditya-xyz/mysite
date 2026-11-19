import {PrintProblem,type PrintEnv} from './printing.ts';
import {printfulApi,printfulRecipient,validPrintfulShippingMethod} from './printful.ts';
import {requireLiveGift} from './live-gifts.ts';
import {digest,now,token} from './security.ts';
// @ts-expect-error Shared verified artwork versions, including per-area calibrations.
import {verifiedMugLayoutVersion} from '../web/mug-layout.js';

// Separate from the read-only catalog adapter: every mutation needs a persisted,
// household-scoped checkout intent. Draft creation never confirms an order.
async function provider(env:PrintEnv,orderId:string,path:string,body?:unknown){
 await requireLiveGift(env,orderId,'mug');
 if(!env.PRINTFUL_API_TOKEN||!env.PRINTFUL_STORE_ID||env.PRINTFUL_ENABLED!=='true')throw new PrintProblem(503,'Live mug ordering is not ready.');
 if(!/^\/orders(?:\?confirm=0&update_existing=0|\/(?:\d+|@[a-zA-Z0-9-]+)(?:\/confirm)?)$/.test(path))throw new PrintProblem(400,'Unsupported fulfillment request.');
 const response=await fetch('https://api.printful.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.PRINTFUL_API_TOKEN,'X-PF-Store-Id':env.PRINTFUL_STORE_ID,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new PrintProblem(503,'Printful could not confirm this request. It will not be submitted again automatically.');
 const data=await response.json() as any;
 if(!data.result||typeof data.result!=='object')throw new PrintProblem(502,'Printful returned an incomplete order.');
 return data.result;
}
const cents=(value:unknown)=>{
 if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Math.abs(Number(value)*100-Math.round(Number(value)*100))>.001)throw new PrintProblem(502,'The final mug price is not available.');
 return Math.round(Number(value)*100);
};
export function checkedMugDraft(order:any,payload:any,maxCents=2500){
 if(order.external_id!==payload.external_id||order.status!=='draft'||!Number.isSafeInteger(Number(order.id))||Number(order.id)<=0||order.shipping!==payload.shipping)throw new PrintProblem(409,'The supplier draft does not match this gift.');
 for(const [key,value] of Object.entries(payload.recipient))if(String(order.recipient?.[key]??'')!==String(value))throw new PrintProblem(409,'The supplier address does not match the saved address.');
 const items=order.items,item=items?.[0],expected=payload.items[0];
 if(!Array.isArray(items)||items.length!==1||item.variant_id!==expected.variant_id||item.quantity!==1||item.options?.some((o:any)=>o.id==='embroidery_type'))throw new PrintProblem(409,'The supplier mug does not match the selected gift.');
 const files=item.files?.filter((f:any)=>f.type==='default');
 if(files?.length!==1||files[0].url!==expected.files[0].url||item.files.length!==1)throw new PrintProblem(409,'The supplier print file does not match the saved artwork.');
 if(order.costs?.currency!=='USD')throw new PrintProblem(409,'The mug must be priced in US dollars.');
 const total=cents(order.costs.total),subtotal=cents(order.costs.subtotal),shipping=cents(order.costs.shipping),tax=cents(order.costs.tax),vat=cents(order.costs.vat),discount=cents(order.costs.discount);
 const other=['digitization','additional_fee','fulfillment_fee','retail_delivery_fee'].reduce((sum,k)=>sum+(order.costs[k]===undefined?0:cents(order.costs[k])),0);
 if(total!==subtotal+shipping+tax+vat+other-discount||total>maxCents||maxCents!==2500)throw new PrintProblem(409,'The final mug total exceeds $25 or could not be verified. No order was submitted.');
 return {currency:'USD',totalCents:total,subtotalCents:subtotal,shippingCents:shipping,taxCents:tax+vat,maxCents};
}
export async function liveMugSource(env:PrintEnv,capability:string){
 if(env.LIVE_GIFT_ORDERING!=='true')throw new PrintProblem(404,'Print file not found.');
 const row=await env.DB.prepare("SELECT o.print_artwork_key FROM live_gift_orders l JOIN mug_orders o ON o.id=l.order_id JOIN editions e ON e.year=l.year WHERE e.is_active=1 AND e.taken_offline_at IS NULL AND l.state IN ('working','draft','submitting','unknown','submitted') AND l.kind='mug' AND l.asset_token_hash=?1 AND l.asset_expires_at>?2").bind(await digest(capability),now()).first<{print_artwork_key:string}>();
 const file=row?.print_artwork_key&&await env.MEDIA.get(row.print_artwork_key);
 if(!file)throw new PrintProblem(404,'Print file not found.');
 return new Response(file.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
}
export async function tickLiveMugFulfillment(env:PrintEnv,preferredId?:string){
 if(env.LIVE_GIFT_ORDERING!=='true')return;
 // An expired mutation lease is ambiguous, never permission to charge again.
 const at=now();
 await env.DB.batch([
  env.DB.prepare("UPDATE live_gift_orders SET state='unknown',error='Submission needs review; it will not be retried automatically.',updated_at=?1 WHERE kind='mug' AND state IN ('working','submitting') AND lease_until<?1").bind(at),
  env.DB.prepare("UPDATE mug_orders SET status='unknown',updated_at=?1 WHERE status='simulated' AND id IN (SELECT order_id FROM live_gift_orders WHERE kind='mug' AND state='unknown')").bind(at)
 ]);
 const job=await env.DB.prepare("SELECT l.*,o.address_json,o.recipient_name,o.quote_json AS estimate_json,o.print_artwork_key,o.print_layout_version FROM live_gift_orders l JOIN mug_orders o ON o.id=l.order_id WHERE l.kind='mug' AND l.state IN ('pending','draft') AND l.lease_until<?1 AND o.status='simulated' AND o.allowance_reset_at IS NULL ORDER BY CASE WHEN l.order_id=?2 THEN 0 ELSE 1 END,l.created_at LIMIT 1").bind(now(),preferredId||'').first<any>();
 if(!job)return;
 const locked=await env.DB.prepare("UPDATE live_gift_orders SET lease_until=?1,state=CASE WHEN state='pending' THEN 'working' ELSE state END,updated_at=?2 WHERE order_id=?3 AND state=?4 AND lease_until<?2 RETURNING order_id").bind(now()+180,now(),job.order_id,job.state).first();
 if(!locked)return;
 let mutated=false;
 try{
  await requireLiveGift(env,job.order_id,'mug');
  if(!job.print_artwork_key||!verifiedMugLayoutVersion(job.print_layout_version))throw new PrintProblem(409,'The print-ready mug artwork needs review.');
  // Check the deployed credential before exporting a recipient or creating a draft.
  const access=await printfulApi(env,'/oauth/scopes') as {scopes?:{scope:string}[]};
  if(!Array.isArray(access.scopes)||!access.scopes.some(scope=>scope.scope==='orders'))throw new PrintProblem(503,'Printful’s connection is read-only. Pixelbook admins need to enable order creation before this gift can be submitted.');
  let payload=job.payload_json?JSON.parse(job.payload_json):null,remote:any;
  if(job.state==='pending'){
   const quote=JSON.parse(job.estimate_json||'null');
   if(!quote?.withinBudget||quote.currency!=='USD'||quote.totalCents>2500||!Number.isSafeInteger(quote.variantId)||!validPrintfulShippingMethod(quote.shippingMethod))throw new PrintProblem(409,'A current destination-aware mug quote is required.');
   const address=JSON.parse(job.address_json),capability=token(),origin=new URL(env.SOCIAL_JOURNAL_ORIGIN||env.JOURNAL_ORIGIN||'');
   if(quote.destination!==address.country)throw new PrintProblem(409,'A current destination-aware mug quote is required.');
   if(origin.protocol!=='https:')throw new PrintProblem(503,'The private print-file origin is unavailable.');
   payload={external_id:job.order_id,shipping:quote.shippingMethod,recipient:{name:job.recipient_name,...printfulRecipient(address)},items:[{variant_id:quote.variantId,quantity:1,files:[{type:'default',url:origin.origin+'/api/gift/order-source/'+capability}]}]};
   await env.DB.prepare('UPDATE live_gift_orders SET payload_json=?1,asset_token_hash=?2,asset_expires_at=?3 WHERE order_id=?4').bind(JSON.stringify(payload),await digest(capability),now()+7*86400,job.order_id).run();
   mutated=true;
   remote=await provider(env,job.order_id,'/orders?confirm=0&update_existing=0',payload);
   if(!Number.isSafeInteger(Number(remote.id))||Number(remote.id)<=0||remote.external_id!==job.order_id)throw new PrintProblem(502,'The mug draft could not be identified.');
   await env.DB.prepare("UPDATE live_gift_orders SET state='draft',provider_id=?1,updated_at=?2 WHERE order_id=?3 AND state='working'").bind(String(remote.id),now(),job.order_id).run();
   job.provider_id=String(remote.id);
  }
  remote=await provider(env,job.order_id,'/orders/'+Number(job.provider_id));
  // Printful can calculate draft costs and process the image asynchronously.
  // Poll this known unconfirmed draft; never create another or pay without costs.
  if(remote.id==Number(job.provider_id)&&remote.external_id===job.order_id&&remote.status==='draft'&&(!remote.costs||remote.costs.total==null||remote.items?.some((i:any)=>i.files?.some((f:any)=>['waiting','pending'].includes(f.status))))){
   if(job.created_at<now()-86400)throw new PrintProblem(409,'The supplier draft is still incomplete and needs review.');
   await env.DB.prepare("UPDATE live_gift_orders SET lease_until=?1,updated_at=?2 WHERE order_id=?3 AND state='draft'").bind(now()+10,now(),job.order_id).run();return;
  }
  if(remote.items?.some((i:any)=>i.files?.some((f:any)=>f.status==='failed')))throw new PrintProblem(409,'The supplier could not process the print file. No order was submitted.');
  const quote=checkedMugDraft(remote,payload);
  // Freeze and fence before the non-idempotent confirmation. All subsequent
  // runs exclude 'submitting' even if a response or worker is lost.
  await requireLiveGift(env,job.order_id,'mug');
  const ready=await env.DB.prepare("UPDATE live_gift_orders SET state='submitting',quote_json=?1,updated_at=?2 WHERE order_id=?3 AND state='draft' AND lease_until>?2 RETURNING order_id").bind(JSON.stringify(quote),now(),job.order_id).first();
  if(!ready)throw new PrintProblem(409,'The mug checkout changed.');
  mutated=true;
  try{await provider(env,job.order_id,'/orders/'+Number(job.provider_id)+'/confirm',{});}catch{/* Reconcile this exact draft ID once; never repeat confirmation. */}
  remote=await provider(env,job.order_id,'/orders/'+Number(job.provider_id));
  if(remote.external_id!==job.order_id||!['pending','inreview','inprocess','fulfilled','partial'].includes(remote.status)||remote.costs?.currency!=='USD'||cents(remote.costs.total)>2500)throw new PrintProblem(502,'The mug submission outcome needs review. Do not place another order.');
  await env.DB.batch([
   env.DB.prepare("UPDATE live_gift_orders SET state='submitted',error=NULL,updated_at=?1 WHERE order_id=?2 AND state='submitting'").bind(now(),job.order_id),
   env.DB.prepare("UPDATE mug_orders SET status='submitted',updated_at=?1 WHERE id=?2 AND status='simulated' AND EXISTS(SELECT 1 FROM live_gift_orders l WHERE l.order_id=mug_orders.id AND l.state='submitted')").bind(now(),job.order_id)
  ]);
 }catch(error){
  const current=await env.DB.prepare('SELECT state FROM live_gift_orders WHERE order_id=?1').bind(job.order_id).first<{state:string}>();
  if(!current||!['working','draft','submitting'].includes(current.state))return;
  const state=current.state==='submitting'||mutated&&current.state==='working'?'unknown':'review';
  await env.DB.batch([
   env.DB.prepare('UPDATE live_gift_orders SET state=?1,error=?2,updated_at=?3 WHERE order_id=?4 AND state=?5').bind(state,error instanceof PrintProblem?error.message:'The supplier request needs review. It will not be repeated automatically.',now(),job.order_id,current.state),
   env.DB.prepare("UPDATE mug_orders SET status='unknown',updated_at=?1 WHERE id=?2 AND status='simulated' AND EXISTS(SELECT 1 FROM live_gift_orders l WHERE l.order_id=mug_orders.id AND l.state='unknown')").bind(now(),job.order_id)
  ]);
 }
}
