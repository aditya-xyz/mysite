import {liveGiftState} from './live-gifts.ts';
import {giftWindow} from './gift-deadline.ts';
import {PrintProblem,printOrderView,type PrintOrderProof,type PrintEnv} from './printing.ts';
import type {InvitationAudience} from './invitations.ts';
import {digitalPostcard} from './digital-postcards.ts';
export interface KeepsakeDefault {revision:string;frames:Record<string,string>}
export async function keepsakeDefault(env:PrintEnv,year:number):Promise<KeepsakeDefault|null>{
 const row=await env.DB.prepare('SELECT revision,frames_json FROM keepsake_defaults WHERE year=?1').bind(year).first<{revision:string;frames_json:string}>();
 return row?{revision:row.revision,frames:JSON.parse(row.frames_json)}:null;
}
export async function keepsakeAccess(env:PrintEnv,invite:InvitationAudience){
 const row=await env.DB.prepare('SELECT i.allow_print,e.allow_print_orders,e.is_active FROM invites i JOIN editions e ON e.year=i.edition_year WHERE i.id=?1 AND i.edition_year=?2').bind(invite.id,invite.edition_year).first<{allow_print:number;allow_print_orders:number;is_active:number}>();
 return !!(row?.allow_print&&row.allow_print_orders&&row.is_active);
}
export async function keepsakeManifest(env:PrintEnv,invite:InvitationAudience,personalCount:number,knownWindow?:Awaited<ReturnType<typeof giftWindow>>){
 const [window,access]=await Promise.all([knownWindow||giftWindow(env.DB,invite),keepsakeAccess(env,invite)]);
 if(!access)return {enabled:false};
 const digital=await digitalPostcard(env.DB,invite);
 if(digital)return {enabled:true,mode:digital.personalized&&personalCount>=3?'personal':'default',digitalOnly:true,digitalFrame:digital.frame,digitalArtworkSrc:'/api/print/digital/image',cardCount:1,format:'folded',defaultRevision:digital.default_revision,defaultSrc:'/api/print/digital/default/'};
 const [ordered,defaults]=await Promise.all([
  env.DB.prepare("SELECT id,status,created_at,card_count,format,back_text,note,authors,handwrytten_preview_id,recipe_json,provider_id,(SELECT state FROM print_fulfillment f WHERE f.order_id=print_orders.id) AS fulfillment_state FROM print_orders WHERE invitation_id=?1 AND year=?2 AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown') ORDER BY created_at DESC LIMIT 1").bind(invite.id,invite.edition_year).first<PrintOrderProof>(),
  keepsakeDefault(env,invite.edition_year)
 ]);

 if(ordered)ordered.live=ordered.provider_id?.startsWith('handwrytten-live-')||(!ordered.provider_id?.startsWith('handwrytten-test-')&&!!await liveGiftState(env,ordered.id));
 if(ordered)return {enabled:true,mode:'default',cardCount:1,order:printOrderView(ordered)};
 if(window.closed||!defaults)return {enabled:false};
 return {enabled:true,allowPaperless:invite.allow_paperless!==0,mode:personalCount>=3?'personal':'default',cardCount:1,format:'folded',defaultRevision:defaults.revision,defaultSrc:`/api/keepsake/default/${defaults.revision}/`};
}

export async function keepsakeDefaultImage(env:PrintEnv,invite:InvitationAudience,revision:string,frame:string){
 if(!await keepsakeAccess(env,invite))throw new PrintProblem(403,'Postcards are not enabled for this invitation and scrapbook.');
 const defaults=await keepsakeDefault(env,invite.edition_year),key=defaults?.revision===revision?defaults.frames[frame]:null;
 const file=key&&await env.MEDIA.get(key);if(!file)throw new PrintProblem(404,'Postcard not found.');
 return new Response(file.body,{headers:{'Content-Type':'image/jpeg'}});
}
