import {PrintProblem,type PrintEnv} from './printing.ts';
import {now} from './security.ts';
export type LiveGiftKind='postcard'|'mug';
export const liveGiftLimit=(kind:LiveGiftKind)=>kind==='postcard'?1000:2500;
export const liveMugsConfigured=(env:PrintEnv)=>env.LIVE_GIFT_ORDERING==='true';
const liveMugInviteSQL="i.allow_mug=1 AND i.person_id IS NOT NULL AND i.revoked_at IS NULL AND i.expires_at>unixepoch() AND e.is_active=1 AND e.taken_offline_at IS NULL";
export async function liveGiftAllowed(env:PrintEnv,invitationId:string,year:number,kind:LiveGiftKind){
 if(env.LIVE_GIFT_ORDERING!=='true')return false;
 if(kind==='mug'){
  return !!await env.DB.prepare(`SELECT i.id FROM invites i JOIN editions e ON e.year=i.edition_year
   WHERE i.id=?1 AND i.edition_year=?2 AND ${liveMugInviteSQL}`).bind(invitationId,year).first();
 }
 const grant=await env.DB.prepare(`SELECT g.invitation_id FROM live_gift_permissions g JOIN invites i ON i.id=g.invitation_id JOIN editions e ON e.year=g.year
 WHERE g.invitation_id=?1 AND g.year=?2 AND g.enabled=1 AND g.expires_at>?3 AND g.postcard_enabled=1
 AND i.edition_year=g.year AND i.person_id=g.person_id AND i.member_ids=g.member_ids
 AND i.revoked_at IS NULL AND i.expires_at>?3 AND e.is_active=1 AND i.allow_print=1 AND e.allow_print_orders=1`).bind(invitationId,year,now()).first();
 return !!grant;
}
export async function requireLiveGift(env:PrintEnv,orderId:string,kind:LiveGiftKind){
 if(env.LIVE_GIFT_ORDERING!=='true')throw new PrintProblem(403,'Live gift ordering is disabled.');
 const mugIdentity=kind==='mug'? 'AND EXISTS(SELECT 1 FROM invites i WHERE i.id=l.invitation_id AND i.edition_year=l.year AND i.person_id=l.mug_person_id AND i.member_ids=l.mug_member_ids)' : '';
 const intent=await env.DB.prepare(`SELECT l.* FROM live_gift_orders l JOIN ${kind==='postcard'?'print_orders':'mug_orders'} o ON o.id=l.order_id AND o.invitation_id=l.invitation_id AND o.year=l.year WHERE l.order_id=?1 AND l.kind=?2 AND o.allowance_reset_at IS NULL AND o.status IN ('simulated','submitted') ${mugIdentity}`).bind(orderId,kind).first<any>();
 if(!intent||intent.max_cents!==liveGiftLimit(kind)||!await liveGiftAllowed(env,intent.invitation_id,intent.year,kind))throw new PrintProblem(403,'This household is not enabled for live ordering.');
 return intent;
}
export function liveGiftIntentStatement(env:PrintEnv,orderId:string,kind:LiveGiftKind,invitationId:string,year:number){
 if(kind==='mug'){
  return env.DB.prepare(`INSERT INTO live_gift_orders(order_id,kind,year,invitation_id,max_cents,mug_person_id,mug_member_ids)
   SELECT ?1,'mug',i.edition_year,i.id,?4,i.person_id,i.member_ids FROM invites i JOIN editions e ON e.year=i.edition_year
   WHERE i.edition_year=?2 AND i.id=?3 AND ${liveMugInviteSQL}
   AND EXISTS(SELECT 1 FROM mug_orders o WHERE o.id=?1 AND o.invitation_id=i.id AND o.year=e.year AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated')) ON CONFLICT DO NOTHING`).bind(orderId,year,invitationId,liveGiftLimit('mug'));
 }
 return env.DB.prepare(`INSERT INTO live_gift_orders(order_id,kind,year,invitation_id,max_cents)
 SELECT ?1,?2,g.year,g.invitation_id,?5 FROM live_gift_permissions g JOIN invites i ON i.id=g.invitation_id
 WHERE g.year=?3 AND g.invitation_id=?4 AND g.enabled=1 AND g.expires_at>unixepoch()
 AND i.person_id=g.person_id AND i.member_ids=g.member_ids AND i.revoked_at IS NULL AND i.expires_at>unixepoch()
 AND g.postcard_enabled=1 AND EXISTS(SELECT 1 FROM print_orders o WHERE o.id=?1 AND o.invitation_id=g.invitation_id AND o.year=g.year AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated')) ON CONFLICT DO NOTHING`).bind(orderId,kind,year,invitationId,liveGiftLimit(kind));
}
export async function liveGiftState(env:PrintEnv,orderId:string){
 if(env.LIVE_GIFT_ORDERING!=='true')return null;
 return env.DB.prepare('SELECT state,error,provider_id,max_cents FROM live_gift_orders WHERE order_id=?1').bind(orderId).first<{state:string;error:string|null;provider_id:string|null;max_cents:number}>();
}
// This predicate is shared by the reset, the admin action, and the release of the live slot.
export const postcardIntentResettableSQL=`((o.status='submitted' AND f.state='submitted' AND l.state='submitted'
 AND o.provider_id=(CASE json_extract(o.handwrytten_quote_json,'$.testMode') WHEN 1 THEN 'handwrytten-test-' WHEN 0 THEN 'handwrytten-live-' END)||l.provider_id
 AND json_extract(o.handwrytten_quote_json,'$.submitted')=1)
 OR (o.status='simulated' AND f.state='review' AND f.basket_item_id IS NULL AND l.state='review'
 AND l.provider_id IS NULL AND o.provider_id IS NULL
 AND coalesce(json_extract(o.handwrytten_quote_json,'$.submitAttempted'),0)=0))`;
export const postcardLiveJoinSQL="LEFT JOIN live_gift_orders l ON l.order_id=o.id AND l.invitation_id=o.invitation_id AND l.year=o.year AND l.kind='postcard'";
export const postcardAllowanceResettableSQL=`o.status IN ('simulated','submitted') AND
 ((l.order_id IS NULL AND (f.order_id IS NULL OR f.state='submitted' OR (f.state='review' AND f.basket_item_id IS NULL))) OR ${postcardIntentResettableSQL})`;
export function resetPostcardIntentStatement(env:PrintEnv,orderId:string,invite:string,year:number){
 return env.DB.prepare(`DELETE FROM live_gift_orders AS l WHERE order_id=?1 AND invitation_id=?2 AND year=?3 AND kind='postcard'
 AND EXISTS(SELECT 1 FROM print_orders o JOIN print_fulfillment f ON f.order_id=o.id
 WHERE o.id=l.order_id AND o.invitation_id=l.invitation_id AND o.year=l.year AND o.allowance_reset_at IS NOT NULL
 AND ${postcardIntentResettableSQL})`).bind(orderId,invite,year);
}
