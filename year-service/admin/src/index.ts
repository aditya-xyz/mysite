import { adminIdentity, type AuthConfig } from "./auth.ts";
import { token, digest, now, sameOrigin } from "../../src/security.ts";
import { clientEdition, type Draft, type Published, type PublishedPhoto } from "../../src/edition.ts";

interface Env extends AuthConfig { DB: D1Database; MEDIA: R2Bucket; ASSETS: Fetcher; JOURNAL_ORIGIN: string }
interface EditionRow { draft_json: string; draft_version: number; published_version: number | null; published_at: number | null }
interface Media { id: string; preview_key: string; original_key: string | null; filename: string; mime: string; bytes: number }
class Problem extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (value: unknown, status = 200) => Response.json(value, { status });
const fail = (message: string): never => { throw new Problem(400, message); };
function text(value: unknown, name: string, max: number, required = true) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) return fail(`Check ${name}.`);
  return value.trim();
}
async function body(request: Request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new Problem(415, "JSON required.");
  const reader = request.body?.getReader();
  if (!reader) return fail("Missing request.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.length;
    if (size > 256000) { await reader.cancel(); throw new Problem(413,"This draft is too large."); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c,offset); offset += c.length; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
  catch { return fail("Invalid request."); }
}
async function edition(env: Env) {
  const row = await env.DB.prepare("SELECT * FROM editions WHERE year=2026").first<EditionRow>();
  if (!row) throw new Problem(503, "The 2026 editor has not been initialized.");
  return row;
}
const audit = (env: Env, actor: string, action: string, target: string) =>
  env.DB.prepare("INSERT INTO admin_events(actor,action,target) VALUES(?1,?2,?3)").bind(actor,action,target);
async function validDraft(value: unknown, env: Env): Promise<Draft> {
  if (!value || typeof value !== "object") return fail("Missing draft.");
  const d = value as Draft;
  if (!Array.isArray(d.photos) || d.photos.length > 300 || !Array.isArray(d.stories) || d.stories.length > 20) return fail("Use at most 300 photos and 20 stories.");
  const media = await env.DB.prepare("SELECT id FROM media_objects WHERE year=2026").all<{id:string}>();
  const people = await env.DB.prepare("SELECT id FROM invites WHERE edition_year=2026").all<{id:string}>();
  const mediaIds = new Set(media.results.map(m => m.id)), peopleIds = new Set(people.results.map(p => p.id));
  const photoIds = new Set<string>(), storyIds = new Set<string>();
  const photos = d.photos.map(p => {
    if (!p || !mediaIds.has(p.id) || photoIds.has(p.id)) return fail("A photo is missing or appears more than once.");
    photoIds.add(p.id);
    if (!Array.isArray(p.recipients) || p.recipients.some(id => typeof id !== "string" || !peopleIds.has(id))) return fail("Check the selected photo recipients.");
    return {id:p.id, caption:text(p.caption,"photo caption",500,false), alt:text(p.alt,"photo description",500), recipients:[...new Set(p.recipients)]};
  });
  const stories = d.stories.map(s => {
    if (!s || typeof s.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(s.id) || storyIds.has(s.id)) return fail("Check the stories.");
    storyIds.add(s.id); return {id:s.id,title:text(s.title,"story title",150),body:text(s.body,"story text",10000)};
  });
  return {title:text(d.title,"title",150),authors:text(d.authors,"authors",100),intro:text(d.intro,"invitation introduction",1000),
    note:text(d.note,"opening note",10000),sharedTitle:text(d.sharedTitle,"shared chapter title",150),stories,photos};
}
async function snapshot(draft: Draft, env: Env): Promise<Published> {
  const media = await env.DB.prepare("SELECT * FROM media_objects WHERE year=2026").all<Media>();
  const objects = new Map(media.results.map(m => [m.id,m]));
  const photos: PublishedPhoto[] = [];
  for (const p of draft.photos) {
    const m = objects.get(p.id); if (!m) return fail("An uploaded photo is missing. Save the draft again.");
    photos.push({...p,preview_key:m.preview_key,original_key:m.original_key,filename:m.filename,mime:m.mime});
  }
  return {...draft,photos};
}
function detect(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return "image/png";
  const h = new TextDecoder().decode(bytes.slice(0,12)); if (h.startsWith("RIFF") && h.endsWith("WEBP")) return "image/webp";
  return fail("Upload JPEG, PNG, or WebP photos. HEIC and SVG aren’t supported in this first editor.");
}
async function route(request: Request, env: Env, actor: string) {
  const url = new URL(request.url), path = url.pathname;
  if (!["GET","HEAD","POST"].includes(request.method)) throw new Problem(405,"Method not allowed.");
  if (request.method === "POST" && !sameOrigin(request)) throw new Problem(403,"Use the admin dashboard to make changes.");
  if (path === "/api/state" && request.method === "GET") {
    const row = await edition(env);
    const people = await env.DB.prepare("SELECT id,name,phone,expires_at,revoked_at FROM invites WHERE edition_year=2026 ORDER BY name").all();
    const media = await env.DB.prepare("SELECT id,filename,mime,bytes,created_at,original_key IS NOT NULL AS has_original FROM media_objects WHERE year=2026 ORDER BY created_at DESC,id").all();
    return json({actor,year:2026,draft:JSON.parse(row.draft_json),version:row.draft_version,publishedVersion:row.published_version,publishedAt:row.published_at,people:people.results,media:media.results});
  }
  if (path === "/api/draft" && request.method === "POST") {
    const data = await body(request), draft = await validDraft(data.draft,env);
    if (!Number.isInteger(data.version)) return fail("Missing draft version.");
    const result = await env.DB.prepare("UPDATE editions SET draft_json=?1,draft_version=draft_version+1,updated_at=unixepoch() WHERE year=2026 AND draft_version=?2 RETURNING draft_version")
      .bind(JSON.stringify(draft),data.version as number).first<{draft_version:number}>();
    if (!result) throw new Problem(409,"This edition changed in another window. Reload before saving again.");
    await audit(env,actor,"save-draft","2026").run();
    return json({version:result.draft_version});
  }
  if (path === "/api/publish" && request.method === "POST") {
    const data = await body(request), row = await edition(env);
    if (data.version !== row.draft_version) throw new Problem(409,"Save and review the latest draft before publishing.");
    const draft = await validDraft(JSON.parse(row.draft_json),env), published = await snapshot(draft,env);
    if (!published.photos.length) return fail("Add at least one photo before publishing.");
    const result = await env.DB.prepare("UPDATE editions SET published_json=?1,published_version=draft_version,published_at=unixepoch() WHERE year=2026 AND draft_version=?2 RETURNING published_version")
      .bind(JSON.stringify(published),row.draft_version).first<{published_version:number}>();
    if (!result) throw new Problem(409,"The draft changed while publishing. Review it again.");
    await audit(env,actor,"publish","2026").run();
    return json({publishedVersion:result.published_version});
  }
  if (path === "/api/preview" && request.method === "GET") {
    const id = url.searchParams.get("recipient") || "";
    const person = id ? await env.DB.prepare("SELECT name FROM invites WHERE id=?1 AND edition_year=2026").bind(id).first<{name:string}>() : null;
    if (id && !person) throw new Problem(404,"Recipient not found.");
    const row = await edition(env), published = await snapshot(JSON.parse(row.draft_json),env);
    const data = clientEdition(published,id,person?.name || "friend");
    data.photos = data.photos.map(p => ({...p,src:`/api/media/${p.id}/preview`}));
    return json(data);
  }
  if (path === "/api/people" && request.method === "POST") {
    const data = await body(request), name = text(data.name,"name",100), phone = text(data.phone,"phone number",20);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return fail("Use a full phone number including country code, such as +1 followed by ten digits.");
    const count = await env.DB.prepare("SELECT count(*) n FROM invites WHERE edition_year=2026").first<{n:number}>();
    if (count && count.n >= 100) return fail("This edition supports up to 100 people.");
    const duplicate = await env.DB.prepare("SELECT id FROM invites WHERE phone=?1 AND edition_year=2026").bind(phone).first();
    if (duplicate) return fail("That phone number is already in this edition.");
    const id = "person-" + token().slice(0,24), raw = token();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO invites(id,token_hash,name,phone,expires_at,edition_year) VALUES(?1,?2,?3,?4,?5,2026)")
        .bind(id,await digest(raw),name,phone,now()+90*86400), audit(env,actor,"add-person",id)
    ]);
    return json({id,url:env.JOURNAL_ORIGIN+"/#"+raw},201);
  }
  const detailsRoute = /^\/api\/people\/(person-[a-f0-9]{24}|angela)\/details$/.exec(path);
  if (detailsRoute && request.method === "POST") {
    const id=detailsRoute[1],data=await body(request),name=text(data.name,"name",100),phone=text(data.phone,"phone number",20);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return fail("Use a full phone number including country code.");
    const current=await env.DB.prepare("SELECT phone FROM invites WHERE id=?1 AND edition_year=2026").bind(id).first<{phone:string}>();
    if (!current) throw new Problem(404,"Recipient not found.");
    const duplicate=await env.DB.prepare("SELECT id FROM invites WHERE phone=?1 AND id<>?2 AND edition_year=2026").bind(phone,id).first();
    if (duplicate) return fail("That phone number is already assigned to another person.");
    const changed=current.phone!==phone;
    await env.DB.batch([
      env.DB.prepare("UPDATE invites SET name=?1,phone=?2,challenge_expires_at=CASE WHEN ?3 THEN 0 ELSE challenge_expires_at END WHERE id=?4")
        .bind(name,phone,changed?1:0,id),
      env.DB.prepare("DELETE FROM sessions WHERE invite_id=?1 AND ?2=1").bind(id,changed?1:0),
      audit(env,actor,changed?"change-phone":"edit-person",id)
    ]);
    return json({saved:true,phoneChanged:changed});
  }
  const personRoute = /^\/api\/people\/(person-[a-f0-9]{24}|angela)\/(invite|revoke)$/.exec(path);
  if (personRoute && request.method === "POST") {
    const id = personRoute[1];
    const person = await env.DB.prepare("SELECT id FROM invites WHERE id=?1 AND edition_year=2026").bind(id).first();
    if (!person) throw new Problem(404,"Recipient not found.");
    const raw = token(), revoke = personRoute[2] === "revoke";
    await env.DB.batch([
      revoke ? env.DB.prepare("UPDATE invites SET revoked_at=?1,challenge_expires_at=0 WHERE id=?2").bind(now(),id) :
        env.DB.prepare("UPDATE invites SET token_hash=?1,revoked_at=NULL,expires_at=?2,last_sent_at=0,challenge_expires_at=0,attempts=0 WHERE id=?3").bind(await digest(raw),now()+90*86400,id),
      env.DB.prepare("DELETE FROM sessions WHERE invite_id=?1").bind(id), audit(env,actor,revoke?"revoke-invite":"rotate-invite",id)
    ]);
    return json(revoke ? {revoked:true} : {url:env.JOURNAL_ORIGIN+"/#"+raw});
  }
  if (path === "/api/upload" && request.method === "POST") {
    if (Number(request.headers.get("Content-Length") || 0) > 30*1024*1024) throw new Problem(413,"Use an original smaller than 25 MB.");
    const form = await request.formData(), original = form.get("original"), preview = form.get("preview");
    if (!(original instanceof File) || !(preview instanceof File)) return fail("Include the original photo and its preview.");
    if (original.size > 25*1024*1024 || preview.size > 4*1024*1024 || !original.size || !preview.size) throw new Problem(413,"Use an original up to 25 MB and a preview up to 4 MB.");
    const mime = detect(new Uint8Array(await original.slice(0,12).arrayBuffer()));
    if (detect(new Uint8Array(await preview.slice(0,12).arrayBuffer())) !== "image/jpeg") return fail("The preview must be JPEG.");
    const id = "photo-"+token().slice(0,24), originalKey = `2026/${id}/original`, previewKey = `2026/${id}/preview.jpg`;
    try {
      await env.MEDIA.put(originalKey,original.stream(),{httpMetadata:{contentType:mime}});
      await env.MEDIA.put(previewKey,preview.stream(),{httpMetadata:{contentType:"image/jpeg"}});
      await env.DB.batch([
        env.DB.prepare("INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes) VALUES(?1,2026,?2,?3,?4,?5,?6)")
          .bind(id,previewKey,originalKey,original.name.slice(0,200),mime,original.size), audit(env,actor,"upload-photo",id)
      ]);
    } catch { await env.MEDIA.delete([originalKey,previewKey]); throw new Problem(503,"The upload did not finish. Please try again."); }
    return json({id,filename:original.name,mime,bytes:original.size,has_original:true},201);
  }
  const mediaRoute = /^\/api\/media\/([a-z0-9-]+)\/(preview|original)$/.exec(path);
  if (mediaRoute && request.method === "GET") {
    const media = await env.DB.prepare("SELECT * FROM media_objects WHERE id=?1 AND year=2026").bind(mediaRoute[1]).first<Media>();
    const key = mediaRoute[2] === "preview" ? media?.preview_key : media?.original_key;
    if (!key) throw new Problem(404,"Photo not found.");
    const file = await env.MEDIA.get(key); if (!file) throw new Problem(404,"Photo not found.");
    return new Response(file.body,{headers:{"Content-Type":mediaRoute[2] === "preview" ? "image/jpeg" : media!.mime}});
  }
  if (path.startsWith("/api/")) throw new Problem(404,"Not found.");
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env) {
    let response: Response;
    try {
      const actor = await adminIdentity(request,env);
      response = actor ? await route(request,env,actor) : json({error:"Sign in with the approved admin Google account to continue."},401);
    } catch (error) { response = error instanceof Problem ? json({error:error.message},error.status) : json({error:"Something went wrong. Please try again."},500); }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control","private, no-store"); headers.set("Referrer-Policy","no-referrer");
    headers.set("X-Content-Type-Options","nosniff"); headers.set("X-Frame-Options","DENY");
    headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
    headers.set("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");
    if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security","max-age=31536000");
    return new Response(response.body,{status:response.status,headers});
  }
};
