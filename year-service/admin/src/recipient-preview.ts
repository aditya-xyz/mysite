import {giftWindow} from '../../src/gift-deadline.ts';
import {addressMode,verifyGoogle,type AddressEnv} from './address-verification.ts';
import {addressVerificationCurrent} from '../../src/address-state.ts';
import {mailingAddress,PrintProblem,foldedPreviewNote,foldedBackText} from '../../src/printing.ts';
import {keepsakeDefault} from '../../src/keepsake-defaults.ts';
import {preparedMugCatalog,preparedMugImage} from '../../src/prepared-mugs.ts';
import {invitationMembers,type InvitationAudience} from '../../src/invitations.ts';

// Called only after adminIdentity. No guest cookie, reusable code or session is created.
export async function recipientPreviewRoute(request:Request,env:AddressEnv,year:number,path:string,journal:(invitationId?:string)=>Promise<any>,readBody:()=>Promise<Record<string,unknown>>){
 if(!path.startsWith('/api/recipient-preview/'))return null;
 const action=path.slice('/api/recipient-preview/'.length),url=new URL(request.url);
 const invitation=url.searchParams.get('invitation'),recipient=url.searchParams.get('recipient');
 const invite=invitation?await env.DB.prepare('SELECT * FROM invites WHERE id=?1 AND edition_year=?2').bind(invitation,year).first<InvitationAudience>():recipient?await env.DB.prepare("SELECT * FROM invites WHERE edition_year=?2 AND (person_id=?1 OR EXISTS(SELECT 1 FROM json_each(member_ids) WHERE value=?1)) ORDER BY revoked_at IS NOT NULL,expires_at DESC LIMIT 1").bind(recipient,year).first<InvitationAudience>():null;
 if(invitation&&!invite)throw new PrintProblem(404,'Invitation not found.');
 const personId=invite?.person_id||recipient;
 const person=personId?await env.DB.prepare('SELECT * FROM people WHERE id=?1').bind(personId).first<any>():null;
 if(recipient&&!await env.DB.prepare('SELECT id FROM people WHERE id=?1').bind(recipient).first())throw new PrintProblem(404,'Recipient not found.');
 const edition=await env.DB.prepare('SELECT * FROM editions WHERE year=?1').bind(year).first<any>();
 const base=`/api/editions/${year}/recipient-preview/`,query=url.search;
 const defaults=await keepsakeDefault(env,year);
 const window=invite?await giftWindow(env.DB,invite):{closed:false,closesAt:null,runAt:null};
 const canPrint=!window.closed&&!!(invite?.allow_print&&edition?.allow_print_orders&&defaults);
 if(request.method==='GET'){
  if(action==='journal'){
   const data=await journal(invite?.id);data.adminPreview=true;data.giftWindow=window;data.shareSocials=!!invite?.share_socials;data.householdSize=invite?invitationMembers(invite).length:1;
   if(window.closed||!invite?.allow_mug||!edition?.allow_mug_orders){data.gift.enabled=false;data.gift.designs=[];}
   Object.assign(data.gift,{mode:'preview',orderingEnabled:false,livePricing:true,hasOrder:false,claim:null});
   data.keepsake=canPrint?{enabled:true,mode:data.photos.filter((p:any)=>p.personal).length>=3?'personal':'default',cardCount:1,format:'folded',defaultRevision:defaults!.revision,defaultSrc:base+`default/${defaults!.revision}/`}: {enabled:false};
   if(canPrint)data.keepsake.defaultFrames=Object.fromEntries(Object.keys(defaults!.frames).map(frame=>[frame,base+`default/${defaults!.revision}/${frame}`+query]));
   return Response.json({...data,previewContext:query});
  }
  if(action==='gift/deadline')return Response.json(window);
  if(action==='gift/status')return Response.json({eligible:!window.closed&&!!(invite?.allow_mug&&edition?.allow_mug_orders),claim:null,livePricing:true,mode:'preview'});
  if(action==='gift/catalog'){
   const catalog=await preparedMugCatalog(env,year,true);if(!catalog)throw new PrintProblem(409,'Prepare mug previews in admin first.');
   return Response.json({...catalog,previews:(catalog.previews||[]).map((p:any)=>({...p,src:base+'mug-image/'+p.id+query}))});
  }
  const image=/^mug-image\/([a-f0-9]{64})$/.exec(action);
  if(image&&invite)return preparedMugImage(env,invite,image[1]);
  if(action==='delivery-address'){
   let address=null;try{if(person?.mailing_address)address=mailingAddress(JSON.parse(person.mailing_address));}catch{}
   return Response.json({previewOnly:true,verified:!!address&&addressVerificationCurrent(person),address:address&&addressVerificationCurrent(person)?address:null,country:address?.country||'US',recipientName:person?.name||'friend',version:person?.version||1,mode:addressMode(request,env),autocompleteAvailable:false});
  }
  if(action==='print/status')return Response.json({previewOnly:true,eligible:canPrint,canOrder:canPrint,remaining:1,order:null,mode:'preview',cardCount:1,format:'folded',preview:{note:foldedPreviewNote,authors:'Pixel',backText:foldedBackText(year)}});
  const imageDefault=/^default\/([a-f0-9]+)\/([^/]+)$/.exec(action);
  if(imageDefault&&canPrint&&defaults!.revision===imageDefault[1]){
   const key=defaults!.frames[imageDefault[2]],file=key?await env.MEDIA.get(key):null;
   if(file)return new Response(file.body,{headers:{'Content-Type':'image/jpeg'}});
  }
 }
 if(request.method==='POST'&&action==='delivery-address/verify'){
  if(addressMode(request,env)!=='google')throw new PrintProblem(503,'Google verification is unavailable. Preview does not change the contact.');
  const data=await readBody(),address=mailingAddress(data.address);if(address.country!=='US')throw new PrintProblem(400,'International addresses are managed in admin.');return Response.json({address:await verifyGoogle(env,address),verificationId:'preview-only',previewOnly:true});
 }
 // Explicit allowlist: checkout, contact saves, SMS and authentication never enter guest routes.
 throw new PrintProblem(403,'This admin preview cannot place orders, send texts or save contact changes.');
}
