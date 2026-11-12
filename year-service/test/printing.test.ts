import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {digest} from '../src/security.ts';
import {personalCount,localPrintProvider} from '../src/printing.ts';
test('local print ordering is gated, atomic, private, and preserves submitted snapshots',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
 const issuer='https://print-test.cloudflareaccess.com',jwk={...await exportJWK(publicKey),kid:'print',alg:'RS256',use:'sig'};
 const outbound=async(r:{url:string})=>{assert.equal(r.url,issuer+'/cdn-cgi/access/certs','No print, address, or SMS provider may be contacted');return Response.json({keys:[jwk]});};
 const common={modules:true,compatibilityDate:'2026-08-06',d1Databases:{DB:'print-test'},r2Buckets:{MEDIA:'print-test'},outboundService:outbound};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {...common,name:'admin',routes:['admin.test/*'],scriptPath:'.wrangler/admin-test-bundle/index.js',bindings:{ADMIN_EMAIL:'owner@example.com',ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:'print',JOURNAL_ORIGIN:'http://guest.test',PRINT_PROVIDER:'local_mock'}},
  {...common,name:'guest',routes:['guest.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{PRINT_PROVIDER:'local_mock',SMS_ENABLED:'false'}}
 ]}));
 const jwt=await new SignJWT({email:'owner@example.com'}).setProtectedHeader({alg:'RS256',kid:'print'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience('print').setExpirationTime('1h').sign(privateKey);
 try{
  const db=await mf.getD1Database('DB','admin'),bucket=await mf.getR2Bucket('MEDIA','admin');
  for(const name of ['0001_invites.sql','0002_editor.sql','0003_scrapbooks.sql','0004_people.sql'])await db.exec((await readFile('migrations/'+name,'utf8')).replace(/\n/g,' '));
  for(const name of ['0005_shared_invitations.sql','0006_photo_renditions_downloads.sql','0007_photo_uploads.sql','0008_media_library.sql','0009_invitation_sharing.sql','0010_print_orders.sql','0011_print_allowance_resets.sql','0012_google_address_verification.sql']){const sql=await readFile('migrations/'+name,'utf8');if(name.startsWith('0006')||name.startsWith('0007'))await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));else await db.batch(sql.split('--> statement-breakpoint').map(part=>db.prepare(part)));}
    await db.batch((await readFile('migrations/0013_unpublish.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0015_simulated_mug_orders.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0016_mug_permissions.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
    await db.batch((await readFile('migrations/0017_immediate_print_permissions.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
  const expires=Math.floor(Date.now()/1000)+86400,session='c'.repeat(64);
  await db.prepare("INSERT INTO people(id,name,phone) VALUES('contact','Test Recipient','+15555550100'),('partner','Test Partner',NULL)").run();
  await db.prepare("INSERT INTO invites(id,person_id,token_hash,name,phone,expires_at,member_ids) VALUES('invite','contact',?1,'Test Recipient','+15555550100',?2,?3)").bind(await digest('a'.repeat(64)),expires,JSON.stringify(['contact','partner'])).run();
  await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,'invite',?2)").bind(await digest(session),expires).run();
  const address={line1:'123 Example Lane',line2:'Unit 2',city:'Portland',state:'OR',postalCode:'97201',country:'US'};
  const photos=[['one',['contact']],['two',['partner']],['three',['contact','partner']],['shared',[]]].map(([id,recipients])=>({id,recipients,caption:id,alt:id,preview_key:id+'.jpg',original_key:null,filename:id+'.jpg',mime:'image/jpeg',width:1200,height:1500}));
  for(const id of ['one','two','three','shared'])await db.prepare('INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?2,\'image/jpeg\',17)').bind(id,id+'.jpg').run();
  const published={title:'Test',authors:'Test Authors',intro:'Test',note:'Test',sharedTitle:'Test',stories:[],photos,printNote:'A note for everyone.',printInvitations:['invite'],printAddressKeys:{invite:'address-key'}};
  async function reset(){
   await db.prepare('DELETE FROM print_orders').run();
   await db.prepare("UPDATE people SET mailing_address=?1,address_verified=0 WHERE id='contact'").bind(JSON.stringify(address)).run();
   await db.prepare("UPDATE people SET address_verified=1,address_verifier='local_mock',address_verification_key='address-key' WHERE id='contact'").run();
   await db.prepare("UPDATE editions SET draft_json=?1,published_json=?1,published_version=1,allow_print_orders=1,is_active=1 WHERE year=2026").bind(JSON.stringify(published)).run();
   await db.prepare("UPDATE invites SET allow_print=1,print_address_key='address-key' WHERE id='invite'").run();
  }
  async function admin(path:string,data?:unknown,auth=true){return mf.dispatchFetch('http://admin.test/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:'http://admin.test','Content-Type':'application/json',...(auth?{'Cf-Access-Jwt-Assertion':jwt}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});}
  async function guest(path:string,data?:FormData,options:{cookie?:boolean;origin?:string}={}){
   const encoded=data?new Request('http://guest.test',{method:'POST',body:data}):null,bytes=encoded?await encoded.arrayBuffer():null;
   return mf.dispatchFetch('http://guest.test/api/'+path,{method:data?'POST':'GET',headers:{Origin:options.origin||'http://guest.test',...(options.cookie===false?{}:{Cookie:'__Host-year_session='+session}),...(encoded?{'Content-Type':encoded.headers.get('Content-Type')!,'Content-Length':String(bytes!.byteLength)}:{})},...(bytes?{body:bytes}:{})});
  }
  const status=async()=>await (await guest('print/status')).json() as any;
  async function order(ids=['one','two','three'],key=crypto.randomUUID(),confirmationKey?:string){const s=await status(),form=new FormData();const jpg=new Uint8Array([255,216,255,192,0,11,8,5,220,4,176,1,1,17,0,255,217]);form.set('artwork',new File([jpg],'keepsake.jpg',{type:'image/jpeg'}));form.set('recipe',JSON.stringify({photoIds:ids,frame:'moss',crops:Object.fromEntries(ids.map(id=>[id,{x:.5,y:.5,zoom:1}])),requestKey:key,confirmationKey:confirmationKey||s.confirmationKey,addressVersion:s.addressVersion}));return form;}
  await t.test('schema defaults off and a couple’s overlapping photo counts only once',async()=>{
   assert.equal((await db.prepare('SELECT allow_print_orders FROM editions WHERE year=2026').first<any>()).allow_print_orders,0);
   assert.equal(personalCount(published as any,['contact','partner']),3);
   assert.equal(localPrintProvider(new Request('https://guest.test'),{DB:db as any,MEDIA:bucket as any,PRINT_PROVIDER:'local_mock'}),false);
  });
  await t.test('auth and CSRF gates apply to print APIs',async()=>{
   await reset();assert.equal((await guest('print/status',undefined,{cookie:false})).status,401);
   assert.equal((await admin('editions/2026/print-orders',undefined,false)).status,401);
   assert.equal((await guest('print/orders',await order(),{origin:'https://unrelated.test'})).status,403);
  });
  await t.test('invitation print toggles apply without saving or publishing content and stale confirmations are rejected',async()=>{
   await reset();
   await db.prepare("UPDATE editions SET published_json=json_remove(published_json,'$.printInvitations','$.printAddressKeys') WHERE year=2026").run();
   assert.equal((await status()).eligible,true,'Legacy publication flags are no longer consulted');
   const before=await db.prepare('SELECT draft_json,published_json,draft_version,published_version FROM editions WHERE year=2026').first<any>();
   const staleOrder=await order();
   let invite=await db.prepare("SELECT * FROM invites WHERE id='invite'").first<any>();
   const change=(allowPrint:boolean,version:number)=>admin('editions/2026/invitations/invite/details',{version,memberIds:['contact','partner'],verificationContactId:'contact',addressedTo:'Test household',allowPrint});
   assert.equal((await change(false,invite.version)).status,200);assert.match((await status()).reason,/not enabled/);
   assert.equal((await guest('print/orders',staleOrder)).status,409);
   assert.equal((await change(true,invite.version)).status,409,'Stale admin saves cannot restore permission');
   invite=await db.prepare("SELECT * FROM invites WHERE id='invite'").first<any>();
   assert.equal((await change(true,invite.version)).status,200);assert.equal((await status()).eligible,true);
   assert.deepEqual(await db.prepare('SELECT draft_json,published_json,draft_version,published_version FROM editions WHERE year=2026').first(),before,'Editing permission never saves or publishes scrapbook content');
   await db.prepare("UPDATE people SET address_verified=0 WHERE id='contact'").run();
   invite=await db.prepare("SELECT * FROM invites WHERE id='invite'").first<any>();assert.equal((await change(true,invite.version)).status,200);assert.equal((await status()).needsAddress,true);assert.equal((await status()).canOrder,true);
  });
  await t.test('each eligibility requirement is enforced on the server',async()=>{
   await reset();const eligible=await status();assert.equal(eligible.eligible,true);for(const privateField of ['note','address','recipientName','authors'])assert.equal(privateField in eligible,false);
   for(const [sql,reason] of [["UPDATE editions SET allow_print_orders=0 WHERE year=2026",'turned off'],["UPDATE people SET address_verified=0 WHERE id='contact'",'verified US'],["UPDATE people SET address_verification_key='new-address-key' WHERE id='contact'",'changed']] as const){await reset();await db.prepare(sql).run();assert.match((await status()).reason,new RegExp(reason));assert.equal((await guest('print/orders',await order())).status,409);}
   for(const extra of [{printNote:''},{photos:photos.slice(0,2)}]){await reset();await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({...published,...extra})).run();assert.equal((await status()).eligible,false);}
  });
  await t.test('draft saves clear ineligible permission without changing the published snapshot',async()=>{
   await reset();const initial=await (await admin('editions/2026/state')).json() as any;
   const changed={...published,photos:photos.map(p=>p.id==='three'?{...p,hidden:true}:p)};
   const saved=await admin('editions/2026/draft',{version:initial.version,draft:changed});assert.equal(saved.status,200);const result=await saved.json() as any;assert.deepEqual(result.printInvitations,[]);
   assert.equal((await status()).eligible,true,'Draft changes do not alter the guest publication');
   assert.equal((await admin('editions/2026/publish',{version:result.version})).status,200);assert.equal((await status()).eligible,false);
   const fresh=await (await admin('editions/2026/state')).json() as any;fresh.draft.photos=photos;
   const restored=await admin('editions/2026/draft',{version:fresh.version,draft:fresh.draft});assert.equal(restored.status,200);assert.deepEqual((await restored.json() as any).printInvitations,[]);
  });
  await t.test('simulated fulfillment and address verification cannot run over production HTTPS',async()=>{
   await reset();await db.prepare('UPDATE editions SET allow_print_orders=0 WHERE year=2026').run();
   const response=await mf.dispatchFetch('https://admin.test/api/editions/2026/print-settings',{method:'POST',headers:{Origin:'https://admin.test','Content-Type':'application/json','Cf-Access-Jwt-Assertion':jwt},body:JSON.stringify({allowPrintOrders:true})});
   assert.equal(response.status,503);assert.equal((await db.prepare('SELECT allow_print_orders FROM editions WHERE year=2026').first<any>()).allow_print_orders,0);
  });
  await t.test('stale previews, repeated photos and shared photos cannot be ordered',async()=>{
   await reset();const prior=await status();await db.prepare("UPDATE people SET version=version+1 WHERE id='contact'").run();assert.equal((await guest('print/orders',await order(undefined,undefined,prior.confirmationKey))).status,409);
   assert.equal((await guest('print/orders',await order(['one','one','two']))).status,403);assert.equal((await guest('print/orders',await order(['one','two','shared']))).status,403);
   assert.equal((await db.prepare('SELECT count(*) n FROM print_orders').first<any>()).n,0);
  });
  await t.test('simulation reset clears count and proof, scopes by year, and cannot clear a newer order on retry',async()=>{
   await reset();const first=await (await guest('print/orders',await order())).json() as any;
   const path='editions/2026/invitations/invite/reset-print-allowance',data={orderId:first.order.id,confirm:true};
   assert.equal((await admin(path,data,false)).status,401);
   assert.equal((await admin('editions/2027/invitations/invite/reset-print-allowance',data)).status,404);
   assert.equal((await admin(path,data)).status,200);assert.equal((await status()).eligible,true);
   assert.equal(await db.prepare('SELECT * FROM print_orders WHERE id=?1').bind(first.order.id).first(),null);assert.equal((await db.prepare("SELECT print_order_count FROM invites WHERE id='invite'").first<any>()).print_order_count,0);assert.equal((await admin('editions/2026/print-orders/'+first.order.id+'/artwork')).status,404);assert.equal((await (await admin('editions/2026/print-orders')).json() as any).orders.length,0);
   const second=await (await guest('print/orders',await order())).json() as any;assert.notEqual(second.order.id,first.order.id);
   assert.equal((await admin(path,data)).status,409);assert.equal((await status()).eligible,false);
   const history=await (await admin('editions/2026/print-orders')).json() as any;assert.equal(history.orders.length,1);assert.equal(history.counts[0].count,1);assert.equal(history.counts[0].used,1);
   await db.prepare("UPDATE print_orders SET status='unknown' WHERE id=?1").bind(second.order.id).run();assert.equal((await admin(path,{orderId:second.order.id,confirm:true})).status,409);
   await db.prepare("UPDATE print_orders SET status='preparing' WHERE id=?1").bind(second.order.id).run();assert.equal((await admin(path,{orderId:second.order.id,confirm:true})).status,409);
  });
  await t.test('concurrent taps and retries create exactly one simulated order',async()=>{
   await reset();const results=await Promise.all(Array.from({length:6},async()=>{const r=await guest('print/orders',await order());assert.equal(r.status,200);return await r.json() as any;}));
   assert.equal(new Set(results.map(r=>r.order.id)).size,1);assert.equal((await db.prepare('SELECT count(*) n FROM print_orders').first<any>()).n,1);assert.equal((await status()).remaining,0);
   const row=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(row.status,'simulated');assert.ok(await bucket.get(row.artwork_key));assert.equal(row.note,published.printNote);
   await admin('editions/2026/print-settings',{allowPrintOrders:false});await db.prepare("UPDATE people SET mailing_address=?1 WHERE id='contact'").bind(JSON.stringify({...address,line1:'456 Different Lane'})).run();
   assert.equal((await status()).order.id,row.id);const saved=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(saved.address_json,row.address_json);assert.equal(saved.note,row.note);
   assert.equal((await admin('editions/2027/print-orders/'+row.id+'/artwork')).status,404);
  });
  await t.test('a definite failed reservation releases the allowance but an uncertain one does not',async()=>{
   await reset();await guest('print/orders',await order());await db.prepare("UPDATE print_orders SET status='failed'").run();assert.equal((await status()).eligible,true);
   assert.equal((await guest('print/orders',await order())).status,200);await db.prepare("UPDATE print_orders SET status='unknown' WHERE status='simulated'").run();assert.equal((await status()).remaining,0);
  });
  await t.test('address edits invalidate verification and local verification is explicit',async()=>{
   await reset();const person=await db.prepare("SELECT version FROM people WHERE id='contact'").first<any>();
   const saved=await admin('contacts/contact/address',{version:person.version,address:{...address,line1:'987 Sample Way'},verify:false});assert.equal(saved.status,200);const r=await saved.json() as any;assert.equal(r.person.address_verified,0);
   const verified=await admin('contacts/contact/address',{version:r.person.version,address,verify:true});assert.equal(verified.status,200);const result=await verified.json() as any;assert.equal(result.simulated,true);assert.equal(result.person.address_verifier,'local_mock');assert.ok(result.person.address_verification_key);
   assert.equal((await status()).eligible,false,'Reverification cannot restore an old print permission automatically');
  });
 }finally{await mf.dispose();}
});
