import {PrintProblem,type PrintEnv} from './printing.ts';
import {keepsakeAccess} from './keepsake-defaults.ts';
import {prepareHandwryttenFoldedCard} from './handwrytten.ts';
import {handwryttenBrandPNG,handwryttenBrandYear} from './handwrytten-brand.ts';
import {digest,now} from './security.ts';
import type {InvitationAudience} from './invitations.ts';
export const handwryttenPreviewVersion='handwrytten-folded-v3-placement';
interface Proof {id:string;invitation_id:string;year:number;status:string;card_id:number|null;front_key:string|null;inside_key:string|null;back_key:string|null;updated_at:number}
export function handwryttenPictureView(id:string){return {provider:'handwrytten',id,frontSrc:`/api/print/previews/${id}/front`,insideSrc:`/api/print/previews/${id}/inside`,backSrc:`/api/print/previews/${id}/back`};}
// Admin proofs always read immutable order artwork rather than current editor/defaults.
export async function prepareSavedOrderProof(env:PrintEnv,year:number,orderId:string){
 if(env.HANDWRYTTEN_PREVIEWS_ENABLED!=='true')throw new PrintProblem(503,'Handwrytten previews are not enabled.');
 const order=await env.DB.prepare("SELECT * FROM print_orders WHERE id=?1 AND year=?2 AND format='folded' AND status='simulated' AND allowance_reset_at IS NULL").bind(orderId,year).first<{id:string;invitation_id:string;year:number;artwork_key:string;default_artwork_key:string;card_count:number;handwrytten_preview_id:string|null}>();
 if(!order)throw new PrintProblem(404,'Simulated folded order not found.');
 if(year!==handwryttenBrandYear)throw new PrintProblem(503,'The back signature for this edition is being prepared.');
 const invite={id:order.invitation_id,edition_year:year};
 const id=order.handwrytten_preview_id||await digest(JSON.stringify([handwryttenPreviewVersion,'saved-order',order.id]));
 async function attach(){
  // Only attach a ready, scoped design; keep the real frozen note/font/address intact.
  const attached=await env.DB.prepare("UPDATE print_orders SET handwrytten_preview_id=?1,handwrytten_order_json=json_set(handwrytten_order_json,'$.card_id',(SELECT card_id FROM handwrytten_previews WHERE id=?1)) WHERE id=?2 AND year=?3 AND status='simulated' AND allowance_reset_at IS NULL RETURNING id").bind(id,orderId,year).first();
  if(!attached)throw new PrintProblem(409,'This simulated order was reset. Reopen order history.');
 }
 const previous=await env.DB.prepare('SELECT * FROM handwrytten_previews WHERE id=?1').bind(id).first<Proof>();
 if(previous&&(previous.invitation_id!==invite.id||previous.year!==year))throw new PrintProblem(409,'The saved proof does not match this order.');
 if(previous?.status==='ready'){await attach();return {status:'ready',id};}
 const front=await env.MEDIA.get(order.artwork_key),inside=order.card_count===2?await env.MEDIA.get(order.default_artwork_key):null;
 if(!front||(order.card_count===2&&!inside))throw new PrintProblem(404,'Saved artwork not found.');
 const frontBytes=await front.arrayBuffer(),insideBytes=inside?await inside.arrayBuffer():null;
 const row=await env.DB.prepare(`INSERT INTO handwrytten_previews(id,invitation_id,year,status) VALUES(?1,?2,?3,'preparing')
 ON CONFLICT(id) DO UPDATE SET status='preparing',updated_at=?4 WHERE status='failed' OR (status='preparing' AND updated_at<?5) RETURNING *`).bind(id,invite.id,invite.edition_year,now(),now()-300).first<Proof>();
 if(!row)return {status:'preparing',id};
 try{
  const asset=await env.DB.prepare('SELECT image_id FROM handwrytten_preview_assets WHERE id=?1').bind('back-'+handwryttenBrandYear+'-v1').first<{image_id:number}>();
  const back=Uint8Array.from(atob(handwryttenBrandPNG),c=>c.charCodeAt(0));
  const prepared=await prepareHandwryttenFoldedCard(env,{
   name:'Pixelbook folded '+id.slice(0,16),front:new File([frontBytes],'front.jpg',{type:'image/jpeg'}),
   ...(insideBytes?{inside:new File([insideBytes],'inside-left.jpg',{type:'image/jpeg'})}:{}),
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
  await attach();return {status:'ready',id};
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
