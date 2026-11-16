import {PrintProblem,printedGreeting,type PrintEnv} from './printing.ts';
import {keepsakeDefault,keepsakeAccess} from './keepsake-defaults.ts';
import {giftWindow,giftReservationOpenSQL} from './gift-deadline.ts';
import {invitationMembers,invitationAudience,type InvitationAudience} from './invitations.ts';
import {visiblePhotos,type Published} from './edition.ts';
import {imageDimensions} from './image-dimensions.ts';
import {now,token} from './security.ts';
export interface DigitalPostcard {id:string;year:number;invitation_id:string;member_ids:string;personalized:number;frame:string;note:string;authors:string;frames_json:string;default_revision:string;artwork_key:string;recipe_json:string;created_at:number}
export const digitalMailingAllowedSQL=`NOT EXISTS(SELECT 1 FROM digital_postcards d WHERE d.year=i.edition_year AND (d.invitation_id=i.id OR i.person_id IN (SELECT value FROM json_each(d.member_ids)) OR EXISTS(SELECT 1 FROM json_each(i.member_ids) a JOIN json_each(d.member_ids) b ON a.value=b.value)))`;
export const householdMembers=(i:InvitationAudience)=>[...new Set([i.person_id,...invitationMembers(i)].filter(Boolean))];
export async function digitalPostcard(db:D1Database,i:InvitationAudience){return db.prepare(`SELECT * FROM digital_postcards d WHERE year=?1 AND (invitation_id=?2 OR EXISTS(SELECT 1 FROM json_each(d.member_ids) a JOIN json_each(?3) b ON a.value=b.value)) LIMIT 1`).bind(i.edition_year,i.id,JSON.stringify(householdMembers(i))).first<DigitalPostcard>();}
export async function digitalContext(env:PrintEnv,i:InvitationAudience){
 if((await giftWindow(env.DB,i)).closed)throw new PrintProblem(403,'The gift deadline has passed.');
 if(!await keepsakeAccess(env,i))throw new PrintProblem(403,'Postcards are not enabled for this invitation and scrapbook.');
 const [edition,claim,defaults]=await Promise.all([env.DB.prepare('SELECT published_json,published_version FROM editions WHERE year=?1 AND is_active=1').bind(i.edition_year).first<{published_json:string;published_version:number}>(),digitalPostcard(env.DB,i),keepsakeDefault(env,i.edition_year)]);
 if(!edition?.published_json||!defaults)throw new PrintProblem(409,'Your postcard is not available yet.');
 const p=JSON.parse(edition.published_json) as Published,photos=visiblePhotos(p,i.id,await invitationAudience(env.DB,i)).filter(p=>p.recipients.length),personalized=claim?!!claim.personalized&&photos.length>=3:photos.length>=3;
 const members=JSON.stringify(householdMembers(i));
 const order=await env.DB.prepare(`SELECT o.id FROM print_orders o JOIN invites oi ON oi.id=o.invitation_id WHERE o.year=?1 AND o.allowance_reset_at IS NULL AND o.status IN ('preparing','simulated','submitted','unknown') AND (oi.id=?2 OR oi.person_id IN (SELECT value FROM json_each(?3)) OR EXISTS(SELECT 1 FROM json_each(oi.member_ids) a JOIN json_each(?3) b ON a.value=b.value)) LIMIT 1`).bind(i.edition_year,i.id,members).first();
 const note=claim?.note||printedGreeting(i)+(personalized?p.printNote:p.defaultPrintNote?.trim()||p.printNote||'');
 if(!note.trim()||(!claim&&!(personalized?p.printNote:p.defaultPrintNote?.trim()||p.printNote)?.trim()))throw new PrintProblem(409,'The postcard note is not published yet.');
 return {edition,p,photos,claim,defaults,personalized,note,order};
}
export async function digitalStatus(env:PrintEnv,i:InvitationAudience){
 const c=await digitalContext(env,i);
 return {eligible:!c.order,claimed:!!c.claim,personalized:c.personalized,note:c.note,authors:c.claim?.authors||c.p.authors,frame:c.claim?.frame,contentVersion:c.edition.published_version,defaultRevision:c.claim?.default_revision||c.defaults.revision,defaultSrc:'/api/print/digital/default/',artworkSrc:c.claim?'/api/print/digital/image':null};
}
export async function digitalImage(env:PrintEnv,i:InvitationAudience,frame?:string){
 const c=await digitalContext(env,i),key=frame?(c.claim?JSON.parse(c.claim.frames_json):c.defaults.frames)[frame]:c.claim?.artwork_key;
 if(!key)throw new PrintProblem(404,'Digital postcard not found.');const file=await env.MEDIA.get(key);if(!file)throw new PrintProblem(404,'Digital postcard not found.');
 return new Response(file.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store, private'}});
}
export async function claimDigitalPostcard(request:Request,env:PrintEnv,i:InvitationAudience){
 const c=await digitalContext(env,i);if(c.claim)return {...await digitalStatus(env,i),reused:true};if(c.order)throw new PrintProblem(409,'Your mailed postcard is already reserved.');
 const length=Number(request.headers.get('Content-Length'));if(!length||length>3*1024*1024)throw new PrintProblem(413,'Use a postcard image under 3 MB.');
 const form=await request.formData(),file=form.get('artwork');let recipe:any;try{recipe=JSON.parse(String(form.get('recipe')));}catch{throw new PrintProblem(400,'Check your digital postcard.');}
 if(!recipe||typeof recipe!=='object'||recipe.confirmed!==true)throw new PrintProblem(400,'Confirm that your household permanently gives up its mailed postcard.');
 if(!(file instanceof File)||file.type!=='image/jpeg'||String(form.get('recipe')).length>5000||file.size>3*1024*1024||!['starry-night','evergreen','winterlight'].includes(recipe.frame)||!Object.hasOwn(c.defaults.frames,recipe.frame))throw new PrintProblem(400,'Check your digital postcard.');
 if(recipe.contentVersion!==c.edition.published_version||recipe.defaultRevision!==c.defaults.revision)throw new PrintProblem(409,'The postcard changed. Reopen it and try again.');
 const ids=recipe.photoIds;if(!Array.isArray(ids)||(c.personalized?(ids.length!==3||new Set(ids).size!==3||ids.some((id:string)=>!c.photos.some(p=>p.id===id))):ids.length))throw new PrintProblem(403,'Choose only the photos assigned to your household.');
 if(c.personalized&&ids.some((id:string)=>{const v=recipe.crops?.[id];return !v||![v.x,v.y,v.zoom].every(Number.isFinite)||v.x<0||v.x>1||v.y<0||v.y>1||v.zoom<1||v.zoom>2.5;}))throw new PrintProblem(400,'Check the photo crops.');
 const bytes=new Uint8Array(await file.arrayBuffer()),size=imageDimensions(bytes);if(size?.width!==1080||size.height!==(c.personalized?1920:1440))throw new PrintProblem(400,'Use the complete digital postcard image.');
 const id='digital-'+token().slice(0,24),key=`${i.edition_year}/digital-postcards/${id}.jpg`;await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
 try{
  const inserted=await env.DB.prepare(`INSERT INTO digital_postcards(id,year,invitation_id,member_ids,personalized,frame,note,authors,frames_json,default_revision,artwork_key,recipe_json)
   SELECT ?1,i.edition_year,i.id,?2,?3,?4,?5,?6,?7,?8,?9,?10 FROM invites i JOIN editions e ON e.year=i.edition_year
   WHERE i.id=?11 AND i.version=?12 AND i.allow_print=1 AND i.revoked_at IS NULL AND i.expires_at>?13 AND e.is_active=1 AND e.allow_print_orders=1 AND e.published_version=?14 AND ${giftReservationOpenSQL}
   AND EXISTS(SELECT 1 FROM keepsake_defaults k WHERE k.year=e.year AND k.revision=?8) RETURNING id`).bind(id,JSON.stringify(householdMembers(i)),Number(c.personalized),recipe.frame,c.note,c.p.authors,JSON.stringify(c.defaults.frames),c.defaults.revision,key,JSON.stringify(recipe),i.id,(i as any).version,now(),c.edition.published_version).first();
  if(!inserted)throw new Error('Reservation changed');
 }catch{
  await env.MEDIA.delete(key);if(await digitalPostcard(env.DB,i))return {...await digitalStatus(env,i),reused:true};throw new PrintProblem(409,'Your postcard choice changed. Reopen the postcard and try again.');
 }
 return {...await digitalStatus(env,i),reused:false};
}
