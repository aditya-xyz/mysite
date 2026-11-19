import {PrintProblem,type PrintEnv} from '../../src/printing.ts';
import {postcardAllowanceResettableSQL,postcardLiveJoinSQL,resetPostcardIntentStatement} from '../../src/live-gifts.ts';
export async function resetSimulatedOrder(env:PrintEnv,kind:'print'|'mug',year:number,invite:string,data:Record<string,unknown>){
 if(kind==='print')return resetPrintAllowance(env,year,invite,data);
 if(data.confirm!==true||typeof data.orderId!=='string'||!new RegExp(`^${kind}-[a-z0-9]+$`).test(data.orderId))throw new PrintProblem(400,'Confirm clearing this simulated order and its saved design.');
 // Atomic comparison with the current order prevents an old reset/retry or stale page from clearing a newer or live order.
 // Live mug orders (tracked in live_gift_orders) are deliberately ineligible for simulation-only reset even if status is still 'simulated'.
 const order=await env.DB.prepare(`DELETE FROM mug_orders WHERE id=?1 AND invitation_id=?2 AND year=?3 AND status='simulated' AND allowance_reset_at IS NULL AND NOT EXISTS(SELECT 1 FROM live_gift_orders l WHERE l.order_id=mug_orders.id AND l.kind='mug') RETURNING artwork_key,print_artwork_key`).bind(data.orderId,invite,year).first<{artwork_key:string;default_artwork_key?:string|null;print_artwork_key?:string|null}>();
 if(!order)throw new PrintProblem(409,'The order changed, is live, or is not a completed simulation. Refresh before resetting.');
 // DELETE triggers set the real counter back to zero. Its private proof is no longer accessible.
 await env.MEDIA.delete([...new Set([order.artwork_key,order.default_artwork_key,order.print_artwork_key].filter((key):key is string=>!!key))]).catch(()=>{});
 return {reset:true,count:0,historyCleared:true};
}

export async function resetPrintAllowance(env:PrintEnv,year:number,invite:string,data:Record<string,unknown>){
 if(data.confirm!==true||typeof data.orderId!=='string'||!/^print-(?:fallback-)?[a-z0-9]+$/.test(data.orderId))throw new PrintProblem(400,'Confirm allowing one more print for this invitation.');
 // Release only this completed reservation. The timestamp records which order
 // consumed the previous allowance, and existing triggers release the 0/1 marker.
 const reset=env.DB.prepare(`UPDATE print_orders SET allowance_reset_at=unixepoch(),updated_at=unixepoch()
 WHERE id=?1 AND invitation_id=?2 AND year=?3 AND allowance_reset_at IS NULL
 AND EXISTS(SELECT 1 FROM print_orders o LEFT JOIN print_fulfillment f ON f.order_id=o.id
 ${postcardLiveJoinSQL} WHERE o.id=print_orders.id AND ${postcardAllowanceResettableSQL})
 RETURNING id,allowance_reset_at`).bind(data.orderId,invite,year);
 const [result]=await env.DB.batch<{id:string;allowance_reset_at:number}>([reset,resetPostcardIntentStatement(env,data.orderId,invite,year)]);
 const order=result.results[0];
 if(!order)throw new PrintProblem(409,'The print allowance changed, or the order is still processing or uncertain. Refresh before resetting.');
 return {reset:true,remaining:1,historyCleared:false,orderId:order.id,resetAt:order.allowance_reset_at};
}
