import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
// @ts-expect-error Browser upload helper is plain JavaScript.
import {uploadPhoto} from '../admin/client/photo-upload.js';
// @ts-expect-error Browser transport is plain JavaScript.
import {ApiError} from '../admin/client/api-request.js';
const jpeg=(w:number,h:number)=>new Uint8Array([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,1,1,17,0,255,217]);
test('private bounded uploads of originals under 100 MB',async t=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
  const issuer='https://uploads-test.cloudflareaccess.com',aud='uploads',email='owner@example.com';
  const jwk={...await exportJWK(publicKey),kid:'upload-key',alg:'RS256',use:'sig'};
  const jwt=await new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'upload-key'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime('10m').sign(privateKey);
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-08-06',scriptPath:'.wrangler/admin-test-bundle/index.js',d1Databases:{DB:'uploads-db'},r2Buckets:{MEDIA:'uploads-media'},
    bindings:{ADMIN_EMAIL:email,ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:aud,JOURNAL_ORIGIN:'https://guest.test'},
    outboundService:async(request:{url:string})=>{assert.equal(request.url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});}
  }));
  async function req(path:string,data:unknown={},origin='https://admin.test',assertion=jwt){
    const encoded=data instanceof FormData?new Request('https://admin.test',{method:'POST',body:data}):null;
    return mf.dispatchFetch('https://admin.test/api/'+path,{method:'POST',headers:{Origin:origin,'Cf-Access-Jwt-Assertion':assertion,'Content-Type':encoded?.headers.get('Content-Type')||(data instanceof Uint8Array?'application/octet-stream':'application/json')},body:encoded?await encoded.arrayBuffer():data instanceof Uint8Array?data:JSON.stringify(data)});
  }
  const start=async(bytes:number,mime='image/jpeg')=>{
    const r=await req('editions/2026/uploads',{filename:'synthetic-original.jpg',mime,bytes});assert.equal(r.status,201,await r.clone().text());
    return await r.json() as {id:string;chunkBytes:number};
  };
  const previews=(grid=jpeg(640,800),viewer=jpeg(1920,2400))=>{
    const form=new FormData();form.set('preview',new File([grid],'grid.jpg'));form.set('viewer',new File([viewer],'viewer.jpg'));return form;
  };
  try{
    const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA');
    for(const file of ['0001_invites.sql','0002_editor.sql','0003_scrapbooks.sql','0004_people.sql'])await db.exec((await readFile('migrations/'+file,'utf8')).replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0005_shared_invitations.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    for(const file of ['0006_photo_renditions_downloads.sql','0007_photo_uploads.sql'])await db.exec((await readFile('migrations/'+file,'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0008_media_library.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await t.test('new upload APIs retain authentication, same-origin and year checks',async()=>{
      for(const path of ['uploads','uploads/photo-'+('a'.repeat(24))+'/parts/1','uploads/photo-'+('a'.repeat(24))+'/complete','uploads/photo-'+('a'.repeat(24))+'/abort']){
        assert.equal((await req('editions/2026/'+path,{},undefined,'')).status,401);
        assert.equal((await req('editions/2026/'+path,{},'https://other.test')).status,403);
      }
      assert.equal((await req('editions/2027/uploads',{filename:'test.jpg',mime:'image/jpeg',bytes:12})).status,404);
    });
    await t.test('server rejects 100 MB, larger files, empty files and unsupported types before creating storage',async()=>{
      for(const bytes of [0,-1,100_000_000,100_000_001,1.5])assert.equal((await req('uploads',{filename:'test.jpg',mime:'image/jpeg',bytes})).status,413);
      assert.equal((await req('uploads',{filename:'test.heic',mime:'image/heic',bytes:100})).status,400);
      assert.equal((await db.prepare('SELECT count(*) n FROM photo_uploads').first<{n:number}>())!.n,0);
    });
    await t.test('99,999,999-byte original retains every byte and EXIF marker without publishing',async()=>{
      const bytes=99_999_999,session=await start(bytes),expected=createHash('sha256');
      assert.equal(session.chunkBytes,8*1024*1024);
      const chunk=new Uint8Array(session.chunkBytes);chunk.fill(37);
      for(let offset=0,part=1;offset<bytes;offset+=session.chunkBytes,part++){
        chunk.fill(part);if(part===1)chunk.set([255,216,255,225,0,8,69,120,105,102,0,0]);
        const value=chunk.subarray(0,Math.min(chunk.length,bytes-offset));expected.update(value);
        const r=await req(`uploads/${session.id}/parts/${part}`,value);assert.equal(r.status,200,await r.clone().text());
      }
      assert.equal(await bucket.head(`2026/${session.id}/original`),null,'Multipart original is not visible before completion');
      assert.equal(await db.prepare('SELECT id FROM media_objects WHERE id=?').bind(session.id).first(),null);
      const r=await req(`uploads/${session.id}/complete`,previews());assert.equal(r.status,201,await r.clone().text());
      const media=await r.json() as {id:string;bytes:number;has_original:boolean;has_viewer:boolean};assert.equal(media.bytes,bytes);assert.ok(media.has_original&&media.has_viewer);
      const stored=(await bucket.get(`2026/${session.id}/original`))!,actual=createHash('sha256');
      const reader=stored.body.getReader();for(;;){const {value,done}=await reader.read();if(done)break;actual.update(value);}
      assert.equal(actual.digest('hex'),expected.digest('hex'));
      assert.deepEqual(new Uint8Array(await (await bucket.get(`2026/${session.id}/preview.jpg`))!.arrayBuffer()),jpeg(640,800));
      assert.deepEqual(new Uint8Array(await (await bucket.get(`2026/${session.id}/viewer.jpg`))!.arrayBuffer()),jpeg(1920,2400));
      assert.equal((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<{published_json:string|null}>())!.published_json,null);
      assert.equal(await db.prepare('SELECT id FROM photo_uploads WHERE id=?').bind(session.id).first(),null);
      assert.equal((await req(`uploads/${session.id}/complete`,previews())).status,201,'Lost success response can be retried');
      assert.equal((await req(`uploads/${session.id}/abort`)).status,404,'Completed original cannot be deleted by abort');
      assert.ok(await bucket.head(`2026/${session.id}/original`));
    });
    await t.test('incomplete, oversized, out-of-order and disguised parts cannot complete',async()=>{
      const s=await start(20);
      assert.equal((await req(`uploads/${s.id}/complete`,previews())).status,409);
      assert.equal((await req(`uploads/${s.id}/parts/2`,new Uint8Array(20))).status,409);
      assert.equal((await req(`uploads/${s.id}/parts/1`,new Uint8Array(21))).status,413);
      assert.equal((await req(`uploads/${s.id}/parts/1`,new Uint8Array(19))).status,400);
      assert.equal((await req(`uploads/${s.id}/parts/1`,new Uint8Array(20))).status,200,'Raw transfer does not decode the original in JS');
      assert.equal((await req(`uploads/${s.id}/complete`,previews())).status,400,'Actual stored image type must be validated before a library item exists');
      assert.equal((await req(`uploads/${s.id}/abort`)).status,404,'Invalid originals are cleaned up automatically');
      assert.equal(await db.prepare('SELECT id FROM photo_uploads WHERE id=?').bind(s.id).first(),null);
      assert.equal(await bucket.head(`2026/${s.id}/original`),null);
    });
    await t.test('invalid previews preserve the pending upload; valid previews finalize once',async()=>{
      const value=jpeg(640,800),s=await start(value.length);
      const responses=await Promise.all([req(`uploads/${s.id}/parts/1`,value),req(`uploads/${s.id}/parts/1`,value)]);
      assert.ok(responses.every(r=>r.status===200),'Concurrent retries are safe and cannot leave a busy lock');
      assert.equal((await req(`uploads/${s.id}/parts/1`,value)).status,200,'A lost part response is safe to retry');
      assert.equal(JSON.parse((await db.prepare('SELECT parts_json FROM photo_uploads WHERE id=?').bind(s.id).first<{parts_json:string}>())!.parts_json).length,1);
      assert.equal((await req(`uploads/${s.id}/complete`,previews(jpeg(801,801)))).status,400);
      assert.equal((await req(`uploads/${s.id}/complete`,previews(jpeg(640,800),jpeg(2400,1800)))).status,400);
      assert.ok(await db.prepare('SELECT id FROM photo_uploads WHERE id=?').bind(s.id).first());
      const pending=(await db.prepare('SELECT * FROM photo_uploads WHERE id=?').bind(s.id).first<{upload_id:string}>())!;
      assert.equal((await req(`uploads/${s.id}/complete`,previews())).status,201);
      // Recover stale session state after a successful commit without deleting the photo.
      await db.prepare("INSERT INTO photo_uploads(id,year,actor,filename,mime,bytes,upload_id,created_at) VALUES(?1,2026,?2,'test.jpg','image/jpeg',?3,?4,unixepoch()-86401)")
        .bind(s.id,email,value.length,pending.upload_id).run();
      assert.equal((await req(`uploads/${s.id}/abort`)).status,410);
      assert.ok(await bucket.head(`2026/${s.id}/original`));
      assert.equal(await db.prepare('SELECT id FROM photo_uploads WHERE id=?').bind(s.id).first(),null);
    });
    await t.test('stored original magic bytes must match the declared image type before registration',async()=>{
      const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,0,0,0,0]),s=await start(bytes.length,'image/jpeg');
      assert.equal((await req(`uploads/${s.id}/parts/1`,bytes)).status,200);
      assert.equal((await req(`uploads/${s.id}/complete`,previews())).status,400);
      assert.equal(await db.prepare('SELECT id FROM media_objects WHERE id=?').bind(s.id).first(),null);
      assert.equal(await db.prepare('SELECT id FROM photo_uploads WHERE id=?').bind(s.id).first(),null);
      assert.equal(await bucket.head(`2026/${s.id}/original`),null);
    });
    await t.test('a killed part request leaves no busy lock and its physical part cannot overwrite a retry',async()=>{
      const value=jpeg(640,800),s=await start(value.length);
      const row=(await db.prepare('SELECT upload_id FROM photo_uploads WHERE id=?').bind(s.id).first<{upload_id:string}>())!;
      await db.prepare('UPDATE photo_uploads SET part_counter=1 WHERE id=?').bind(s.id).run();
      await bucket.resumeMultipartUpload(`2026/${s.id}/original`,row.upload_id).uploadPart(1,new Uint8Array(value.length));
      assert.equal((await req(`uploads/${s.id}/parts/1`,value)).status,200);
      const pending=(await db.prepare('SELECT status,parts_json FROM photo_uploads WHERE id=?').bind(s.id).first<{status:string;parts_json:string}>())!;
      assert.equal(pending.status,'open');assert.equal(JSON.parse(pending.parts_json)[0].partNumber,2);
      const finished=await Promise.all([req(`uploads/${s.id}/complete`,previews()),req(`uploads/${s.id}/complete`,previews())]);
      assert.ok(finished.every(r=>r.status===201));
      assert.deepEqual(new Uint8Array(await (await bucket.get(`2026/${s.id}/original`))!.arrayBuffer()),value);
      assert.equal((await db.prepare("SELECT count(*) n FROM admin_events WHERE target=? AND action='upload-photo'").bind(s.id).first<{n:number}>())!.n,1);
    });
    await t.test('client recovers lost initialization, part and final responses without duplicating photos',async()=>{
      const original=jpeg(640,800),lost=new Set<string>(),waits:number[]=[];
      const result=await uploadPhoto(new File([original],'synthetic.jpg',{type:'image/jpeg'}),{preview:new Blob([jpeg(640,800)]),viewer:new Blob([jpeg(1920,2400)])},async(path:string,data:unknown)=>{
        const r=await req(path,data instanceof Blob?new Uint8Array(await data.arrayBuffer()):data);
        const value=await r.json() as {error?:string};
        if(!r.ok)throw new ApiError(value.error,r.status,r.status>=500);
        if((path==='uploads'||path.endsWith('/parts/1')||path.endsWith('/complete'))&&!lost.has(path)){
          lost.add(path);throw new ApiError('Synthetic lost response',503,true);
        }
        return value;
      },()=>{},async(ms:number)=>{waits.push(ms);});
      assert.equal(lost.size,3);assert.deepEqual(waits,[1000,1000,1000]);
      assert.deepEqual(new Uint8Array(await (await bucket.get(`2026/${result.id}/original`))!.arrayBuffer()),original);
      assert.equal((await db.prepare("SELECT count(*) n FROM admin_events WHERE target=? AND action='upload-photo'").bind(result.id).first<{n:number}>())!.n,1);
    });
    await t.test('storage failure after original completion can be retried without a permanent lock',async()=>{
      const value=jpeg(640,800),s=await start(value.length);
      assert.equal((await req(`uploads/${s.id}/parts/1`,value)).status,200);
      await db.exec("CREATE TRIGGER fail_upload BEFORE INSERT ON media_objects BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
      try{assert.equal((await req(`uploads/${s.id}/complete`,previews())).status,503);}finally{await db.exec('DROP TRIGGER fail_upload');}
      assert.ok(await bucket.head(`2026/${s.id}/original`));
      assert.equal((await db.prepare('SELECT status FROM photo_uploads WHERE id=?').bind(s.id).first<{status:string}>())!.status,'completing');
      assert.equal((await req(`uploads/${s.id}/complete`,previews())).status,201);
      assert.equal(await db.prepare('SELECT id FROM photo_uploads WHERE id=?').bind(s.id).first(),null);
    });
    await t.test('expired uploads are cleaned up and cannot be resumed',async()=>{
      const s=await start(20);
      await db.prepare('UPDATE photo_uploads SET created_at=unixepoch()-86401 WHERE id=?').bind(s.id).run();
      assert.equal((await req(`uploads/${s.id}/parts/1`,new Uint8Array(20))).status,410);
      assert.equal(await db.prepare('SELECT id FROM photo_uploads WHERE id=?').bind(s.id).first(),null);
    });
  }finally{await mf.dispose();}
});
