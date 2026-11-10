import { UploadProblem } from './media-errors.ts';
interface Env { DB: D1Database; MEDIA: R2Bucket }
export interface LibraryMedia {
  id:string; year:number; filename:string; mime:string; bytes:number; preview_key:string;
  viewer_key:string|null; original_key:string|null; content_hash:string|null; deleting:number;
}
const json=(value:unknown,status=200)=>Response.json(value,{status});
export const validHash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function mediaResult(env:Env,media:LibraryMedia){
  const edition=await env.DB.prepare('SELECT draft_json,published_json FROM editions WHERE year=?1').bind(media.year).first<{draft_json:string;published_json:string|null}>();
  const photos=[...JSON.parse(edition!.draft_json).photos,...(edition!.published_json?JSON.parse(edition!.published_json).photos:[])];
  const photo=photos.find((p:{id:string})=>p.id===media.id);
  return {id:media.id,filename:media.filename,mime:media.mime,bytes:media.bytes,has_original:!!media.original_key,has_viewer:!!media.viewer_key,
    ...(photo?{draftPhoto:{id:media.id,caption:photo.caption,alt:photo.alt,recipients:photo.recipients}}:{})};
}
export async function mediaByHash(env:Env,year:number,hash:string,bytes:number){
  return env.DB.prepare('SELECT * FROM media_objects WHERE year=?1 AND content_hash=?2 AND bytes=?3 AND deleting=0 AND original_key IS NOT NULL').bind(year,hash,bytes).first<LibraryMedia>();
}
export async function mediaLibraryRoute(request:Request,env:Env,actor:string,year:number,path:string,readBody:(r:Request)=>Promise<Record<string,unknown>>):Promise<Response|null>{
  if(request.method!=='POST')return null;
  if(path==='/api/media/lookup'){
    const data=await readBody(request);
    if(!validHash(data.hash)||!Number.isSafeInteger(data.bytes)||(data.bytes as number)<=0||(data.bytes as number)>=100_000_000)throw new UploadProblem(400,'Check the photo fingerprint and size.');
    const existing=await mediaByHash(env,year,data.hash,data.bytes as number);
    if(existing)return json({media:await mediaResult(env,existing),candidates:[]});
    const candidates=await env.DB.prepare('SELECT id,filename FROM media_objects WHERE year=?1 AND bytes=?2 AND content_hash IS NULL AND original_key IS NOT NULL AND deleting=0 ORDER BY created_at,id').bind(year,data.bytes).all();
    return json({media:null,candidates:candidates.results});
  }
  const route=/^\/api\/media\/([a-z0-9-]+)\/(fingerprint|delete)$/.exec(path);
  if(!route)return null;
  const media=await env.DB.prepare('SELECT * FROM media_objects WHERE id=?1 AND year=?2').bind(route[1],year).first<LibraryMedia>();
  if(!media)throw new UploadProblem(404,'Photo not found.');
  const data=await readBody(request);
  if(route[2]==='fingerprint'){
    if(media.deleting||!media.original_key)throw new UploadProblem(409,'This photo is no longer available.');
    if(!validHash(data.hash)||data.bytes!==media.bytes)throw new UploadProblem(400,'Check the photo fingerprint and size.');
    // Fingerprints are computed by the authenticated owner's browser from the
    // original. They are private reuse metadata, never guest authorization.
    if(media.content_hash&&media.content_hash!==data.hash)throw new UploadProblem(409,'This photo already has a different fingerprint.');
    const existing=await mediaByHash(env,year,data.hash,media.bytes);
    if(existing)return json({media:await mediaResult(env,existing)});
    try{await env.DB.prepare('UPDATE media_objects SET content_hash=?1 WHERE id=?2 AND deleting=0 AND content_hash IS NULL').bind(data.hash,media.id).run();}
    catch(error){const concurrent=await mediaByHash(env,year,data.hash,media.bytes);if(concurrent)return json({media:await mediaResult(env,concurrent)});throw error;}
    return json({media:await mediaResult(env,media)});
  }
  if(data.confirm!==true)throw new UploadProblem(400,'Confirm permanent deletion first.');
  const claimed=await env.DB.prepare(`UPDATE media_objects SET deleting=1 WHERE id=?1 AND year=?2
    AND NOT EXISTS(SELECT 1 FROM editions e,json_each(e.draft_json,'$.photos') p WHERE json_extract(p.value,'$.id')=?1)
    AND NOT EXISTS(SELECT 1 FROM editions e,json_each(coalesce(e.published_json,'{"photos":[]}'),'$.photos') p WHERE json_extract(p.value,'$.id')=?1)
    AND NOT EXISTS(SELECT 1 FROM photos WHERE id=?1 AND EXISTS(SELECT 1 FROM editions WHERE year=2026 AND published_json IS NULL)) RETURNING id`).bind(media.id,year).first();
  if(!claimed)throw new UploadProblem(409,'This photo is still used. Remove it from the draft and save; if published, remove it and publish that change before deleting.');
  try{
    const remove=new Set([media.original_key,media.preview_key,media.viewer_key].filter((k):k is string=>!!k));
    let cursor:string|undefined;
    do{const page=await env.MEDIA.list({prefix:`${year}/${media.id}/`,cursor});for(const item of page.objects)remove.add(item.key);cursor=page.truncated?page.cursor:undefined;}while(cursor);
    // Legacy imported media can share storage keys. Retain any key still used
    // by another library entry, a published manifest, or the active pilot.
    const retained=new Set<string>();
    const others=await env.DB.prepare('SELECT preview_key,viewer_key,original_key FROM media_objects WHERE id<>?1').bind(media.id).all<{preview_key:string;viewer_key:string|null;original_key:string|null}>();
    for(const item of others.results)for(const key of [item.preview_key,item.viewer_key,item.original_key])if(key)retained.add(key);
    const editions=await env.DB.prepare('SELECT published_json FROM editions WHERE published_json IS NOT NULL').all<{published_json:string}>();
    for(const edition of editions.results)for(const photo of JSON.parse(edition.published_json).photos)for(const key of [photo.preview_key,photo.viewer_key,photo.original_key])if(key)retained.add(key);
    const pilot=await env.DB.prepare('SELECT preview_key,original_key FROM photos WHERE EXISTS(SELECT 1 FROM editions WHERE year=2026 AND published_json IS NULL)').all<{preview_key:string;original_key:string|null}>();
    for(const item of pilot.results)for(const key of [item.preview_key,item.original_key])if(key)retained.add(key);
    const keys=[...remove].filter(key=>!retained.has(key));
    for(let offset=0;offset<keys.length;offset+=1000)await env.MEDIA.delete(keys.slice(offset,offset+1000));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM original_downloads WHERE photo_id=?1').bind(media.id),
      env.DB.prepare('DELETE FROM photos WHERE id=?1').bind(media.id),
      env.DB.prepare('DELETE FROM media_objects WHERE id=?1 AND deleting=1').bind(media.id),
      env.DB.prepare("INSERT INTO admin_events(actor,action,target) VALUES(?1,'delete-photo',?2)").bind(actor,media.id)
    ]);
    return json({deleted:true,id:media.id});
  }catch{throw new UploadProblem(503,'Deletion could not finish. Retry deletion to clear the remaining files.');}
}
