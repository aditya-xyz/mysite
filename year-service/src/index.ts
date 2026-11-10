import { now, token, digest, cookie, validToken, validCode, sameOrigin, sessionCookie } from "./security.ts";
import { reserveDownload,releaseDownload } from "./downloads.ts";
import { previewDimensions } from "./image-dimensions.ts";
import { invitationAudience, invitationName, type InvitationAudience } from "./invitations.ts";
import { publishedEdition, clientEdition, visiblePhotos } from "./edition.ts";

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  SMS_ENABLED: string;
  JOURNAL_ORIGIN?:string;
  SOCIAL_JOURNAL_ORIGIN?:string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_API_KEY_SID: string;
  TWILIO_API_KEY_SECRET: string;
  TWILIO_VERIFY_SERVICE_SID: string;
}
interface Invite extends InvitationAudience { version:number; person_id: string | null; edition_year: number; id: string; name: string; phone: string; expires_at: number; challenge_expires_at: number }
interface Photo { id: string; invite_id: string | null; preview_key: string; original_key: string | null; filename: string | null; caption: string; alt: string }
const INVITE = "__Host-year_invite", SESSION = "__Host-year_session";
class Failure extends Error { constructor(public status: number, message: string, public retryAfter?:number) { super(message); } }
const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers });

async function limited(env: Env, key: string, max: number, seconds: number) {
  // One atomic UPSERT: concurrent requests cannot each claim the final slot.
  const row = await env.DB.prepare(`INSERT INTO rate_limits(key,count,expires_at) VALUES(?1,1,?2)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=?3 THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=?3 THEN ?2 ELSE expires_at END RETURNING count`)
    .bind(key, now() + seconds, now()).first<{ count: number }>();
  if (!row || row.count > max) throw new Failure(429, "A few too many attempts. Please try again later.");
}
async function requireActive(env:Env,year:number){
  const row=await env.DB.prepare("SELECT is_active FROM editions WHERE year=?1").bind(year).first<{is_active:number}>();
  if(!row?.is_active)throw new Failure(409,"This scrapbook is no longer active. Please ask for a current invitation.");
}
async function invitation(request: Request, env: Env) {
  const raw = cookie(request, INVITE);
  if (!validToken(raw)) throw new Failure(401, "Please open your original invitation link.");
  const row = await env.DB.prepare("SELECT * FROM invites WHERE token_hash=?1 AND revoked_at IS NULL AND expires_at>?2")
    .bind(await digest(raw), now()).first<Invite>();
  if (!row) throw new Failure(401, "This invitation has expired or is no longer available.");
  await requireActive(env,row.edition_year);
  return row;
}
async function authenticated(request: Request, env: Env) {
  const raw = cookie(request, SESSION);
  if (!validToken(raw)) throw new Failure(401, "Please verify your invitation to continue.");
  const row = await env.DB.prepare(`SELECT i.* FROM invites i JOIN sessions s ON s.invite_id=i.id
    WHERE s.token_hash=?1 AND s.expires_at>?2 AND i.expires_at>?2 AND i.revoked_at IS NULL`)
    .bind(await digest(raw), now()).first<Invite>();
  if (!row) throw new Failure(401, "Your session has ended. Please open your invitation again.");
  await requireActive(env,row.edition_year);
  return row;
}
async function body(request: Request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new Failure(415, "JSON required.");
  const text = await request.text();
  if (text.length > 1024) throw new Failure(413, "Request too large.");
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Failure(400, "Invalid request."); }
}
async function twilio(env: Env, resource: string, params: Record<string, string>) {
  if (!/^SK[a-f0-9]{32}$/i.test(env.TWILIO_API_KEY_SID || "") || !env.TWILIO_API_KEY_SECRET ||
      !/^VA[a-f0-9]{32}$/i.test(env.TWILIO_VERIFY_SERVICE_SID || "")) {
    throw new Failure(503, "Verification is not configured yet.");
  }
  let response: Response;
  try {
    response = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${resource}`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params), signal: AbortSignal.timeout(15000)
    });
  } catch { throw new Failure(503, "The verification service is unavailable. Please try again shortly."); }
  const data = await response.json() as { status?: string; code?: number };
  // Never log provider payloads: they can contain the recipient's phone number.
  if (!response.ok) {
    if (resource === "VerificationCheck" && [400, 404].includes(response.status))
      throw new Failure(400, "That code is incorrect or expired. Please try again or request a new one.");
    throw new Failure(503, "We couldn’t complete verification. Please try again later.");
  }
  return data;
}

async function route(request: Request, env: Env) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "POST" && !sameOrigin(request)) throw new Failure(403, "Please use this site's invitation page.");
  if (path.startsWith("/api/") && request.method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    await limited(env, "ip:" + await digest(ip), 60, 3600);
  }
  if (path === "/api/open" && request.method === "POST") {
    const data = await body(request);
    if (!validToken(data.token)) throw new Failure(401, "This invitation link is not valid.");
    const row = await env.DB.prepare("SELECT name,addressed_to,edition_year,share_socials FROM invites WHERE token_hash=?1 AND revoked_at IS NULL AND expires_at>?2")
      .bind(await digest(data.token), now()).first<{ name: string; addressed_to:string|null;edition_year:number;share_socials:number }>();
    if (!row) throw new Failure(401, "This invitation link is not valid or has expired.");
    await requireActive(env,row.edition_year);
    const preferred=row.share_socials?env.SOCIAL_JOURNAL_ORIGIN:env.JOURNAL_ORIGIN;
    if(preferred && new URL(preferred).origin!==url.origin)return json({redirectUrl:new URL(preferred).origin+"/#"+data.token});
    const headers=new Headers();headers.append("Set-Cookie",sessionCookie(INVITE,data.token,86400));
    headers.append("Set-Cookie",sessionCookie(SESSION,"",0));
    return json({ name: invitationName(row) }, 200, headers);
  }
  if (path === "/api/invitation" && request.method === "GET") {
    const i = await invitation(request, env);
    const edition = await publishedEdition(env.DB,i.edition_year);
    if (!edition && i.edition_year !== 2026) throw new Failure(409,"This scrapbook hasn’t been published yet. Please check back later.");
    return json({ year:i.edition_year,name: invitationName(i), verificationName:i.name, phoneHint: i.phone.slice(-4), smsEnabled: env.SMS_ENABLED === "true",
      ...(edition ? { title:edition.title,authors:edition.authors,intro:edition.intro } : {}) });
  }
  if (path === "/api/send" && request.method === "POST") {
    const i = await invitation(request, env);
    if (i.edition_year !== 2026 && !await publishedEdition(env.DB,i.edition_year)) throw new Failure(409,"This scrapbook hasn’t been published yet. Please check back later.");
    if (env.SMS_ENABLED !== "true") throw new Failure(503, "Your invitation is ready. Text verification will be enabled soon.");
    await limited(env, `send:${i.id}`, 5, 3600);
    const stamp = now();
    const reserved = await env.DB.prepare(`UPDATE invites SET last_sent_at=?1, challenge_expires_at=0, attempts=0
      WHERE id=?2 AND last_sent_at<=?3 AND revoked_at IS NULL AND expires_at>?1 AND version=?4 RETURNING id`)
      .bind(stamp, i.id, stamp - 60,i.version).first();
    if (!reserved) throw new Failure(429, "Please wait a minute before requesting another code.");
    const result = await twilio(env, "Verifications", { To: i.phone, Channel: "sms" });
    if (result.status !== "pending") throw new Failure(503, "The text could not be sent. Please try again later.");
    await env.DB.prepare("UPDATE invites SET challenge_expires_at=?1 WHERE id=?2 AND last_sent_at=?3 AND version=?4")
      .bind(stamp + 600, i.id, stamp,i.version).run();
    return json({ sent: true, retryAfter: 60 });
  }
  if (path === "/api/verify" && request.method === "POST") {
    const i = await invitation(request, env), data = await body(request);
    if (!validCode(data.code)) throw new Failure(400, "Enter the six-digit code from your text.");
    await limited(env, `check:${i.id}`, 15, 3600);
    const claim = await env.DB.prepare(`UPDATE invites SET attempts=attempts+1 WHERE id=?1 AND attempts<5
      AND challenge_expires_at>?2 AND revoked_at IS NULL AND expires_at>?2 AND version=?3 RETURNING last_sent_at`)
      .bind(i.id, now(),i.version).first<{ last_sent_at: number }>();
    if (!claim) throw new Failure(429, "Please request a fresh code before trying again.");
    const result = await twilio(env, "VerificationCheck", { To: i.phone, Code: data.code });
    if (result.status !== "approved") throw new Failure(400, "That code didn’t match. Please try again.");
    // Only one successful request may consume this challenge, including concurrent checks.
    const consumed = await env.DB.prepare(`UPDATE invites SET challenge_expires_at=0
      WHERE id=?1 AND last_sent_at=?2 AND challenge_expires_at>?3 AND revoked_at IS NULL AND expires_at>?3 AND version=?4 RETURNING id`)
      .bind(i.id, claim.last_sent_at, now(),i.version).first();
    if (!consumed) throw new Failure(400, "This code has already been used or expired. Request a new code.");
    const raw = token(), expiry = Math.min(now() + 7 * 86400, i.expires_at);
    await env.DB.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,?2,?3)")
      .bind(await digest(raw), i.id, expiry).run();
    return json({ verified: true }, 200, { "Set-Cookie": sessionCookie(SESSION, raw, expiry - now()) });
  }
  if (path === "/api/logout" && request.method === "POST") {
    const raw = cookie(request, SESSION);
    if (validToken(raw)) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?1").bind(await digest(raw)).run();
    return json({ loggedOut: true }, 200, { "Set-Cookie": sessionCookie(SESSION, "", 0) });
  }
  if (path === "/api/journal" && request.method === "GET") {
    const i = await authenticated(request, env);
    const edition = await publishedEdition(env.DB,i.edition_year);
    if (edition) {
      const data=clientEdition(edition,i.id,invitationName(i),i.edition_year,await invitationAudience(env.DB,i));
      data.shareSocials=!!i.share_socials;
      // Old publications remain unchanged; resolve missing preview dimensions read-only.
      for(let offset=0;offset<data.photos.length;offset+=8)await Promise.all(data.photos.slice(offset,offset+8).map(async photo=>{
        if(!photo.width||!photo.height)Object.assign(photo,await previewDimensions(env.MEDIA,edition.photos.find(p=>p.id===photo.id)!.preview_key));
      }));
      return json(data);
    }
    if (i.edition_year !== 2026) throw new Failure(409,"This scrapbook hasn’t been published yet. Please check back later.");
    const photos = await env.DB.prepare(`SELECT id,caption,alt,invite_id,preview_key,original_key FROM photos
      WHERE invite_id IS NULL OR invite_id IN (SELECT value FROM json_each(?1)) ORDER BY invite_id IS NULL,sort_order,id`).bind(JSON.stringify(await invitationAudience(env.DB,i))).all<Photo>();
    return json({ year:i.edition_year,name: invitationName(i), verificationName:i.name,shareSocials:!!i.share_socials, photos: await Promise.all(photos.results.map(async p => ({ id: p.id, caption: p.caption, alt: p.alt,...await previewDimensions(env.MEDIA,p.preview_key),
      personal: p.invite_id !== null, src: `/api/media/${p.id}`,viewerSrc:`/api/media/${p.id}/viewer`, canSave: !!p.invite_id && !!p.original_key }))) });
  }
  const media = /^\/api\/media\/([a-z0-9-]+)(\/(original|viewer))?$/.exec(path);
  if (media && request.method === "GET") {
    const i=await authenticated(request,env),edition=await publishedEdition(env.DB,i.edition_year),original=media[3]==="original";
    let key:string|null,filename:string,mime:string;
    if(edition){
      const p=visiblePhotos(edition,i.id,await invitationAudience(env.DB,i)).find(p=>p.id===media[1]);
      if(!p||(original&&(!p.recipients.length||!p.original_key)))throw new Failure(404,"Photo not found.");
      key=original?p.original_key:media[3]==="viewer"?(p.viewer_key||p.preview_key):p.preview_key;
      filename=p.filename;mime=original?p.mime:"image/jpeg";
    }else{
      if(i.edition_year!==2026)throw new Failure(404,"Photo not found.");
      const p=await env.DB.prepare("SELECT * FROM photos WHERE id=?1 AND (invite_id IS NULL OR invite_id IN (SELECT value FROM json_each(?2)))")
        .bind(media[1],JSON.stringify(await invitationAudience(env.DB,i))).first<Photo>();
      if(!p||(original&&(!p.invite_id||!p.original_key)))throw new Failure(404,"Photo not found.");
      key=original?p.original_key:p.preview_key;filename=p.filename||"photo.jpg";mime=original?"":"image/jpeg";
    }
    if(!key)throw new Failure(404,"Photo not found.");
    const reservation=original?await reserveDownload(env.DB,i.id,media[1],now()):null;
    if(reservation&&!reservation.allowed)throw new Failure(429,"You’ve reached five original downloads for this photo. Your allowance resets within 24 hours.",reservation.retryAfter);
    let file:R2ObjectBody|null;
    try{file=await env.MEDIA.get(key);}catch{
      if(reservation?.allowed)await releaseDownload(env.DB,i.id,media[1],reservation.windowStart);
      throw new Failure(503,"The original could not be retrieved. Please try again.");
    }
    if(!file){if(reservation?.allowed)await releaseDownload(env.DB,i.id,media[1],reservation.windowStart);throw new Failure(404,"Photo not found.");}
    const headers=new Headers({"Content-Type":mime||file.httpMetadata?.contentType||"image/jpeg"});
    if(original){headers.set("Content-Disposition",`attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g,"_")}"`);if(reservation?.allowed)headers.set("X-Downloads-Remaining",String(reservation.remaining));}
    return new Response(file.body,{headers});
  }
  if (path.startsWith("/api/")) throw new Failure(404, "Not found.");
  if (!["GET", "HEAD"].includes(request.method)) throw new Failure(405, "Method not allowed.");
  // Assets contain only the app shell; no personal media or invitation data.
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env) {
    let response: Response;
    try { response = await route(request, env); }
    catch (error) { response = error instanceof Failure ? json({ error: error.message,...(error.retryAfter?{retryAfter:error.retryAfter}:{}) }, error.status,error.retryAfter?{"Retry-After":String(error.retryAfter)}:undefined) : json({ error: "Something went wrong. Please try again later." }, 500); }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, private");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event: ScheduledEvent, env: Env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?1").bind(now()),
      env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<=?1").bind(now())
    ]);
  }
};
