import {printfulApi,printfulCatalog,printfulEnabled} from './printful.ts';
import {mugAllowed} from './mug-orders.ts';
import {liveMugsConfigured} from './live-gifts.ts';
import {publishedMugs,type Published} from './edition.ts';
import {PrintProblem,type PrintEnv} from './printing.ts';
import {now} from './security.ts';
import type {InvitationAudience} from './invitations.ts';
// @ts-expect-error Shared configuration allowlist.
import {validMugOptions} from '../web/mug-options.js';
interface Mockup {id:string;invitation_id:string;year:number;recipe_key:string;source_key:string;image_key:string|null;task_key:string|null;status:string;source_expires_at:number;next_poll_at:number}
const MAX_BYTES=2*1024*1024;
const state=(row:Mockup)=>({id:row.id,status:row.status,...(row.status==='ready'?{src:`/api/gift/mockup/${row.id}/image`}:{}),retryAfter:Math.max(0,row.next_poll_at-now())});
async function allowed(env:PrintEnv,invite:InvitationAudience){if(!printfulEnabled(env)||!await mugAllowed(env,invite))throw new PrintProblem(403,'Mug previews are unavailable for this invitation.');}
export async function lookupMugMockup(env:PrintEnv,invite:InvitationAudience,data:Record<string,unknown>){
 await allowed(env,invite);
 const configuration=validMugOptions(data.configuration,(await printfulCatalog(env)).styles);
 if(!configuration||typeof data.designId!=='string')throw new PrintProblem(400,'Choose an available mug.');
 const publication=await env.DB.prepare('SELECT published_json FROM editions WHERE year=?1 AND is_active=1').bind(invite.edition_year).first<{published_json:string}>();
 const design=publication&&publishedMugs(JSON.parse(publication.published_json) as Published).find(d=>d.id===data.designId);
 if(!design?.cutoutVersion)throw new PrintProblem(409,'Choose a current published mugshot.');
 // Resume only this household’s prior render.
 const row=await env.DB.prepare("SELECT * FROM mug_mockups WHERE invitation_id=?1 AND year=?2 AND design_id=?3 AND cutout_version=?4 AND caption=?5 AND configuration_json=?6 AND layout_version=3 AND (status='ready' OR (status IN ('pending','preparing') AND source_expires_at>?7)) ORDER BY CASE status WHEN 'ready' THEN 0 ELSE 1 END,created_at DESC LIMIT 1").bind(invite.id,invite.edition_year,design.id,design.cutoutVersion,design.caption,JSON.stringify(configuration),now()).first<Mockup>();
 return row?state(row):{status:'missing'};
}
async function bytes(request:Request|Response){
 if(Number(request.headers.get('Content-Length'))>MAX_BYTES+8192)throw new PrintProblem(413,'Mug preview artwork is too large.');
 const reader=request.body?.getReader();if(!reader)throw new PrintProblem(400,'Include the mug artwork.');
 const chunks:Uint8Array[]=[];let length=0;for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>MAX_BYTES+8192){await reader.cancel();throw new PrintProblem(413,'Mug preview artwork is too large.');}chunks.push(next.value);}
 const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}
export async function mugMockupSource(env:PrintEnv,id:string){
 // A short-lived, unguessable capability exposes only this rendered print file
 // to Printful. Gallery originals and R2 remain private; no session is shared.
 const row=await env.DB.prepare(`SELECT m.source_key FROM mug_mockups m JOIN invites i ON i.id=m.invitation_id JOIN editions e ON e.year=m.year WHERE m.id=?1 AND m.source_expires_at>?2 AND m.status IN ('preparing','pending') AND i.revoked_at IS NULL AND i.expires_at>?2 AND i.allow_mug=1 AND e.is_active=1 AND (?3=1 OR e.allow_mug_orders=1)`).bind(id,now(),Number(liveMugsConfigured(env))).first<{source_key:string}>();
 const file=row&&await env.MEDIA.get(row.source_key);if(!file)throw new PrintProblem(404,'Preview artwork not found.');return new Response(file.body,{headers:{'Content-Type':'image/png'}});
}
export async function mugMockupResult(request:Request,env:PrintEnv,invite:InvitationAudience,id:string,image=false){
 await allowed(env,invite);
 const row=await env.DB.prepare('SELECT * FROM mug_mockups WHERE id=?1 AND invitation_id=?2 AND year=?3').bind(id,invite.id,invite.edition_year).first<Mockup>();
 if(!row)throw new PrintProblem(404,'Mug preview not found.');
 if(image){const file=row.image_key&&await env.MEDIA.get(row.image_key);if(!file)throw new PrintProblem(404,'Mug preview not found.');return new Response(file.body,{headers:{'Content-Type':'image/png'}});}
 if(['preparing','pending'].includes(row.status)&&row.source_expires_at<=now()){
  await env.DB.prepare("UPDATE mug_mockups SET status='failed',source_expires_at=0 WHERE id=?1").bind(id).run();await env.MEDIA.delete(row.source_key);row.status='failed';
 }
 if(row.status==='pending'&&row.task_key&&now()>=row.next_poll_at){
  const lock=await env.DB.prepare('UPDATE mug_mockups SET next_poll_at=?1 WHERE id=?2 AND next_poll_at<=?3 RETURNING id').bind(now()+10,id,now()).first();if(!lock)return Response.json(state(row));
  row.next_poll_at=now()+10;
  const result=await printfulApi(env,`/mockup-generator/task?task_key=${encodeURIComponent(row.task_key)}`) as {status:string;mockups?:{mockup_url:string;extra?:{option:string;url:string}[]}[]};
  if(result.status==='completed'){
   const mockup=result.mockups?.[0];const url=mockup?.extra?.find(e=>/front/i.test(e.option))?.url||mockup?.mockup_url;
   if(!url)throw new PrintProblem(503,'Printful could not prepare this preview.');
   const parsed=new URL(url);if(parsed.protocol!=='https:'||!['printful-upload.s3-accelerate.amazonaws.com','files.cdn.printful.com'].includes(parsed.hostname))throw new PrintProblem(503,'Printful returned an unavailable preview.');
   const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
   if(!response.ok||!response.headers.get('Content-Type')?.startsWith('image/png'))throw new PrintProblem(503,'Printful could not retrieve this preview.');
   const png=await bytes(response);if(![137,80,78,71,13,10,26,10].every((b,i)=>png[i]===b))throw new PrintProblem(503,'Printful returned an unavailable preview.');
   row.image_key=`${row.year}/mug-mockups/${id}/mockup.png`;await env.MEDIA.put(row.image_key,png,{httpMetadata:{contentType:'image/png'}});
   await env.DB.prepare("UPDATE mug_mockups SET status='ready',image_key=?1,source_expires_at=0 WHERE id=?2").bind(row.image_key,id).run();await env.MEDIA.delete(row.source_key);row.status='ready';
  }else if(result.status==='failed'||row.source_expires_at<=now()){
   await env.DB.prepare("UPDATE mug_mockups SET status='failed',source_expires_at=0 WHERE id=?1").bind(id).run();await env.MEDIA.delete(row.source_key);row.status='failed';
  }
 }
 return Response.json(state(row));
}
export async function cleanMugMockups(env:PrintEnv){
 const stale=await env.DB.prepare("SELECT id,source_key FROM mug_mockups WHERE source_expires_at<=?1 AND status!='ready' LIMIT 100").bind(now()).all<{id:string;source_key:string}>();
 for(const row of stale.results){await env.MEDIA.delete(row.source_key);await env.DB.prepare('DELETE FROM mug_mockups WHERE id=?1').bind(row.id).run();}
}
