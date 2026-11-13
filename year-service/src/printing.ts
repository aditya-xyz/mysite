import {handwryttenPrintFont} from './handwrytten.ts';
import {keepsakeDefault} from './keepsake-defaults.ts';
import {addressVerificationCurrent,type AddressState} from './address-state.ts';
import {digest,now,token} from './security.ts';
import {invitationAudience,invitationName,type InvitationAudience} from './invitations.ts';
import {visiblePhotos,type Published,type Draft} from './edition.ts';
import {imageDimensions} from './image-dimensions.ts';
export interface PrintEnv {DB:D1Database;MEDIA:R2Bucket;PRINT_PROVIDER?:string;ORDER_MODE?:string;PRINTFUL_ENABLED?:string;PRINTFUL_API_TOKEN?:string;PRINTFUL_STORE_ID?:string;HANDWRYTTEN_API_KEY?:string;HANDWRYTTEN_PREVIEWS_ENABLED?:string}
export interface MailingAddress {line1:string;line2:string;city:string;state:string;postalCode:string;country:'US'}
export class PrintProblem extends Error {status:number;retryAfter?:number;constructor(status:number,message:string,retryAfter?:number){super(message);this.status=status;this.retryAfter=retryAfter;}}
export const localPrintProvider=(request:Request,env:PrintEnv)=>env.PRINT_PROVIDER==='local_mock'&&new URL(request.url).protocol==='http:'&&['localhost','127.0.0.1','guest.preview','admin.preview','guest.test','admin.test'].includes(new URL(request.url).hostname);
export const simulatedOrders=(request:Request,env:PrintEnv)=>env.ORDER_MODE==='simulation'||localPrintProvider(request,env);
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
 const invites=await db.prepare('SELECT i.*,p.address_verified,p.address_verifier,p.address_verified_at,p.address_verified_until,p.mailing_address,p.address_verification_key FROM invites i JOIN people p ON p.id=i.person_id WHERE i.edition_year=?1').bind(year).all<InvitationAudience&AddressState&{address_verified:number;mailing_address:string|null;address_verification_key:string|null}>();
 const allowed:string[]=[];
 for(const i of invites.results)if(list.includes(i.id)&&addressVerificationCurrent(i)&&i.mailing_address&&i.address_verification_key&&draft.printAddressKeys?.[i.id]===i.address_verification_key)allowed.push(i.id);
 return {printInvitations:allowed,printAddressKeys:Object.fromEntries(invites.results.filter(i=>allowed.includes(i.id)).map(i=>[i.id,i.address_verification_key!]))};
}
// Guest previews keep the printed message a surprise. Fulfillment uses the frozen DB note.
export const foldedPreviewNote='a little note is hiding here. i’d tell you what it says, but i’m very good at keeping things buried. 🐾';
export const printedGreeting=(invite:Pick<InvitationAudience,'addressed_to'|'name'>)=>`Dear ${(invitationName(invite).trim()||invite.name.trim()||'friend').replace(/\s+/g,' ')},\n\n`;
const guestFoldedPreview=(backText:string)=>({note:foldedPreviewNote,authors:'Pixel',backText});
export const foldedBackText=(year:number)=>`pixelbook ’${String(year).slice(-2)}`;
export interface PrintOrderProof {id:string;status:string;created_at:number;card_count:number;format?:string;back_text?:string|null;note?:string;authors?:string;handwrytten_preview_id?:string|null;recipe_json?:string}
export async function printContext(request:Request,env:PrintEnv,invite:InvitationAudience){
 const i=await env.DB.prepare('SELECT * FROM invites WHERE id=?1 AND revoked_at IS NULL AND expires_at>?2').bind(invite.id,now()).first<InvitationAudience&{version:number}>();
 if(!i)throw new PrintProblem(401,'This invitation is no longer available.');
 const edition=await env.DB.prepare('SELECT published_json,published_version,is_active,allow_print_orders FROM editions WHERE year=?1').bind(i.edition_year).first<{published_json:string|null;published_version:number;is_active:number;allow_print_orders:number}>();
 const person=await env.DB.prepare('SELECT id,name,version,mailing_address,address_verified,address_verified_at,address_verified_until,address_verifier,address_verification_key FROM people WHERE id=?1').bind(i.person_id).first<AddressState&{id:string;name:string;version:number;mailing_address:string|null;address_verified:number;address_verifier:string|null;address_verification_key:string|null}>();
 const published:Published|null=edition?.published_json?JSON.parse(edition.published_json):null;
 const photos=published?visiblePhotos(published,i.id,await invitationAudience(env.DB,i)).filter(p=>p.recipients.length):[];
 const defaults=edition?.is_active&&edition.allow_print_orders&&i.allow_print?await keepsakeDefault(env,i.edition_year):null;
 const existing=await env.DB.prepare("SELECT id,status,created_at,card_count,format,back_text,note,authors,handwrytten_preview_id,recipe_json FROM print_orders WHERE invitation_id=?1 AND year=?2 AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown') ORDER BY created_at DESC LIMIT 1").bind(i.id,i.edition_year).first<PrintOrderProof>();
 const mode=simulatedOrders(request,env)?'local_mock':'disabled';
 let reason='';
 if(existing)reason='Your complimentary print has already been ordered.';
 else if(!edition?.is_active)reason='This scrapbook is no longer active.';
 else if(!edition.allow_print_orders)reason='Print orders are turned off for this scrapbook.';
 else if(!(photos.length>=3?published?.printNote:published?.defaultPrintNote?.trim()||published?.printNote)?.trim())reason='The folded card note is not published yet.';
 else if(!i.allow_print)reason='Printing is not enabled for this invitation.';
 else if(!defaults)reason='The default keepsake is being prepared.';
 else if(!addressVerificationCurrent(person)||!person?.mailing_address)reason='The mailing contact needs a verified US address.';
 else if(i.print_address_key!==person.address_verification_key)reason='The mailing address changed. Ask us to re-enable printing.';
 else if(mode==='disabled')reason='The print provider is not configured. No orders can be placed.';
 const confirmationKey=await digest(JSON.stringify(['folded-a2-portrait-v1',i.id,i.version,edition?.published_version,person?.version,person?.mailing_address,published?.printNote,published?.defaultPrintNote]));
 const needsAddress=!!reason&&['The mailing contact needs a verified US address.','The mailing address changed. Ask us to re-enable printing.'].includes(reason)&&mode!=='disabled';
 return {i,edition,person,published,photos,existing,mode,reason,confirmationKey,needsAddress,defaults};
}
export async function printStatus(request:Request,env:PrintEnv,invite:InvitationAudience){
 const c=await printContext(request,env,invite);
 return {eligible:!c.reason,canOrder:!c.reason||c.needsAddress,needsAddress:c.needsAddress,contentVersion:c.edition?.published_version,reason:c.reason,mode:c.mode,order:c.existing?printOrderView(c.existing):null,remaining:c.existing?0:1,cardCount:1,format:'folded',picturePreviews:'local',preview:guestFoldedPreview(foldedBackText(c.i.edition_year)),defaultRevision:c.defaults?.revision,
  ...(!c.reason?{confirmationKey:c.confirmationKey,addressVersion:c.person?.version}: {})};
}
export async function readPrintArtwork(request:Request,env:PrintEnv,c:Awaited<ReturnType<typeof printContext>>){
 const length=Number(request.headers.get('Content-Length'));
 if(!Number.isFinite(length)||length<=0||length>3*1024*1024)throw new PrintProblem(413,'Use a keepsake image under 3 MB.');
 const form=await request.formData(),artwork=form.get('artwork'),raw=form.get('recipe');
 if(!(artwork instanceof File)||artwork.type!=='image/jpeg'||typeof raw!=='string'||raw.length>5000)throw new PrintProblem(400,'Include the keepsake artwork and photo selection.');
 let recipe:{photoIds:string[];crops:unknown;frame:string;requestKey:string;confirmationKey:string;addressVersion:number;mode?:string;defaultRevision?:string;format?:string;previewId?:string;frontDesign?:'personal'|'default'};
 try{recipe=JSON.parse(raw);}catch{throw new PrintProblem(400,'Check the print request.');}
 if(recipe?.format!=='folded')throw new PrintProblem(409,'Reopen your keepsake to preview the folded card.');
 const personalized=c.photos.length>=3;
 if(!recipe||!Array.isArray(recipe.photoIds)||recipe.defaultRevision!==c.defaults!.revision)throw new PrintProblem(409,'The default keepsake changed. Reopen your keepsake.');
 if(personalized){
  if(recipe.mode!=='personal'||recipe.photoIds.length!==3||new Set(recipe.photoIds).size!==3||recipe.photoIds.some(id=>!c.photos.some(p=>p.id===id)))throw new PrintProblem(403,'Choose three distinct authorized personal photos.');
 }else if(recipe.mode!=='default'||recipe.photoIds.length||Object.keys(recipe.crops||{}).length)throw new PrintProblem(403,'This keepsake has a fixed photo layout. Choose a border only.');
 if(!['moss','classic','santa'].includes(recipe.frame)||!recipe.crops||typeof recipe.crops!=='object')throw new PrintProblem(400,'Check the frame and crops.');
 const crops=recipe.crops as Record<string,{x:number;y:number;zoom:number}>;
 if(personalized&&recipe.photoIds.some(id=>{const p=crops[id];return !p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.zoom)||p.x<0||p.x>1||p.y<0||p.y>1||p.zoom<1||p.zoom>2.5;}))throw new PrintProblem(400,'Check the photo crops.');
 if(recipe.frontDesign!==undefined&&!['personal','default'].includes(recipe.frontDesign))throw new PrintProblem(400,'Choose which keepsake goes on the front.');
 recipe.frontDesign??=personalized?'personal':'default';
 if(!personalized&&recipe.frontDesign!=='default')throw new PrintProblem(403,'This keepsake only has the default design.');
 const defaultFile=await env.MEDIA.get(c.defaults!.frames[recipe.frame]);if(!defaultFile)throw new PrintProblem(409,'The default keepsake is unavailable.');
 const defaultBytes=new Uint8Array(await defaultFile.arrayBuffer());
 const bytes=personalized?new Uint8Array(await artwork.arrayBuffer()):defaultBytes,dimensions=imageDimensions(bytes);
 if(!dimensions||dimensions.width!==1200||dimensions.height!==1500)throw new PrintProblem(400,'Use the 1200 by 1500 keepsake image.');
 const frontBytes=recipe.frontDesign==='default'?defaultBytes:bytes,insideBytes=personalized?(recipe.frontDesign==='default'?bytes:defaultBytes):null;
 return {recipe,personalized,bytes,defaultBytes,frontBytes,insideBytes};
 }
export async function createPrintOrder(request:Request,env:PrintEnv,invite:InvitationAudience){
 const c=await printContext(request,env,invite);
 if(c.existing)return {order:printOrderView(c.existing),reused:true};
 if(c.reason)throw new PrintProblem(409,c.reason);
 const {recipe,personalized,frontBytes,insideBytes}=await readPrintArtwork(request,env,c);
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(recipe.requestKey)||recipe.confirmationKey!==c.confirmationKey||recipe.addressVersion!==c.person?.version)throw new PrintProblem(409,'The address or scrapbook changed. Reopen the order confirmation.');
 // Vendor proofs are prepared from this frozen order in admin, never on the guest path.
 const id='print-'+token().slice(0,24),key=`${c.i.edition_year}/print-orders/${id}/front.jpg`,defaultKey=personalized?`${c.i.edition_year}/print-orders/${id}/default.jpg`:key;
 // The reservation and all mutable eligibility checks share one database statement.
 const inserted=await env.DB.prepare(`INSERT INTO print_orders(id,invitation_id,year,request_key,status,address_json,recipient_name,note,authors,recipe_json,artwork_key,published_version,default_artwork_key,default_revision,card_count,default_note,format,back_text,handwrytten_preview_id)
 SELECT ?1,i.id,e.year,?2,'preparing',p.mailing_address,p.name,?16||CASE WHEN ?13=1 THEN coalesce(nullif(trim(json_extract(e.published_json,'$.defaultPrintNote')),''),json_extract(e.published_json,'$.printNote')) ELSE json_extract(e.published_json,'$.printNote') END,json_extract(e.published_json,'$.authors'),?3,?4,e.published_version,?11,?12,?13,?16||coalesce(nullif(trim(json_extract(e.published_json,'$.defaultPrintNote')),''),json_extract(e.published_json,'$.printNote')),'folded',?14,?15
 FROM invites i JOIN editions e ON e.year=i.edition_year JOIN people p ON p.id=i.person_id
 WHERE i.id=?5 AND i.print_order_count=0 AND i.version=?6 AND i.revoked_at IS NULL AND i.expires_at>?7 AND e.is_active=1 AND e.allow_print_orders=1 AND e.published_version=?8
 AND p.id=?9 AND p.version=?10 AND p.address_verified=1 AND p.address_verifier IN ('local_mock','google') AND (p.address_verifier!='google' OR p.address_verified_until>?7)
 AND i.allow_print=1 AND i.print_address_key=p.address_verification_key
 AND EXISTS(SELECT 1 FROM keepsake_defaults k WHERE k.year=e.year AND k.revision=?12)
 AND NOT EXISTS(SELECT 1 FROM print_orders WHERE invitation_id=i.id AND year=e.year AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown')) ON CONFLICT DO NOTHING RETURNING id`)
 .bind(id,recipe.requestKey,JSON.stringify({...recipe,layout:'a2-portrait-v1'}),key,c.i.id,c.i.version,now(),c.edition!.published_version,c.person!.id,c.person!.version,defaultKey,c.defaults!.revision,personalized?2:1,foldedBackText(c.i.edition_year),null,printedGreeting(c.i)).first();
 if(!inserted){const fresh=await printStatus(request,env,invite);if(fresh.order)return {order:fresh.order,reused:true};throw new PrintProblem(409,'The print settings changed, or this request was already attempted. Reopen the order confirmation.');}
 try{
  await env.MEDIA.put(key,frontBytes,{httpMetadata:{contentType:'image/jpeg'}});
  // Legacy column/key name: folded orders store the chosen inside-left image here.
  if(insideBytes)await env.MEDIA.put(defaultKey,insideBytes,{httpMetadata:{contentType:'image/jpeg'}});
  const snapshot=await env.DB.prepare('SELECT note,authors,recipient_name,address_json FROM print_orders WHERE id=?1').bind(id).first<{note:string;authors:string;recipient_name:string;address_json:string}>();
  const address=JSON.parse(snapshot!.address_json) as MailingAddress,name=snapshot!.recipient_name.trim().split(/\s+/);
  const payload={card_id:null,...handwryttenPrintFont,addresses:[{to_first_name:name[0],to_last_name:name.slice(1).join(' '),to_address1:address.line1,to_address2:address.line2,to_city:address.city,to_state:address.state,to_zip:address.postalCode,to_country:'United States',message:snapshot!.note,wishes:'With love,\n'+snapshot!.authors}],check_quantity:true,delivery_confirmation:0,client_metadata:id};
  await env.DB.prepare('UPDATE print_orders SET handwrytten_order_json=?1 WHERE id=?2').bind(JSON.stringify(payload),id).run();
  // Deliberately no live fulfillment adapter: only an explicit simulation mode can record an order.
  await env.DB.prepare("UPDATE print_orders SET status='simulated',provider_id=?1,updated_at=unixepoch() WHERE id=?2 AND status='preparing'").bind('local-'+id,id).run();
 }catch{
  // No provider submission happened, so this is a definite failure and releases the allowance.
  await env.DB.prepare("UPDATE print_orders SET status='failed',updated_at=unixepoch() WHERE id=?1 AND status='preparing'").bind(id).run();
  await env.MEDIA.delete([key,defaultKey]).catch(()=>{});throw new PrintProblem(503,'The local order could not be saved. Retry with a new request.');
 }
 return {order:printOrderView({id,status:'simulated',created_at:now(),card_count:personalized?2:1,recipe_json:JSON.stringify(recipe),format:'folded',back_text:foldedBackText(c.i.edition_year),note:(personalized?c.published!.printNote:c.published!.defaultPrintNote?.trim()||c.published!.printNote)||'',authors:c.published!.authors}),reused:false};
}

export function printOrderView(order:PrintOrderProof){
 const recipe=order.recipe_json?JSON.parse(order.recipe_json):{};
 const frontDesign=order.card_count===2&&recipe.frontDesign!=='default'?'personal':'default';
 return {id:order.id,status:order.status,created_at:order.created_at,cardCount:order.format==='folded'?1:order.card_count,format:order.format||'legacy',personalized:order.card_count===2,frontDesign,...(order.format==='folded'?{preview:guestFoldedPreview(order.back_text||''),defaultSrc:order.card_count===2?`/api/print/orders/${order.id}/default-artwork`:null}:{}),artworkSrc:`/api/print/orders/${order.id}/artwork`};
}
export async function printOrderArtwork(env:PrintEnv,invite:InvitationAudience,id:string,inside=false){
 const order=await env.DB.prepare("SELECT artwork_key,default_artwork_key FROM print_orders WHERE id=?1 AND invitation_id=?2 AND year=?3 AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown')").bind(id,invite.id,invite.edition_year).first<{artwork_key:string;default_artwork_key:string|null}>();
 const file=order&&await env.MEDIA.get(inside?(order.default_artwork_key||order.artwork_key):order.artwork_key);
 if(!file)throw new PrintProblem(404,'Ordered keepsake not found.');
 return new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store, private'}});
}
