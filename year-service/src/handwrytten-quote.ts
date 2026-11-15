import {handwryttenCheckoutQuote} from './handwrytten.ts';
import {tickPrintFulfillment} from './handwrytten-fulfillment.ts';
import {prepareSavedOrderProof} from './handwrytten-previews.ts';
import {PrintProblem,type PrintEnv} from './printing.ts';
export async function quoteSavedPrintOrder(env:PrintEnv,year:number,orderId:string){
 const queued=await env.DB.prepare('SELECT f.*,o.handwrytten_quote_json,o.handwrytten_preview_id FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id WHERE o.id=?1 AND o.year=?2').bind(orderId,year).first<any>();
 if(queued&&!queued.quote_only){if(queued.handwrytten_quote_json)return {status:'ready',proofId:queued.handwrytten_preview_id,quote:JSON.parse(queued.handwrytten_quote_json)};throw new PrintProblem(409,'The automatic test order is '+queued.state+'. Its destination-aware total will appear after checkout preparation.');}
 const proof=await prepareSavedOrderProof(env,year,orderId);
 if(proof.status!=='ready')return {status:'preparing'};
 const order=await env.DB.prepare("SELECT handwrytten_order_json,address_json FROM print_orders WHERE id=?1 AND year=?2 AND status='simulated' AND allowance_reset_at IS NULL").bind(orderId,year).first<{handwrytten_order_json:string;address_json:string}>();
 if(!order)throw new PrintProblem(404,'Simulated order not found.');
 const payload=JSON.parse(order.handwrytten_order_json||'{}'),recipient=payload.addresses?.[0];
 const address=JSON.parse(order.address_json||'{}'),country=({US:'United States',IN:'India',NL:'Netherlands'} as Record<string,string>)[address.country];
 if(payload.addresses?.length!==1||!country||recipient?.to_country!==country||typeof recipient.message!=='string')throw new PrintProblem(409,'This quote requires one supported saved recipient, a matching destination and a printed note.');
 if(address.country!=='US'||queued?.quote_only){
  // /outbound/process documents only US/Canada. International pricing comes
  // from an isolated Test Mode basket, never from a US postage substitution.
  if(env.PRINT_ORDER_MODE!=='handwrytten_test')throw new PrintProblem(409,'Enable the Handwrytten test-order connection to calculate this destination’s checkout total.');
  if(queued&&!['pending','preparing','review'].includes(queued.state))throw new PrintProblem(409,'This test quote needs review before it can be retried.');
  await env.DB.prepare("INSERT INTO print_fulfillment(order_id,state,quote_only) VALUES(?1,'pending',1) ON CONFLICT(order_id) DO UPDATE SET state='pending',next_at=unixepoch(),error=NULL WHERE quote_only=1 AND state='review'").bind(orderId).run();
  await tickPrintFulfillment(env,orderId);
  const fresh=await env.DB.prepare('SELECT f.state,f.error,o.handwrytten_quote_json,o.handwrytten_preview_id FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id WHERE o.id=?1').bind(orderId).first<any>();
  if(fresh?.state==='review'&&!fresh.error&&fresh.handwrytten_quote_json)return {status:'ready',proofId:fresh.handwrytten_preview_id,quote:JSON.parse(fresh.handwrytten_quote_json)};
  if(fresh&&['pending','preparing'].includes(fresh.state))return {status:'preparing'};
  throw new PrintProblem(409,fresh?.error||'The destination-aware test quote needs review. No live order was submitted.');
 }
 const quote=await handwryttenCheckoutQuote(env,{cardId:payload.card_id,message:[recipient.message,recipient.wishes].filter(Boolean).join('\n\n')});
 const saved=await env.DB.prepare("UPDATE print_orders SET handwrytten_quote_json=?1 WHERE id=?2 AND year=?3 AND status='simulated' AND handwrytten_preview_id=?4 RETURNING id").bind(JSON.stringify(quote),orderId,year,proof.id).first();
 if(!saved)throw new PrintProblem(409,'This order changed. Reopen order history.');
 return {status:'ready',proofId:proof.id,quote};
}
