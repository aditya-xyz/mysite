import {publishedMugs,type Published,type PublishedMugDesign} from './edition.ts';
import {PrintProblem,type PrintEnv} from './printing.ts';
import {printfulCatalog,printfulApi,printfulEnabled,type MugStyle,type MugVariant} from './printful.ts';
import {digest,now,token} from './security.ts';
import type {InvitationAudience} from './invitations.ts';
// @ts-expect-error Shared font identifiers only; artwork is prepared by the authenticated owner.
import {mugFonts} from '../web/mug-options.js';
const LAYOUT=1,SIDE=1200,MAX_IMAGE=3*1024*1024;
interface Source {id:string;year:number;design_id:string;cutout_version:string;caption:string;font:string;ink:string;artwork_key:string}
interface Target extends MugVariant {style:string;imageId:string}
interface Job {id:string;year:number;source_id:string;product_id:number;print_width:number;print_height:number;mockup_group:string|null;variants_json:string;status:string;task_key:string|null;source_expires_at:number;next_check_at:number;attempts:number;result_key:string|null}
interface Sync {year:number;catalog_json:string|null;manifest_json:string|null;desired_count:number;ready_count:number;requested:number;synced_at:number}
interface Catalog {provider:string;currency:string;styles:MugStyle[];maxCents:number;taxReserveCents:number;shippingReserveCents:number}
interface Image {id:string;year:number;source_id:string;design_id:string;cutout_version:string;caption:string;font:string;style:string;size:string;color:string;variant_id:number;image_key:string}
const inkFor=(style:string)=>style==='black-glossy'?'light':'dark';
async function published(env:PrintEnv,year:number){const row=await env.DB.prepare('SELECT published_json FROM editions WHERE year=?1 AND is_active=1').bind(year).first<{published_json:string}>();return row?.published_json?publishedMugs(JSON.parse(row.published_json) as Published):[];}
async function sourcePlan(year:number,design:PublishedMugDesign,font:string,ink:string){
 const id=await digest(JSON.stringify([LAYOUT,year,design.id,design.cutoutVersion,design.caption,font,ink]));
 return {id,year,design_id:design.id,cutout_version:design.cutoutVersion!,caption:design.caption,font,ink,artwork_key:`${year}/prepared-mugs/sources/${id}.png`,src:`/api/editions/${year}/media/${design.id}/cutout/${design.cutoutVersion}`,alt:design.alt};
}
export async function preparedMugPlans(env:PrintEnv,year:number){
 const plans=[];for(const design of await published(env,year))for(const font of mugFonts)for(const ink of ['dark','light'])plans.push(await sourcePlan(year,design,font.id,ink));return plans;
}
async function bounded(request:Request|Response,max=MAX_IMAGE){
 if(Number(request.headers.get('Content-Length'))>max)throw new PrintProblem(413,'Preview image is too large.');
 const reader=request.body?.getReader();if(!reader)throw new PrintProblem(400,'Include the preview image.');const chunks:Uint8Array[]=[];let size=0;
 for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>max){await reader.cancel();throw new PrintProblem(413,'Preview image is too large.');}chunks.push(next.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function isPNG(bytes:Uint8Array){return bytes.length>=33&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);}
export async function preparedMugAdminRoute(request:Request,env:PrintEnv,path:string,year:number){
 if(path==='/api/mug-preview-library'&&request.method==='GET'){
  const sources=await env.DB.prepare('SELECT id FROM mug_preview_sources WHERE year=?1').bind(year).all<{id:string}>(),saved=new Set(sources.results.map(s=>s.id));
  const sync=await env.DB.prepare('SELECT desired_count,ready_count,synced_at FROM mug_preview_sync WHERE year=?1').bind(year).first();
  const pending=await env.DB.prepare("SELECT status,count(*) AS count FROM mug_preview_jobs WHERE year=?1 GROUP BY status").bind(year).all();
  return Response.json({plans:(await preparedMugPlans(env,year)).map(p=>({...p,ready:saved.has(p.id)})),sync,jobs:pending.results});
 }
 const source=/^\/api\/mug-preview-library\/sources\/([a-f0-9]{64})$/.exec(path);
 if(source&&request.method==='POST'){
  const plan=(await preparedMugPlans(env,year)).find(p=>p.id===source[1]);if(!plan)throw new PrintProblem(409,'The published mug artwork changed. Reload the preview preparation.');
  if(await env.DB.prepare('SELECT id FROM mug_preview_sources WHERE id=?1').bind(plan.id).first())return Response.json({saved:true,reused:true});
  const bytes=await bounded(request),view=new DataView(bytes.buffer);
  if(!isPNG(bytes)||view.getUint32(16)!==SIDE||view.getUint32(20)!==SIDE||bytes[24]!==8||bytes[25]!==6)throw new PrintProblem(400,'Use the prepared transparent PNG artwork.');
  await env.MEDIA.put(plan.artwork_key,bytes,{httpMetadata:{contentType:'image/png'}});
  await env.DB.prepare('INSERT INTO mug_preview_sources(id,year,design_id,cutout_version,caption,font,ink,artwork_key) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id) DO NOTHING').bind(plan.id,year,plan.design_id,plan.cutout_version,plan.caption,plan.font,plan.ink,plan.artwork_key).run();
  await requestPreparedSync(env,year);return Response.json({saved:true});
 }
 if(path==='/api/mug-preview-library/sync'&&request.method==='POST'){await requestPreparedSync(env,year);return Response.json({queued:true});}
 return null;
}
export async function requestPreparedSync(env:PrintEnv,year:number){await env.DB.prepare('INSERT INTO mug_preview_sync(year,requested) VALUES(?1,1) ON CONFLICT(year) DO UPDATE SET requested=1').bind(year).run();}
export async function syncPreparedMugs(env:PrintEnv,year:number){
 const lease=await env.DB.prepare('INSERT INTO mug_preview_sync(year,sync_lease_until) VALUES(?1,?2) ON CONFLICT(year) DO UPDATE SET sync_lease_until=excluded.sync_lease_until WHERE sync_lease_until<=?3 RETURNING year').bind(year,now()+180,now()).first();if(!lease)return;
 try{
  const catalog=await printfulCatalog(env,true),designs=await published(env,year),plans=await preparedMugPlans(env,year);
  const stored=await env.DB.prepare('SELECT * FROM mug_preview_sources WHERE year=?1').bind(year).all<Source>(),sources=new Map(stored.results.map(s=>[s.id,s]));
  const images=await env.DB.prepare('SELECT id FROM mug_preview_images WHERE year=?1').bind(year).all<{id:string}>(),ready=new Set(images.results.map(i=>i.id));
  await env.DB.prepare("UPDATE mug_preview_jobs SET status='obsolete',source_expires_at=0,source_token=NULL WHERE year=?1 AND status IN ('queued','starting','pending','copying') AND source_id NOT IN (SELECT value FROM json_each(?2))").bind(year,JSON.stringify(plans.map(p=>p.id))).run();
  const activeJobs=await env.DB.prepare("SELECT variants_json FROM mug_preview_jobs WHERE year=?1 AND status IN ('queued','starting','pending','copying')").bind(year).all<{variants_json:string}>();
  const covered=new Set(activeJobs.results.flatMap(j=>(JSON.parse(j.variants_json) as Target[]).map(v=>v.imageId)));
  const statements:D1PreparedStatement[]=[];
  // Preferred mug/font goes first; a single task includes all colors sharing a print area.
  const styles=[...catalog.styles].sort((a,b)=>a.id==='color-inside'?-1:b.id==='color-inside'?1:0);
  for(const font of mugFonts)for(const style of styles)for(const design of designs){
   const plan=plans.find(p=>p.design_id===design.id&&p.font===font.id&&p.ink===inkFor(style.id));if(!plan||!sources.has(plan.id))continue;
   const groups=new Map<string,Target[]>();
   const variants=[...style.variants].sort((a,b)=>a.size==='15oz'?-1:b.size==='15oz'?1:0);
   for(const variant of variants){
    if(!variant.printWidth||!variant.printHeight)continue;
    const imageId=await digest(JSON.stringify([LAYOUT,plan.id,variant.id]));if(ready.has(imageId)||covered.has(imageId))continue;
    const key=variant.printWidth+'x'+variant.printHeight;const list=groups.get(key)||[];list.push({...variant,style:style.id,imageId});groups.set(key,list);
   }
   for(const targets of groups.values()){
    const first=targets[0],id=await digest(JSON.stringify([plan.id,style.productId,targets.map(t=>t.id).sort()]));
    statements.push(env.DB.prepare("INSERT INTO mug_preview_jobs(id,year,source_id,product_id,print_width,print_height,mockup_group,variants_json,priority) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET status=CASE WHEN status='failed' THEN 'queued' ELSE status END,next_check_at=CASE WHEN status='failed' THEN 0 ELSE next_check_at END,attempts=CASE WHEN status='failed' THEN 0 ELSE attempts END").bind(id,year,plan.id,style.productId,first.printWidth!,first.printHeight!,style.mockupGroup||null,JSON.stringify(targets),styles.indexOf(style)*10000+(first.size==='15oz'?0:1000)+mugFonts.indexOf(font)*100+designs.indexOf(design)));
   }
  }
  for(let i=0;i<statements.length;i+=40)await env.DB.batch(statements.slice(i,i+40));
  await env.DB.prepare('UPDATE mug_preview_sync SET catalog_json=?1,desired_count=?2,requested=0,synced_at=?3,sync_lease_until=0 WHERE year=?4').bind(JSON.stringify(catalog),designs.length*mugFonts.length*catalog.styles.reduce((n,s)=>n+s.variants.length,0),now(),year).run();
  await refreshPreparedManifest(env,year);
 }finally{await env.DB.prepare('UPDATE mug_preview_sync SET sync_lease_until=0 WHERE year=?1').bind(year).run();}
}
async function refreshPreparedManifest(env:PrintEnv,year:number){
 const sync=await env.DB.prepare('SELECT * FROM mug_preview_sync WHERE year=?1').bind(year).first<Sync>();if(!sync?.catalog_json)return;
 const catalog=JSON.parse(sync.catalog_json) as Catalog,designs=await published(env,year),expected=designs.length*mugFonts.length;
 const currentSources=new Set((await preparedMugPlans(env,year)).map(p=>p.id));
 const result=await env.DB.prepare('SELECT * FROM mug_preview_images WHERE year=?1').bind(year).all<Image>();
 const images=result.results.filter(i=>currentSources.has(i.source_id)&&designs.some(d=>d.id===i.design_id&&d.cutoutVersion===i.cutout_version&&d.caption===i.caption)&&catalog.styles.some(s=>s.id===i.style&&s.variants.some(v=>v.id===i.variant_id)));
 const complete=new Set(catalog.styles.flatMap(s=>s.variants).filter(v=>images.filter(i=>i.variant_id===v.id).length===expected).map(v=>v.id));
 const styles=catalog.styles.map(s=>({...s,variants:s.variants.filter(v=>complete.has(v.id))})).filter(s=>s.variants.length).map(s=>({...s,sizes:[...new Set(s.variants.map(v=>v.size))],colors:[...new Set(s.variants.map(v=>v.color))]}));
 const artworkRevision=await digest(JSON.stringify([LAYOUT,designs.map(d=>[d.id,d.cutoutVersion,d.caption])]));
 const manifest=styles.length?{...catalog,styles,prepared:true,artworkRevision,previews:images.filter(i=>complete.has(i.variant_id)).map(i=>({id:i.id,designId:i.design_id,caption:i.caption,configuration:{style:i.style,size:i.size,color:i.color,font:i.font},src:`/api/gift/previews/${i.id}`}))}:null;
 await env.DB.prepare('UPDATE mug_preview_sync SET manifest_json=?1,ready_count=?2 WHERE year=?3').bind(manifest?JSON.stringify(manifest):null,images.length,year).run();
}
export async function preparedMugCatalog(env:PrintEnv,year:number,includeSavedCatalog=false){
 const sync=await env.DB.prepare('SELECT manifest_json,catalog_json FROM mug_preview_sync WHERE year=?1').bind(year).first<{manifest_json:string|null;catalog_json:string|null}>();const fallback=includeSavedCatalog&&sync?.catalog_json?JSON.parse(sync.catalog_json):null;if(!sync?.manifest_json)return fallback;const manifest=JSON.parse(sync.manifest_json);const designs=await published(env,year),revision=await digest(JSON.stringify([LAYOUT,designs.map(d=>[d.id,d.cutoutVersion,d.caption])]));return revision===manifest.artworkRevision?manifest:fallback;
}
export async function preparedMugImage(env:PrintEnv,invite:InvitationAudience,id:string){
 const row=await env.DB.prepare('SELECT * FROM mug_preview_images WHERE id=?1 AND year=?2').bind(id,invite.edition_year).first<Image>();
 const designs=await published(env,invite.edition_year);if(!row||!designs.some(d=>d.id===row.design_id&&d.cutoutVersion===row.cutout_version&&d.caption===row.caption))throw new PrintProblem(404,'Mug preview not found.');
 const image=await env.MEDIA.get(row.image_key);if(!image)throw new PrintProblem(404,'Mug preview not found.');return new Response(image.body,{headers:{'Content-Type':'image/png'}});
}
export async function preparedMugSource(env:PrintEnv,capability:string){
 const row=await env.DB.prepare("SELECT s.artwork_key FROM mug_preview_jobs j JOIN mug_preview_sources s ON s.id=j.source_id JOIN editions e ON e.year=j.year WHERE j.source_token=?1 AND j.source_expires_at>?2 AND j.status IN ('starting','pending') AND e.is_active=1").bind(capability,now()).first<{artwork_key:string}>();
 const image=row&&await env.MEDIA.get(row.artwork_key);if(!image)throw new PrintProblem(404,'Preview artwork not found.');return new Response(image.body,{headers:{'Content-Type':'image/png'}});
}
export async function startPreparedJob(env:PrintEnv){
 const job=await env.DB.prepare("SELECT * FROM mug_preview_jobs WHERE status='queued' AND next_check_at<=?1 ORDER BY priority,created_at,id LIMIT 1").bind(now()).first<Job>();if(!job)return false;
 const lease=await env.DB.prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES('printful-mockup-lease',1,?1) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE expires_at<=?2 RETURNING key").bind(now()+31,now()).first();if(!lease)return false;
 const capability=token(),locked=await env.DB.prepare("UPDATE mug_preview_jobs SET status='starting',source_token=?1,source_expires_at=?2,attempts=attempts+1,updated_at=?3 WHERE id=?4 AND status='queued' RETURNING id").bind(capability,now()+1800,now(),job.id).first();if(!locked)return false;
 try{
  const side=Math.min(job.print_width,job.print_height),origin=(env as PrintEnv&{JOURNAL_ORIGIN?:string}).JOURNAL_ORIGIN||'https://aditya-year-2026.aditya-year-service.workers.dev';
  const result=await printfulApi(env,`/mockup-generator/create-task/${job.product_id}`,{variant_ids:(JSON.parse(job.variants_json) as Target[]).map(v=>v.id),format:'png',width:900,...(job.mockup_group?{option_groups:[job.mockup_group]}:{}),files:[{placement:'default',image_url:new URL('/api/gift/prepared-source/'+capability,origin).href,position:{area_width:job.print_width,area_height:job.print_height,width:side,height:side,left:(job.print_width-side)/2,top:(job.print_height-side)/2}}]}) as {task_key?:string};
  if(!result.task_key)throw new Error('Task unavailable');
  await env.DB.prepare("UPDATE mug_preview_jobs SET status='pending',task_key=?1,next_check_at=?2,updated_at=?3 WHERE id=?4").bind(result.task_key,now()+10,now(),job.id).run();return true;
 }catch(error){await failJob(env,job,error instanceof PrintProblem?error.retryAfter:undefined);return false;}
}
async function failJob(env:PrintEnv,job:Job,retryAfter=60){if(job.result_key)await env.MEDIA.delete(job.result_key);await env.DB.prepare("UPDATE mug_preview_jobs SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,source_expires_at=0,source_token=NULL,task_key=NULL,result_key=NULL,next_check_at=?1,updated_at=?2 WHERE id=?3").bind(now()+Math.max(31,retryAfter),now(),job.id).run();}
export async function finishPreparedJobs(env:PrintEnv){
 const jobs=await env.DB.prepare("SELECT * FROM mug_preview_jobs WHERE status IN ('pending','copying') AND next_check_at<=?1 ORDER BY priority,created_at,id LIMIT 2").bind(now()).all<Job>();let budget=6;const years=new Set<number>();
 for(const job of jobs.results){
  if(budget<=0)break;
  const locked=await env.DB.prepare('UPDATE mug_preview_jobs SET next_check_at=?1 WHERE id=?2 AND next_check_at<=?3 RETURNING id').bind(now()+60,job.id,now()).first();if(!locked)continue;
  try{
   let result:any;
   if(job.result_key){const saved=await env.MEDIA.get(job.result_key);result=saved?await saved.json():null;}
   if(!result){
    result=await printfulApi(env,`/mockup-generator/task?task_key=${encodeURIComponent(job.task_key!)}`);
    if(result.status==='failed'){await failJob(env,job);continue;}
    if(result.status!=='completed'){if(job.source_expires_at<=now())await failJob(env,job);continue;}
    job.result_key=`${job.year}/prepared-mugs/tasks/${job.id}.json`;await env.MEDIA.put(job.result_key,JSON.stringify(result),{httpMetadata:{contentType:'application/json'}});
    await env.DB.prepare("UPDATE mug_preview_jobs SET status='copying',result_key=?1,source_expires_at=0,source_token=NULL WHERE id=?2").bind(job.result_key,job.id).run();
   }
   const source=await env.DB.prepare('SELECT * FROM mug_preview_sources WHERE id=?1').bind(job.source_id).first<Source>();if(!source)throw new Error('Source unavailable');
   const targets=JSON.parse(job.variants_json) as Target[];let remaining=0;
   const existing=await env.DB.prepare('SELECT id FROM mug_preview_images WHERE source_id=?1').bind(source.id).all<{id:string}>(),saved=new Set(existing.results.map(i=>i.id));const inserts:D1PreparedStatement[]=[];
   for(const target of targets){
    if(saved.has(target.imageId))continue;
    if(budget<=0){remaining++;continue;}
    const mockup=result.mockups?.find((m:any)=>m.variant_ids?.includes(target.id));const url=mockup?.extra?.find((e:any)=>/front/i.test(e.option))?.url||mockup?.mockup_url;
    if(typeof url!=='string')throw new Error('Preview unavailable');const parsed=new URL(url);
    if(parsed.protocol!=='https:'||!['printful-upload.s3-accelerate.amazonaws.com','files.cdn.printful.com'].includes(parsed.hostname))throw new Error('Invalid preview host');
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});if(!response.ok||!response.headers.get('Content-Type')?.startsWith('image/png'))throw new Error('Preview unavailable');
    const png=await bounded(response);if(!isPNG(png))throw new Error('Invalid preview');
    const imageKey=`${job.year}/prepared-mugs/images/${target.imageId}.png`;await env.MEDIA.put(imageKey,png,{httpMetadata:{contentType:'image/png'}});
    inserts.push(env.DB.prepare('INSERT INTO mug_preview_images(id,year,source_id,design_id,cutout_version,caption,font,style,size,color,variant_id,image_key) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(id) DO NOTHING').bind(target.imageId,job.year,source.id,source.design_id,source.cutout_version,source.caption,source.font,target.style,target.size,target.color,target.id,imageKey));budget--;years.add(job.year);
   }
   if(inserts.length)await env.DB.batch(inserts);
   if(!remaining){await env.DB.prepare("UPDATE mug_preview_jobs SET status='ready',result_key=NULL,updated_at=?1 WHERE id=?2").bind(now(),job.id).run();await env.MEDIA.delete(job.result_key!);}
  }catch{await failJob(env,job);}
 }
 for(const year of years)await refreshPreparedManifest(env,year);
}
export async function tickPreparedMugs(env:PrintEnv,nightly=false){
 if(!printfulEnabled(env))return;
 const years=await env.DB.prepare('SELECT year FROM editions WHERE is_active=1 AND published_json IS NOT NULL').all<{year:number}>();
 for(const {year} of years.results){const sync=await env.DB.prepare('SELECT * FROM mug_preview_sync WHERE year=?1').bind(year).first<Sync>();if(nightly||sync?.requested||!sync||sync.synced_at<now()-86400){await syncPreparedMugs(env,year);return;}}
 await env.DB.prepare("UPDATE mug_preview_jobs SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,source_expires_at=0,source_token=NULL WHERE status='starting' AND updated_at<?1").bind(now()-180).run();
 await finishPreparedJobs(env);
 let first=await startPreparedJob(env);
 if(!first){
  const queued=await env.DB.prepare("SELECT id FROM mug_preview_jobs WHERE status='queued' AND next_check_at<=?1 LIMIT 1").bind(now()).first();
  const lease=await env.DB.prepare("SELECT expires_at FROM rate_limits WHERE key='printful-mockup-lease'").first<{expires_at:number}>();
  if(queued&&lease&&lease.expires_at>now()){await new Promise(resolve=>setTimeout(resolve,Math.min(31,lease.expires_at-now())*1000+100));first=await startPreparedJob(env);}
 }
 if(first){await new Promise(resolve=>setTimeout(resolve,31050));await startPreparedJob(env);}
}
