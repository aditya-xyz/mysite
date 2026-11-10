import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
const jpeg=(w:number,h:number)=>new Uint8Array([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,1,1,17,0,255,217]);
test('private media reuse and guarded permanent library deletion',async t=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
  const issuer='https://library-test.cloudflareaccess.com',aud='library',email='owner@example.com';
  const jwk={...await exportJWK(publicKey),kid:'library-key',alg:'RS256',use:'sig'};
  const jwt=await new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'library-key'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime('10m').sign(privateKey);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-08-06',scriptPath:'.wrangler/admin-test-bundle/index.js',d1Databases:{DB:'library-db'},r2Buckets:{MEDIA:'library-media'},
    bindings:{ADMIN_EMAIL:email,ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:aud,JOURNAL_ORIGIN:'https://guest.test'},outboundService:async(request:{url:string})=>{assert.equal(request.url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});}
  }));
  async function req(path:string,data?:unknown,origin='https://admin.test',assertion=jwt){
    const encoded=data instanceof FormData?new Request('https://admin.test',{method:'POST',body:data}):null;
    return mf.dispatchFetch('https://admin.test/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Cf-Access-Jwt-Assertion':assertion,'Content-Type':encoded?.headers.get('Content-Type')||(data instanceof Uint8Array?'application/octet-stream':'application/json')},...(data===undefined?{}:{body:encoded?await encoded.arrayBuffer():data instanceof Uint8Array?data:JSON.stringify(data)})});
  }
  const previews=()=>{const form=new FormData();form.set('preview',new File([jpeg(640,800)],'grid.jpg'));form.set('viewer',new File([jpeg(1920,2400)],'viewer.jpg'));return form;};
  const begin=async(bytes:Uint8Array,hash?:string,filename='synthetic.jpg')=>{
    const r=await req('editions/2026/uploads',{filename,mime:'image/jpeg',bytes:bytes.length,...(hash?{hash}:{})});assert.equal(r.status,201,await r.clone().text());return (await r.json() as {id:string}).id;
  };
  const create=async(value:number,fingerprint=true)=>{
    const bytes=new Uint8Array([...jpeg(640,800),value]),hash=createHash('sha256').update(bytes).digest('hex'),id=await begin(bytes,fingerprint?hash:undefined);
    assert.equal((await req(`uploads/${id}/parts/1`,bytes)).status,200);
    assert.equal((await req(`uploads/${id}/complete`,previews())).status,201);return {id,hash,bytes};
  };
  const photo=(id:string)=>({id,caption:'Keep this caption',alt:'Synthetic photo',recipients:[]});
  try{
    const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA');
    for(const file of ['0001_invites.sql','0002_editor.sql','0003_scrapbooks.sql','0004_people.sql'])await db.exec((await readFile('migrations/'+file,'utf8')).replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0005_shared_invitations.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    for(const file of ['0006_photo_renditions_downloads.sql','0007_photo_uploads.sql'])await db.exec((await readFile('migrations/'+file,'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0008_media_library.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0009_invitation_sharing.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    const setDraft=(photos:unknown[])=>db.prepare("UPDATE editions SET draft_json=json_set(draft_json,'$.photos',json(?1)) WHERE year=2026").bind(JSON.stringify(photos)).run();
    const manifest=(id:string)=>({title:'Synthetic',authors:'Test',intro:'Test',note:'Test',sharedTitle:'Test',stories:[],photos:[{...photo(id),preview_key:`2026/${id}/preview.jpg`,viewer_key:`2026/${id}/viewer.jpg`,original_key:`2026/${id}/original`,filename:'synthetic.jpg',mime:'image/jpeg'}]});
    await t.test('lookup, fingerprints and deletion require authentication and same-origin writes',async()=>{
      for(const path of ['media/lookup','media/example/fingerprint','media/example/delete']){
        assert.equal((await req(path,{},undefined,'')).status,401);assert.equal((await req(path,{},'https://other.test')).status,403);
      }
      assert.equal((await req('media/lookup',{hash:'not-a-hash',bytes:12})).status,400);
    });
    const keeper=await create(1);
    await t.test('obsolete sample-gallery references do not block confirmed deletion of unused photos',async()=>{
      for(const id of ['legacy-delete','legacy-keep']){
        await bucket.put(id+'.jpg',jpeg(640,800));
        await db.prepare("INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?2,'image/jpeg',0)").bind(id,id+'.jpg').run();
        await db.prepare("INSERT INTO photos(id,preview_key,caption,alt) VALUES(?1,?2,'Synthetic sample','Illustrative sample')").bind(id,id+'.jpg').run();
      }
      assert.equal((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<{published_json:string|null}>())!.published_json,null);
      assert.equal((await req('media/legacy-delete/delete',{confirm:true})).status,200);
      assert.equal(await db.prepare("SELECT id FROM photos WHERE id='legacy-delete'").first(),null);
      assert.equal(await db.prepare("SELECT id FROM media_objects WHERE id='legacy-delete'").first(),null);
      assert.equal(await bucket.head('legacy-delete.jpg'),null);
      assert.ok(await db.prepare("SELECT id FROM photos WHERE id='legacy-keep'").first());assert.ok(await bucket.head('legacy-keep.jpg'));
      assert.equal((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<{published_json:string|null}>())!.published_json,null,'Deletion must not publish content');
    });
    await t.test('same content with a different filename reuses existing media and restores saved photo metadata',async()=>{
      await setDraft([photo(keeper.id)]);
      const lookup=await req('media/lookup',{hash:keeper.hash,bytes:keeper.bytes.length});assert.equal(lookup.status,200);
      const found=await lookup.json() as {media:{id:string;draftPhoto:unknown}};assert.equal(found.media.id,keeper.id);assert.deepEqual(found.media.draftPhoto,photo(keeper.id));
      const reused=await req('uploads',{filename:'renamed.jpg',mime:'image/jpeg',bytes:keeper.bytes.length,hash:keeper.hash});assert.equal(reused.status,200);
      assert.equal((await reused.json() as {media:{id:string}}).media.id,keeper.id);
      const otherHash=createHash('sha256').update(new Uint8Array([...jpeg(640,800),2])).digest('hex');
      assert.equal((await (await req('media/lookup',{hash:otherHash,bytes:keeper.bytes.length})).json() as {media:unknown}).media,null,'Equal size and name are insufficient');
      assert.equal((await db.prepare('SELECT count(*) n FROM media_objects WHERE original_key IS NOT NULL').first<{n:number}>())!.n,1);
      await setDraft([]);
      assert.equal((await req('editions',{year:2027,title:'Synthetic 2027',authors:'Test'})).status,201);
      const other=await (await req('editions/2027/media/lookup',{hash:keeper.hash,bytes:keeper.bytes.length})).json() as {media:unknown;candidates:unknown[]};assert.equal(other.media,null);assert.deepEqual(other.candidates,[]);
    });
    await t.test('older originals can be fingerprinted without replacing their bytes',async()=>{
      const old=await create(3,false);
      const lookup=await (await req('media/lookup',{hash:old.hash,bytes:old.bytes.length})).json() as {candidates:{id:string}[]};assert.ok(lookup.candidates.some(m=>m.id===old.id));
      const original=await req(`media/${old.id}/original`);assert.deepEqual(new Uint8Array(await original.arrayBuffer()),old.bytes);
      assert.equal((await req(`media/${old.id}/fingerprint`,{hash:old.hash,bytes:old.bytes.length})).status,200);
      assert.equal((await (await req('media/lookup',{hash:old.hash,bytes:old.bytes.length})).json() as {media:{id:string}}).media.id,old.id);
      assert.equal((await req(`media/${old.id}/fingerprint`,{hash:'f'.repeat(64),bytes:old.bytes.length})).status,409);
      assert.equal((await req(`editions/2027/media/${old.id}/fingerprint`,{hash:old.hash,bytes:old.bytes.length})).status,404);
    });
    await t.test('concurrent identical files commit one media item and clean up the redundant upload',async()=>{
      const bytes=new Uint8Array([...jpeg(640,800),4]),hash=createHash('sha256').update(bytes).digest('hex');
      const ids=await Promise.all([begin(bytes,hash),begin(bytes,hash)]);
      for(const id of ids)assert.equal((await req(`uploads/${id}/parts/1`,bytes)).status,200);
      const results=await Promise.all(ids.map(id=>req(`uploads/${id}/complete`,previews())));assert.ok(results.every(r=>r.status===201));
      const media=await Promise.all(results.map(async r=>(await r.json() as {id:string}).id));assert.equal(media[0],media[1]);
      assert.equal((await db.prepare('SELECT count(*) n FROM media_objects WHERE content_hash=?').bind(hash).first<{n:number}>())!.n,1);
      const redundant=ids.find(id=>id!==media[0])!;assert.equal(await bucket.head(`2026/${redundant}/original`),null);
    });
    await t.test('deletion blocks saved drafts and publications and removes unused originals and every rendition',async()=>{
      const item=await create(5),prefix=`2026/${item.id}/`;
      assert.equal((await req(`media/${item.id}/delete`,{})).status,400);
      await setDraft([photo(item.id)]);
      const draftBlocked=await req(`media/${item.id}/delete`,{confirm:true});assert.equal(draftBlocked.status,409);assert.match((await draftBlocked.json() as {error:string}).error,/saved draft for 2026/);assert.ok(await bucket.head(prefix+'original'));
      await setDraft([]);
      await db.prepare('UPDATE editions SET published_json=? WHERE year=2026').bind(JSON.stringify(manifest(item.id))).run();
      const publicationBlocked=await req(`media/${item.id}/delete`,{confirm:true});assert.equal(publicationBlocked.status,409);assert.match((await publicationBlocked.json() as {error:string}).error,/published scrapbook for 2026/);
      const published=JSON.stringify(manifest(keeper.id));await db.prepare('UPDATE editions SET published_json=? WHERE year=2026').bind(published).run();
      await bucket.put(prefix+'previews/old/grid.jpg','historical grid');await bucket.put(prefix+'previews/old/viewer.jpg','historical viewer');
      await db.prepare('UPDATE media_objects SET deleting=1 WHERE id=?').bind(item.id).run();
      await assert.rejects(()=>setDraft([photo(item.id)]),/photo is no longer available/);
      await assert.rejects(()=>db.prepare('UPDATE editions SET published_json=? WHERE year=2026').bind(JSON.stringify(manifest(item.id))).run(),/photo is no longer available/);
      assert.equal((await req(`media/${item.id}/delete`,{confirm:true})).status,200);
      assert.equal(await db.prepare('SELECT id FROM media_objects WHERE id=?').bind(item.id).first(),null);assert.deepEqual((await bucket.list({prefix})).objects,[]);
      assert.ok(await bucket.head(`2026/${keeper.id}/original`));assert.equal((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<{published_json:string}>())!.published_json,published);
      assert.equal((await req(`media/${item.id}/original`)).status,404);
    });
    await t.test('preview-only samples can be deleted without removing another photo’s shared storage keys',async()=>{
      await db.prepare("INSERT INTO media_objects(id,year,preview_key,original_key,filename,mime,bytes) VALUES('unused-sample',2026,?1,NULL,'sample.jpg','image/jpeg',0)").bind(`2026/${keeper.id}/preview.jpg`).run();
      assert.equal((await req('media/unused-sample/delete',{confirm:true})).status,200);assert.ok(await bucket.head(`2026/${keeper.id}/preview.jpg`));
    });
    await t.test('a failed deletion stays unavailable for reuse and can be retried to finish cleanup',async()=>{
      const item=await create(6);
      await db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON media_objects BEGIN SELECT RAISE(ABORT,'synthetic deletion failure'); END");
      try{assert.equal((await req(`media/${item.id}/delete`,{confirm:true})).status,503);}finally{await db.exec('DROP TRIGGER fail_delete');}
      assert.equal((await db.prepare('SELECT deleting FROM media_objects WHERE id=?').bind(item.id).first<{deleting:number}>())!.deleting,1);
      assert.equal((await (await req('media/lookup',{hash:item.hash,bytes:item.bytes.length})).json() as {media:unknown}).media,null);
      assert.equal((await req(`media/${item.id}/delete`,{confirm:true})).status,200);assert.equal(await db.prepare('SELECT id FROM media_objects WHERE id=?').bind(item.id).first(),null);
      assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
    });
  }finally{await mf.dispose();}
});
