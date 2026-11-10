import {sealLink,unsealLink,invitationUrl,type LinkConfig} from './invitation-links.ts';
import { previewDimensions,imageDimensions } from "../../src/image-dimensions.ts";
import { invitationAudience, invitationName, type InvitationAudience } from "../../src/invitations.ts";
import { canonicalDraft, type Contact } from "./people.ts";
import { adminIdentity, type AuthConfig } from "./auth.ts";
import { photoUploadRoute, UploadProblem } from "./uploads.ts";
import { mediaLibraryRoute } from './media-library.ts';
import { token, digest, now, sameOrigin } from "../../src/security.ts";
import { clientEdition, type Draft, type Published, type PublishedPhoto } from "../../src/edition.ts";

interface Env extends AuthConfig, LinkConfig { DB: D1Database; MEDIA: R2Bucket; ASSETS: Fetcher; JOURNAL_ORIGIN: string }
interface EditionRow { draft_json: string; draft_version: number; published_version: number | null; published_at: number | null; is_active:number }
interface Media { id: string; preview_key: string; viewer_key:string|null; original_key: string | null; filename: string; mime: string; bytes: number }
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
async function edition(env: Env, year: number) {
  const row = await env.DB.prepare("SELECT * FROM editions WHERE year=?1").bind(year).first<EditionRow>();
  if (!row) throw new Problem(404, "Scrapbook not found.");
  return row;
}
const audit = (env: Env, actor: string, action: string, target: string) =>
  env.DB.prepare("INSERT INTO admin_events(actor,action,target) VALUES(?1,?2,?3)").bind(actor,action,target);
async function validDraft(value: unknown, env: Env, year: number): Promise<Draft> {
  if (!value || typeof value !== "object") return fail("Missing draft.");
  const d = await canonicalDraft(value as Draft,env.DB,year);
  if (!Array.isArray(d.photos) || d.photos.length > 300 || !Array.isArray(d.stories) || d.stories.length > 20) return fail("Use at most 300 photos and 20 stories.");
  const media = await env.DB.prepare("SELECT id FROM media_objects WHERE year=?1 AND deleting=0").bind(year).all<{id:string}>();
  const people = await env.DB.prepare("SELECT id FROM people").all<{id:string}>();
  const mediaIds = new Set(media.results.map(m => m.id)), peopleIds = new Set(people.results.map(p => p.id));
  const photoIds = new Set<string>(), storyIds = new Set<string>();
  const photos = d.photos.map(p => {
    if (!p || !mediaIds.has(p.id) || photoIds.has(p.id)) return fail("A photo is missing or appears more than once.");
    photoIds.add(p.id);
    if (!Array.isArray(p.recipients) || p.recipients.some(id => typeof id !== "string" || !peopleIds.has(id))) return fail("Check the selected photo recipients.");
    if(p.hidden!==undefined && typeof p.hidden!=="boolean")return fail("Check the photo visibility.");
    if(p.audience!==undefined && p.audience!=="shared" && p.audience!=="personal")return fail("Check the photo audience.");
    if(!p.hidden && p.audience==="personal" && !p.recipients.length)return fail("Select people for this photo or hide it until you’re ready.");
    return {id:p.id, caption:text(p.caption,"photo caption",500,false), alt:text(p.alt,"photo description",500,!p.hidden), recipients:[...new Set(p.recipients)],
      ...(p.hidden?{hidden:true}:{}),...(p.audience?{audience:p.audience}:{})};
  });
  const stories = d.stories.map(s => {
    if (!s || typeof s.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(s.id) || storyIds.has(s.id)) return fail("Check the stories.");
    storyIds.add(s.id); return {id:s.id,title:text(s.title,"story title",150),body:text(s.body,"story text",10000)};
  });
  return {title:text(d.title,"title",150),authors:text(d.authors,"authors",100),intro:text(d.intro,"invitation introduction",1000),
    note:text(d.note,"opening note",10000),sharedTitle:text(d.sharedTitle,"shared chapter title",150),stories,photos};
}
async function snapshot(draft: Draft, env: Env, year: number): Promise<Published> {
  const media = await env.DB.prepare("SELECT * FROM media_objects WHERE year=?1 AND deleting=0").bind(year).all<Media>();
  const objects = new Map(media.results.map(m => [m.id,m]));
  const photos: PublishedPhoto[] = [];
  for (const p of draft.photos.filter(p=>!p.hidden)) {
    const m = objects.get(p.id); if (!m) return fail("An uploaded photo is missing. Save the draft again.");
    photos.push({...p,...await previewDimensions(env.MEDIA,m.preview_key),preview_key:m.preview_key,viewer_key:m.viewer_key,original_key:m.original_key,filename:m.filename,mime:m.mime});
  }
  return {...draft,photos};
}
function detect(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) return "image/png";
  const h = new TextDecoder().decode(bytes.slice(0,12)); if (h.startsWith("RIFF") && h.endsWith("WEBP")) return "image/webp";
  return fail("Upload JPEG, PNG, or WebP photos. HEIC and SVG aren’t supported in this first editor.");
}
async function validRenditions(grid:File,viewer:File){
  if(!grid.size||grid.size>4*1024*1024||!viewer.size||viewer.size>6*1024*1024)throw new Problem(413,"Use a grid preview up to 4 MB and a viewer preview up to 6 MB.");
  const g=imageDimensions(new Uint8Array(await grid.slice(0,65536).arrayBuffer())),v=imageDimensions(new Uint8Array(await viewer.slice(0,65536).arrayBuffer()));
  if(!g||!v||Math.max(g.width,g.height)>800||Math.max(v.width,v.height)>2400)return fail("Use JPEG previews up to 800px for the grid and 2400px for the viewer.");
  if(Math.abs(g.width*v.height-v.width*g.height)>2*Math.max(v.width,v.height))return fail("Both previews must have the same aspect ratio.");
}
async function route(request: Request, env: Env, actor: string) {
  const url = new URL(request.url); let path = url.pathname;
  if (!["GET","HEAD","POST"].includes(request.method)) throw new Problem(405,"Method not allowed.");
  if (request.method === "POST" && !sameOrigin(request)) throw new Problem(403,"Use the admin dashboard to make changes.");
  if (path === "/api/contacts") {
    if(request.method === "GET") {
      const people=await env.DB.prepare("SELECT id,name,phone,version FROM people ORDER BY name COLLATE NOCASE,id").all<Contact>();
      return json({people:people.results});
    }
    if(request.method === "POST") {
      const data=await body(request),name=text(data.name,"name",100),phone=text(data.phone??"","phone number",20,false)||null;
      if(phone && !/^\+[1-9]\d{7,14}$/.test(phone)) return fail("Use a full phone number including country code.");
      const id="contact-"+token().slice(0,24);
      const person=await env.DB.prepare("INSERT INTO people(id,name,phone) VALUES(?1,?2,?3) ON CONFLICT(phone) DO NOTHING RETURNING id,name,phone,version")
        .bind(id,name,phone).first<Contact>();
      if(!person)throw new Problem(409,"That phone number is already in People. Search for the existing person.");
      await audit(env,actor,"create-contact",id).run();
      return json({person},201);
    }
  }
  const contactRoute=/^\/api\/contacts\/([a-z0-9-]{1,100})\/details$/.exec(path);
  if(contactRoute && request.method === "POST") {
    const data=await body(request),name=text(data.name,"name",100),phone=text(data.phone??"","phone number",20,false)||null;
    if(phone && !/^\+[1-9]\d{7,14}$/.test(phone))return fail("Use a full phone number including country code.");
    if(!Number.isInteger(data.version))return fail("Missing person version.");
    const person=await env.DB.prepare("UPDATE people SET name=?1,phone=?2,version=version+1,updated_at=unixepoch() WHERE id=?3 AND version=?4 RETURNING id,name,phone,version")
      .bind(name,phone,contactRoute[1],data.version as number).first<Contact>();
    if(!person)throw new Problem(409,"This person changed in another window. Refresh before editing again.");
    await audit(env,actor,"update-contact",person.id).run();
    return json({person});
  }
  if (path === "/api/editions") {
    if (request.method === "GET") {
      const rows = await env.DB.prepare(`SELECT year,draft_json,draft_version,published_version,published_at,is_active,updated_at,
        (SELECT count(DISTINCT m.value) FROM invites i,json_each(i.member_ids) m WHERE i.edition_year=editions.year) AS people_count
        FROM editions ORDER BY year DESC`).all<EditionRow & {year:number;updated_at:number;people_count:number}>();
      return json({editions:rows.results.map(row=>{
        const draft=JSON.parse(row.draft_json) as Draft;
        return {year:row.year,title:draft.title,authors:draft.authors,version:row.draft_version,
          publishedVersion:row.published_version,publishedAt:row.published_at,isActive:!!row.is_active,updatedAt:row.updated_at,
          photoCount:draft.photos.length,storyCount:draft.stories.length,peopleCount:row.people_count};
      })});
    }
    if (request.method === "POST") {
      const data=await body(request);
      if (!Number.isInteger(data.year) || (data.year as number)<2000 || (data.year as number)>2100) return fail("Choose a year from 2000 to 2100.");
      const year=data.year as number,title=text(data.title,"title",150),authors=text(data.authors,"authors",100);
      const draft:Draft={title,authors,intro:"A few places, some familiar faces, and the everyday things worth keeping. We’d love to share them with you.",
        note:"A little look back at our year, and the people who made it special.",sharedTitle:"Meanwhile, in our camera roll…",stories:[],photos:[]};
      const result=await env.DB.prepare("INSERT INTO editions(year,draft_json) VALUES(?1,?2) ON CONFLICT(year) DO NOTHING RETURNING year")
        .bind(year,JSON.stringify(draft)).first<{year:number}>();
      if (!result) throw new Problem(409,"A scrapbook for this year already exists. Open it from Scrapbooks.");
      await audit(env,actor,"create-edition",String(year)).run();
      return json({year},201);
    }
  }
  // Original URLs remain scoped to the original pilot for older deployed clients.
  // New clients always send the scrapbook year in the path, never in request bodies.
  let year=2026;
  const scoped=/^\/api\/editions\/([^/]+)(\/.*)$/.exec(path);
  if (scoped) {
    if (!/^\d{4}$/.test(scoped[1]) || Number(scoped[1])<2000 || Number(scoped[1])>2100) return fail("Invalid scrapbook year.");
    year=Number(scoped[1]);path="/api"+scoped[2];
  }
  if (path.startsWith("/api/")) await edition(env,year);
  if (path === "/api/state" && request.method === "GET") {
    const row = await edition(env,year);
    const people = await env.DB.prepare("SELECT id,person_id,name,phone,expires_at,revoked_at,addressed_to,member_ids,version,share_socials,token_encrypted IS NOT NULL AS has_link FROM invites WHERE edition_year=?1 ORDER BY name").bind(year).all();
    const media = await env.DB.prepare("SELECT id,filename,mime,bytes,created_at,deleting AS deletion_pending,original_key IS NOT NULL AS has_original,viewer_key IS NOT NULL AS has_viewer FROM media_objects WHERE year=?1 ORDER BY created_at DESC,id").bind(year).all();
    return json({actor,year,draft:await canonicalDraft(JSON.parse(row.draft_json),env.DB,year),version:row.draft_version,publishedVersion:row.published_version,publishedAt:row.published_at,isActive:!!row.is_active,people:people.results.map(p=>({...p,addressedTo:p.addressed_to||p.name,memberIds:JSON.parse(p.member_ids as string)})),media:media.results});
  }
  if (path === "/api/draft" && request.method === "POST") {
    const data = await body(request), draft = await validDraft(data.draft,env,year);
    if (!Number.isInteger(data.version)) return fail("Missing draft version.");
    const result = await env.DB.prepare("UPDATE editions SET draft_json=?1,draft_version=draft_version+1,updated_at=unixepoch() WHERE year=?3 AND draft_version=?2 RETURNING draft_version")
      .bind(JSON.stringify(draft),data.version as number,year).first<{draft_version:number}>();
    if (!result) throw new Problem(409,"This edition changed in another window. Reload before saving again.");
    await audit(env,actor,"save-draft",String(year)).run();
    return json({version:result.draft_version});
  }
  if (path === "/api/publish" && request.method === "POST") {
    const data = await body(request), row = await edition(env,year);
    if (data.version !== row.draft_version) throw new Problem(409,"Save and review the latest draft before publishing.");
    const draft = await validDraft(JSON.parse(row.draft_json),env,year), published = await snapshot(draft,env,year);
    if (!published.photos.length) return fail("Add at least one photo before publishing.");
    const invitations=await env.DB.prepare("SELECT m.value AS person_id FROM invites i,json_each(i.member_ids) m WHERE i.edition_year=?1 AND i.revoked_at IS NULL AND i.expires_at>?2").bind(year,now()).all<{person_id:string}>();
    const active=new Set(invitations.results.map(i=>i.person_id));
    if(draft.photos.some(p=>!p.hidden && p.recipients.some(id=>!active.has(id))))return fail("Invite every selected photo recipient to this scrapbook before publishing.");
    const result = await env.DB.prepare("UPDATE editions SET published_json=?1,published_version=draft_version,published_at=unixepoch(),is_active=1 WHERE year=?3 AND draft_version=?2 RETURNING published_version")
      .bind(JSON.stringify(published),row.draft_version,year).first<{published_version:number}>();
    if (!result) throw new Problem(409,"The draft changed while publishing. Review it again.");
    await audit(env,actor,"publish",String(year)).run();
    return json({publishedVersion:result.published_version,isActive:true});
  }
  if (path === "/api/preview" && request.method === "GET") {
    const id = url.searchParams.get("recipient") || "";
    const person = id ? await env.DB.prepare(`SELECT p.id,p.name FROM people p WHERE p.id=?1 OR p.id=(SELECT person_id FROM invites WHERE id=?1 AND edition_year=?2)`)
      .bind(id,year).first<{id:string;name:string}>() : null;
    if (id && !person) throw new Problem(404,"Recipient not found.");
    const row = await edition(env,year), draft=await canonicalDraft(JSON.parse(row.draft_json),env.DB,year), published = await snapshot(draft,env,year);
    const invitationId=url.searchParams.get("invitation");
    const invite=invitationId?await env.DB.prepare("SELECT * FROM invites WHERE id=?1 AND edition_year=?2").bind(invitationId,year).first<InvitationAudience>():null;
    if(invitationId && !invite)throw new Problem(404,"Invitation not found.");
    const data = invite ? clientEdition(published,invite.id,invitationName(invite),year,await invitationAudience(env.DB,invite)) : clientEdition(published,id,person?.name || "friend",year,person?.id);
    data.shareSocials=!!invite?.share_socials;
    data.photos = data.photos.map(p => ({...p,src:`/api/editions/${year}/media/${p.id}/preview`,viewerSrc:`/api/editions/${year}/media/${p.id}/viewer`}));
    return json(data);
  }
  const linkRoute=/^\/api\/invitations\/([a-z0-9-]{1,100})\/link$/.exec(path);
  if(linkRoute && request.method==="POST"){
    const data=await body(request),id=linkRoute[1];
    const invite=await env.DB.prepare("SELECT token_hash,token_encrypted,share_socials,revoked_at,expires_at,name,addressed_to FROM invites WHERE id=?1 AND edition_year=?2").bind(id,year).first<{token_hash:string;token_encrypted:string|null;share_socials:number;revoked_at:number|null;expires_at:number;name:string;addressed_to:string|null}>();
    if(!invite)throw new Problem(404,"Invitation not found.");
    if(invite.revoked_at||invite.expires_at<=now())throw new Problem(409,"This invitation is expired or revoked. Create a fresh link to reopen access.");
    let raw:string;
    if(data.url!==undefined){
      if(typeof data.url!=="string")return fail("Paste the original invitation link.");
      let parsed:URL;try{parsed=new URL(data.url);}catch{return fail("Paste the original invitation link.");}
      if(![new URL(env.JOURNAL_ORIGIN).origin,...(env.SOCIAL_JOURNAL_ORIGIN?[new URL(env.SOCIAL_JOURNAL_ORIGIN).origin]:[])].includes(parsed.origin))return fail("Use one of this scrapbook’s invitation links.");
      raw=parsed.hash.slice(1);
      if(!/^[a-f0-9]{64}$/.test(raw)||await digest(raw)!==invite.token_hash)return fail("That link doesn’t match this invitation.");
      const encrypted=await sealLink(raw,env.INVITATION_LINK_KEY,id,year);
      if(!encrypted)throw new Problem(503,"Invitation link storage is not configured.");
      const saved=await env.DB.prepare("UPDATE invites SET token_encrypted=?1 WHERE id=?2 AND edition_year=?3 AND token_hash=?4 AND revoked_at IS NULL AND expires_at>?5 RETURNING id").bind(encrypted,id,year,invite.token_hash,now()).first();
      if(!saved)throw new Problem(409,"This invitation changed. Reopen it and try again.");
      await audit(env,actor,"restore-invitation-link",id).run();
    }else{
      if(!invite.token_encrypted)throw new Problem(409,"Paste the original link once to restore it without replacing it.");
      try{raw=await unsealLink(invite.token_encrypted,env.INVITATION_LINK_KEY,id,year);}catch{throw new Problem(503,"The stored link couldn’t be reopened. Try restoring the original link.");}
      if(await digest(raw)!==invite.token_hash)throw new Problem(409,"This link was replaced. Reopen the invitation.");
    }
    return json({name:invitationName(invite),url:invitationUrl(env,raw,!!invite.share_socials)});
  }
  const invitationRoute=/^\/api\/invitations\/([a-z0-9-]{1,100})\/details$/.exec(path);
  if ((path === "/api/invitations" || invitationRoute) && request.method === "POST") {
    const data=await body(request),personId=text(data.verificationContactId??data.personId,"verification contact",100);
    if(data.shareSocials!==undefined && typeof data.shareSocials!=="boolean")return fail("Choose whether to share socials.");
    const members=data.memberIds??[personId];
    if(!Array.isArray(members)||!members.length||members.length>20||members.some(id=>typeof id!=="string")||new Set(members).size!==members.length)
      return fail("Choose between 1 and 20 different people for the invitation.");
    if(!members.includes(personId))return fail("The verification contact must be included in this invitation.");
    const people=await env.DB.prepare("SELECT id,name,phone,version FROM people WHERE id IN (SELECT value FROM json_each(?1))")
      .bind(JSON.stringify(members)).all<Contact>();
    if(people.results.length!==members.length)throw new Problem(404,"Person not found. Add them in People first.");
    const contact=people.results.find(p=>p.id===personId)!;
    if(!contact.phone)return fail("Choose a verification contact with a phone number.");
    const addressedTo=data.addressedTo===undefined?null:text(data.addressedTo,"addressed to",200);
    if(invitationRoute){
      if(!Number.isInteger(data.version))return fail("Missing invitation version.");
      const id=invitationRoute[1];
      const saved=await env.DB.prepare(`UPDATE invites SET person_id=?1,name=?2,phone=?3,addressed_to=?4,member_ids=?5,share_socials=coalesce(?10,share_socials),version=version+1,
        challenge_expires_at=CASE WHEN person_id<>?1 OR member_ids<>?5 THEN 0 ELSE challenge_expires_at END
        WHERE id=?6 AND edition_year=?7 AND version=?8 AND EXISTS(SELECT 1 FROM people WHERE id=?1 AND version=?9) RETURNING id`)
        .bind(contact.id,contact.name,contact.phone,addressedTo,JSON.stringify(members),id,year,data.version as number,contact.version,data.shareSocials===undefined?null:Number(data.shareSocials)).first();
      if(!saved)throw new Problem(409,"This invitation changed in another window. Refresh before editing again.");
      await audit(env,actor,"edit-invitation",id).run();
      return json({saved:true});
    }
    const count=await env.DB.prepare("SELECT count(*) n FROM invites WHERE edition_year=?1").bind(year).first<{n:number}>();
    if(count && count.n>=100)return fail("This scrapbook supports up to 100 invitations.");
    const id="person-"+token().slice(0,24),raw=token();
    const created=await env.DB.prepare(`INSERT INTO invites(id,person_id,token_hash,name,phone,expires_at,edition_year,addressed_to,member_ids,share_socials,token_encrypted)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?11,?12 FROM people WHERE id=?2 AND version=?10 AND phone IS NOT NULL ON CONFLICT(edition_year,person_id) WHERE person_id IS NOT NULL DO NOTHING RETURNING id`)
      .bind(id,contact.id,await digest(raw),contact.name,contact.phone,now()+90*86400,year,addressedTo,JSON.stringify(members),contact.version,Number(!!data.shareSocials),await sealLink(raw,env.INVITATION_LINK_KEY,id,year)).first();
    if(!created)throw new Problem(409,"This verification contact already has an invitation here. Edit their existing invitation to include both people.");
    await audit(env,actor,"create-invitation",id).run();
    return json({id,personId:contact.id,url:invitationUrl(env,raw,!!data.shareSocials)},201);
  }
  if (path === "/api/people" && request.method === "POST") {
    const data = await body(request), name = text(data.name,"name",100), phone = text(data.phone,"phone number",20);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return fail("Use a full phone number including country code, such as +1 followed by ten digits.");
    const count = await env.DB.prepare("SELECT count(*) n FROM invites WHERE edition_year=?1").bind(year).first<{n:number}>();
    if (count && count.n >= 100) return fail("This edition supports up to 100 people.");
    const duplicate = await env.DB.prepare("SELECT id FROM invites WHERE phone=?1 AND edition_year=?2").bind(phone,year).first();
    if (duplicate) return fail("That phone number is already in this edition.");
    const id = "person-" + token().slice(0,24), raw = token();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO invites(id,token_hash,name,phone,expires_at,edition_year,token_encrypted) VALUES(?1,?2,?3,?4,?5,?6,?7)")
        .bind(id,await digest(raw),name,phone,now()+90*86400,year,await sealLink(raw,env.INVITATION_LINK_KEY,id,year)), audit(env,actor,"add-person",id)
    ]);
    return json({id,url:env.JOURNAL_ORIGIN+"/#"+raw},201);
  }
  const detailsRoute = /^\/api\/people\/(person-[a-f0-9]{24}|angela)\/details$/.exec(path);
  if (detailsRoute && request.method === "POST") {
    const id=detailsRoute[1],data=await body(request),name=text(data.name,"name",100),phone=text(data.phone??"","phone number",20,false)||null;
    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) return fail("Use a full phone number including country code.");
    const current=await env.DB.prepare("SELECT phone,person_id FROM invites WHERE id=?1 AND edition_year=?2").bind(id,year).first<{phone:string;person_id:string}>();
    if (!current) throw new Problem(404,"Recipient not found.");
    const duplicate=await env.DB.prepare("SELECT id FROM invites WHERE phone=?1 AND id<>?2 AND edition_year=?3").bind(phone,id,year).first();
    if (duplicate) return fail("That phone number is already assigned to another person.");
    const changed=current.phone!==phone;
    await env.DB.prepare("UPDATE people SET name=?1,phone=?2,version=version+1,updated_at=unixepoch() WHERE id=?3")
      .bind(name,phone,current.person_id).run();
    await audit(env,actor,changed?"change-phone":"edit-person",id).run();
    return json({saved:true,phoneChanged:changed});
  }
  const resetDownloads=/^\/api\/invitations\/([a-z0-9-]{1,100})\/downloads\/reset$/.exec(path);
  if(resetDownloads&&request.method==="POST"){
    await body(request);
    const invite=await env.DB.prepare("SELECT id FROM invites WHERE id=?1 AND edition_year=?2").bind(resetDownloads[1],year).first();
    if(!invite)throw new Problem(404,"Invitation not found.");
    await env.DB.batch([env.DB.prepare("DELETE FROM original_downloads WHERE invite_id=?1").bind(resetDownloads[1]),audit(env,actor,"reset-downloads",resetDownloads[1])]);
    return json({reset:true});
  }
  const personRoute = /^\/api\/people\/(person-[a-f0-9]{24}|angela)\/(invite|revoke)$/.exec(path);
  if (personRoute && request.method === "POST") {
    const id = personRoute[1];
    const person = await env.DB.prepare("SELECT id,share_socials FROM invites WHERE id=?1 AND edition_year=?2").bind(id,year).first<{id:string;share_socials:number}>();
    if (!person) throw new Problem(404,"Recipient not found.");
    const raw = token(), revoke = personRoute[2] === "revoke";
    await env.DB.batch([
      revoke ? env.DB.prepare("UPDATE invites SET version=version+1,revoked_at=?1,challenge_expires_at=0 WHERE id=?2").bind(now(),id) :
        env.DB.prepare("UPDATE invites SET version=version+1,token_hash=?1,revoked_at=NULL,expires_at=?2,last_sent_at=0,challenge_expires_at=0,attempts=0,token_encrypted=?4 WHERE id=?3").bind(await digest(raw),now()+90*86400,id,await sealLink(raw,env.INVITATION_LINK_KEY,id,year)),
      env.DB.prepare("DELETE FROM sessions WHERE invite_id=?1").bind(id), audit(env,actor,revoke?"revoke-invite":"rotate-invite",id)
    ]);
    return json(revoke ? {revoked:true} : {url:invitationUrl(env,raw,!!person.share_socials)});
  }
  const library=await mediaLibraryRoute(request,env,actor,year,path,body);
  if(library)return library;
  const uploaded = await photoUploadRoute(request,env,actor,year,path,validRenditions);
  if (uploaded) return uploaded;
  if (path === "/api/upload" && request.method === "POST") {
    if (Number(request.headers.get("Content-Length") || 0) > 36*1024*1024) throw new Problem(413,"Use an original smaller than 25 MB.");
    const form = await request.formData(), original = form.get("original"), preview = form.get("preview"),viewer=form.get("viewer");
    if (!(original instanceof File) || !(preview instanceof File)) return fail("Include the original photo and its preview.");
    if (original.size > 25*1024*1024 || preview.size > 4*1024*1024 || !original.size || !preview.size) throw new Problem(413,"Use an original up to 25 MB and a preview up to 4 MB.");
    const mime = detect(new Uint8Array(await original.slice(0,12).arrayBuffer()));
    if (detect(new Uint8Array(await preview.slice(0,12).arrayBuffer())) !== "image/jpeg") return fail("The preview must be JPEG.");
    if(viewer!==null){
      if(!(viewer instanceof File))return fail("Include a JPEG viewer preview.");
      await validRenditions(preview,viewer);
    }
    const id = "photo-"+token().slice(0,24), originalKey = `${year}/${id}/original`, previewKey = `${year}/${id}/preview.jpg`,viewerKey=viewer instanceof File?`${year}/${id}/viewer.jpg`:null;
    try {
      await env.MEDIA.put(originalKey,original.stream(),{httpMetadata:{contentType:mime}});
      await env.MEDIA.put(previewKey,preview.stream(),{httpMetadata:{contentType:"image/jpeg"}});
      if(viewerKey&&viewer instanceof File)await env.MEDIA.put(viewerKey,viewer.stream(),{httpMetadata:{contentType:"image/jpeg"}});
      await env.DB.batch([
        env.DB.prepare("INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes,viewer_key) VALUES(?1,?7,?2,?3,?4,?5,?6,?8)")
          .bind(id,previewKey,originalKey,original.name.slice(0,200),mime,original.size,year,viewerKey), audit(env,actor,"upload-photo",id)
      ]);
    } catch { await env.MEDIA.delete([originalKey,previewKey,...(viewerKey?[viewerKey]:[])]); throw new Problem(503,"The upload did not finish. Please try again."); }
    return json({id,filename:original.name,mime,bytes:original.size,has_original:true,has_viewer:!!viewerKey},201);
  }
  const renditionRoute=/^\/api\/media\/([a-z0-9-]+)\/previews$/.exec(path);
  if(renditionRoute&&request.method==="POST"){
    if(Number(request.headers.get("Content-Length")||0)>11*1024*1024)throw new Problem(413,"Previews are too large.");
    const media=await env.DB.prepare("SELECT id FROM media_objects WHERE id=?1 AND year=?2 AND deleting=0").bind(renditionRoute[1],year).first();
    if(!media)throw new Problem(404,"Photo not found.");
    const form=await request.formData(),grid=form.get("preview"),viewer=form.get("viewer");
    if(!(grid instanceof File)||!(viewer instanceof File))return fail("Include both photo previews.");
    await validRenditions(grid,viewer);
    const prefix=`${year}/${renditionRoute[1]}/previews/${token().slice(0,16)}`,gridKey=prefix+"/grid.jpg",viewerKey=prefix+"/viewer.jpg";
    try{
      await env.MEDIA.put(gridKey,grid.stream(),{httpMetadata:{contentType:"image/jpeg"}});
      await env.MEDIA.put(viewerKey,viewer.stream(),{httpMetadata:{contentType:"image/jpeg"}});
      const [updated]=await env.DB.batch([
        env.DB.prepare("UPDATE media_objects SET preview_key=?1,viewer_key=?2 WHERE id=?3 AND year=?4 AND deleting=0 RETURNING id").bind(gridKey,viewerKey,renditionRoute[1],year),
        env.DB.prepare("INSERT INTO admin_events(actor,action,target) SELECT ?1,'generate-previews',?2 WHERE EXISTS(SELECT 1 FROM media_objects WHERE id=?2 AND preview_key=?3 AND viewer_key=?4 AND deleting=0)").bind(actor,renditionRoute[1],gridKey,viewerKey)
      ]);
      if(!updated.results.length)throw new Problem(409,'This photo is no longer available.');
    }catch{await env.MEDIA.delete([gridKey,viewerKey]);throw new Problem(503,"Preview generation could not be saved. Please try again.");}
    return json({saved:true});
  }
  const mediaRoute = /^\/api\/media\/([a-z0-9-]+)\/(preview|viewer|original)$/.exec(path);
  if (mediaRoute && request.method === "GET") {
    const media = await env.DB.prepare("SELECT * FROM media_objects WHERE id=?1 AND year=?2 AND deleting=0").bind(mediaRoute[1],year).first<Media>();
    const key = mediaRoute[2] === "preview" ? media?.preview_key : mediaRoute[2]==="viewer"?(media?.viewer_key||media?.preview_key):media?.original_key;
    if (!key) throw new Problem(404,"Photo not found.");
    const file = await env.MEDIA.get(key); if (!file) throw new Problem(404,"Photo not found.");
    return new Response(file.body,{headers:{"Content-Type":mediaRoute[2] !== "original" ? "image/jpeg" : media!.mime}});
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
    } catch (error) {
      if (error instanceof Problem || error instanceof UploadProblem) response=json({error:error.message},error.status);
      else if(error instanceof Error&&error.message.includes('photo is no longer available'))response=json({error:'A photo was deleted in another tab. Remove it from this draft before saving or publishing.'},409);
      else if (error instanceof Error && error.message.includes("UNIQUE constraint failed: invites.edition_year, invites.phone"))
        response=json({error:"That phone number is already in this scrapbook. Refresh to see the latest invitations."},409);
      else if(error instanceof Error && error.message.includes("verification contact needs a phone"))
        response=json({error:"This person is a verification contact. Choose another contact on their invitations before removing the phone number."},400);
      else if(error instanceof Error && error.message.includes("UNIQUE constraint failed: invites.edition_year, invites.person_id"))
        response=json({error:"This verification contact already has an invitation here. Edit the existing invitation instead."},409);
      else if(error instanceof Error && error.message.includes("UNIQUE constraint failed: people.phone"))
        response=json({error:"That phone number belongs to another person in People."},409);
      else response=json({error:"Something went wrong. Please try again."},500);
    }
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
