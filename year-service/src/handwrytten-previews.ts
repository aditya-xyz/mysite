import {PrintProblem,printContext,readPrintArtwork,type PrintEnv} from './printing.ts';
import {keepsakeAccess} from './keepsake-defaults.ts';
import {prepareHandwryttenFoldedCard} from './handwrytten.ts';
import {handwryttenBrandPNG,handwryttenBrandYear} from './handwrytten-brand.ts';
import {digest,now} from './security.ts';
import type {InvitationAudience} from './invitations.ts';
export const handwryttenPreviewVersion='handwrytten-folded-v2-cover-fit90';
interface Proof {id:string;invitation_id:string;year:number;status:string;card_id:number|null;front_key:string|null;inside_key:string|null;back_key:string|null;updated_at:number}
export function handwryttenPictureView(id:string){return {provider:'handwrytten',id,frontSrc:`/api/print/previews/${id}/front`,insideSrc:`/api/print/previews/${id}/inside`,backSrc:`/api/print/previews/${id}/back`};}
async function proofId(c:Awaited<ReturnType<typeof printContext>>,recipe:any,bytes:Uint8Array){
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer)),b=>b.toString(16).padStart(2,'0')).join('');
 return digest(JSON.stringify([handwryttenPreviewVersion,c.i.id,c.i.edition_year,c.defaults!.revision,recipe.mode,recipe.frame,recipe.photoIds,recipe.photoIds.map((id:string)=>recipe.crops[id]),hash]));
}
export async function matchingHandwryttenPreview(env:PrintEnv,c:Awaited<ReturnType<typeof printContext>>,recipe:any,bytes:Uint8Array){
 const id=await proofId(c,recipe,bytes);
 const row=recipe.previewId===id?await env.DB.prepare("SELECT * FROM handwrytten_previews WHERE id=?1 AND invitation_id=?2 AND year=?3 AND status='ready'").bind(id,c.i.id,c.i.edition_year).first<Proof>():null;
 if(!row?.card_id)throw new PrintProblem(409,'Wait for the matching Handwrytten picture previews before confirming.');return row;
}
export async function createHandwryttenPreview(request:Request,env:PrintEnv,invite:InvitationAudience){
 if(env.HANDWRYTTEN_PREVIEWS_ENABLED!=='true')throw new PrintProblem(503,'Handwrytten previews are not enabled.');
 const c=await printContext(request,env,invite);
 if(c.reason&&!c.needsAddress)throw new PrintProblem(409,c.reason);
 if(c.i.edition_year!==handwryttenBrandYear)throw new PrintProblem(503,'The back signature for this edition is being prepared.');
 const {recipe,personalized,bytes,defaultBytes}=await readPrintArtwork(request,env,c),id=await proofId(c,recipe,bytes);
 const previous=await env.DB.prepare('SELECT * FROM handwrytten_previews WHERE id=?1').bind(id).first<Proof>();
 if(previous?.status==='ready')return {status:'ready',pictures:handwryttenPictureView(id)};
 const row=await env.DB.prepare(`INSERT INTO handwrytten_previews(id,invitation_id,year,status) VALUES(?1,?2,?3,'preparing')
 ON CONFLICT(id) DO UPDATE SET status='preparing',updated_at=?4 WHERE status='failed' OR (status='preparing' AND updated_at<?5) RETURNING *`).bind(id,invite.id,invite.edition_year,now(),now()-300).first<Proof>();
 if(!row)return {status:'preparing',id};
 try{
  const asset=await env.DB.prepare('SELECT image_id FROM handwrytten_preview_assets WHERE id=?1').bind('back-'+handwryttenBrandYear+'-v1').first<{image_id:number}>();
  const back=Uint8Array.from(atob(handwryttenBrandPNG),c=>c.charCodeAt(0));
  const prepared=await prepareHandwryttenFoldedCard(env,{
   name:'Pixelbook folded '+id.slice(0,16),front:new File([bytes],'front.jpg',{type:'image/jpeg'}),
   ...(personalized?{inside:new File([defaultBytes],'inside-left.jpg',{type:'image/jpeg'})}:{}),
   back:new File([back],'pixelbook.png',{type:'image/png'}),backId:asset?.image_id,cardId:row.card_id||undefined,
   onBack:async imageId=>{await env.DB.prepare('INSERT INTO handwrytten_preview_assets(id,image_id) VALUES(?1,?2) ON CONFLICT(id) DO NOTHING').bind('back-'+handwryttenBrandYear+'-v1',imageId).run();},
   onCard:async cardId=>{await env.DB.prepare('UPDATE handwrytten_previews SET card_id=?1 WHERE id=?2').bind(cardId,id).run();}
  });
  const keys={} as Record<string,string>;
  for(const side of ['front','inside','back'] as const){
   let response=await fetch(prepared.proofs[side],{redirect:'manual',signal:AbortSignal.timeout(20000)});
   for(let retry=0;!response.ok&&[403,404,409,503].includes(response.status)&&retry<5;retry++){await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,2000));response=await fetch(prepared.proofs[side],{redirect:'manual',signal:AbortSignal.timeout(20000)});}
   if(!response.ok)throw new PrintProblem(502,'The Handwrytten picture proof could not be loaded.');
   const reader=response.body?.getReader();if(!reader)throw new PrintProblem(502,'The picture proof is empty.');
   const chunks:Uint8Array[]=[];let size=0;
   for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>12*1024*1024){await reader.cancel();throw new PrintProblem(502,'The picture proof is too large.');}chunks.push(next.value);}
   const image=new Uint8Array(size);let offset=0;for(const chunk of chunks){image.set(chunk,offset);offset+=chunk.length;}
   const png=[137,80,78,71,13,10,26,10].every((b,i)=>image[i]===b),jpeg=image[0]===255&&image[1]===216;
   if(!png&&!jpeg)throw new PrintProblem(502,'The picture proof format is unsupported.');
   keys[side]=`${invite.edition_year}/handwrytten-previews/${id}/${side}.${png?'png':'jpg'}`;
   await env.MEDIA.put(keys[side],image,{httpMetadata:{contentType:png?'image/png':'image/jpeg'}});
  }
  await env.DB.prepare("UPDATE handwrytten_previews SET status='ready',front_key=?1,inside_key=?2,back_key=?3,updated_at=?4 WHERE id=?5").bind(keys.front,keys.inside,keys.back,now(),id).run();
  return {status:'ready',pictures:handwryttenPictureView(id)};
 }catch(error){await env.DB.prepare("UPDATE handwrytten_previews SET status='failed',updated_at=?1 WHERE id=?2").bind(now(),id).run();throw error instanceof PrintProblem?error:new PrintProblem(503,'The print preview could not be prepared. Please try again.');}
}
async function authorizedProof(env:PrintEnv,invite:InvitationAudience,id:string){
 const row=await env.DB.prepare('SELECT * FROM handwrytten_previews WHERE id=?1 AND invitation_id=?2 AND year=?3').bind(id,invite.id,invite.edition_year).first<Proof>();
 if(!row)throw new PrintProblem(404,'Picture preview not found.');
 const ordered=await env.DB.prepare("SELECT id FROM print_orders WHERE handwrytten_preview_id=?1 AND invitation_id=?2 AND year=?3 AND allowance_reset_at IS NULL AND status IN ('preparing','simulated','submitted','unknown')").bind(id,invite.id,invite.edition_year).first();
 if(!ordered&&!await keepsakeAccess(env,invite))throw new PrintProblem(403,'Keepsakes are not enabled.');return row;
}
export async function handwryttenPreviewStatus(env:PrintEnv,invite:InvitationAudience,id:string){
 const row=await authorizedProof(env,invite,id);return row.status==='ready'?{status:'ready',pictures:handwryttenPictureView(id)}:{status:row.status,id};
}
export async function handwryttenPreviewImage(env:PrintEnv,invite:InvitationAudience,id:string,side:string){
 const row=await authorizedProof(env,invite,id),key=side==='front'?row.front_key:side==='inside'?row.inside_key:row.back_key;
 const file=row.status==='ready'&&key?await env.MEDIA.get(key):null;if(!file)throw new PrintProblem(404,'Picture preview not ready.');
 return new Response(file.body,{headers:{'Content-Type':file.httpMetadata?.contentType||'image/jpeg','Cache-Control':'no-store, private'}});
}
