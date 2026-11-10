import { token, now } from '../../src/security.ts';

const MAX_BYTES = 100_000_000; // Decimal MB, strictly under 100 MB.
export const CHUNK_BYTES = 8 * 1024 * 1024;
interface UploadEnv { DB: D1Database; MEDIA: R2Bucket }
interface Upload {
  id: string; year: number; actor: string; filename: string; mime: string; bytes: number;
  upload_id: string; parts_json: string; status: string; created_at: number;
}
export class UploadProblem extends Error {
  constructor(public status: number, message: string) { super(message); }
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
    let data: {filename?: unknown; mime?: unknown; bytes?: unknown};
    try { data = JSON.parse(new TextDecoder().decode(await boundedBody(request,4096))); }
    catch (error) { if (error instanceof UploadProblem) throw error; throw new UploadProblem(400,'Invalid upload details.'); }
    if (!data || typeof data.filename !== 'string' || !data.filename.trim() || data.filename.length > 200 ||
      !['image/jpeg','image/png','image/webp'].includes(data.mime as string)) throw new UploadProblem(400,'Check the photo name and type.');
    if (!Number.isSafeInteger(data.bytes) || (data.bytes as number) <= 0 || (data.bytes as number) >= MAX_BYTES)
      throw new UploadProblem(413,'Choose a photo smaller than 100 MB.');
    await expireUploads(env);
    const pending = await env.DB.prepare('SELECT count(*) n FROM photo_uploads').first<{n:number}>();
    if (pending!.n >= 50) throw new UploadProblem(429,'Too many unfinished uploads. Please try again later.');
    const id = 'photo-'+token().slice(0,24), key = `${year}/${id}/original`;
    const upload = await env.MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:data.mime as string}});
    try {
      await env.DB.prepare('INSERT INTO photo_uploads(id,year,actor,filename,mime,bytes,upload_id) VALUES(?1,?2,?3,?4,?5,?6,?7)')
        .bind(id,year,actor,data.filename,data.mime,data.bytes,upload.uploadId).run();
    } catch (error) { await upload.abort(); throw error; }
    return json({id,chunkBytes:CHUNK_BYTES},201);
  }
  const match = /^\/api\/uploads\/(photo-[a-f0-9]{24})\/(parts\/([1-9]\d?)|complete|abort)$/.exec(path);
  if (!match) throw new UploadProblem(404,'Upload not found.');
  const u = await env.DB.prepare('SELECT * FROM photo_uploads WHERE id=?1 AND year=?2 AND actor=?3')
    .bind(match[1],year,actor).first<Upload>();
  if (!u) {
    // A lost success response can be retried without publishing or duplicating the photo.
    if (match[2] === 'complete') {
      const media = await env.DB.prepare('SELECT id,filename,mime,bytes FROM media_objects WHERE id=?1 AND year=?2').bind(match[1],year).first();
      if (media) return json({...media,has_original:true,has_viewer:true},201);
    }
    throw new UploadProblem(404,'Upload not found. Please choose the photo again.');
  }
  if (u.created_at < now()-86400) { await expireUploads(env); throw new UploadProblem(410,'This upload expired. Please choose the photo again.'); }
  const parts = JSON.parse(u.parts_json) as R2UploadedPart[];
  if (match[2].startsWith('parts/')) {
    const partNumber = Number(match[3]);
    if (partNumber !== parts.length+1 || partNumber > Math.ceil(u.bytes/CHUNK_BYTES))
      throw new UploadProblem(409,'Upload the photo parts in order.');
    const expected = Math.min(CHUNK_BYTES,u.bytes-(partNumber-1)*CHUNK_BYTES);
    const bytes = await boundedBody(request,expected);
    if (bytes.byteLength !== expected) throw new UploadProblem(400,'The photo part was incomplete. Please try again.');
    if (partNumber === 1 && detectPhoto(bytes) !== u.mime) throw new UploadProblem(400,'The photo contents do not match its type.');
    const claimed = await env.DB.prepare("UPDATE photo_uploads SET status='working',created_at=?3 WHERE id=?1 AND status='open' AND parts_json=?2 RETURNING id")
      .bind(u.id,u.parts_json,now()).first();
    if (!claimed) throw new UploadProblem(409,'This photo is already being uploaded.');
    try {
      const part = await env.MEDIA.resumeMultipartUpload(keys(u)[0],u.upload_id).uploadPart(partNumber,bytes);
      await env.DB.prepare("UPDATE photo_uploads SET parts_json=?1,status='open' WHERE id=?2").bind(JSON.stringify([...parts,part]),u.id).run();
      return json({uploaded:Math.min(partNumber*CHUNK_BYTES,u.bytes)});
    } catch (error) {
      await env.DB.prepare("UPDATE photo_uploads SET status='open' WHERE id=?1 AND status='working'").bind(u.id).run();
      throw error;
    }
  }
  if (match[2] === 'abort') {
    const claimed = await env.DB.prepare("UPDATE photo_uploads SET status='aborting',created_at=?2 WHERE id=?1 AND status='open' RETURNING id").bind(u.id,now()).first();
    if (!claimed) throw new UploadProblem(409,'This photo is already being uploaded.');
    await discard(env,u); return json({aborted:true});
  }
  if (parts.length !== Math.ceil(u.bytes/CHUNK_BYTES)) throw new UploadProblem(409,'Finish uploading the original photo first.');
  const bytes = await boundedBody(request,11*1024*1024);
  const form = await new Response(bytes,{headers:{'Content-Type':request.headers.get('Content-Type') || ''}}).formData();
  const preview = form.get('preview'), viewer = form.get('viewer');
  if (!(preview instanceof File) || !(viewer instanceof File)) throw new UploadProblem(400,'Include both photo previews.');
  await validatePreviews(preview,viewer);
  const claimed = await env.DB.prepare("UPDATE photo_uploads SET status='completing',created_at=?2 WHERE id=?1 AND status='open' RETURNING id").bind(u.id,now()).first();
  if (!claimed) throw new UploadProblem(409,'This photo is already being uploaded.');
  const [originalKey,previewKey,viewerKey] = keys(u);
  try {
    const original = await env.MEDIA.resumeMultipartUpload(originalKey,u.upload_id).complete(parts);
    if (original.size !== u.bytes) throw new Error('Original size mismatch');
    await env.MEDIA.put(previewKey,preview.stream(),{httpMetadata:{contentType:'image/jpeg'}});
    await env.MEDIA.put(viewerKey,viewer.stream(),{httpMetadata:{contentType:'image/jpeg'}});
    await env.DB.batch([
      env.DB.prepare('INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes,viewer_key) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)')
        .bind(u.id,year,previewKey,originalKey,u.filename,u.mime,u.bytes,viewerKey),
      env.DB.prepare("INSERT INTO admin_events(actor,action,target) VALUES(?1,'upload-photo',?2)").bind(actor,u.id),
      env.DB.prepare('DELETE FROM photo_uploads WHERE id=?1').bind(u.id)
    ]);
  } catch {
    await discard(env,u);
    throw new UploadProblem(503,'The upload did not finish. Please try again.');
  }
  return json({id:u.id,filename:u.filename,mime:u.mime,bytes:u.bytes,has_original:true,has_viewer:true},201);
}
