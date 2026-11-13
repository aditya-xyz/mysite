import {handwryttenCheckoutQuote} from './handwrytten.ts';
import {prepareSavedOrderProof} from './handwrytten-previews.ts';
import {PrintProblem,type PrintEnv} from './printing.ts';
export async function quoteSavedPrintOrder(env:PrintEnv,year:number,orderId:string){
 const proof=await prepareSavedOrderProof(env,year,orderId);
 if(proof.status!=='ready')return {status:'preparing'};
 const order=await env.DB.prepare("SELECT handwrytten_order_json FROM print_orders WHERE id=?1 AND year=?2 AND status='simulated' AND allowance_reset_at IS NULL").bind(orderId,year).first<{handwrytten_order_json:string}>();
 if(!order)throw new PrintProblem(404,'Simulated order not found.');
 const payload=JSON.parse(order.handwrytten_order_json||'{}'),recipient=payload.addresses?.[0];
 if(payload.addresses?.length!==1||recipient?.to_country!=='United States'||typeof recipient.message!=='string')throw new PrintProblem(409,'This quote requires one saved US recipient and a printed note.');
 const quote=await handwryttenCheckoutQuote(env,{cardId:payload.card_id,message:[recipient.message,recipient.wishes].filter(Boolean).join('\n\n')});
 const saved=await env.DB.prepare("UPDATE print_orders SET handwrytten_quote_json=?1 WHERE id=?2 AND year=?3 AND status='simulated' AND allowance_reset_at IS NULL AND handwrytten_preview_id=?4 RETURNING id").bind(JSON.stringify(quote),orderId,year,proof.id).first();
 if(!saved)throw new PrintProblem(409,'This order changed or was reset. Reopen order history.');
 return {status:'ready',proofId:proof.id,quote};
}
