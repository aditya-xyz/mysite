import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { digest } from "../src/security.ts";

test("private admin authentication, drafts, publishing, uploads, and recipient isolation", async t => {
  const {privateKey,publicKey} = await generateKeyPair("RS256",{extractable:true});
  const jwk = {...await exportJWK(publicKey),kid:"test-key",alg:"RS256",use:"sig"};
  const issuer="https://test-team.cloudflareaccess.com",aud="test-admin-application";
  const adminEmail="owner@example.com";
  const outbound = async (request: {url:string}) => {
    assert.equal(request.url,issuer+"/cdn-cgi/access/certs","Admin operations must never send SMS or contact arbitrary destinations");
    return Response.json({keys:[jwk]});
  };
  const mf = new Miniflare(convertV4MiniflareOptions({workers:[{
    name:"admin",routes:["admin.test/*"],modules:true,scriptPath:".wrangler/admin-test-bundle/index.js",compatibilityDate:"2026-08-06",
    d1Databases:{DB:"shared-db"},r2Buckets:{MEDIA:"shared-media"},
    bindings:{ADMIN_EMAIL:adminEmail,ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:aud,JOURNAL_ORIGIN:"https://journal.test",SOCIAL_JOURNAL_ORIGIN:"https://scrapbook.test",INVITATION_LINK_KEY:"1".repeat(64)},outboundService:outbound
  },{
    name:"guest",routes:["journal.test/*","scrapbook.test/*"],modules:true,scriptPath:".wrangler/test-bundle/index.js",compatibilityDate:"2026-08-06",
    d1Databases:{DB:"shared-db"},r2Buckets:{MEDIA:"shared-media"},bindings:{SMS_ENABLED:"false",JOURNAL_ORIGIN:"https://journal.test",SOCIAL_JOURNAL_ORIGIN:"https://scrapbook.test"},outboundService:outbound
  }]}));
  async function signed(email=adminEmail,audience=aud,expires="5m",iss=issuer) {
    return new SignJWT({email}).setProtectedHeader({alg:"RS256",kid:"test-key"})
      .setSubject("test-user").setIssuedAt().setIssuer(iss).setAudience(audience).setExpirationTime(expires).sign(privateKey);
  }
  try {
    const db=await mf.getD1Database("DB","admin"),bucket=await mf.getR2Bucket("MEDIA","admin");
    for(const f of ["0001_invites.sql","0002_editor.sql","0003_scrapbooks.sql","0004_people.sql"]) await db.exec((await readFile("migrations/"+f,"utf8")).replace(/\n/g," "));
    await db.batch((await readFile("migrations/0005_shared_invitations.sql","utf8")).split("--> statement-breakpoint").map(sql=>db.prepare(sql)));
    await db.exec((await readFile("migrations/0006_photo_renditions_downloads.sql","utf8")).replace(/\n/g," "));
    await db.exec((await readFile('migrations/0007_photo_uploads.sql','utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0008_media_library.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0009_invitation_sharing.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0010_print_orders.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0011_print_allowance_resets.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0012_google_address_verification.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0013_unpublish.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    const expires=Math.floor(Date.now()/1000)+86400;
    await db.prepare("INSERT INTO invites(id,token_hash,name,phone,expires_at) VALUES('angela',?1,'Angela','+15555550101',?2)").bind(await digest("a".repeat(64)),expires).run();
    let assertion=await signed();
    async function req(path: string,data?:unknown,origin="https://admin.test",jwt=assertion) {
      const multipart=data instanceof FormData;
      const encoded=multipart?new Request("https://admin.test",{method:"POST",body:data}):null;
      return mf.dispatchFetch("https://admin.test"+path,{method:data===undefined?"GET":"POST",
        headers:{Origin:origin,...(jwt?{"Cf-Access-Jwt-Assertion":jwt}:{}),"Content-Type":encoded?.headers.get("Content-Type")||"application/json"},
        ...(data===undefined?{}:{body:encoded?await encoded.arrayBuffer():JSON.stringify(data)})});
    }
    await t.test("all admin pages, assets, and APIs reject unauthenticated or forged identities",async()=>{
      for(const path of ["/","/app.js","/style.css","/api/state","/api/editions","/api/editions/2027/state","/api/media/anything/preview"])assert.equal((await req(path,undefined,undefined,"")).status,401);
      const forged=await mf.dispatchFetch("https://admin.test/api/state",{headers:{"Cf-Access-Authenticated-User-Email":adminEmail}});assert.equal(forged.status,401);
      for(const jwt of [await signed("other@example.com"),await signed(adminEmail,"other-app"),await signed(adminEmail,aud,"-1m"),await signed(adminEmail,aud,"5m","https://other-team.cloudflareaccess.com"),"forged.jwt.value"])
        assert.equal((await req("/api/state",undefined,undefined,jwt)).status,401);
      assert.equal((await req("/api/state")).status,200);
    });
    await t.test("authenticated writes still reject cross-origin requests",async()=>{
      assert.equal((await req("/api/draft",{},"https://other.test")).status,403);
    });
    const original=new Uint8Array([255,216,255,225,69,88,73,70,0,2,4,6,255,217]);
    async function upload(){const form=new FormData();form.set("original",new File([original],"original.jpeg",{type:"image/jpeg"}));form.set("preview",new File([original],"preview.jpg",{type:"image/jpeg"}));return req("/api/upload",form);}
    let photoId="",personId="";
    await t.test("uploads preserve untouched originals and never publish automatically",async()=>{
      const r=await upload();assert.equal(r.status,201);photoId=(await r.json() as {id:string}).id;
      const m=await db.prepare("SELECT original_key FROM media_objects WHERE id=?").bind(photoId).first<{original_key:string}>();
      assert.deepEqual(new Uint8Array(await (await bucket.get(m!.original_key))!.arrayBuffer()),original);
      const ed=await db.prepare("SELECT published_json FROM editions WHERE year=2026").first<{published_json:string|null}>();assert.equal(ed!.published_json,null);
      const form=new FormData();form.set("original",new File(["<svg></svg>"],"unsafe.svg",{type:"image/svg+xml"}));form.set("preview",new File([original],"preview.jpg"));
      assert.equal((await req("/api/upload",form)).status,400);
    });
    await t.test("creating a person generates a phone-bound link without sending SMS",async()=>{
      const r=await req("/api/people",{name:"Sam",phone:"+15555550102"});assert.equal(r.status,201);
      const result=await r.json() as {id:string;url:string};personId=result.id;assert.match(result.url,/^https:\/\/journal.test\/#\w{64}$/);
      const stored=await db.prepare("SELECT token_hash FROM invites WHERE id=?").bind(personId).first<{token_hash:string}>();
      assert.equal(stored!.token_hash,await digest(result.url.split("#")[1]));
      assert.equal((await req("/api/people",{name:"Duplicate",phone:"+15555550102"})).status,400);
    });
    const initial=await (await req("/api/state")).json() as {draft:import("../src/edition.ts").Draft;version:number};
    let version=initial.version;
    const draft=initial.draft;draft.note="Our saved opening note.";draft.stories=[{id:"first-story",title:"A little adventure",body:"A story from both of us."}];
    draft.photos=[{id:photoId,caption:"A memory together",alt:"An illustrative photo",recipients:["angela",personId]}];
    await t.test("save uses version checks and preview is private",async()=>{
      const r=await req("/api/draft",{version,draft});assert.equal(r.status,200);version=(await r.json() as {version:number}).version;
      assert.equal((await req("/api/draft",{version:initial.version,draft})).status,409);
      const preview=await (await req("/api/preview?recipient=angela")).json() as {photos:{id:string}[];note:string};
      assert.equal(preview.note,draft.note);assert.equal(preview.photos[0].id,photoId);
      const ed=await db.prepare("SELECT published_json FROM editions WHERE year=2026").first<{published_json:string|null}>();assert.equal(ed!.published_json,null);
      const invalid={...draft,photos:[{...draft.photos[0],recipients:["unknown-person"]}]};
      assert.equal((await req("/api/draft",{version,draft:invalid})).status,400);
    });
    let guestToken="b".repeat(64),samToken="c".repeat(64);
    const guestReq=(id:string,raw=guestToken)=>mf.dispatchFetch("https://journal.test/api/"+id,{headers:{Cookie:"__Host-year_session="+raw}});
    await t.test("publish connects the edition to guests and enforces selected groups",async()=>{
      const r=await req("/api/publish",{version});assert.equal(r.status,200);
      for(const [raw,id] of [[guestToken,"angela"],[samToken,personId]])await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,?)").bind(await digest(raw),id,expires).run();
      for(const raw of [guestToken,samToken]){
        const journal=await (await guestReq("journal",raw)).json() as {photos:{id:string;canSave:boolean}[];note:string;stories:unknown[]};
        assert.equal(journal.note,draft.note);assert.equal(journal.photos[0].id,photoId);assert.equal(journal.photos[0].canSave,true);assert.equal(journal.stories.length,1);
        assert.deepEqual(new Uint8Array(await (await guestReq(`media/${photoId}/original`,raw)).arrayBuffer()),original);
      }
    });
    await t.test("unpublishing preserves content and links, blocks guest access, and needs no fresh 2FA for the offline message",async()=>{
      const before=await db.prepare("SELECT * FROM editions WHERE year=2026").first<any>();
      const revision=before.publication_revision;
      const payload={confirm:true,publicationRevision:revision};
      assert.equal((await req('/api/editions/2026/unpublish',payload,undefined,'')).status,401);
      assert.equal((await req('/api/editions/2026/unpublish',payload,'https://other.test')).status,403);
      assert.equal((await req('/api/editions/2026/unpublish',{...payload,confirm:false})).status,400);
      assert.equal((await req('/api/editions/2026/unpublish',{...payload,publicationRevision:revision-1})).status,409);
      const result=await req('/api/editions/2026/unpublish',payload);assert.equal(result.status,200);
      const offline=await result.json() as any;assert.equal(offline.isActive,false);assert.ok(offline.takenOfflineAt);assert.equal(offline.publicationRevision,revision+1);
      const after=await db.prepare("SELECT * FROM editions WHERE year=2026").first<any>();
      for(const key of ['draft_json','draft_version','published_json','published_version','published_at','allow_print_orders'])assert.equal(after[key],before[key],key+' is preserved');
      assert.equal((await req('/api/editions/2026/unpublish',payload)).status,409);
      for(const route of ['journal',`media/${photoId}`,`media/${photoId}/viewer`,`media/${photoId}/original`,'print/status']){
        const r=await guestReq(route);assert.equal(r.status,409,route);assert.equal((await r.json() as any).code,'SCRAPBOOK_OFFLINE');
      }
      const expired='09'.repeat(32);
      await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,1)").bind(await digest(expired),'angela').run();
      const cookie='__Host-year_invite='+ 'a'.repeat(64)+'; __Host-year_session='+expired;
      const guest=(path:string,data?:unknown,cookies=cookie)=>mf.dispatchFetch('https://scrapbook.test/api/'+path,{method:data===undefined?'GET':'POST',headers:{Cookie:cookies,Origin:'https://scrapbook.test','Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
      assert.equal((await guest('journal')).status,401,'Expired 2FA is not extended');
      for(const [path,data] of [['invitation',undefined],['send',{}],['verify',{code:'123456'}]] as const){
        const r=await guest(path,data);assert.equal(r.status,409);assert.equal((await r.json() as any).code,'SCRAPBOOK_OFFLINE');
      }
      const opened=await guest('open',{token:'a'.repeat(64)},'');assert.equal(opened.status,200);assert.deepEqual(await opened.json(),{offline:true});
      assert.match(opened.headers.get('Set-Cookie')!,/__Host-year_invite=/,'Refreshing an offline link keeps invitation context');
      assert.equal((await guest('invitation',undefined,'')).status,401);
      assert.equal((await guest('open',{token:'f'.repeat(64)},'')).status,401);
      await db.prepare("UPDATE invites SET revoked_at=1 WHERE id='angela'").run();
      assert.equal((await guest('open',{token:'a'.repeat(64)},'')).status,401);
      assert.equal((await guest('invitation')).status,401);
      await db.prepare("UPDATE invites SET revoked_at=NULL WHERE id='angela'").run();
      const preview=await req('/api/editions/2026/preview');assert.equal(preview.status,200,'Admin can preview offline drafts');
      assert.equal((await req('/api/publish',{version,publicationRevision:revision})).status,409,'A stale tab cannot republish over an unpublish');
      const republished=await req('/api/publish',{version,publicationRevision:offline.publicationRevision});assert.equal(republished.status,200);
      assert.equal((await req('/api/editions/2026/unpublish',{confirm:true,publicationRevision:offline.publicationRevision})).status,409,'A stale unpublish cannot close a newer publication');
      assert.equal((await guestReq('journal')).status,200,'Existing valid sessions reopen without re-verification');
      assert.equal((await guest('invitation')).status,200,'Expired 2FA can use the same invitation when online again');
      assert.equal((await guest('journal')).status,401,'Republishing does not bypass expired 2FA');
      assert.equal((await db.prepare("SELECT count(*) AS n FROM admin_events WHERE action='unpublish'").first<any>())!.n,1);
    });
    await t.test("draft audience edits do not leak before publication; shared originals stay blocked",async()=>{
      draft.photos[0].recipients=[];
      let r=await req("/api/draft",{version,draft});version=(await r.json() as {version:number}).version;
      assert.equal((await guestReq(`media/${photoId}/original`)).status,200,"Published personal access must persist until a new publication");
      r=await req("/api/publish",{version});assert.equal(r.status,200);
      assert.equal((await guestReq(`media/${photoId}/original`)).status,404);
      assert.equal((await guestReq(`media/${photoId}`)).status,200);
      draft.photos[0].recipients=[personId];
      r=await req("/api/draft",{version,draft});version=(await r.json() as {version:number}).version;
      await req("/api/publish",{version});
      assert.equal((await guestReq(`media/${photoId}`)).status,404);
      assert.equal((await guestReq(`media/${photoId}/original`)).status,404);
      assert.equal((await guestReq(`media/${photoId}/original`,samToken)).status,200);
    });
    await t.test("hidden photos persist in draft order and stay inaccessible until unhidden and republished",async()=>{
      const id=(await (await upload()).json() as {id:string}).id;
      const state=await (await req("/api/state")).json() as {draft:import("../src/edition.ts").Draft;version:number};
      const held=state.draft,assigned=held.photos[0].recipients[0];
      held.photos.push({id,caption:"Keep this position",alt:"",recipients:[],hidden:true,audience:"personal"});
      const save=async()=>{const r=await req("/api/draft",{version,draft:held});assert.equal(r.status,200,await r.clone().text());version=(await r.json() as {version:number}).version;};
      await save();
      const reloaded=await (await req("/api/state")).json() as {draft:import("../src/edition.ts").Draft};
      assert.deepEqual(reloaded.draft.photos,held.photos,"Order, caption, unfinished description, and unassigned personal mode survive reload");
      assert.equal((await req(`/api/editions/2026/media/${id}/delete`,{confirm:true})).status,409);
      const preview=await (await req("/api/preview")).json() as {photos:{id:string}[]};assert.ok(!preview.photos.some(p=>p.id===id));
      assert.equal((await req("/api/publish",{version})).status,200);
      const published=(await db.prepare("SELECT published_json FROM editions WHERE year=2026").first<{published_json:string}>())!.published_json;
      assert.ok(!published.includes(id));assert.ok(!published.includes("Keep this position"));
      for(const raw of [guestToken,samToken])for(const suffix of ["","/viewer","/original"])assert.equal((await guestReq(`media/${id}${suffix}`,raw)).status,404);
      await db.prepare("INSERT INTO people(id,name) VALUES('not-invited-yet','Future guest')").run();
      held.photos[1].recipients=['not-invited-yet'];await save();
      assert.equal((await req("/api/publish",{version})).status,200,"Hidden assignments do not require invitations yet");
      held.photos[1].recipients=[];
      held.photos[1].hidden=false;held.photos[1].alt="A synthetic portrait";
      assert.equal((await req("/api/draft",{version,draft:held})).status,400,"Unassigned personal photos must not become shared");
      held.photos[1].recipients=[assigned];await save();
      assert.equal((await guestReq(`media/${id}`,samToken)).status,404);
      assert.equal((await req("/api/publish",{version})).status,200);
      assert.equal((await guestReq(`media/${id}`,samToken)).status,200);assert.equal((await guestReq(`media/${id}/original`,samToken)).status,200);
      const visible=await (await guestReq("journal",samToken)).json() as {photos:{id:string}[]};assert.deepEqual(visible.photos.map(p=>p.id),held.photos.map(p=>p.id));
      held.photos[1].hidden=true;held.photos[1].alt="";await save();
      assert.equal((await guestReq(`media/${id}`,samToken)).status,200,"Draft hiding must not change the current publication");
      assert.equal((await req("/api/publish",{version})).status,200);assert.equal((await guestReq(`media/${id}/original`,samToken)).status,404);
      for(const invalid of [{hidden:"yes"},{audience:"unknown"}]){const bad=structuredClone(held);Object.assign(bad.photos[1],invalid);assert.equal((await req("/api/draft",{version,draft:bad})).status,400);}
      held.photos[0].hidden=true;await save();assert.equal((await req("/api/publish",{version})).status,400,"All-hidden publication is rejected");
      held.photos[0].hidden=false;await save();assert.equal((await req("/api/publish",{version})).status,200);
    });
    await t.test("invitation socials only control the footer, while all links use the scrapbook domain",async()=>{
      const {person:contact}=await (await req("/api/contacts",{name:"Social test",phone:"+15555550108"})).json() as {person:{id:string}};
      const created=await req("/api/editions/2026/invitations",{memberIds:[contact.id],verificationContactId:contact.id,addressedTo:"Test household",shareSocials:true});
      assert.equal(created.status,201,await created.clone().text());const invite=await created.json() as {id:string;url:string};
      assert.equal(new URL(invite.url).origin,"https://scrapbook.test");const raw=new URL(invite.url).hash.slice(1);
      const openAt=(origin:string)=>mf.dispatchFetch(origin+"/api/open",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({token:raw})});
      const redirected=await openAt("https://journal.test");assert.equal((await redirected.json() as {redirectUrl:string}).redirectUrl,invite.url);assert.equal(redirected.headers.get("Set-Cookie"),null);
      const canonical=await openAt("https://scrapbook.test");assert.ok(canonical.headers.get("Set-Cookie")?.includes("__Host-year_invite="));
      const stored=await db.prepare("SELECT token_hash,token_encrypted,version FROM invites WHERE id=?1").bind(invite.id).first<{token_hash:string;token_encrypted:string;version:number}>();
      assert.equal(stored!.token_hash,await digest(raw));assert.ok(!stored!.token_encrypted.includes(raw));
      const link=()=>req(`/api/editions/2026/invitations/${invite.id}/link`,{});
      assert.equal((await link()).status,200);assert.equal((await (await link()).json() as {url:string}).url,invite.url);
      assert.equal((await req(`/api/editions/2027/invitations/${invite.id}/link`,{})).status,404);
      assert.equal((await req(`/api/editions/2026/invitations/${invite.id}/link`,{},"https://evil.test")).status,403);
      assert.equal((await req(`/api/editions/2026/invitations/${invite.id}/link`,{},undefined,"")).status,401);
      const previewOn=await (await req(`/api/preview?invitation=${invite.id}`)).json() as {shareSocials:boolean};assert.equal(previewOn.shareSocials,true);
      const session="e".repeat(64);await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,?)").bind(await digest(session),invite.id,expires).run();
      assert.equal((await (await guestReq("journal",session)).json() as {shareSocials:boolean}).shareSocials,true);
      const edited=await req(`/api/editions/2026/invitations/${invite.id}/details`,{memberIds:[contact.id],verificationContactId:contact.id,addressedTo:"Test household",shareSocials:false,version:stored!.version});assert.equal(edited.status,200);
      const cloudflareUrl=(await (await link()).json() as {url:string}).url;assert.equal(new URL(cloudflareUrl).origin,"https://scrapbook.test");assert.equal(new URL(cloudflareUrl).hash,new URL(invite.url).hash);
      assert.ok((await openAt("https://scrapbook.test")).headers.get("Set-Cookie")?.includes("__Host-year_invite="));
      assert.equal((await (await openAt("https://journal.test")).json() as {redirectUrl:string}).redirectUrl,cloudflareUrl);
      assert.equal((await (await guestReq("journal",session)).json() as {shareSocials:boolean}).shareSocials,false,"Preference applies to existing sessions without publishing");
      assert.equal((await (await req(`/api/preview?invitation=${invite.id}`)).json() as {shareSocials:boolean}).shareSocials,false);
      // A legacy hash-only invitation can retain its exact token, sessions and version.
      await db.prepare("UPDATE invites SET token_encrypted=NULL WHERE id=?1").bind(invite.id).run();
      assert.equal((await link()).status,409);
      assert.equal((await req(`/api/editions/2026/invitations/${invite.id}/link`,{url:"https://journal.test/#"+"f".repeat(64)})).status,400);
      assert.equal((await req(`/api/editions/2026/invitations/${invite.id}/link`,{url:cloudflareUrl})).status,200);
      assert.equal((await (await link()).json() as {url:string}).url,cloudflareUrl);
      const rotated=await req(`/api/people/${invite.id}/invite`,{});assert.equal(rotated.status,200);const rotatedUrl=(await rotated.json() as {url:string}).url;assert.notEqual(rotatedUrl,cloudflareUrl);assert.equal((await (await link()).json() as {url:string}).url,rotatedUrl);
      assert.equal((await guestReq("journal",session)).status,401);
      assert.equal((await req(`/api/people/${invite.id}/revoke`,{})).status,200);assert.equal((await link()).status,409);
    });
    let nextPerson="",nextPhoto="",nextInvite="",nextVersion=1;
    const next=(path:string,data?:unknown)=>req("/api/editions/2027/"+path,data);
    let nextDraft:import("../src/edition.ts").Draft;
    const oldBefore=await (await req("/api/state")).json();
    await t.test("scrapbook creation validates years and creates one empty draft per year atomically",async()=>{
      for(const year of ["2027",1999,2101,2027.5,null])assert.equal((await req("/api/editions",{year,title:"Next year",authors:"Aditya & Angela"})).status,400);
      assert.equal((await req("/api/editions",{year:2027,title:"",authors:"Aditya & Angela"})).status,400);
      assert.equal((await req("/api/editions",{year:2027,title:"Next year",authors:"Aditya & Angela"},"https://other.test")).status,403);
      const results=await Promise.all([1,2].map(()=>req("/api/editions",{year:2027,title:"Our 2027",authors:"Aditya & Angela"})));
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
      assert.equal((await req("/api/editions/2028/state")).status,404);
      assert.equal((await req("/api/editions/not-a-year/state")).status,400);
      const state=await (await next("state")).json() as {year:number;draft:import("../src/edition.ts").Draft;people:unknown[];media:unknown[]};
      assert.equal(state.year,2027);assert.deepEqual(state.people,[]);assert.deepEqual(state.media,[]);assert.deepEqual(state.draft.photos,[]);assert.deepEqual(state.draft.stories,[]);nextDraft=state.draft;
      const listing=await (await req("/api/editions")).json() as {editions:{year:number}[]};
      assert.deepEqual(listing.editions.map(e=>e.year),[2027,2026]);
      assert.ok(!JSON.stringify(listing).includes("+1555"));
      assert.deepEqual(await (await req("/api/state")).json(),oldBefore);
    });
    await t.test("each scrapbook isolates admin media, invitations, previews, and draft assignments",async()=>{
      for(const path of [`media/${photoId}/preview`,`media/${photoId}/original`,"preview?recipient=angela"])
        assert.equal((await next(path)).status,404);
      for(const action of ["invite","revoke","details"])
        assert.equal((await next(`people/${personId}/${action}`,{name:"Wrong year",phone:"+15555550109"})).status,404);
      const invitation=await next("people",{name:"Sam in 2027",phone:"+15555550105"});assert.equal(invitation.status,201);
      const person=await invitation.json() as {id:string;url:string};nextPerson=person.id;nextInvite=person.url.split("#")[1];
      // The same person can receive a separate annual invitation.
      const same=await next("people",{name:"Angela in 2027",phone:"+15555550101"});assert.equal(same.status,201);
      assert.equal((await next("people",{name:"Duplicate",phone:"+15555550101"})).status,400);
      const form=new FormData();form.set("original",new File([original],"2027.jpeg",{type:"image/jpeg"}));form.set("preview",new File([original],"preview.jpg",{type:"image/jpeg"}));
      const uploaded=await next("upload",form);assert.equal(uploaded.status,201);nextPhoto=(await uploaded.json() as {id:string}).id;
      const stored=await db.prepare("SELECT year,original_key FROM media_objects WHERE id=?").bind(nextPhoto).first<{year:number;original_key:string}>();
      assert.equal(stored!.year,2027);assert.ok(stored!.original_key.startsWith("2027/"));
      assert.deepEqual(new Uint8Array(await (await bucket.get(stored!.original_key))!.arrayBuffer()),original);
      assert.equal((await req(`/api/editions/2026/media/${nextPhoto}/preview`)).status,404);
      nextDraft.photos=[{id:photoId,caption:"Wrong year",alt:"Sample",recipients:[]}];
      assert.equal((await next("draft",{version:1,draft:nextDraft})).status,400);
      nextDraft.photos=[{id:nextPhoto,caption:"New year",alt:"Sample",recipients:[personId]}];
      assert.equal((await next("draft",{version:1,draft:nextDraft})).status,400);
      nextDraft.photos[0].recipients=[nextPerson];
      const saved=await next("draft",{version:1,draft:nextDraft});assert.equal(saved.status,200);nextVersion=(await saved.json() as {version:number}).version;
      assert.equal((await next("draft",{version:1,draft:nextDraft})).status,409);
      const preview=await (await next("preview?recipient="+nextPerson)).json() as {year:number;photos:{src:string}[]};
      assert.equal(preview.year,2027);assert.ok(preview.photos[0].src.startsWith("/api/editions/2027/"));
      assert.deepEqual(await (await req("/api/state")).json(),oldBefore);
    });
    const nextSession="d".repeat(64);
    await t.test("unpublished scrapbooks never fall back to the 2026 pilot or send SMS",async()=>{
      await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,?)").bind(await digest(nextSession),nextPerson,expires).run();
      assert.equal((await guestReq("journal",nextSession)).status,409);
      assert.equal((await guestReq(`media/${photoId}`,nextSession)).status,409);
      assert.equal((await guestReq(`media/${nextPhoto}`,nextSession)).status,409);
      for(const [path,data] of [["invitation",undefined],["send",{}]] as const){
        const r=await mf.dispatchFetch("https://journal.test/api/"+path,{method:data?"POST":"GET",headers:{Origin:"https://journal.test",Cookie:"__Host-year_invite="+nextInvite,"Content-Type":"application/json"},...(data?{body:"{}"}:{})});
        assert.equal(r.status,409);
      }
      const opened=await mf.dispatchFetch("https://journal.test/api/open",{method:"POST",headers:{Origin:"https://journal.test","Content-Type":"application/json",Cookie:"__Host-year_session="+samToken},body:JSON.stringify({token:nextInvite})});
      assert.equal(opened.status,409);assert.equal(opened.headers.get("Set-Cookie"),null);
    });
    await t.test("publishing activates exactly one year and closes old invitation and media access",async()=>{
      assert.equal((await next("publish",{version:nextVersion})).status,200);
      const journal=await (await guestReq("journal",nextSession)).json() as {year:number;title:string;photos:{id:string;canSave:boolean}[]};
      assert.equal(journal.year,2027);assert.equal(journal.title,"Our 2027");assert.deepEqual(journal.photos.map(p=>p.id),[nextPhoto]);assert.equal(journal.photos[0].canSave,true);
      assert.deepEqual(new Uint8Array(await (await guestReq(`media/${nextPhoto}/original`,nextSession)).arrayBuffer()),original);
      assert.equal((await guestReq(`media/${photoId}`,nextSession)).status,404);
      assert.equal((await guestReq(`media/${nextPhoto}`,samToken)).status,409);
      assert.deepEqual(await (await req("/api/state")).json(),{...(oldBefore as object),isActive:false});
      for(const path of ["journal",`media/${photoId}`,`media/${photoId}/viewer`,`media/${photoId}/original`])assert.equal((await guestReq(path,samToken)).status,409);
      const oldOpen=await mf.dispatchFetch("https://journal.test/api/open",{method:"POST",headers:{Origin:"https://journal.test","Content-Type":"application/json"},body:JSON.stringify({token:"a".repeat(64)})});assert.equal(oldOpen.status,409);
      for(const path of ["send","verify"]){const closed=await mf.dispatchFetch("https://journal.test/api/"+path,{method:"POST",headers:{Origin:"https://journal.test",Cookie:"__Host-year_invite="+"a".repeat(64),"Content-Type":"application/json"},body:JSON.stringify({code:"123456"})});assert.equal(closed.status,409);}
      assert.deepEqual((await db.prepare("SELECT year FROM editions WHERE is_active=1").all()).results,[{year:2027}]);
      assert.equal((await req("/api/publish",{version:-1})).status,409);assert.deepEqual((await db.prepare("SELECT year FROM editions WHERE is_active=1").all()).results,[{year:2027}],"Failed publish does not deactivate the active year");
      nextDraft.photos[0].recipients=[];const saved=await next("draft",{version:nextVersion,draft:nextDraft});assert.equal(saved.status,200);
      assert.equal((await guestReq(`media/${nextPhoto}/original`,nextSession)).status,200,"New draft edits must not change the published edition");
    });
    await t.test("rotating and revoking invitations invalidates existing sessions",async()=>{
      const changed=await req(`/api/people/${personId}/details`,{name:"Sam Updated",phone:"+15555550103"});assert.equal(changed.status,200);
      assert.equal((await guestReq("journal",samToken)).status,401,"Changing a phone must end that recipient's existing session");
      await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,?)").bind(await digest(samToken),personId,expires).run();
      const rotated=await req(`/api/people/${personId}/invite`,{});assert.equal(rotated.status,200);
      assert.equal((await guestReq("journal",samToken)).status,401);
      const revoked=await req("/api/people/angela/revoke",{});assert.equal(revoked.status,200);
      assert.equal((await guestReq("journal")).status,401);
      assert.equal((await guestReq("journal",nextSession)).status,200,"Changing 2026 invitations must not end 2027 sessions");
      const events=await db.prepare("SELECT count(*) n FROM admin_events").first<{n:number}>();assert.ok(events!.n>=9);
    });
  }finally{await mf.dispose();}
});
