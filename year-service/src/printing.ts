import {digest,now,token} from './security.ts';
import {invitationAudience,type InvitationAudience} from './invitations.ts';
import {visiblePhotos,type Published,type Draft} from './edition.ts';
import {imageDimensions} from './image-dimensions.ts';
export interface PrintEnv {DB:D1Database;MEDIA:R2Bucket;PRINT_PROVIDER?:string}
export interface MailingAddress {line1:string;line2:string;city:string;state:string;postalCode:string;country:'US'}
export class PrintProblem extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export const localPrintProvider=(request:Request,env:PrintEnv)=>env.PRINT_PROVIDER==='local_mock'&&new URL(request.url).protocol==='http:'&&['localhost','127.0.0.1','guest.preview','admin.preview','guest.test','admin.test'].includes(new URL(request.url).hostname);
export function mailingAddress(value:unknown):MailingAddress {
 if(!value||typeof value!=='object')throw new PrintProblem(400,'Enter a US mailing address.');
 const a=value as Record<string,unknown>,out:Record<string,string>={};
 for(const key of ['line1','line2','city','state','postalCode','country']){
  const v=a[key]??(key==='line2'?'':'');if(typeof v!=='string'||v.length>120||/[\r\n\x00-\x1f]/.test(v))throw new PrintProblem(400,'Check the mailing address.');out[key]=v.trim();
 }
 if(out.country!=='US'||!out.line1||!out.city||! /^[A-Z]{2}$/.test(out.state)||!/^\d{5}(-\d{4})?$/.test(out.postalCode))throw new PrintProblem(400,'Use a US address, two-letter state, and ZIP code.');
 return out as unknown as MailingAddress;
}
export const personalCount=(draft:Draft,ids:string[])=>new Set(draft.photos.filter(p=>!p.hidden&&p.recipients.length&&p.recipients.some(id=>ids.includes(id))).map(p=>p.id)).size;
export async function cleanPrintInvitations(draft:Draft,db:D1Database,year:number){
 const list=draft.printInvitations??[];
 if(!Array.isArray(list)||list.some(id=>typeof id!=='string')||list.length>100)throw new PrintProblem(400,'Check the print invitations.');
 const invites=await db.prepare('SELECT i.*,p.address_verified,p.address_verifier,p.mailing_address,p.address_verification_key FROM invites i JOIN people p ON p.id=i.person_id WHERE i.edition_year=?1').bind(year).all<InvitationAudience&{address_verified:number;mailing_address:string|null;address_verification_key:string|null}>();
 const allowed:string[]=[];
 for(const i of invites.results)if(list.includes(i.id)&&i.address_verified&&i.mailing_address&&i.address_verification_key&&draft.printAddressKeys?.[i.id]===i.address_verification_key&&personalCount(draft,await invitationAudience(db,i))>=3)allowed.push(i.id);
 return {printInvitations:allowed,printAddressKeys:Object.fromEntries(invites.results.filter(i=>allowed.includes(i.id)).map(i=>[i.id,i.address_verification_key!]))};
}
export async function printContext(request:Request,env:PrintEnv,invite:InvitationAudience){
 const i=await env.DB.prepare('SELECT * FROM invites WHERE id=?1 AND revoked_at IS NULL AND expires_at>?2').bind(invite.id,now()).first<InvitationAudience&{version:number}>();
 if(!i)throw new PrintProblem(401,'This invitation is no longer available.');
 const edition=await env.DB.prepare('SELECT published_json,published_version,is_active,allow_print_orders FROM editions WHERE year=?1').bind(i.edition_year).first<{published_json:string|null;published_version:number;is_active:number;allow_print_orders:number}>();
 const person=await env.DB.prepare('SELECT id,name,version,mailing_address,address_verified,address_verifier,address_verification_key FROM people WHERE id=?1').bind(i.person_id).first<{id:string;name:string;version:number;mailing_address:string|null;address_verified:number;address_verifier:string|null;address_verification_key:string|null}>();
 const published:Published|null=edition?.published_json?JSON.parse(edition.published_json):null;
 const photos=published?visiblePhotos(published,i.id,await invitationAudience(env.DB,i)).filter(p=>p.recipients.length):[];
 const existing=await env.DB.prepare("SELECT id,status,created_at FROM print_orders WHERE invitation_id=?1 AND year=?2 AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown') ORDER BY created_at DESC LIMIT 1").bind(i.id,i.edition_year).first<{id:string;status:string;created_at:number}>();
 const mode=localPrintProvider(request,env)?'local_mock':'disabled';
 let reason='';
 if(existing)reason='Your complimentary print has already been ordered.';
 else if(!edition?.is_active)reason='This scrapbook is no longer active.';
 else if(!edition.allow_print_orders)reason='Print orders are turned off for this scrapbook.';
 else if(!published?.printNote?.trim())reason='The postcard note is not published yet.';
 else if(!published.printInvitations?.includes(i.id))reason='Printing is not enabled for this invitation.';
 else if(photos.length<3)reason='At least three personal photos are needed.';
 else if(!person?.address_verified||!person.mailing_address)reason='The mailing contact needs a verified US address.';
 else if(published.printAddressKeys?.[i.id]!==person.address_verification_key)reason='The mailing address changed. Ask us to re-enable printing.';
 else if(mode==='disabled'||person.address_verifier!=='local_mock')reason='The print provider is not configured. No orders can be placed.';
 const confirmationKey=await digest(JSON.stringify([i.id,i.version,edition?.published_version,person?.version,person?.mailing_address,published?.printNote]));
 return {i,edition,person,published,photos,existing,mode,reason,confirmationKey};
}
export async function printStatus(request:Request,env:PrintEnv,invite:InvitationAudience){
 const c=await printContext(request,env,invite);
 return {eligible:!c.reason,reason:c.reason,mode:c.mode,order:c.existing,remaining:c.existing?0:1,
  ...(!c.reason?{confirmationKey:c.confirmationKey}: {})};
}
export async function createPrintOrder(request:Request,env:PrintEnv,invite:InvitationAudience){
 const c=await printContext(request,env,invite);
 if(c.existing)return {order:c.existing,reused:true};
 if(c.reason)throw new PrintProblem(409,c.reason);
 const length=Number(request.headers.get('Content-Length'));
 if(!Number.isFinite(length)||length<=0||length>3*1024*1024)throw new PrintProblem(413,'Use a keepsake image under 3 MB.');
 const form=await request.formData(),artwork=form.get('artwork'),raw=form.get('recipe');
 if(!(artwork instanceof File)||artwork.type!=='image/jpeg'||typeof raw!=='string'||raw.length>5000)throw new PrintProblem(400,'Include the keepsake artwork and photo selection.');
 let recipe:{photoIds:string[];crops:unknown;frame:string;requestKey:string;confirmationKey:string};
 try{recipe=JSON.parse(raw);}catch{throw new PrintProblem(400,'Check the print request.');}
 if(!recipe||!Array.isArray(recipe.photoIds)||recipe.photoIds.length!==3||new Set(recipe.photoIds).size!==3||recipe.photoIds.some(id=>!c.photos.some(p=>p.id===id)))throw new PrintProblem(403,'Choose three distinct authorized personal photos.');
 if(!['moss','classic'].includes(recipe.frame)||!recipe.crops||typeof recipe.crops!=='object')throw new PrintProblem(400,'Check the frame and crops.');
 const crops=recipe.crops as Record<string,{x:number;y:number;zoom:number}>;
 if(recipe.photoIds.some(id=>{const p=crops[id];return !p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.zoom)||p.x<0||p.x>1||p.y<0||p.y>1||p.zoom<1||p.zoom>2.5;}))throw new PrintProblem(400,'Check the photo crops.');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(recipe.requestKey)||recipe.confirmationKey!==c.confirmationKey)throw new PrintProblem(409,'The address or scrapbook changed. Reopen the order confirmation.');
 const bytes=new Uint8Array(await artwork.arrayBuffer()),dimensions=imageDimensions(bytes);
 if(!dimensions||dimensions.width!==1200||dimensions.height!==1500)throw new PrintProblem(400,'Use the 1200 by 1500 keepsake image.');
 const id='print-'+token().slice(0,24),key=`${c.i.edition_year}/print-orders/${id}/front.jpg`;
 // The reservation and all mutable eligibility checks share one database statement.
 const inserted=await env.DB.prepare(`INSERT INTO print_orders(id,invitation_id,year,request_key,status,address_json,recipient_name,note,authors,recipe_json,artwork_key,published_version)
 SELECT ?1,i.id,e.year,?2,'preparing',p.mailing_address,p.name,json_extract(e.published_json,'$.printNote'),json_extract(e.published_json,'$.authors'),?3,?4,e.published_version
 FROM invites i JOIN editions e ON e.year=i.edition_year JOIN people p ON p.id=i.person_id
 WHERE i.id=?5 AND i.version=?6 AND i.revoked_at IS NULL AND i.expires_at>?7 AND e.is_active=1 AND e.allow_print_orders=1 AND e.published_version=?8
 AND p.id=?9 AND p.version=?10 AND p.address_verified=1 AND p.address_verifier='local_mock'
 AND EXISTS(SELECT 1 FROM json_each(e.published_json,'$.printInvitations') WHERE value=i.id)
 AND json_extract(e.published_json,'$.printAddressKeys."'||i.id||'"')=p.address_verification_key
 AND NOT EXISTS(SELECT 1 FROM print_orders WHERE invitation_id=i.id AND year=e.year AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown')) ON CONFLICT DO NOTHING RETURNING id`)
 .bind(id,recipe.requestKey,JSON.stringify(recipe),key,c.i.id,c.i.version,now(),c.edition!.published_version,c.person!.id,c.person!.version).first();
 if(!inserted){const fresh=await printStatus(request,env,invite);if(fresh.order)return {order:fresh.order,reused:true};throw new PrintProblem(409,'The print settings changed, or this request was already attempted. Reopen the order confirmation.');}
 try{
  await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  // Deliberately no live fulfillment adapter: only a loopback HTTP fixture can simulate ordering.
  await env.DB.prepare("UPDATE print_orders SET status='simulated',provider_id=?1,updated_at=unixepoch() WHERE id=?2 AND status='preparing'").bind('local-'+id,id).run();
 }catch{
  // No provider submission happened, so this is a definite failure and releases the allowance.
  await env.DB.prepare("UPDATE print_orders SET status='failed',updated_at=unixepoch() WHERE id=?1 AND status='preparing'").bind(id).run();
  await env.MEDIA.delete(key).catch(()=>{});throw new PrintProblem(503,'The local order could not be saved. Retry with a new request.');
 }
 return {order:{id,status:'simulated',created_at:now()},reused:false};
}
