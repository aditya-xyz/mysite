import {PrintProblem,type PrintEnv} from './printing.ts';
import {now} from './security.ts';
export type LiveGiftKind='postcard'|'mug';
export const liveGiftLimit=(kind:LiveGiftKind)=>kind==='postcard'?1000:2500;
export async function liveGiftAllowed(env:PrintEnv,invitationId:string,year:number,kind:LiveGiftKind){
 if(env.LIVE_GIFT_ORDERING!=='true')return false;
 const grant=await env.DB.prepare(`SELECT g.invitation_id FROM live_gift_permissions g JOIN invites i ON i.id=g.invitation_id JOIN editions e ON e.year=g.year
 WHERE g.invitation_id=?1 AND g.year=?2 AND g.enabled=1 AND g.expires_at>?3 AND g.${kind==='postcard'?'postcard':'mug'}_enabled=1
 AND i.edition_year=g.year AND i.person_id=g.person_id AND i.member_ids=g.member_ids
 AND i.revoked_at IS NULL AND i.expires_at>?3 AND e.is_active=1 AND i.allow_${kind==='postcard'?'print':'mug'}=1 AND e.allow_${kind==='postcard'?'print':'mug'}_orders=1`).bind(invitationId,year,now()).first();
 return !!grant;
}
export async function requireLiveGift(env:PrintEnv,orderId:string,kind:LiveGiftKind){
 if(env.LIVE_GIFT_ORDERING!=='true')throw new PrintProblem(403,'Live gift ordering is disabled.');
 const intent=await env.DB.prepare(`SELECT l.* FROM live_gift_orders l JOIN ${kind==='postcard'?'print_orders':'mug_orders'} o ON o.id=l.order_id AND o.invitation_id=l.invitation_id AND o.year=l.year WHERE l.order_id=?1 AND l.kind=?2 AND o.allowance_reset_at IS NULL AND o.status IN ('simulated','submitted')`).bind(orderId,kind).first<any>();
 if(!intent||intent.max_cents!==liveGiftLimit(kind)||!await liveGiftAllowed(env,intent.invitation_id,intent.year,kind))throw new PrintProblem(403,'This household is not enabled for live ordering.');
 return intent;
}
export function liveGiftIntentStatement(env:PrintEnv,orderId:string,kind:LiveGiftKind,invitationId:string,year:number){
 return env.DB.prepare(`INSERT INTO live_gift_orders(order_id,kind,year,invitation_id,max_cents)
 SELECT ?1,?2,g.year,g.invitation_id,?5 FROM live_gift_permissions g JOIN invites i ON i.id=g.invitation_id
 WHERE g.year=?3 AND g.invitation_id=?4 AND g.enabled=1 AND g.expires_at>unixepoch()
 AND i.person_id=g.person_id AND i.member_ids=g.member_ids AND i.revoked_at IS NULL AND i.expires_at>unixepoch()
 AND g.${kind==='postcard'?'postcard':'mug'}_enabled=1 AND EXISTS(SELECT 1 FROM ${kind==='postcard'?'print_orders':'mug_orders'} o WHERE o.id=?1 AND o.invitation_id=g.invitation_id AND o.year=g.year AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated')) ON CONFLICT DO NOTHING`).bind(orderId,kind,year,invitationId,liveGiftLimit(kind));
}
export async function liveGiftState(env:PrintEnv,orderId:string){
 if(env.LIVE_GIFT_ORDERING!=='true')return null;
 return env.DB.prepare('SELECT state,error,provider_id,max_cents FROM live_gift_orders WHERE order_id=?1').bind(orderId).first<{state:string;error:string|null;provider_id:string|null;max_cents:number}>();
}
// An explicit admin allowance reset permits one more completed postcard checkout.
// Keep the original order and fulfillment audit; uncertain orders stay reserved.
export function releaseResetPostcardIntent(env:PrintEnv,orderId:string){
 return env.DB.prepare(`DELETE FROM live_gift_orders WHERE order_id=?1 AND kind='postcard' AND state='submitted'
 AND EXISTS(SELECT 1 FROM print_orders o WHERE o.id=live_gift_orders.order_id
 AND o.invitation_id=live_gift_orders.invitation_id AND o.year=live_gift_orders.year
 AND o.status='submitted' AND o.allowance_reset_at IS NOT NULL
 AND o.provider_id=(CASE json_extract(o.handwrytten_quote_json,'$.testMode') WHEN 1 THEN 'handwrytten-test-' WHEN 0 THEN 'handwrytten-live-' END)||live_gift_orders.provider_id
 AND json_extract(o.handwrytten_quote_json,'$.submitted')=1
 AND EXISTS(SELECT 1 FROM print_fulfillment f WHERE f.order_id=o.id AND f.state='submitted'))`).bind(orderId).run();
}
