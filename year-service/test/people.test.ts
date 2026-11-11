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
  const verificationPhones:string[]=[];
  const outbound=async(request:{url:string;text():Promise<string>})=>{
    if(request.url.startsWith('https://verify.twilio.com/')){
      const body=new URLSearchParams(await request.text());verificationPhones.push(body.get('To')!);
      return Response.json({status:request.url.endsWith('VerificationCheck')?'approved':'pending'});
    }
    assert.equal(request.url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});
  };
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[
    {name:'admin',routes:['admin.test/*'],modules:true,scriptPath:'.wrangler/admin-test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'people-db'},r2Buckets:{MEDIA:'people-media'},bindings:{ADMIN_EMAIL:email,ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:aud,JOURNAL_ORIGIN:'https://guest.test'},outboundService:outbound},
    {name:'guest',routes:['guest.test/*'],modules:true,scriptPath:'.wrangler/test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:{DB:'people-db'},r2Buckets:{MEDIA:'people-media'},bindings:{SMS_ENABLED:'true',TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'local-test-only',TWILIO_VERIFY_SERVICE_SID:'VA'+'0'.repeat(32)},outboundService:outbound}
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
    await bucket.put('legacy-preview',new Uint8Array([255,216,255,192,0,11,8,7,128,4,56,1,1,17,0,255,217]));await bucket.put('legacy-original',original);
    await db.prepare("INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes) VALUES('legacy-photo',2026,'legacy-preview','legacy-original','original.jpg','image/jpeg',10)").run();
    const oldDraft:Draft={...JSON.parse(draft.draft_json),photos:[{id:'legacy-photo',caption:'Memory',alt:'Sample',recipients:['angela']}]};
    const oldPublished={...oldDraft,photos:[{...oldDraft.photos[0],preview_key:'legacy-preview',original_key:'legacy-original',filename:'original.jpg',mime:'image/jpeg'}]};
    const publishedJSON=JSON.stringify(oldPublished),draftJSON=JSON.stringify(oldDraft);
    await db.prepare('UPDATE editions SET draft_json=?,published_json=?,published_version=1 WHERE year=2026').bind(draftJSON,publishedJSON).run();
    const second={...oldPublished,photos:[{...oldPublished.photos[0],recipients:['person-123456789012345678901234']}]};
    await db.prepare('UPDATE editions SET published_json=?,published_version=1 WHERE year=2027').bind(JSON.stringify(second)).run();
    const before=(await db.prepare('SELECT id,token_hash,name,phone,expires_at,revoked_at,challenge_expires_at FROM invites ORDER BY id').all()).results;
    await migrate('0004_people.sql');
    await db.batch((await readFile('migrations/0005_shared_invitations.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.exec((await readFile("migrations/0006_photo_renditions_downloads.sql","utf8")).replace(/\n/g," "));
    await db.exec((await readFile('migrations/0007_photo_uploads.sql','utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0008_media_library.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.prepare('UPDATE editions SET published_at=unixepoch() WHERE year=2026').run();
    await db.batch((await readFile('migrations/0009_invitation_sharing.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0010_print_orders.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0011_print_allowance_resets.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0012_google_address_verification.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    let oldPerson='',newPerson='',version=1,inviteId='',newRaw='';
    await t.test('migration links existing invitations without changing tokens, sessions, or manifests',async()=>{
      const contacts=await (await req('contacts')).json() as {people:{id:string;name:string;version:number}[]};
      assert.equal(contacts.people.length,1);oldPerson=contacts.people[0].id;assert.equal(contacts.people[0].name,'Angela Newer');
      assert.deepEqual((await db.prepare('SELECT id,token_hash,name,phone,expires_at,revoked_at,challenge_expires_at FROM invites ORDER BY id').all()).results,before);
      assert.equal((await db.prepare('SELECT count(*) n FROM sessions').first<{n:number}>())!.n,2);
      const edition=(await db.prepare('SELECT draft_json,published_json FROM editions WHERE year=2026').first<{draft_json:string;published_json:string}>())!;
      assert.equal(edition.draft_json,draftJSON);assert.equal(edition.published_json,publishedJSON);
      assert.equal((await guest('media/legacy-photo/original','a'.repeat(64))).status,200);
      assert.equal((await guest('media/legacy-photo/original','b'.repeat(64))).status,409,'Only the last published year remains active');
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
      assert.equal((await guest('media/legacy-photo/original','b'.repeat(64))).status,409,'Inactive 2027 keeps its manifest but closes guest access');
    });
    await t.test('global edits use version checks and phone changes invalidate all linked sessions without rotating links',async()=>{
      const name=await req(`contacts/${oldPerson}/details`,{version:1,name:'Angela Updated',phone:'+15555550101'});assert.equal(name.status,200);
      assert.equal((await guest('journal',newRaw)).status,200,'Name-only edits retain active sessions');
      assert.equal((await guest('journal','b'.repeat(64))).status,409,'Inactive year remains closed');
      assert.equal((await req(`contacts/${oldPerson}/details`,{version:1,name:'Stale',phone:'+15555550109'})).status,409);
      assert.equal((await req(`contacts/${oldPerson}/details`,{version:2,name:'Angela Updated',phone:'+15555550109'})).status,200);
      for(const raw of ['a'.repeat(64),'b'.repeat(64)])assert.equal((await guest('journal',raw)).status,401);
      const after=(await db.prepare('SELECT id,token_hash,phone,challenge_expires_at FROM invites WHERE person_id=? ORDER BY id').bind(oldPerson).all<{id:string;token_hash:string;phone:string;challenge_expires_at:number}>()).results;
      assert.equal(after.length,2);for(const row of after){assert.equal(row.token_hash,before.find(i=>i.id===row.id)!.token_hash);assert.equal(row.phone,'+15555550109');assert.equal(row.challenge_expires_at,0);}
      assert.equal((await guest('journal',newRaw)).status,200,'Another person retains their session');
    });

    let ben='',jerry='',coupleId='',coupleRaw='',coupleVersion=1;
    const inviteCookie=()=>({'Cookie':'__Host-year_invite='+coupleRaw,Origin:'https://guest.test','Content-Type':'application/json'});
    await t.test('couples include a person without a phone, but need exactly one included verification contact',async()=>{
      ben=(await (await req('contacts',{name:'Ben',phone:'+15555550110'})).json() as {person:{id:string}}).person.id;
      jerry=(await (await req('contacts',{name:'Jerry'})).json() as {person:{id:string}}).person.id;
      assert.equal((await req('contacts',{name:'Another partner',phone:''})).status,201,'Multiple people may have no phone');
      for(const data of [
        {memberIds:[ben,jerry],verificationContactId:jerry,addressedTo:'Ben & Jerry'},
        {memberIds:[jerry],verificationContactId:ben,addressedTo:'Ben & Jerry'},
        {memberIds:[ben,ben],verificationContactId:ben,addressedTo:'Ben & Ben'},
        {memberIds:[ben,'missing'],verificationContactId:ben,addressedTo:'Friends'},
        {memberIds:[ben,jerry],verificationContactId:ben,addressedTo:' '}
      ])assert.ok([400,404].includes((await req('editions/2026/invitations',data)).status));
      const created=await req('editions/2026/invitations',{memberIds:[ben,jerry],verificationContactId:ben,addressedTo:'Ben & Jerry'});
      assert.equal(created.status,201);const data=await created.json() as {id:string;url:string};coupleId=data.id;coupleRaw=data.url.split('#')[1];
      assert.equal(verificationPhones.length,0,'Admin creation must never send a text');
      const opened=await mf.dispatchFetch('https://guest.test/api/open',{method:'POST',headers:{Origin:'https://guest.test','Content-Type':'application/json'},body:JSON.stringify({token:coupleRaw})});
      assert.equal((await opened.json() as {name:string}).name,'Ben & Jerry');
      const entry=await (await mf.dispatchFetch('https://guest.test/api/invitation',{headers:inviteCookie()})).json() as {name:string;verificationName:string;phoneHint:string;phone?:string};
      assert.equal(entry.name,'Ben & Jerry');assert.equal(entry.verificationName,'Ben');assert.equal(entry.phoneHint,'0110');assert.equal(entry.phone,undefined);
      assert.equal((await req(`contacts/${ben}/details`,{version:1,name:'Ben',phone:''})).status,400,'Cannot remove an in-use verification phone');
    });
    await t.test('shared invitation SMS verification uses only its chosen contact',async()=>{
      assert.equal((await mf.dispatchFetch('https://guest.test/api/send',{method:'POST',headers:inviteCookie(),body:'{}'})).status,200);
      const verified=await mf.dispatchFetch('https://guest.test/api/verify',{method:'POST',headers:inviteCookie(),body:JSON.stringify({code:'123456'})});
      assert.equal(verified.status,200);assert.deepEqual(verificationPhones,['+15555550110','+15555550110']);
      const session=verified.headers.get('Set-Cookie')!.match(/__Host-year_session=([^;]+)/)![1];
      assert.equal((await guest('journal',session)).status,200);
    });
    await t.test('one QR exposes either partner’s personal photos and originals, with shared and year isolation',async()=>{
      const photo=(id:string,recipients:string[])=>({id,caption:id,alt:'Sample',recipients,preview_key:'legacy-preview',original_key:'legacy-original',filename:'original.jpg',mime:'image/jpeg'});
      const grouped={...oldPublished,photos:[photo('for-ben',[ben]),photo('for-jerry',[jerry]),photo('unrelated',[newPerson]),{...photo('shared',[]),original_key:null}]};
      for(const item of grouped.photos)await db.prepare('INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes) VALUES(?1,2026,?2,?3,?4,?5,0)').bind(item.id,item.preview_key,item.original_key,item.filename,item.mime).run();
      await db.prepare('UPDATE editions SET published_json=? WHERE year=2026').bind(JSON.stringify(grouped)).run();
      await db.prepare('INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?,?,?)').bind(await digest(coupleRaw),coupleId,expiry).run();
      const journal=await (await guest('journal',coupleRaw)).json() as {name:string;photos:{id:string}[]};
      assert.equal(journal.name,'Ben & Jerry');assert.equal((journal.photos[0] as {width?:number}).width,1080);assert.equal((journal.photos[0] as {height?:number}).height,1920);assert.deepEqual(journal.photos.map(p=>p.id),['for-ben','for-jerry','shared']);
      for(const id of ['for-ben','for-jerry'])assert.deepEqual(new Uint8Array(await (await guest('media/'+id+'/original',coupleRaw)).arrayBuffer()),original);
      for(const path of ['media/unrelated','media/unrelated/original','media/shared/original','media/legacy-photo'])assert.equal((await guest(path,coupleRaw)).status,404);
      assert.equal((await guest('media/for-jerry',newRaw)).status,404);
      const editable={...oldDraft,photos:[{id:'legacy-photo',caption:'For Jerry',alt:'Sample',recipients:[jerry]}]};
      const saved=await req('editions/2026/draft',{version,draft:editable});version=(await saved.json() as {version:number}).version;
      assert.equal((await req('editions/2026/publish',{version})).status,200,'Partner is covered by the couple invitation');
      const manifest=JSON.parse((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<{published_json:string}>())!.published_json);assert.equal(manifest.photos[0].width,1080);assert.equal(manifest.photos[0].height,1920);
      const preview=await (await req('editions/2026/preview?invitation='+coupleId)).json() as {name:string;photos:{id:string}[]};
      assert.equal(preview.name,'Ben & Jerry');assert.equal(preview.photos[0].id,'legacy-photo');
      assert.equal((await req('editions/2027/preview?invitation='+coupleId)).status,404);
    });
    await t.test('editable greeting retains sessions and tokens; audience changes end sessions and pending codes',async()=>{
      const update=(memberIds:string[],verificationContactId:string,addressedTo:string,v=coupleVersion)=>req(`editions/2026/invitations/${coupleId}/details`,{memberIds,verificationContactId,addressedTo,version:v});
      assert.equal((await update([ben,jerry],ben,'Ben and Jerry')).status,200);coupleVersion++;
      assert.equal((await guest('journal',coupleRaw)).status,200,'Greeting-only edits retain sessions');
      assert.equal((await update([ben,jerry],ben,'Stale',1)).status,409);
      await db.prepare('UPDATE invites SET challenge_expires_at=? WHERE id=?').bind(expiry,coupleId).run();
      assert.equal((await update([ben],ben,'Ben')).status,200);coupleVersion++;
      assert.equal((await guest('journal',coupleRaw)).status,401);
      const record=(await db.prepare('SELECT token_hash,challenge_expires_at FROM invites WHERE id=?').bind(coupleId).first<{token_hash:string;challenge_expires_at:number}>())!;
      assert.equal(record.token_hash,await digest(coupleRaw));assert.equal(record.challenge_expires_at,0);
      const opened=await mf.dispatchFetch('https://guest.test/api/open',{method:'POST',headers:{Origin:'https://guest.test','Content-Type':'application/json'},body:JSON.stringify({token:coupleRaw})});assert.equal(opened.status,200,'Same QR remains valid');
      assert.equal((await req('editions/2026/publish',{version})).status,400,'Removed partner needs an active invitation again');
      await db.prepare('UPDATE people SET phone=? WHERE id=?').bind('+15555550111',jerry).run();
      assert.equal((await update([ben,jerry],jerry,'The two of you')).status,200);coupleVersion++;
      const entry=await (await mf.dispatchFetch('https://guest.test/api/invitation',{headers:inviteCookie()})).json() as {verificationName:string;phoneHint:string};assert.equal(entry.verificationName,'Jerry');assert.equal(entry.phoneHint,'0111');
      assert.equal((await req(`editions/2026/people/${coupleId}/revoke`,{})).status,200);
      assert.equal((await mf.dispatchFetch('https://guest.test/api/invitation',{headers:inviteCookie()})).status,401);
      assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
    });
    await t.test('contact deletion requires auth and current version, and protects all stored references',async()=>{
      const created=await req('contacts',{name:'Disposable contact'});assert.equal(created.status,201);
      const {person}=await created.json() as {person:{id:string;version:number}};
      const path=`contacts/${person.id}/delete`;
      assert.equal((await req(path,{version:person.version},'https://evil.test')).status,403);
      assert.equal((await req(path,{version:person.version},undefined,'')).status,401);
      assert.equal((await req(path,{})).status,400);
      assert.equal((await req(path,{version:person.version+1})).status,409);
      await db.prepare("INSERT INTO editions(year,draft_json) SELECT 2028,json_set(draft_json,'$.photos',json('[]')) FROM editions WHERE year=2026").run();
      const saved=await db.prepare('SELECT draft_json,published_json FROM editions WHERE year=2028').first<{draft_json:string;published_json:string|null}>();
      await db.prepare("INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES('reference-check',2028,'reference-preview','sample.jpg','image/jpeg',10)").run();
      const referenced={...JSON.parse(saved!.draft_json),photos:[{id:'reference-check',caption:'Sample',alt:'Sample',recipients:[person.id],hidden:true}]};
      await db.prepare('UPDATE editions SET draft_json=? WHERE year=2028').bind(JSON.stringify(referenced)).run();
      assert.equal((await req(path,{version:person.version})).status,409,'Hidden draft assignments stay protected');
      await db.prepare('UPDATE editions SET draft_json=?,published_json=? WHERE year=2028').bind(saved!.draft_json,JSON.stringify(referenced)).run();
      assert.equal((await req(path,{version:person.version})).status,409,'Older publications stay protected');
      await db.prepare('UPDATE editions SET published_json=? WHERE year=2028').bind(saved!.published_json).run();
      const active=await db.prepare('SELECT id,member_ids,person_id FROM invites LIMIT 1').first<{id:string;member_ids:string;person_id:string}>();
      await db.prepare('UPDATE invites SET member_ids=? WHERE id=?').bind(JSON.stringify([active!.person_id,person.id]),active!.id).run();
      assert.equal((await req(path,{version:person.version})).status,409,'Household invitation membership stays protected');
      await db.prepare('UPDATE invites SET member_ids=? WHERE id=?').bind(active!.member_ids,active!.id).run();
      await db.prepare("INSERT INTO address_verification_challenges VALUES('delete-test',?,?,?,'local_mock',?,?)").bind(person.id,person.version,'{}',expiry-86400,expiry).run();
      assert.equal((await req(path,{version:person.version})).status,200);
      assert.equal(await db.prepare('SELECT id FROM people WHERE id=?').bind(person.id).first(),null);
      assert.equal(await db.prepare("SELECT id FROM address_verification_challenges WHERE id='delete-test'").first(),null);
      assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
    });
  }finally{await mf.dispose();}
});
