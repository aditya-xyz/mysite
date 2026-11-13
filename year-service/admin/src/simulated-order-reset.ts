import {PrintProblem,type PrintEnv} from '../../src/printing.ts';
export async function resetSimulatedOrder(env:PrintEnv,kind:'print'|'mug',year:number,invite:string,data:Record<string,unknown>){
 if(kind==='print')return resetPrintAllowance(env,year,invite,data);
 if(data.confirm!==true||typeof data.orderId!=='string'||!new RegExp(`^${kind}-[a-z0-9]+$`).test(data.orderId))throw new PrintProblem(400,'Confirm clearing this simulated order and its saved design.');
 // Atomic comparison with the current order prevents an old reset/retry from clearing a newer one.
 // Live submitted/uncertain orders are deliberately ineligible for this simulation-only reset.
 const order=await env.DB.prepare(`DELETE FROM mug_orders WHERE id=?1 AND invitation_id=?2 AND year=?3 AND status='simulated' AND allowance_reset_at IS NULL RETURNING artwork_key`).bind(data.orderId,invite,year).first<{artwork_key:string;default_artwork_key?:string|null}>();
 if(!order)throw new PrintProblem(409,'The order changed or is not a completed simulation. Refresh before resetting.');
 // DELETE triggers set the real counter back to zero. Its private proof is no longer accessible.
 await env.MEDIA.delete([...new Set([order.artwork_key,order.default_artwork_key].filter((key):key is string=>!!key))]).catch(()=>{});
 return {reset:true,count:0,historyCleared:true};
}

export async function resetPrintAllowance(env:PrintEnv,year:number,invite:string,data:Record<string,unknown>){
 if(data.confirm!==true||typeof data.orderId!=='string'||!/^print-[a-z0-9]+$/.test(data.orderId))throw new PrintProblem(400,'Confirm allowing one more print for this invitation.');
 // Release only this completed reservation. The timestamp records which order
 // consumed the previous allowance, and existing triggers release the 0/1 marker.
 const order=await env.DB.prepare(`UPDATE print_orders SET allowance_reset_at=unixepoch(),updated_at=unixepoch()
 WHERE id=?1 AND invitation_id=?2 AND year=?3 AND allowance_reset_at IS NULL AND status IN ('simulated','submitted')
 AND NOT EXISTS(SELECT 1 FROM print_fulfillment f WHERE f.order_id=print_orders.id AND NOT (f.state='submitted' OR (f.state='review' AND f.basket_item_id IS NULL)))
 RETURNING id,allowance_reset_at`).bind(data.orderId,invite,year).first<{id:string;allowance_reset_at:number}>();
 if(!order)throw new PrintProblem(409,'The print allowance changed, or the order is still processing or uncertain. Refresh before resetting.');
 return {reset:true,remaining:1,historyCleared:false,orderId:order.id,resetAt:order.allowance_reset_at};
}
