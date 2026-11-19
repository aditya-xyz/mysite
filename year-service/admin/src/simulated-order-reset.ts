import {PrintProblem,type PrintEnv} from '../../src/printing.ts';
import {postcardAllowanceResettableSQL,postcardLiveJoinSQL,resetPostcardIntentStatement} from '../../src/live-gifts.ts';
export const mugLiveJoinSQL="LEFT JOIN live_gift_orders l ON l.order_id=o.id AND l.kind='mug'";
export const mugAllowanceResettableSQL=`((o.status='simulated' AND l.order_id IS NULL)
 OR (o.status='submitted' AND l.invitation_id=o.invitation_id AND l.year=o.year AND l.state='submitted' AND l.provider_id NOT GLOB '*[^0-9]*' AND CAST(l.provider_id AS INTEGER)>0 AND l.allowance_reset_at IS NULL))`;

export async function resetMugAllowance(env:PrintEnv,year:number,invite:string,data:Record<string,unknown>){
 if(data.confirm!==true||typeof data.orderId!=='string'||!/^mug-[a-z0-9]+$/.test(data.orderId))throw new PrintProblem(400,'Confirm allowing one more mug for this invitation.');
 const reset=env.DB.prepare(`UPDATE mug_orders SET allowance_reset_at=unixepoch(),updated_at=unixepoch()
 WHERE id=?1 AND invitation_id=?2 AND year=?3 AND allowance_reset_at IS NULL
 AND EXISTS(SELECT 1 FROM mug_orders o ${mugLiveJoinSQL} WHERE o.id=mug_orders.id AND ${mugAllowanceResettableSQL})
 RETURNING id,allowance_reset_at`).bind(data.orderId,invite,year);
 // changes() reads the preceding update in this D1 batch, so a stale reset cannot release an intent.
 const release=env.DB.prepare(`UPDATE live_gift_orders SET allowance_reset_at=(
 SELECT o.allowance_reset_at FROM mug_orders o WHERE o.id=live_gift_orders.order_id AND o.invitation_id=?2 AND o.year=?3 AND o.status='submitted'
 ) WHERE order_id=?1 AND invitation_id=?2 AND year=?3 AND kind='mug' AND state='submitted' AND allowance_reset_at IS NULL AND changes()=1`).bind(data.orderId,invite,year);
 const [result]=await env.DB.batch<{id:string;allowance_reset_at:number}>([reset,release]);
 const order=result.results[0];
 if(!order)throw new PrintProblem(409,'The mug allowance changed, or the order is still processing or uncertain. Refresh before resetting.');
 return {reset:true,remaining:1,historyCleared:false,orderId:order.id,resetAt:order.allowance_reset_at};
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
