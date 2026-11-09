import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {digest} from '../src/security.ts';
import type {Draft} from '../src/edition.ts';

test('persistent people, migration compatibility, and explicit scrapbook invitations',async t=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
  const issuer='https://people-test.cloudflareaccess.com',aud='people-test',email='owner@example.com';
  const jwk={...await exportJWK(publicKey),kid:'people-key',alg:'RS256',use:'sig'};
  const jwt=await new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'people-key'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime('10m').sign(privateKey);
  const outbound=async(request:{url:string})=>{assert.equal(request.url,issuer+'/cdn-cgi/access/certs','People and invitations must never send SMS');return Response.json({keys:[jwk]});};
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[
    {name:'admin',routes:['admin.test/*'],modules:true,scriptPath:'.wrangler/admin-test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'people-db'},r2Buckets:{MEDIA:'people-media'},bindings:{ADMIN_EMAIL:email,ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:aud,JOURNAL_ORIGIN:'https://guest.test'},outboundService:outbound},
    {name:'guest',routes:['guest.test/*'],modules:true,scriptPath:'.wrangler/test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'people-db'},r2Buckets:{MEDIA:'people-media'},bindings:{SMS_ENABLED:'false'},outboundService:outbound}
  ]}));
  const req=(path:string,data?:unknown,origin='https://admin.test',assertion=jwt)=>mf.dispatchFetch('https://admin.test/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json','Cf-Access-Jwt-Assertion':assertion},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const guest=(path:string,session:string)=>mf.dispatchFetch('https://guest.test/api/'+path,{headers:{Cookie:'__Host-year_session='+session}});
  try{
    const db=await mf.getD1Database('DB','admin'),bucket=await mf.getR2Bucket('MEDIA','admin');
    const migrate=async(file:string)=>db.exec((await readFile('migrations/'+file,'utf8')).replace(/\n/g,' '));
    for(const file of ['0001_invites.sql','0002_editor.sql','0003_scrapbooks.sql'])await migrate(file);
    const expiry=Math.floor(Date.now()/1000)+86400;
    const draft=(await db.prepare('SELECT draft_json FROM editions WHERE year=2026').first<{draft_json:string}>())!;
    await db.prepare('INSERT INTO editions(year,draft_json) VALUES(2027,?)').bind(draft.draft_json).run();
    for(const [id,year,raw,name] of [['angela',2026,'a'.repeat(64),'Angela'],['person-123456789012345678901234',2027,'b'.repeat(64),'Angela Newer']] as const){
      await db.prepare('INSERT INTO invites(id,edition_year,token_hash,name,phone,expires_at,challenge_expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,year,await digest(raw),name,'+15555550101',expiry,expiry).run();
      await db.prepare('INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,?)').bind(await digest(raw),id,expiry).run();
    }
    const original=new Uint8Array([255,216,255,225,69,88,73,70,255,217]);
    await bucket.put('legacy-preview','sample');await bucket.put('legacy-original',original);
    await db.prepare("INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes) VALUES('legacy-photo',2026,'legacy-preview','legacy-original','original.jpg','image/jpeg',10)").run();
    const oldDraft:Draft={...JSON.parse(draft.draft_json),photos:[{id:'legacy-photo',caption:'Memory',alt:'Sample',recipients:['angela']}]};
    const oldPublished={...oldDraft,photos:[{...oldDraft.photos[0],preview_key:'legacy-preview',original_key:'legacy-original',filename:'original.jpg',mime:'image/jpeg'}]};
    const publishedJSON=JSON.stringify(oldPublished),draftJSON=JSON.stringify(oldDraft);
    await db.prepare('UPDATE editions SET draft_json=?,published_json=?,published_version=1 WHERE year=2026').bind(draftJSON,publishedJSON).run();
    const second={...oldPublished,photos:[{...oldPublished.photos[0],recipients:['person-123456789012345678901234']}]};
    await db.prepare('UPDATE editions SET published_json=?,published_version=1 WHERE year=2027').bind(JSON.stringify(second)).run();
    const before=(await db.prepare('SELECT id,token_hash,name,phone,expires_at,revoked_at,challenge_expires_at FROM invites ORDER BY id').all()).results;
    await migrate('0004_people.sql');
    let oldPerson='',newPerson='',version=1,inviteId='',newRaw='';
    await t.test('migration links existing invitations without changing tokens, sessions, or manifests',async()=>{
      const contacts=await (await req('contacts')).json() as {people:{id:string;name:string;version:number}[]};
      assert.equal(contacts.people.length,1);oldPerson=contacts.people[0].id;assert.equal(contacts.people[0].name,'Angela Newer');
      assert.deepEqual((await db.prepare('SELECT id,token_hash,name,phone,expires_at,revoked_at,challenge_expires_at FROM invites ORDER BY id').all()).results,before);
      assert.equal((await db.prepare('SELECT count(*) n FROM sessions').first<{n:number}>())!.n,2);
      const edition=(await db.prepare('SELECT draft_json,published_json FROM editions WHERE year=2026').first<{draft_json:string;published_json:string}>())!;
      assert.equal(edition.draft_json,draftJSON);assert.equal(edition.published_json,publishedJSON);
      for(const raw of ['a'.repeat(64),'b'.repeat(64)])assert.equal((await guest('media/legacy-photo/original',raw)).status,200);
      assert.deepEqual(new Uint8Array(await (await guest('media/legacy-photo/original','a'.repeat(64))).arrayBuffer()),original);
      const opened=await mf.dispatchFetch('https://guest.test/api/open',{method:'POST',headers:{Origin:'https://guest.test','Content-Type':'application/json'},body:JSON.stringify({token:'a'.repeat(64)})});assert.equal(opened.status,200);
      const state=await (await req('editions/2026/state')).json() as {draft:Draft};assert.deepEqual(state.draft.photos[0].recipients,[oldPerson]);
    });
    await t.test('directory creation is protected, unique by phone, and creates no invitations',async()=>{
      assert.equal((await req('contacts',undefined,undefined,'')).status,401);
      assert.equal((await req('contacts',{name:'Jordan',phone:'+15555550102'},'https://other.test')).status,403);
      const count=(await db.prepare('SELECT count(*) n FROM invites').first<{n:number}>())!.n;
      const responses=await Promise.all([1,2].map(()=>req('contacts',{name:'Jordan',phone:'+15555550102'})));
      assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
      const result=await responses.find(r=>r.status===201)!.json() as {person:{id:string}};newPerson=result.person.id;assert.ok(!('url' in result));
      assert.equal((await db.prepare('SELECT count(*) n FROM invites').first<{n:number}>())!.n,count);
    });
    await t.test('uninvited people can be assigned in a draft but cannot be published or access media',async()=>{
      oldDraft.photos[0].recipients=[newPerson];
      const saved=await req('editions/2026/draft',{version:1,draft:oldDraft});assert.equal(saved.status,200);version=(await saved.json() as {version:number}).version;
      assert.equal((await req('editions/2026/publish',{version})).status,400);
      const preview=await (await req('editions/2026/preview?recipient='+newPerson)).json() as {photos:{id:string}[]};assert.equal(preview.photos[0].id,'legacy-photo');
      assert.equal((await guest('media/legacy-photo/original','a'.repeat(64))).status,200,'Old published audience must persist until explicit publication');
      assert.equal((await guest('media/legacy-photo/original','z'.repeat(64))).status,401);
    });
    await t.test('explicit invitations reuse directory identities and never rotate an existing link implicitly',async()=>{
      const created=await req('editions/2026/invitations',{personId:newPerson});assert.equal(created.status,201);
      const result=await created.json() as {id:string;url:string};inviteId=result.id;newRaw=result.url.split('#')[1];
      const record=(await db.prepare('SELECT person_id,token_hash FROM invites WHERE id=?').bind(inviteId).first<{person_id:string;token_hash:string}>())!;
      assert.equal(record.person_id,newPerson);assert.equal(record.token_hash,await digest(newRaw));
      assert.equal((await req('editions/2026/invitations',{personId:newPerson})).status,409);
      assert.equal((await db.prepare('SELECT token_hash FROM invites WHERE id=?').bind(inviteId).first<{token_hash:string}>())!.token_hash,record.token_hash);
      assert.equal((await req('editions/2027/invitations',{personId:newPerson})).status,201);
      assert.equal((await req('editions/2026/invitations',{personId:'missing'})).status,404);
      assert.equal((await db.prepare('SELECT count(*) n FROM sessions').first<{n:number}>())!.n,2);
    });
    await t.test('published person-based audiences preserve personal originals and year isolation',async()=>{
      assert.equal((await req('editions/2026/publish',{version})).status,200);
      await db.prepare('INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,?)').bind(await digest(newRaw),inviteId,expiry).run();
      assert.deepEqual(new Uint8Array(await (await guest('media/legacy-photo/original',newRaw)).arrayBuffer()),original);
      assert.equal((await guest('media/legacy-photo/original','a'.repeat(64))).status,404);
      assert.equal((await guest('media/legacy-photo/original','b'.repeat(64))).status,200,'2027 still uses its untouched legacy manifest');
    });
    await t.test('global edits use version checks and phone changes invalidate all linked sessions without rotating links',async()=>{
      const name=await req(`contacts/${oldPerson}/details`,{version:1,name:'Angela Updated',phone:'+15555550101'});assert.equal(name.status,200);
      assert.equal((await guest('journal','b'.repeat(64))).status,200,'Name-only edits retain sessions');
      assert.equal((await req(`contacts/${oldPerson}/details`,{version:1,name:'Stale',phone:'+15555550109'})).status,409);
      assert.equal((await req(`contacts/${oldPerson}/details`,{version:2,name:'Angela Updated',phone:'+15555550109'})).status,200);
      for(const raw of ['a'.repeat(64),'b'.repeat(64)])assert.equal((await guest('journal',raw)).status,401);
      const after=(await db.prepare('SELECT id,token_hash,phone,challenge_expires_at FROM invites WHERE person_id=? ORDER BY id').bind(oldPerson).all<{id:string;token_hash:string;phone:string;challenge_expires_at:number}>()).results;
      assert.equal(after.length,2);for(const row of after){assert.equal(row.token_hash,before.find(i=>i.id===row.id)!.token_hash);assert.equal(row.phone,'+15555550109');assert.equal(row.challenge_expires_at,0);}
      assert.equal((await guest('journal',newRaw)).status,200,'Another person retains their session');
    });
  }finally{await mf.dispose();}
});
