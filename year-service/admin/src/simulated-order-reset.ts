import {PrintProblem,type PrintEnv} from '../../src/printing.ts';
export async function resetSimulatedOrder(env:PrintEnv,kind:'print'|'mug',year:number,invite:string,data:Record<string,unknown>){
 if(data.confirm!==true||typeof data.orderId!=='string'||!new RegExp(`^${kind}-[a-z0-9]+$`).test(data.orderId))throw new PrintProblem(400,'Confirm clearing this simulated order and its saved design.');
 // Atomic comparison with the current order prevents an old reset/retry from clearing a newer one.
 // Live submitted/uncertain orders are deliberately ineligible for this simulation-only reset.
 const order=await env.DB.prepare(`DELETE FROM ${kind}_orders WHERE id=?1 AND invitation_id=?2 AND year=?3 AND status='simulated' AND allowance_reset_at IS NULL RETURNING artwork_key`).bind(data.orderId,invite,year).first<{artwork_key:string}>();
 if(!order)throw new PrintProblem(409,'The order changed or is not a completed simulation. Refresh before resetting.');
 // DELETE triggers set the real counter back to zero. Its private proof is no longer accessible.
 await env.MEDIA.delete(order.artwork_key).catch(()=>{});
 return {reset:true,count:0,historyCleared:true};
}
