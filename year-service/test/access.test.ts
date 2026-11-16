import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { digest } from "../src/security.ts";

test("invitation, SMS verification, and private media boundaries", async t => {
  const sent: URLSearchParams[] = [];
  let sendFailure=false;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, scriptPath: ".wrangler/test-bundle/index.js", compatibilityDate: "2026-08-06",
    d1Databases: ["DB"], r2Buckets: ["MEDIA"],
    serviceBindings:{ASSETS:async()=>new Response("public shell")},
    bindings: { SMS_ENABLED: "true", TWILIO_API_KEY_SID: "SK" + "a".repeat(32), TWILIO_API_KEY_SECRET: "test-only-secret", TWILIO_VERIFY_SERVICE_SID: "VA" + "b".repeat(32) },
    outboundService: async (request: { url: string; text(): Promise<string> }) => {
      assert.equal(new URL(request.url).hostname, "verify.twilio.com");
      const params = new URLSearchParams(await request.text()); sent.push(params);
      assert.ok(['+15555550101','+15555550102'].includes(params.get('To')||''));
      if(sendFailure&&request.url.endsWith('Verifications'))return Response.json({status:'failed'},{status:503});
      return Response.json({ status: request.url.endsWith("VerificationCheck") ? (params.get("Code") === "123456" ? "approved" : "pending") : "pending" });
    }
  }));
  try {
    const db = await mf.getD1Database("DB");
    await db.exec((await readFile('migrations/0031_sms_send_usage.sql','utf8')).replace(/\n/g,' '));
    const schema = await readFile("migrations/0001_invites.sql", "utf8");
    await db.exec(schema.replace(/\n/g, " "));
    await db.exec((await readFile("migrations/0002_editor.sql","utf8")).replace(/\n/g," "));
    await db.exec((await readFile("migrations/0003_scrapbooks.sql","utf8")).replace(/\n/g," "));
    await db.exec((await readFile("migrations/0004_people.sql","utf8")).replace(/\n/g," "));
    await db.batch((await readFile("migrations/0005_shared_invitations.sql","utf8")).split("--> statement-breakpoint").map(sql=>db.prepare(sql)));
    await db.exec((await readFile("migrations/0006_photo_renditions_downloads.sql","utf8")).replace(/\n/g," "));
    await db.exec((await readFile('migrations/0007_photo_uploads.sql','utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0008_media_library.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0009_invitation_sharing.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0010_print_orders.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0011_print_allowance_resets.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0012_google_address_verification.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0013_unpublish.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0015_simulated_mug_orders.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0016_mug_permissions.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0017_immediate_print_permissions.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    const expiry = Math.floor(Date.now()/1000) + 86400;
    await db.prepare("INSERT INTO invites(id,token_hash,name,phone,expires_at) VALUES(?,?,?,?,?)")
      .bind("angela", await digest("a".repeat(64)), "Angela", "+15555550101", expiry).run();
    await db.prepare("INSERT INTO invites(id,token_hash,name,phone,expires_at) VALUES(?,?,?,?,?)")
      .bind("other", await digest("b".repeat(64)), "Other", "+15555550102", expiry).run();
    await db.prepare("INSERT INTO photos(id,invite_id,preview_key,original_key,filename,caption,alt) VALUES('personal','angela','p.jpg','original.jpg','original.jpg','Personal','Sample')").run();
    await db.prepare("INSERT INTO photos(id,invite_id,preview_key,original_key,caption,alt) VALUES('shared',NULL,'s.jpg',NULL,'Shared','Sample')").run();
    await db.prepare("INSERT INTO photos(id,invite_id,preview_key,original_key,caption,alt) VALUES('other-photo','other','other.jpg','other-original.jpg','Other','Sample')").run();
    const bucket = await mf.getR2Bucket("MEDIA");
    await bucket.put("p.jpg", "preview"); await bucket.put("s.jpg", "shared preview");
    const original = new Uint8Array([255,216,255,225,69,88,73,70,0,255,217]);
    await bucket.put("original.jpg", original, {httpMetadata:{contentType:"image/jpeg"}});
    let cookies = "";
    async function req(path: string, data?: unknown, origin = "https://pilot.test") {
      return mf.dispatchFetch("https://pilot.test/api/"+path, {
        method: data === undefined ? "GET" : "POST",
        headers: { Cookie:cookies, Origin:origin, "Content-Type":"application/json" },
        ...(data === undefined ? {} : {body:JSON.stringify(data)})
      });
    }
    await t.test("unauthenticated journal and media are denied", async () => {
      for (const route of ["journal", "media/personal", "media/shared", "media/personal/original"]) assert.equal((await req(route)).status,401);
    });
    await t.test("bad invite and cross-origin writes are denied", async () => {
      assert.equal((await req("open",{token:"c".repeat(64)})).status,401);
      assert.equal((await req("open",{token:"a".repeat(64)},"https://other.test")).status,403);
      const opened = await req("open",{token:"a".repeat(64)});
      assert.equal(opened.status,200);
      const header=opened.headers.get("Set-Cookie")!;
      assert.match(header,/HttpOnly; Secure; SameSite=Strict/);cookies=header.split(";")[0];
      assert.equal((await req("journal")).status,401);
    });
    await t.test("a code cannot be checked before sending; only one simultaneous send is allowed", async () => {
      assert.equal((await req("verify",{code:"123456"})).status,429);
      const results=await Promise.all([req("send",{}),req("send",{})]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
      assert.equal(sent.length,1);
      assert.equal(sent[0].get("Channel"),"sms");
      assert.equal((await db.prepare('SELECT sum(attempts) n FROM sms_send_usage').first<{n:number}>())?.n,1);
    });
    await t.test("global exhaustion blocks Twilio calls and preserves a previously sent code",async()=>{
      const before=await db.prepare("SELECT challenge_expires_at,attempts FROM invites WHERE id='angela'").first();
      await db.prepare("UPDATE invites SET last_sent_at=0 WHERE id='angela'").run();
      await db.prepare('UPDATE sms_send_usage SET attempts=50').run();
      const response=await req('send',{});
      assert.equal(response.status,429);assert.ok(Number(response.headers.get('Retry-After'))>0);
      assert.equal((await response.json() as any).code,'sms_limit_reached');
      assert.equal(sent.length,1,'Exhausted global quota must never contact Twilio');
      assert.deepEqual(await db.prepare("SELECT challenge_expires_at,attempts FROM invites WHERE id='angela'").first(),before);
      await db.prepare('UPDATE sms_send_usage SET attempts=1').run();
    });
    await t.test("wrong code fails; approved code creates session and cannot be replayed", async () => {
      for (let n=0;n<5;n++) assert.equal((await req("verify",{code:"000000"})).status,400);
      assert.equal((await req("verify",{code:"123456"})).status,429);
      // Test-only database reset emulates a fresh SMS challenge; no production bypass.
      await db.prepare("UPDATE invites SET attempts=0 WHERE id='angela'").run();
      const checked=await req("verify",{code:"123456"});assert.equal(checked.status,200);
      cookies += "; " + checked.headers.get("Set-Cookie")!.split(";")[0];
      assert.equal((await req("verify",{code:"123456"})).status,429);
    });
    await t.test("recipient sees only shared and own photos", async () => {
      const response=await req("journal");assert.equal(response.status,200);
      const data=await response.json() as {photos:{id:string;canSave:boolean}[]};
      assert.deepEqual(data.photos.map(p=>p.id),["personal","shared"]);
      assert.deepEqual(data.photos.map(p=>p.canSave),[true,false]);
      assert.equal((await req("media/other-photo")).status,404);
      assert.equal((await req("media/other-photo/original")).status,404);
      assert.equal((await req("media/shared/original")).status,404);
    });
    await t.test('only explicitly versioned public shell assets are browser cacheable',async()=>{
      for(const file of ['app.bundle.js','app.styles.css','theme.js','fonts/asap-variable.woff2']){
        assert.match((await mf.dispatchFetch('https://example.com/'+file+'?v=0123456789abcdef')).headers.get('Cache-Control')!,/public.*immutable/);
        assert.equal((await mf.dispatchFetch('https://example.com/'+file)).headers.get('Cache-Control'),'no-store, private');
      }
      assert.equal((await mf.dispatchFetch('https://example.com/')).headers.get('Cache-Control'),'no-store, private');
      assert.equal((await req('media/personal?v=0123456789abcdef')).headers.get('Cache-Control'),'no-store, private');
    });
    await t.test("original bytes are preserved; protected responses cannot be cached", async () => {
      const response=await req("media/personal/original");assert.equal(response.status,200);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()),original);
      assert.equal(response.headers.get("Cache-Control"),"no-store, private");
      assert.match(response.headers.get("Content-Disposition")!,/attachment/);
      assert.equal(response.headers.get("Referrer-Policy"),"no-referrer");
    });
    await t.test("provider failures retain their global send reservation",async()=>{
      await db.prepare('DELETE FROM sms_send_usage').run();
      await db.prepare("UPDATE invites SET last_sent_at=0 WHERE id='angela'").run();
      sendFailure=true;
      const before=sent.length;
      assert.equal((await req('send',{})).status,503);
      assert.equal(sent.length,before+1);
      assert.equal((await db.prepare('SELECT sum(attempts) n FROM sms_send_usage').first<{n:number}>())?.n,1);
      sendFailure=false;
    });
    await t.test("different invitations race for the last shared daily send",async()=>{
      const other=await req('open',{token:'b'.repeat(64)});
      const otherCookie=other.headers.get('Set-Cookie')!.split(';')[0];
      await db.prepare("UPDATE invites SET last_sent_at=0 WHERE id IN ('angela','other')").run();
      await db.prepare('UPDATE sms_send_usage SET attempts=49').run();
      const before=sent.length;
      const results=await Promise.all([cookies,otherCookie].map(Cookie=>mf.dispatchFetch('https://pilot.test/api/send',{
        method:'POST',headers:{Cookie,Origin:'https://pilot.test','Content-Type':'application/json'},body:'{}'
      })));
      assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(sent.length,before+1);
      assert.equal((await db.prepare('SELECT sum(attempts) n FROM sms_send_usage').first<{n:number}>())?.n,50);
    });
    await t.test("revocation immediately invalidates session and invitation", async () => {
      await db.prepare("UPDATE invites SET revoked_at=1 WHERE id='angela'").run();
      assert.equal((await req("journal")).status,401);
      assert.equal((await req("media/personal")).status,401);
      assert.equal((await req("send",{})).status,401);
    });
  } finally {await mf.dispose();}
});
