import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {digest} from '../src/security.ts';
import type {Draft,Published} from '../src/edition.ts';
const jpeg=(width:number,height:number)=>new Uint8Array([255,216,255,192,0,11,8,height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);
test('separate photo renditions and persistent original-download limits',async t=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
  const issuer='https://renditions-test.cloudflareaccess.com',aud='renditions',email='owner@example.com';
  const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
  const jwt=await new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience(aud).setExpirationTime('10m').sign(privateKey);
  const outbound=async(request:{url:string})=>{assert.equal(request.url,issuer+'/cdn-cgi/access/certs','No SMS or external photo processing');return Response.json({keys:[jwk]});};
  const common={modules:true,compatibilityDate:'2026-08-06',d1Databases:{DB:'renditions-db'},r2Buckets:{MEDIA:'renditions-media'},outboundService:outbound};
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[
    {...common,name:'admin',routes:['admin.test/*'],scriptPath:'.wrangler/admin-test-bundle/index.js',bindings:{ADMIN_EMAIL:email,ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:aud,JOURNAL_ORIGIN:'https://guest.test'}},
    {...common,name:'guest',routes:['guest.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{SMS_ENABLED:'false'}}
  ]}));
  async function req(path:string,data?:unknown,origin='https://admin.test'){
    const encoded=data instanceof FormData?new Request('https://admin.test',{method:'POST',body:data}):null;
    return mf.dispatchFetch('https://admin.test/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Cf-Access-Jwt-Assertion':jwt,'Content-Type':encoded?.headers.get('Content-Type')||'application/json'},...(data===undefined?{}:{body:encoded?await encoded.arrayBuffer():JSON.stringify(data)})});
  }
  const guest=(path:string,session='a'.repeat(64))=>mf.dispatchFetch('https://guest.test/api/'+path,{headers:{Cookie:'__Host-year_session='+session}});
  try{
    const db=await mf.getD1Database('DB','admin'),bucket=await mf.getR2Bucket('MEDIA','admin');
    for(const file of ['0001_invites.sql','0002_editor.sql','0003_scrapbooks.sql','0004_people.sql'])await db.exec((await readFile('migrations/'+file,'utf8')).replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0005_shared_invitations.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.exec((await readFile('migrations/0006_photo_renditions_downloads.sql','utf8')).replace(/\n/g,' '));
    await db.exec((await readFile('migrations/0007_photo_uploads.sql','utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
    await db.batch((await readFile('migrations/0008_media_library.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0009_invitation_sharing.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0010_print_orders.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0011_print_allowance_resets.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0012_google_address_verification.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    const expiry=Math.floor(Date.now()/1000)+86400;
    const contact=async(name:string,phone?:string)=>(await (await req('contacts',{name,phone})).json() as {person:{id:string}}).person.id;
    const ben=await contact('Ben','+15555550110'),jerry=await contact('Jerry');
    const invitation=await (await req('editions/2026/invitations',{memberIds:[ben,jerry],verificationContactId:ben,addressedTo:'Ben & Jerry'})).json() as {id:string};
    await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest('a'.repeat(64)),invitation.id,expiry).run();
    const outsider=await contact('Other','+15555550111');
    const otherInvite=await (await req('editions/2026/invitations',{personId:outsider})).json() as {id:string};
    await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest('b'.repeat(64)),otherInvite.id,expiry).run();
    const original=new Uint8Array([255,216,255,225,69,88,73,70,1,2,3,4,255,217]),grid=jpeg(640,800),viewer=jpeg(1920,2400),legacy=jpeg(1200,1600);
    const upload=(withViewer=true,preview=grid,large=viewer)=>{
      const form=new FormData();form.set('original',new File([original],'original.jpg',{type:'image/jpeg'}));form.set('preview',new File([preview],'grid.jpg',{type:'image/jpeg'}));if(withViewer)form.set('viewer',new File([large],'viewer.jpg',{type:'image/jpeg'}));return req('editions/2026/upload',form);
    };
    let personal='',shared='',old='',version=1;let draft:Draft;
    await t.test('uploads store distinct bounded previews and untouched originals',async()=>{
      assert.equal((await upload(true,jpeg(801,801))).status,400);
      assert.equal((await upload(true,grid,jpeg(2401,2401))).status,400);
      assert.equal((await upload(true,grid,jpeg(2400,1800))).status,400,'Aspect ratios must agree');
      for(const kind of ['personal','shared','old']){
        const result=await upload(kind!=='old',kind==='old'?legacy:grid);assert.equal(result.status,201);
        const data=await result.json() as {id:string;has_viewer:boolean};assert.equal(data.has_viewer,kind!=='old');
        if(kind==='personal')personal=data.id;else if(kind==='shared')shared=data.id;else old=data.id;
      }
      const media=(await db.prepare('SELECT * FROM media_objects WHERE id=?').bind(personal).first<{preview_key:string;viewer_key:string;original_key:string}>())!;
      assert.deepEqual(new Uint8Array(await (await bucket.get(media.preview_key))!.arrayBuffer()),grid);
      assert.deepEqual(new Uint8Array(await (await bucket.get(media.viewer_key))!.arrayBuffer()),viewer);
      assert.deepEqual(new Uint8Array(await (await bucket.get(media.original_key))!.arrayBuffer()),original);
      const state=await (await req('editions/2026/state')).json() as {draft:Draft;version:number};draft={...state.draft,photos:[{id:personal,caption:'Ben and Jerry',alt:'Sample',recipients:[jerry]},{id:shared,caption:'Everyone',alt:'Sample',recipients:[]},{id:old,caption:'Legacy',alt:'Sample',recipients:[ben]}]};
      const saved=await (await req('editions/2026/draft',{draft,version:state.version})).json() as {version:number};version=saved.version;assert.equal((await req('editions/2026/publish',{version})).status,200);
    });
    await t.test('browsing uses the right renditions, keeps legacy previews, and consumes no download quota',async()=>{
      const journal=await (await guest('journal')).json() as {photos:{id:string;src:string;viewerSrc:string}[]};assert.equal(journal.photos.length,3);assert.equal(journal.photos[0].viewerSrc,`/api/media/${personal}/viewer`);
      for(const [path,bytes] of [[`media/${personal}`,grid],[`media/${personal}/viewer`,viewer],[`media/${old}/viewer`,legacy]] as const)assert.deepEqual(new Uint8Array(await (await guest(path)).arrayBuffer()),bytes);
      assert.equal((await db.prepare('SELECT count(*) n FROM original_downloads').first<{n:number}>())!.n,0);
      assert.equal((await guest('media/'+personal+'/viewer','b'.repeat(64))).status,404);
      assert.equal((await guest('media/'+shared+'/original')).status,404);
      assert.equal((await guest('media/'+personal+'/original','b'.repeat(64))).status,404);
      assert.equal((await guest('media/'+personal+'/original','z'.repeat(64))).status,401);
      assert.equal((await db.prepare('SELECT count(*) n FROM original_downloads').first<{n:number}>())!.n,0);
    });
    await t.test('concurrent original requests stop at five and quota survives new sessions',async()=>{
      const requests=await Promise.all(Array.from({length:10},()=>guest('media/'+personal+'/original')));
      assert.equal(requests.filter(r=>r.status===200).length,5);assert.equal(requests.filter(r=>r.status===429).length,5);
      for(const response of requests)if(response.status===200)assert.deepEqual(new Uint8Array(await response.arrayBuffer()),original);else{assert.ok(Number(response.headers.get('Retry-After'))>0);assert.ok((await response.json() as {retryAfter:number}).retryAfter>0);}
      await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest('c'.repeat(64)),invitation.id,expiry).run();
      assert.equal((await guest('media/'+personal+'/original','c'.repeat(64))).status,429);
      assert.equal((await guest('media/'+personal+'/viewer')).status,200);
      assert.equal((await guest('media/'+old+'/original')).status,200,'Separate photo has a separate allowance');
    });
    await t.test('admin reset is protected and daily windows reset without changing invitations',async()=>{
      assert.equal((await req(`editions/2026/invitations/${invitation.id}/downloads/reset`,{},'https://other.test')).status,403);
      assert.equal((await req(`editions/2027/invitations/${invitation.id}/downloads/reset`,{})).status,404);
      assert.equal((await req(`editions/2026/invitations/${invitation.id}/downloads/reset`,{})).status,200);
      assert.equal((await guest('media/'+personal+'/original')).status,200);
      await db.prepare('UPDATE original_downloads SET window_start=?,requests=5 WHERE invite_id=? AND photo_id=?').bind(Math.floor(Date.now()/1000)-86401,invitation.id,personal).run();
      assert.equal((await guest('media/'+personal+'/original')).status,200);
      assert.equal((await db.prepare('SELECT requests FROM original_downloads WHERE invite_id=? AND photo_id=?').bind(invitation.id,personal).first<{requests:number}>())!.requests,1);
    });
    await t.test('regeneration preserves publication and originals until explicit publication',async()=>{
      const before=(await db.prepare('SELECT * FROM media_objects WHERE id=?').bind(personal).first<{original_key:string;preview_key:string}>())!;
      const form=new FormData();form.set('preview',new File([jpeg(400,500)],'grid.jpg'));form.set('viewer',new File([jpeg(1600,2000)],'viewer.jpg'));
      assert.equal((await req(`editions/2026/media/${personal}/previews`,form)).status,200);
      const after=(await db.prepare('SELECT * FROM media_objects WHERE id=?').bind(personal).first<{original_key:string;preview_key:string}>())!;
      assert.equal(after.original_key,before.original_key);assert.notEqual(after.preview_key,before.preview_key);
      assert.deepEqual(new Uint8Array(await (await guest('media/'+personal)).arrayBuffer()),grid,'Live publication retains its original grid');
      const oldManifest=JSON.parse((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<{published_json:string}>())!.published_json) as Published;assert.equal(oldManifest.photos[0].preview_key,before.preview_key);
      const saved=await (await req('editions/2026/draft',{draft,version})).json() as {version:number};version=saved.version;assert.equal((await req('editions/2026/publish',{version})).status,200);
      assert.deepEqual(new Uint8Array(await (await guest('media/'+personal+'/viewer')).arrayBuffer()),jpeg(1600,2000));
      assert.deepEqual(new Uint8Array(await (await bucket.get(after.original_key))!.arrayBuffer()),original);
      await bucket.delete(after.original_key);
      assert.equal((await guest('media/'+personal+'/original')).status,404);
      assert.equal((await db.prepare('SELECT requests FROM original_downloads WHERE invite_id=? AND photo_id=?').bind(invitation.id,personal).first<{requests:number}>())!.requests,1,'Missing objects do not consume an allowance');
    });
  }finally{await mf.dispose();}
});
