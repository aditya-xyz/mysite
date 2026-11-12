import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {digest} from '../src/security.ts';
import type {Draft} from '../src/edition.ts';

test('configured mugs follow draft publication, minimum count, access and deletion protections',async t=>{
 const issuer='https://mugs-test.cloudflareaccess.com';
 const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
 const jwk={...await exportJWK(publicKey),kid:'mugs',alg:'RS256',use:'sig'};
 const jwt=await new SignJWT({email:'owner@example.com'}).setProtectedHeader({alg:'RS256',kid:'mugs'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience('mugs').setExpirationTime('10m').sign(privateKey);
 const shared={modules:true,compatibilityDate:'2026-08-06',d1Databases:{DB:'mug-db'},r2Buckets:{MEDIA:'mug-media'},outboundService:async(req:{url:string})=>{assert.equal(req.url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});}};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{...shared,name:'admin',routes:['admin.test/*'],scriptPath:'.wrangler/admin-test-bundle/index.js',bindings:{ADMIN_EMAIL:'owner@example.com',ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:'mugs',JOURNAL_ORIGIN:'https://guest.test',ORDER_MODE:'simulation'}},{...shared,name:'guest',routes:['guest.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{SMS_ENABLED:'false'}},{...shared,name:'sim',routes:['sim.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{SMS_ENABLED:'false',ORDER_MODE:'simulation'}}]}));
 const admin=(path:string,data?:unknown,jwtValue=jwt)=>mf.dispatchFetch('https://admin.test/api/editions/2026/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:'https://admin.test','Cf-Access-Jwt-Assertion':jwtValue,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
 const raw='c'.repeat(64);
 const guest=(path:string,authenticated=true)=>mf.dispatchFetch('https://guest.test/api/'+path,{headers:authenticated?{Cookie:'__Host-year_session='+raw}:{}});
 try{
  const db=await mf.getD1Database('DB','admin'),bucket=await mf.getR2Bucket('MEDIA','admin');
  for(const filename of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
   const sql=await readFile('migrations/'+filename,'utf8');
   if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));
   else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));
  }
  const expiry=Math.floor(Date.now()/1000)+86400;
  await db.prepare("INSERT INTO invites(id,token_hash,name,phone,expires_at) VALUES('mug-invite',?1,'Friend','+15555550123',?2)").bind(await digest('a'.repeat(64)),expiry).run();
  await db.prepare("UPDATE people SET name='Verified Recipient',mailing_address=?1 WHERE id='contact-mug-invite'").bind(JSON.stringify({line1:'123 Verified Lane',line2:'',city:'Portland',state:'OR',postalCode:'97201',country:'US'})).run();
  await db.prepare("UPDATE people SET address_verified=1,address_verifier='google',address_verified_at=unixepoch(),address_verified_until=unixepoch()+86400,address_verification_key='mug-address' WHERE id='contact-mug-invite'").run();
  await db.prepare("UPDATE invites SET person_id='contact-mug-invite',member_ids='[\"contact-mug-invite\"]' WHERE id='mug-invite'").run();
  await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,'mug-invite',?2)").bind(await digest(raw),expiry).run();
  const jpeg=new Uint8Array([255,216,255,192,0,11,8,0,64,0,64,1,1,17,0,255,217]);
  for(const id of ['gallery','mug-0','mug-1','mug-2','mug-3','mug-4','mug-5']){
   await bucket.put(id+'.jpg',jpeg);
   await db.prepare('INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?,2026,?,?,?,?)').bind(id,id+'.jpg',id+'.jpg','image/jpeg',jpeg.length).run();
  }
  const initial:any=await (await admin('state')).json();let version=initial.version;
  const draft:Draft={...initial.draft,photos:[{id:'gallery',caption:'Shared',alt:'Synthetic shared photo',recipients:[]}],mugDesigns:[]};
  const cutoutVersion='a'.repeat(32);
  const rgbaPNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=','base64');
  for(let n=0;n<6;n++)await bucket.put(`2026/mug-${n}/mugs/${cutoutVersion}.png`,rgbaPNG,{httpMetadata:{contentType:'image/png'}});
  const design=(n:number)=>({id:'mug-'+n,caption:'caption '+n,alt:'Synthetic mug photo '+n,cutoutVersion});
  async function save(value=draft){const response=await admin('draft',{version,draft:value});assert.equal(response.status,200,await response.clone().text());version=(await response.json() as any).version;}
  async function publish(){const response=await admin('publish',{version});assert.equal(response.status,200,await response.clone().text());}
  await t.test('unauthenticated mug requests are denied and old editions have no gift section',async()=>{
   assert.equal((await guest('mugs/mug-0',false)).status,401);
   assert.equal((await admin('draft',{draft,version},'')).status,401);
   await save();await publish();const journal:any=await (await guest('journal')).json();assert.equal(journal.gift.enabled,false);
  });
  await t.test('theme photos are authenticated, edition-scoped and available in both journal and admin preview',async()=>{
   assert.deepEqual((await (await guest('journal')).json() as any).themeAssets,{});
   for(const name of ['welcome','gift','closing']){
    const bytes=new Uint8Array([...jpeg,name.length]);await bucket.put(`2026/theme/${name}.jpg`,bytes);
    assert.equal((await guest('theme/'+name,false)).status,401);
    const response=await guest('theme/'+name);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/jpeg');assert.match(response.headers.get('Cache-Control')!,/no-store/);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
    assert.equal((await admin('theme/'+name,undefined,'')).status,401);
    assert.deepEqual(new Uint8Array(await (await admin('theme/'+name)).arrayBuffer()),bytes);
   }
   const journal:any=await (await guest('journal')).json(),preview:any=await (await admin('preview')).json();
   for(const name of ['welcome','gift','closing']){assert.equal(journal.themeAssets[name],'/api/theme/'+name);assert.equal(preview.themeAssets[name],'/api/editions/2026/theme/'+name);}
   assert.equal((await guest('theme/original')).status,404);
   await db.prepare("INSERT INTO editions(year,draft_json,is_active) VALUES(2099,?1,0)").bind(JSON.stringify({...draft,photos:[],mugDesigns:[]})).run();
   await db.prepare("INSERT INTO invites(id,token_hash,name,phone,expires_at,edition_year) VALUES('theme-other',?1,'Other','+15555550124',?2,2099)").bind(await digest('d'.repeat(64)),expiry).run();
   await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,'theme-other',?2)").bind(await digest('e'.repeat(64)),expiry).run();
   await db.prepare('UPDATE editions SET is_active=0 WHERE year=2026').run();
   await db.prepare('UPDATE editions SET is_active=1 WHERE year=2099').run();
   assert.equal((await mf.dispatchFetch('https://guest.test/api/theme/gift',{headers:{Cookie:'__Host-year_session='+'e'.repeat(64)}})).status,404);
   await db.prepare('UPDATE editions SET is_active=0 WHERE year=2099').run();
   await db.prepare('UPDATE editions SET is_active=1 WHERE year=2026').run();
   assert.equal((await mf.dispatchFetch('https://admin.test/api/editions/2099/theme/gift',{headers:{'Cf-Access-Jwt-Assertion':jwt}})).status,404);
   await db.prepare('UPDATE editions SET is_active=0 WHERE year=2026').run();
   assert.equal((await guest('theme/gift')).status,409);
   await db.prepare('UPDATE editions SET is_active=1 WHERE year=2026').run();
   await db.prepare("UPDATE invites SET revoked_at=unixepoch() WHERE id='mug-invite'").run();assert.equal((await guest('theme/gift')).status,401);
   await db.prepare("UPDATE invites SET revoked_at=NULL WHERE id='mug-invite'").run();
  });
  await t.test('three selected photos stay hidden; the fourth affects guests only after publishing',async()=>{
   draft.mugDesigns=[0,1,2].map(design);await save();await publish();
   assert.equal((await (await guest('journal')).json() as any).gift.enabled,false);assert.equal((await guest('mugs/mug-0')).status,404);
   draft.mugDesigns.push(design(3));await save();
   assert.equal((await (await guest('journal')).json() as any).gift.enabled,false);
   const preview:any=await (await admin('preview')).json();assert.equal(preview.gift.enabled,true);assert.equal(preview.gift.designs.length,4);assert.match(preview.gift.designs[0].src,/^\/api\/editions\/2026\/media\//);
   await publish();
   assert.equal((await (await guest('journal')).json() as any).gift.enabled,false,'Existing invitations and scrapbook default off');
   assert.equal((await db.prepare("SELECT allow_mug FROM invites WHERE id='mug-invite'").first<any>()).allow_mug,0);
   assert.equal((await admin('mug-settings',{allowMugOrders:true},'')).status,401);
   assert.equal((await admin('mug-settings',{allowMugOrders:'yes'})).status,400);
   assert.equal((await admin('mug-settings',{allowMugOrders:true})).status,200);
   assert.equal((await (await guest('journal')).json() as any).gift.enabled,false,'Edition permission alone is insufficient');
   const before=await db.prepare("SELECT version FROM invites WHERE id='mug-invite'").first<any>();
   assert.equal((await admin('invitations/mug-invite/mug-permission',{allowMug:true,version:before.version},'')).status,401);
   assert.equal((await admin('invitations/mug-invite/mug-permission',{allowMug:'yes',version:before.version})).status,400);
   assert.equal((await admin('invitations/mug-invite/mug-permission',{allowMug:true,version:before.version})).status,200);
   assert.equal((await admin('invitations/mug-invite/mug-permission',{allowMug:false,version:before.version})).status,409,'Stale settings cannot revoke a newer permission');
   const journal:any=await (await guest('journal')).json();assert.equal(journal.gift.enabled,true);assert.equal(journal.gift.orderingEnabled,false);assert.equal(journal.gift.designs.length,4);assert.deepEqual(journal.photos.map((p:any)=>p.id),['gallery']);
   assert.equal((await guest('mugs/mug-0')).status,200);assert.equal((await guest('mugs/mug-0')).headers.get('Content-Type'),'image/png');assert.equal((await guest('mugs/mug-4')).status,404);assert.equal((await guest('mugs/mug-0/original')).status,404);assert.equal((await guest('media/mug-0')).status,404);
  });
  await t.test('simulated mug orders are household-scoped, atomic, preserve proofs until reset, and call no providers',async()=>{
   const sim=(path:string,data?:unknown,origin='https://sim.test',auth=true)=>mf.dispatchFetch('https://sim.test/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,...(auth?{Cookie:'__Host-year_session='+raw}:{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
   const payload={addressVersion:1,designId:'mug-0',requestKey:crypto.randomUUID(),saveAddress:true,address:{name:'Test household',line1:'123 Example Lane',city:'Portland',state:'OR',postalCode:'97201'}};
   assert.equal((await sim('gift/claim',payload,'https://evil.test')).status,403);assert.equal((await sim('gift/claim',payload,undefined,false)).status,401);
   assert.equal((await sim('gift/claim',{...payload,designId:'mug-5'})).status,409);
   const permissionPath='invitations/mug-invite/mug-permission';
   let current=await db.prepare("SELECT version FROM invites WHERE id='mug-invite'").first<any>();
   assert.equal((await admin(permissionPath,{allowMug:false,version:current.version})).status,200);
   assert.equal((await sim('gift/claim',payload)).status,403,'A stale open picker cannot bypass a revoked permission');
   assert.equal((await (await sim('journal')).json() as any).gift.enabled,false);assert.equal((await guest('mugs/mug-0')).status,404);
   assert.equal((await (await sim('gift/status')).json() as any).eligible,false);
   current=await db.prepare("SELECT version FROM invites WHERE id='mug-invite'").first<any>();
   await admin(permissionPath,{allowMug:true,version:current.version});
   assert.equal((await admin('mug-settings',{allowMugOrders:false})).status,200);
   assert.equal((await sim('gift/claim',payload)).status,403,'An enabled invitation cannot bypass the scrapbook switch');
   assert.equal((await (await sim('journal')).json() as any).gift.enabled,false);
   assert.equal((await admin('mug-settings',{allowMugOrders:true})).status,200);
   const results=await Promise.all(Array.from({length:6},async()=>{const response=await sim('gift/claim',payload);assert.equal(response.status,200,await response.clone().text());return (await response.json() as any).claim;}));
   assert.equal(new Set(results.map(o=>o.id)).size,1);const first=results[0];assert.equal(first.status,'simulated');assert.equal(first.address.name,'Verified Recipient');assert.equal(first.address.line1,'123 Verified Lane');assert.equal(first.design.caption,'caption 0');
   assert.equal((await sim(first.design.src.replace('/api/',''))).headers.get('Content-Type'),'image/png');
   const history=await (await admin('mug-orders')).json() as any;assert.equal(history.orders.length,1);assert.equal(history.counts[0].count,1);
   assert.equal((await db.prepare("SELECT mug_order_count,print_order_count FROM invites WHERE id='mug-invite'").first<any>()).mug_order_count,1);
   assert.equal((await sim('journal')).status,200);assert.equal((await (await sim('journal')).json() as any).gift.mode,'simulation');
   assert.equal((await admin('mug-settings',{allowMugOrders:false})).status,200);
   assert.equal((await (await sim('gift/status')).json() as any).claim.id,first.id);assert.equal((await sim(first.design.src.replace('/api/',''))).status,200);
   assert.equal((await admin('mug-settings',{allowMugOrders:true})).status,200);
   const resetPath='invitations/mug-invite/reset-mug-allowance';assert.equal((await admin(resetPath,{orderId:first.id})).status,400);
   assert.equal((await admin(resetPath,{orderId:first.id,confirm:true})).status,200);
   const cleared=await (await admin('mug-orders')).json() as any;assert.equal(cleared.orders.length,0);assert.equal(cleared.counts[0].count,0);assert.equal((await (await sim('gift/status')).json() as any).claim,null);
   assert.equal((await sim(first.design.src.replace('/api/',''))).status,404);assert.equal(await bucket.head(`2026/mug-orders/${first.id}/artwork.png`),null);
   const second=(await (await sim('gift/claim',{...payload,requestKey:crypto.randomUUID()})).json() as any).claim;assert.notEqual(second.id,first.id);
   assert.equal((await admin(resetPath,{orderId:first.id,confirm:true})).status,409);assert.equal((await (await sim('gift/status')).json() as any).claim.id,second.id);
   assert.equal((await admin(resetPath,{orderId:second.id,confirm:true})).status,200);
  });
  await t.test('captions and order are versioned independently of gallery assignments',async()=>{
   draft.mugDesigns=[design(3),{...design(0),caption:'edited caption'},design(1),design(2)];await save();
   assert.equal((await (await guest('journal')).json() as any).gift.designs[0].id,'mug-0');await publish();
   const journal:any=await (await guest('journal')).json();assert.equal(journal.gift.designs[0].id,'mug-3');assert.equal(journal.gift.designs[1].caption,'edited caption');
   const state:any=await (await admin('state')).json();assert.equal(state.draft.mugDesigns[1].caption,'edited caption');
  });
  await t.test('invalid, duplicate, foreign-edition and over-limit mug selections cannot be saved',async()=>{
   await db.prepare("INSERT INTO editions(year,draft_json) VALUES(2027,?1)").bind(JSON.stringify({...draft,photos:[],mugDesigns:[]})).run();
   await db.prepare("INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES('foreign',2027,'foreign.jpg','foreign.jpg','image/jpeg',1)").run();
   for(const mugDesigns of [[design(0),design(0)],[{...design(0),id:'missing'}],[{...design(0),id:'foreign'}],Array.from({length:13},(_,i)=>design(i)),[{...design(0),caption:'x'.repeat(501)}]])assert.equal((await admin('draft',{version,draft:{...draft,mugDesigns}})).status,400);
  });
  await t.test('saved and published mug-only photos cannot be deleted, and concurrent deletion blocks a save',async()=>{
   assert.equal((await admin('media/mug-0/delete',{confirm:true})).status,409);
   draft.mugDesigns=[design(1),design(2),design(3),design(4)];await save();
   const savedOnly=await admin('media/mug-4/delete',{confirm:true});assert.equal(savedOnly.status,409);assert.match(await savedOnly.text(),/saved mug selection/);
   const publishedOnly=await admin('media/mug-0/delete',{confirm:true});assert.equal(publishedOnly.status,409);assert.match(await publishedOnly.text(),/published mug design/);
   await db.prepare("UPDATE media_objects SET deleting=1 WHERE id='mug-5'").run();
   await assert.rejects(()=>db.prepare('UPDATE editions SET draft_json=?1 WHERE year=2026').bind(JSON.stringify({...draft,mugDesigns:[design(5)]})).run(),/mug photo is no longer available/);
   await db.prepare("UPDATE media_objects SET deleting=0 WHERE id='mug-5'").run();
  });
  await t.test('cutouts are authenticated, scoped, reusable and pinned until republished',async()=>{
   const post=(id:string,bytes:Uint8Array,identity=jwt)=>mf.dispatchFetch(`https://admin.test/api/editions/2026/media/${id}/cutout`,{method:'POST',headers:{Origin:'https://admin.test','Cf-Access-Jwt-Assertion':identity,'Content-Type':'application/octet-stream'},body:bytes});
   assert.equal((await post('mug-1',rgbaPNG,'')).status,401);
   assert.equal((await post('foreign',rgbaPNG)).status,404);
   assert.equal((await post('mug-1',jpeg)).status,400);
   const response=await post('mug-1',rgbaPNG);assert.equal(response.status,201);const {version:art}=(await response.json()) as any;assert.match(art,/^[a-f0-9]{32}$/);
   assert.equal((await (await admin('media/mug-1/cutout')).json() as any).version,art);
   assert.equal((await admin(`media/mug-1/cutout/${art}`)).headers.get('Content-Type'),'image/png');
   assert.equal((await guest(`editions/2026/media/mug-1/cutout/${art}`)).status,404);
   const row=await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<{published_json:string}>();assert.equal(JSON.parse(row!.published_json).mugDesigns.find((d:any)=>d.id==='mug-1').cutoutVersion,cutoutVersion);
   assert.ok(await bucket.head('mug-1.jpg'));assert.equal((await guest('mugs/mug-1?version='+art)).status,404);assert.equal((await guest('mugs/mug-1?version='+cutoutVersion)).status,200);
   await save({...draft,mugDesigns:[{...design(1),cutoutVersion:undefined}]});assert.equal((await admin('publish',{version})).status,409);
   await save({...draft,mugDesigns:[{...design(1),cutoutVersion:'b'.repeat(32)}]});assert.equal((await admin('publish',{version})).status,409);
   assert.equal((await admin('draft',{version,draft:{...draft,mugDesigns:[{...design(1),cutoutVersion:'../other'}]}})).status,400);
  });
  await t.test('publishing fewer than four withdraws the section and all mug-preview access',async()=>{
   draft.mugDesigns=[design(0),design(1),design(2)];await save();await publish();
   const journal:any=await (await guest('journal')).json();assert.equal(journal.gift.enabled,false);assert.deepEqual(journal.gift.designs,[]);assert.equal((await guest('mugs/mug-0')).status,404);
  });
 }finally{await mf.dispose();}
});
