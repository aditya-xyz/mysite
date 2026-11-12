// @ts-expect-error Shared browser/server simulation catalog.
import {validMugOptions,pixelMugOptions} from '../web/mug-options.js';
import {confirmDelivery,deliveryState} from './delivery-address.ts';
import {estimateMug,printfulEnabled} from './printful.ts';
import {PrintProblem,mailingAddress,simulatedOrders,type PrintEnv} from './printing.ts';
import {publishedMugs,type Published} from './edition.ts';
import {now,token} from './security.ts';
import type {InvitationAudience} from './invitations.ts';
interface Order {id:string;design_id:string;caption:string;alt:string;artwork_key:string;status:string;recipient_name:string;address_json:string;created_at:number;configuration_json?:string;mockup_key?:string;mockup_id?:string}
export function mugReceipt(o:Order){return {id:o.id,designId:o.design_id,status:o.status,createdAt:o.created_at,configuration:JSON.parse(o.configuration_json||JSON.stringify(pixelMugOptions())),address:{...JSON.parse(o.address_json),name:o.recipient_name},design:{id:o.design_id,name:'your mugshot',caption:o.caption,alt:o.alt,src:`/api/gift/orders/${o.id}/artwork`,...(o.mockup_key?{mockupSrc:`/api/gift/orders/${o.id}/mockup`}:{})}};}
export async function mugAllowed(env:PrintEnv,invite:InvitationAudience){
 const row=await env.DB.prepare('SELECT i.allow_mug,e.allow_mug_orders FROM invites i JOIN editions e ON e.year=i.edition_year WHERE i.id=?1 AND i.edition_year=?2').bind(invite.id,invite.edition_year).first<{allow_mug:number;allow_mug_orders:number}>();return row?.allow_mug===1&&row.allow_mug_orders===1;
}
export async function mugStatus(request:Request,env:PrintEnv,invite:InvitationAudience){
 const order=await env.DB.prepare("SELECT * FROM mug_orders WHERE invitation_id=?1 AND year=?2 AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown') LIMIT 1").bind(invite.id,invite.edition_year).first<Order>();
 if(order?.mockup_id){const mockup=await env.DB.prepare('SELECT image_key FROM mug_mockups WHERE id=?1').bind(order.mockup_id).first<{image_key:string}>();if(mockup?.image_key)order.mockup_key=mockup.image_key;}
 const eligible=await mugAllowed(env,invite);
 return {eligible,claim:order?mugReceipt(order):null,remaining:!eligible||order?0:1,mode:simulatedOrders(request,env)?'simulation':'disabled',livePricing:printfulEnabled(env)};
}
export async function mugQuote(request:Request,env:PrintEnv,invite:InvitationAudience,data:Record<string,unknown>){
 if(!await mugAllowed(env,invite))throw new PrintProblem(403,'Complimentary mugs are not enabled for this invitation.');
 const delivery=await deliveryState(request,env,invite);
 if(!delivery.verified||!delivery.address)throw new PrintProblem(409,'Verify and save your US mailing address first.');
 if(data.addressVersion!==delivery.version)throw new PrintProblem(409,'The saved address changed. Reopen the address step.');
 return estimateMug(env,data.configuration,delivery.address);
}
export async function createMugOrder(request:Request,env:PrintEnv,invite:InvitationAudience,data:Record<string,unknown>){
 if(!await mugAllowed(env,invite))throw new PrintProblem(403,'Complimentary mugs are not enabled for this scrapbook and invitation.');
 if(!simulatedOrders(request,env))throw new PrintProblem(503,'Mug ordering is not enabled.');
 const existing=await mugStatus(request,env,invite);if(existing.claim)return {...existing,reused:true};
 const row=await env.DB.prepare('SELECT published_json,published_version,is_active FROM editions WHERE year=?1').bind(invite.edition_year).first<{published_json:string;published_version:number;is_active:number}>();
 const edition:Published|null=row?.published_json?JSON.parse(row.published_json):null;
 const design=edition&&publishedMugs(edition).find(d=>d.id===data.designId);
 if(!row?.is_active||!design?.cutoutVersion)throw new PrintProblem(409,'Choose a current published mugshot.');
 if(typeof data.requestKey!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(data.requestKey))throw new PrintProblem(400,'Check the order request.');
 const configuration=data.configuration===undefined?pixelMugOptions():validMugOptions(data.configuration);
 if(!configuration)throw new PrintProblem(400,'Choose an available mug style, size, color and font.');
 const delivery=await confirmDelivery(request,env,invite,data.addressVersion);
 const address=delivery.address,recipientName=delivery.person.name;
 const quote=printfulEnabled(env)?await estimateMug(env,configuration,address):null;
 if(quote&&!quote.withinBudget)throw new PrintProblem(409,'This mug exceeds the delivered gift budget. Go back and customize your mug.');
 const mockup=typeof data.mockupId==='string'?await env.DB.prepare("SELECT id FROM mug_mockups WHERE id=?1 AND invitation_id=?2 AND year=?3 AND design_id=?4 AND configuration_json=?5 AND caption=?6 AND cutout_version=?7 AND status IN ('pending','ready')").bind(data.mockupId,invite.id,invite.edition_year,design.id,JSON.stringify(configuration),design.caption,design.cutoutVersion).first<{id:string}>():null;
 const file=await env.MEDIA.get(design.preview_key);if(!file)throw new PrintProblem(409,'The mug artwork is unavailable.');
 const id='mug-'+token().slice(0,24),key=`${invite.edition_year}/mug-orders/${id}/artwork.png`;
 // Store the exact published artwork before reserving, so a crash cannot leave an active order without a proof.
 await env.MEDIA.put(key,file.body,{httpMetadata:{contentType:'image/png'}});
 try{
  const inserted=await env.DB.prepare(`INSERT INTO mug_orders(id,invitation_id,year,request_key,status,design_id,caption,alt,artwork_key,address_json,recipient_name,save_address,published_version,configuration_json,quote_json,mockup_id)
   SELECT ?1,i.id,e.year,?2,'simulated',?3,?4,?5,?6,?7,?8,?9,e.published_version,?16,?17,?18 FROM invites i JOIN editions e ON e.year=i.edition_year
   WHERE i.id=?10 AND i.version=?11 AND i.revoked_at IS NULL AND i.expires_at>?12 AND e.is_active=1 AND e.allow_mug_orders=1 AND e.published_version=?13 AND i.mug_order_count=0 AND i.allow_mug=1
   AND i.person_id=?14 AND EXISTS(SELECT 1 FROM people p WHERE p.id=?14 AND p.version=?15 AND p.address_verified=1 AND p.address_verification_key IS NOT NULL AND p.address_verifier IN ('google','local_mock') AND (p.address_verifier!='google' OR p.address_verified_until>?12))
   AND NOT EXISTS(SELECT 1 FROM mug_orders WHERE invitation_id=i.id AND year=e.year AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown')) ON CONFLICT DO NOTHING RETURNING id`)
   .bind(id,data.requestKey,design.id,design.caption,design.alt,key,JSON.stringify(address),recipientName,1,invite.id,(invite as InvitationAudience&{version:number}).version,now(),row.published_version,delivery.person.id,delivery.person.version,JSON.stringify(configuration),quote?JSON.stringify(quote):null,mockup?.id||null).first();
  if(!inserted){await env.MEDIA.delete(key);const fresh=await mugStatus(request,env,invite);if(fresh.claim)return {...fresh,reused:true};throw new PrintProblem(409,'This request was already used or the scrapbook changed. Reopen the gift picker.');}
 }catch(error){await env.MEDIA.delete(key);throw error;}
 return {...await mugStatus(request,env,invite),reused:false};
}
export async function mugOrderArtwork(env:PrintEnv,invite:InvitationAudience,id:string,mockup=false){
 const order=await env.DB.prepare('SELECT * FROM mug_orders WHERE id=?1 AND invitation_id=?2 AND year=?3').bind(id,invite.id,invite.edition_year).first<Order>();
 const preview=mockup&&order?.mockup_id?await env.DB.prepare('SELECT image_key FROM mug_mockups WHERE id=?1').bind(order.mockup_id).first<{image_key:string}>():null;
 const key=mockup?preview?.image_key:order?.artwork_key;if(!key)throw new PrintProblem(404,'Mug order not found.');const file=await env.MEDIA.get(key);if(!file)throw new PrintProblem(404,'Artwork not found.');return new Response(file.body,{headers:{'Content-Type':'image/png'}});
}
