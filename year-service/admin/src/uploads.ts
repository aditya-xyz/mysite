import { token, now } from '../../src/security.ts';
import { UploadProblem } from './media-errors.ts';
import { mediaByHash,mediaResult,type LibraryMedia,validHash } from './media-library.ts';
import {forwardOriginalPart,uploadBodyLength} from './original-upload.ts';
export { UploadProblem } from './media-errors.ts';

const MAX_BYTES = 100_000_000; // Decimal MB, strictly under 100 MB.
export const CHUNK_BYTES = 8 * 1024 * 1024;
interface UploadEnv { DB: D1Database; MEDIA: R2Bucket }
interface Upload {
  id: string; year: number; actor: string; filename: string; mime: string; bytes: number;
  upload_id: string; parts_json: string; status: string; created_at: number; content_hash:string|null; part_counter:number;
}
const json = (value: unknown, status = 200) => Response.json(value, {status});
const keys = (u: Upload) => [`${u.year}/${u.id}/original`, `${u.year}/${u.id}/preview.jpg`, `${u.year}/${u.id}/viewer.jpg`];
export function detectPhoto(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return 'image/png';
  const h = new TextDecoder().decode(bytes.subarray(0,12));
  if (h.startsWith('RIFF') && h.endsWith('WEBP')) return 'image/webp';
  throw new UploadProblem(400, 'Upload JPEG, PNG, or WebP photos. HEIC and SVG aren’t supported in this first editor.');
}
// Bound actual bytes as well as Content-Length; a missing or false header cannot bypass the cap.
async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get('Content-Length') || 0) > max) throw new UploadProblem(413, 'This upload request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new UploadProblem(400, 'Missing upload data.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const {value,done} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new UploadProblem(413, 'This upload request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return bytes;
}
async function discard(env: UploadEnv, u: Upload) {
  // Stop any concurrent finalization from registering these objects before checking.
  await env.DB.prepare("UPDATE photo_uploads SET status='aborting' WHERE id=?1").bind(u.id).run();
  // A D1 commit can succeed even if its response is lost. Never clean up an
  // already registered photo, including when recovering an expired session.
  const registered = await env.DB.prepare('SELECT id FROM media_objects WHERE id=?1 AND year=?2').bind(u.id,u.year).first();
  if (registered) {
    await env.DB.prepare('DELETE FROM photo_uploads WHERE id=?1').bind(u.id).run();
    return;
  }
  // Also handle a failure between R2 completion and D1 commit.
  try { await env.MEDIA.resumeMultipartUpload(keys(u)[0],u.upload_id).abort(); }
  catch { /* R2 may already have completed or expired the multipart upload. */ }
  await env.MEDIA.delete(keys(u));
  await env.DB.prepare('DELETE FROM photo_uploads WHERE id=?1').bind(u.id).run();
}
async function expireUploads(env: UploadEnv) {
  const expired = await env.DB.prepare('SELECT * FROM photo_uploads WHERE created_at<?1 LIMIT 10').bind(now()-86400).all<Upload>();
  for (const u of expired.results) {
    const claimed = await env.DB.prepare("UPDATE photo_uploads SET status='aborting',created_at=?1 WHERE id=?2 AND created_at=?3 RETURNING id")
      .bind(now(),u.id,u.created_at).first();
    if (claimed) await discard(env,u);
  }
}
export async function photoUploadRoute(request: Request, env: UploadEnv, actor: string, year: number, path: string,
  validatePreviews: (grid: File, viewer: File) => Promise<void>): Promise<Response | null> {
  if (request.method !== 'POST' || !/^\/api\/uploads(?:\/|$)/.test(path)) return null;
  if (path === '/api/uploads') {
    let data: {id?: unknown; filename?: unknown; mime?: unknown; bytes?: unknown; hash?:unknown};
    try { data = JSON.parse(new TextDecoder().decode(await boundedBody(request,4096))); }
    catch (error) { if (error instanceof UploadProblem) throw error; throw new UploadProblem(400,'Invalid upload details.'); }
    if (!data || typeof data.filename !== 'string' || !data.filename.trim() || data.filename.length > 200 ||
      !['image/jpeg','image/png','image/webp'].includes(data.mime as string)) throw new UploadProblem(400,'Check the photo name and type.');
    if (!Number.isSafeInteger(data.bytes) || (data.bytes as number) <= 0 || (data.bytes as number) >= MAX_BYTES)
      throw new UploadProblem(413,'Choose a photo smaller than 100 MB.');
    if (data.id !== undefined && (typeof data.id !== 'string' || !/^photo-[a-f0-9]{24}$/.test(data.id))) throw new UploadProblem(400,'Invalid upload ID.');
    if(data.hash!==undefined&&!validHash(data.hash))throw new UploadProblem(400,'Invalid photo fingerprint.');
    await expireUploads(env);
    if(validHash(data.hash)){
      const existing=await mediaByHash(env,year,data.hash,data.bytes as number);
      if(existing)return json({media:await mediaResult(env,existing),reused:true});
    }
    const id = typeof data.id === 'string' ? data.id : 'photo-'+token().slice(0,24);
    const previous = await env.DB.prepare('SELECT * FROM photo_uploads WHERE id=?1').bind(id).first<Upload>();
    const sameUpload = (u: Upload) => u.year===year && u.actor===actor && u.filename===data.filename && u.mime===data.mime && u.bytes===data.bytes && u.content_hash===(data.hash??null) && u.status!=='aborting';
    if (previous) {
      if (!sameUpload(previous)) throw new UploadProblem(409,'This upload ID is already in use. Choose the photo again.');
      return json({id,chunkBytes:CHUNK_BYTES},201);
    }
    if (await env.DB.prepare('SELECT id FROM media_objects WHERE id=?1').bind(id).first()) throw new UploadProblem(409,'This photo upload already finished.');
    const pending = await env.DB.prepare('SELECT count(*) n FROM photo_uploads').first<{n:number}>();
    if (pending!.n >= 50) throw new UploadProblem(429,'Too many unfinished uploads. Please try again later.');
    const key = `${year}/${id}/original`;
    const upload = await env.MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:data.mime as string}});
    try {
      await env.DB.prepare('INSERT INTO photo_uploads(id,year,actor,filename,mime,bytes,upload_id,content_hash) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)')
        .bind(id,year,actor,data.filename,data.mime,data.bytes,upload.uploadId,data.hash??null).run();
    } catch (error) {
      await upload.abort();
      const concurrent = await env.DB.prepare('SELECT * FROM photo_uploads WHERE id=?1').bind(id).first<Upload>();
      if (concurrent && sameUpload(concurrent)) return json({id,chunkBytes:CHUNK_BYTES},201);
      throw error;
    }
    return json({id,chunkBytes:CHUNK_BYTES},201);
  }
  const match = /^\/api\/uploads\/(photo-[a-f0-9]{24})\/(parts\/([1-9]\d?)|complete|abort)$/.exec(path);
  if (!match) throw new UploadProblem(404,'Upload not found.');
  const u = await env.DB.prepare('SELECT * FROM photo_uploads WHERE id=?1 AND year=?2 AND actor=?3')
    .bind(match[1],year,actor).first<Upload>();
  if (!u) {
    // A lost success response can be retried without publishing or duplicating the photo.
    if (match[2] === 'complete') {
      const media = await env.DB.prepare('SELECT * FROM media_objects WHERE id=?1 AND year=?2 AND deleting=0').bind(match[1],year).first<LibraryMedia>();
      if (media) return json(await mediaResult(env,media),201);
    }
    throw new UploadProblem(404,'Upload not found. Please choose the photo again.');
  }
  if (u.created_at < now()-86400) { await expireUploads(env); throw new UploadProblem(410,'This upload expired. Please choose the photo again.'); }
  const parts = JSON.parse(u.parts_json) as R2UploadedPart[];
  if (match[2].startsWith('parts/')) {
    const partNumber = Number(match[3]);
    if (partNumber <= parts.length && u.status !== 'aborting') {
      // A successful part response may be lost at the edge. Recorded parts are
      // immutable: acknowledge the retry without writing the original twice.
      await request.body?.cancel();
      return json({uploaded:Math.min(partNumber*CHUNK_BYTES,u.bytes)});
    }
    if (partNumber !== parts.length+1 || partNumber > Math.ceil(u.bytes/CHUNK_BYTES))
      throw new UploadProblem(409,'Upload the photo parts in order.');
    const expected = Math.min(CHUNK_BYTES,u.bytes-(partNumber-1)*CHUNK_BYTES);
    // Every attempt gets its own physical R2 part. An interrupted request leaves
    // no global lock, and a late request cannot overwrite a retry's recorded bytes.
    const claimed = await env.DB.prepare(`UPDATE photo_uploads SET part_counter=max(part_counter,coalesce((SELECT max(json_extract(value,'$.partNumber')) FROM json_each(parts_json)),0))+1,created_at=?3
      WHERE id=?1 AND status='open' AND parts_json=?2 AND part_counter<9999 RETURNING part_counter`).bind(u.id,u.parts_json,now()).first<{part_counter:number}>();
    const acknowledge=async()=>{
      const latest=await env.DB.prepare('SELECT parts_json,status FROM photo_uploads WHERE id=?1').bind(u.id).first<{parts_json:string;status:string}>();
      if(latest&&latest.status!=='aborting'&&JSON.parse(latest.parts_json).length>=partNumber)return json({uploaded:Math.min(partNumber*CHUNK_BYTES,u.bytes)});
      throw new UploadProblem(503,'The upload was interrupted. Please retry this photo.');
    };
    if (!claimed) return acknowledge();
    try {
      const part = await forwardOriginalPart(request,expected,env.MEDIA.resumeMultipartUpload(keys(u)[0],u.upload_id),claimed.part_counter);
      const saved=await env.DB.prepare("UPDATE photo_uploads SET parts_json=?1 WHERE id=?2 AND status='open' AND parts_json=?3 RETURNING id").bind(JSON.stringify([...parts,part]),u.id,u.parts_json).first();
      if(!saved)return acknowledge();
      return json({uploaded:Math.min(partNumber*CHUNK_BYTES,u.bytes)});
    } catch (error) {
      if(error instanceof UploadProblem)throw error;
      throw new UploadProblem(503,'The upload was interrupted. Please retry this photo.');
    }
  }
  if (match[2] === 'abort') {
    const claimed = await env.DB.prepare("UPDATE photo_uploads SET status='aborting',created_at=?2 WHERE id=?1 AND status='open' RETURNING id").bind(u.id,now()).first();
    if (!claimed) throw new UploadProblem(409,'This photo is already being uploaded.');
    await discard(env,u); return json({aborted:true});
  }
  if (parts.length !== Math.ceil(u.bytes/CHUNK_BYTES)) throw new UploadProblem(409,'Finish uploading the original photo first.');
  uploadBodyLength(request,11*1024*1024);
  const form = await request.formData();
  const preview = form.get('preview'), viewer = form.get('viewer');
  if (!(preview instanceof File) || !(viewer instanceof File)) throw new UploadProblem(400,'Include both photo previews.');
  await validatePreviews(preview,viewer);
  const claimed = await env.DB.prepare("UPDATE photo_uploads SET status='completing',created_at=?2 WHERE id=?1 AND status IN ('open','completing') AND parts_json=?3 RETURNING id").bind(u.id,now(),u.parts_json).first();
  if (!claimed) throw new UploadProblem(503,'The upload was interrupted. Please retry this photo.');
  const [originalKey,previewKey,viewerKey] = keys(u);
  try {
    let original=await env.MEDIA.head(originalKey);
    if(!original){
      try{original=await env.MEDIA.resumeMultipartUpload(originalKey,u.upload_id).complete(parts);}
      catch(error){original=await env.MEDIA.head(originalKey);if(!original)throw error;}
    }
    if (original.size !== u.bytes) throw new Error('Original size mismatch');
    // Validate actual stored bytes before registering any media. The original's
    // image-type check reads only 12 bytes, regardless of its full size.
    const header=await env.MEDIA.get(originalKey,{range:{offset:0,length:12}});
    if(!header)throw new Error('Original missing');
    if(detectPhoto(new Uint8Array(await header.arrayBuffer()))!==u.mime)throw new UploadProblem(400,'The photo contents do not match its type.');
    await env.MEDIA.put(previewKey,preview.stream(),{httpMetadata:{contentType:'image/jpeg'},onlyIf:{etagDoesNotMatch:'*'}});
    await env.MEDIA.put(viewerKey,viewer.stream(),{httpMetadata:{contentType:'image/jpeg'},onlyIf:{etagDoesNotMatch:'*'}});
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes,viewer_key,content_hash)
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS(SELECT 1 FROM photo_uploads WHERE id=?1 AND status='completing') ON CONFLICT DO NOTHING`)
        .bind(u.id,year,previewKey,originalKey,u.filename,u.mime,u.bytes,viewerKey,u.content_hash),
      env.DB.prepare("INSERT INTO admin_events(actor,action,target) SELECT ?1,'upload-photo',?2 WHERE EXISTS(SELECT 1 FROM photo_uploads WHERE id=?2 AND status='completing') AND EXISTS(SELECT 1 FROM media_objects WHERE id=?2)").bind(actor,u.id),
      env.DB.prepare('DELETE FROM photo_uploads WHERE id=?1 AND EXISTS(SELECT 1 FROM media_objects WHERE id=?1)').bind(u.id)
    ]);
    const saved=await env.DB.prepare('SELECT * FROM media_objects WHERE id=?1 AND deleting=0').bind(u.id).first<LibraryMedia>();
    if(saved)return json(await mediaResult(env,saved),201);
    const reused=u.content_hash?await mediaByHash(env,year,u.content_hash,u.bytes):null;
    if(reused){await discard(env,u);return json({...await mediaResult(env,reused),reused:true},201);}
    throw new Error('Upload state changed');
  } catch (error) {
    if(error instanceof UploadProblem&&error.status===400){await discard(env,u);throw error;}
    // Preserve pending state and completed objects so retries can finish after a
    // lost response or transient D1/R2 failure. Expiry still clears abandoned work.
    throw new UploadProblem(503,'The upload did not finish. Please try again.');
  }
}
