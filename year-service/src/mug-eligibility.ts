import {liveGiftAllowed} from './live-gifts.ts';
import {giftWindow} from './gift-deadline.ts';
import {simulatedOrders,type PrintEnv} from './printing.ts';
import {publishedMugs,type Published} from './edition.ts';
import type {InvitationAudience} from './invitations.ts';

export async function mugAllowed(env:PrintEnv,invite:InvitationAudience,knownWindow?:Awaited<ReturnType<typeof giftWindow>>){
 if((knownWindow||await giftWindow(env.DB,invite)).closed)return false;
 const row=await env.DB.prepare('SELECT i.allow_mug,e.allow_mug_orders FROM invites i JOIN editions e ON e.year=i.edition_year WHERE i.id=?1 AND i.edition_year=?2').bind(invite.id,invite.edition_year).first<{allow_mug:number;allow_mug_orders:number}>();
 return row?.allow_mug===1&&row.allow_mug_orders===1;
}

export async function mugOrderEligible(request:Request,env:PrintEnv,invite:InvitationAudience,knownWindow?:Awaited<ReturnType<typeof giftWindow>>,knownEdition?:{published_json?:string|null;is_active?:number}|null){
 if(!await mugAllowed(env,invite,knownWindow))return false;
 const edition=knownEdition!==undefined?knownEdition:await env.DB.prepare('SELECT published_json,is_active FROM editions WHERE year=?1').bind(invite.edition_year).first<{published_json:string|null;is_active:number}>();
 const published:Published|null=edition?.published_json?JSON.parse(edition.published_json):null;
 if(!edition?.is_active||!published||publishedMugs(published).length===0)return false;
 const [order,live]=await Promise.all([
  env.DB.prepare("SELECT id FROM mug_orders WHERE invitation_id=?1 AND year=?2 AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown') LIMIT 1").bind(invite.id,invite.edition_year).first(),
  liveGiftAllowed(env,invite.id,invite.edition_year,'mug')
 ]);
 return !order&&(live||simulatedOrders(request,env));
}
