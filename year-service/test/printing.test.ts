import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {digest} from '../src/security.ts';
import {personalCount,localPrintProvider,printOrderView,foldedPreviewNote} from '../src/printing.ts';
test('local print ordering is gated, atomic, private, and preserves submitted snapshots',async t=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true});
 const issuer='https://print-test.cloudflareaccess.com',jwk={...await exportJWK(publicKey),kid:'print',alg:'RS256',use:'sig'};
 const vendorCalls:{path:string;body?:any}[]=[];let hwMode=1,hwImage=900,hwCard=700,hwBadURL=false,pendingImage=true;
 const outbound=async(r:Request)=>{
  const url=new URL(r.url);
  if(url.hostname==='api.handwrytten.com'){
   const path=url.pathname;assert.equal(r.headers.get('Authorization'),'synthetic-key');
   const call:{path:string;body?:any}={path};vendorCalls.push(call);
   if(path.endsWith('/checkauth/auth'))return Response.json({status:'ok',test_mode:hwMode});
   if(path.endsWith('/design/dimensions'))return Response.json({status:'ok',dimensions:[{id:4,orientation:'portrait',format:'folded',open_width:'8.500',open_height:'5.500'}]});
   if(path.endsWith('/fonts/list'))return Response.json({status:'ok',fonts:[{id:'hwDavid'}]});
   if(path.endsWith('/uploadCustomLogo')){const form=await r.formData(),file=form.get('file') as File;call.body={type:form.get('type'),bytes:[...new Uint8Array(await file.arrayBuffer())]};return Response.json({status:'ok',id:++hwImage});}
   if(path.endsWith('/createCustomCard')){call.body=await r.json();return Response.json({status:'ok',card_id:++hwCard});}
   assert.equal(path,'/v2/cards/view','Order, basket and payment requests are forbidden');
   return Response.json({status:'ok',card:{images:Object.fromEntries(['front','inside','back'].map(side=>[side,[{image:hwBadURL?'https://untrusted.test/private':'https://d3e924qpzqov0g.cloudfront.net/cardimages/customCards/'+url.searchParams.get('card_id')+'-'+side+'.png'}]]))}});
  }
  if(url.hostname==='d3e924qpzqov0g.cloudfront.net'){if(pendingImage){pendingImage=false;return new Response(null,{status:403});}return new Response(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]),{headers:{'Content-Type':'image/png'}});}
  assert.equal(r.url,issuer+'/cdn-cgi/access/certs','Unexpected provider request');return Response.json({keys:[jwk]});
 };
 const common={modules:true,compatibilityDate:'2026-08-06',d1Databases:{DB:'print-test'},r2Buckets:{MEDIA:'print-test'},outboundService:outbound};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {...common,name:'admin',routes:['admin.test/*'],scriptPath:'.wrangler/admin-test-bundle/index.js',bindings:{ADMIN_EMAIL:'owner@example.com',ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:'print',JOURNAL_ORIGIN:'http://guest.test',PRINT_PROVIDER:'local_mock',HANDWRYTTEN_PREVIEWS_ENABLED:'true',HANDWRYTTEN_API_KEY:'synthetic-key'}},
  {...common,name:'proof-guest',routes:['proof.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{ORDER_MODE:'simulation',HANDWRYTTEN_PREVIEWS_ENABLED:'true',HANDWRYTTEN_API_KEY:'synthetic-key',SMS_ENABLED:'false'}},
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
  await db.batch((await readFile('migrations/0023_keepsake_default_sets.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
  await db.exec(await readFile('migrations/0024_default_keepsake_note.sql','utf8'));
  await db.batch((await readFile('migrations/0026_folded_cards.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
  await db.batch((await readFile('migrations/0027_handwrytten_previews.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
  const expires=Math.floor(Date.now()/1000)+86400,session='c'.repeat(64);
  await db.prepare("INSERT INTO people(id,name,phone) VALUES('contact','Test Recipient','+15555550100'),('partner','Test Partner',NULL)").run();
  await db.prepare("INSERT INTO invites(id,person_id,token_hash,name,phone,expires_at,member_ids) VALUES('invite','contact',?1,'Test Recipient','+15555550100',?2,?3)").bind(await digest('a'.repeat(64)),expires,JSON.stringify(['contact','partner'])).run();
  await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,'invite',?2)").bind(await digest(session),expires).run();
  const defaultRevision='d'.repeat(32),defaultJPEG=new Uint8Array([255,216,255,192,0,11,8,5,220,4,176,1,1,17,0,255,217]);
  await db.prepare('INSERT INTO keepsake_defaults(year,revision,frames_json) VALUES(2026,?1,?2)').bind(defaultRevision,JSON.stringify({moss:'default-moss.jpg',classic:'default-classic.jpg',santa:'default-santa.jpg'})).run();
  for(const frame of ['moss','classic','santa'])await bucket.put('default-'+frame+'.jpg',new Uint8Array([...defaultJPEG,frame.length]));
  const address={line1:'123 Example Lane',line2:'Unit 2',city:'Portland',state:'OR',postalCode:'97201',country:'US'};
  const photos=[['one',['contact']],['two',['partner']],['three',['contact','partner']],['shared',[]]].map(([id,recipients])=>({id,recipients,caption:id,alt:id,preview_key:id+'.jpg',original_key:null,filename:id+'.jpg',mime:'image/jpeg',width:1200,height:1500}));
  for(const id of ['one','two','three','shared'])await db.prepare('INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?2,\'image/jpeg\',17)').bind(id,id+'.jpg').run();
  const published={title:'Test',authors:'Test Authors',intro:'Test',note:'Test',sharedTitle:'Test',stories:[],photos,printNote:'A note for everyone.',printInvitations:['invite'],printAddressKeys:{invite:'address-key'}};
  async function reset(){
   await db.prepare('DELETE FROM print_orders').run();
   await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'print-claim:%'").run();
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
  async function proofGuest(path:string,data?:FormData,cookie=session){
   const encoded=data?new Request('http://proof.test',{method:'POST',body:data}):null,bytes=encoded?await encoded.arrayBuffer():null;
   return mf.dispatchFetch('http://proof.test/api/'+path,{method:data?'POST':'GET',headers:{Origin:'http://proof.test',...(cookie?{Cookie:'__Host-year_session='+cookie}:{}),...(encoded?{'Content-Type':encoded.headers.get('Content-Type')!,'Content-Length':String(bytes!.byteLength)}:{})},...(bytes?{body:bytes}:{})});
  }
  const status=async()=>await (await guest('print/status')).json() as any;
  async function order(ids=['one','two','three'],key=crypto.randomUUID(),confirmationKey?:string){const s=await status(),form=new FormData();const jpg=new Uint8Array([255,216,255,192,0,11,8,5,220,4,176,1,1,17,0,255,217]);form.set('artwork',new File([jpg],'keepsake.jpg',{type:'image/jpeg'}));form.set('recipe',JSON.stringify({format:'folded',mode:ids.length?'personal':'default',defaultRevision,photoIds:ids,frame:'moss',crops:Object.fromEntries(ids.map(id=>[id,{x:.5,y:.5,zoom:1}])),requestKey:key,confirmationKey:confirmationKey||s.confirmationKey,addressVersion:s.addressVersion}));return form;}
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
  await t.test('Candy cane is accepted and preserved in the saved print recipe; unknown frames are rejected',async()=>{
   await reset();
   const invalid=await order(),bad=JSON.parse(invalid.get('recipe') as string);bad.frame='unknown';invalid.set('recipe',JSON.stringify(bad));
   assert.equal((await guest('print/orders',invalid)).status,400);
   const form=await order(),recipe=JSON.parse(form.get('recipe') as string);recipe.frame='santa';form.set('recipe',JSON.stringify(recipe));
   const response=await guest('print/orders',form);assert.equal(response.status,200,await response.clone().text());
   const result:any=await response.json(),saved=await db.prepare('SELECT recipe_json FROM print_orders WHERE id=?').bind(result.order.id).first<any>();
   assert.equal(JSON.parse(saved.recipe_json).frame,'santa');
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
   for(const extra of [{printNote:''}]){await reset();await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({...published,...extra})).run();assert.equal((await status()).eligible,false);}
  });
  await t.test('draft saves clear ineligible permission without changing the published snapshot',async()=>{
   await reset();const initial=await (await admin('editions/2026/state')).json() as any;
   const changed={...published,photos:photos.map(p=>p.id==='three'?{...p,hidden:true}:p)};
   const saved=await admin('editions/2026/draft',{version:initial.version,draft:changed});assert.equal(saved.status,200);const result=await saved.json() as any;assert.deepEqual(result.printInvitations,['invite']);
   assert.equal((await status()).eligible,true,'Draft changes do not alter the guest publication');
   assert.equal((await admin('editions/2026/publish',{version:result.version})).status,200);assert.equal((await status()).eligible,true,'Under three photos uses the default keepsake');
   const fresh=await (await admin('editions/2026/state')).json() as any;fresh.draft.photos=photos;
   const restored=await admin('editions/2026/draft',{version:fresh.version,draft:fresh.draft});assert.equal(restored.status,200);assert.deepEqual((await restored.json() as any).printInvitations,['invite']);
  });
  await t.test('both permission gates control default access; under-three photos has a fixed one-card order',async()=>{
   await reset();const path='keepsake/default/'+defaultRevision+'/moss';
   assert.equal((await guest(path,undefined,{cookie:false})).status,401);
   for(const count of [0,1,2]){
    await reset();await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({...published,photos:photos.slice(0,count)})).run();
    const journal=await (await guest('journal')).json() as any;assert.equal(journal.keepsake.enabled,true);assert.equal(journal.keepsake.mode,'default');assert.equal(journal.keepsake.cardCount,1);
    assert.equal((await status()).eligible,true);assert.equal((await guest(path)).status,200);
    const tampered=await order(['one','two','three']);assert.equal((await guest('print/orders',tampered)).status,403);
    const response=await guest('print/orders',await order([]));assert.equal(response.status,200,await response.clone().text());
    const result=await response.json() as any,row=await db.prepare('SELECT * FROM print_orders WHERE id=?1').bind(result.order.id).first<any>();
    assert.equal(row.card_count,1);assert.equal(row.format,'folded');assert.equal(row.back_text,'pixelbook ’26');assert.equal(row.artwork_key,row.default_artwork_key);assert.deepEqual(new Uint8Array(await (await bucket.get(row.artwork_key))!.arrayBuffer()),new Uint8Array([...defaultJPEG,4]),'Server-owned default replaces any uploaded substitute');
    assert.equal((await db.prepare("SELECT print_order_count FROM invites WHERE id='invite'").first<any>()).print_order_count,1);
   }
   for(const sql of ['UPDATE editions SET allow_print_orders=0 WHERE year=2026',"UPDATE invites SET allow_print=0 WHERE id='invite'"]){await reset();await db.prepare(sql).run();assert.equal((await guest(path)).status,403);const journal=await (await guest('journal')).json() as any;assert.equal(journal.keepsake.enabled,false);assert.equal((await guest('print/orders',await order())).status,409);}
  });
  await t.test('separate default notes persist with emojis, select the right card, and freeze on each order',async()=>{
   const defaultPrintNote='From our pack to yours 🐾❤️';
   for(const count of [2,3]){
    await reset();
    const initial=await (await admin('editions/2026/state')).json() as any;
    const draft={...published,defaultPrintNote,photos:photos.slice(0,count)};
    const save=await admin('editions/2026/draft',{version:initial.version,draft});assert.equal(save.status,200,await save.clone().text());
    const saved=await save.json() as any;
    assert.equal((await (await admin('editions/2026/state')).json() as any).draft.defaultPrintNote,defaultPrintNote);
    assert.equal((await admin('editions/2026/publish',{version:saved.version})).status,200);
    const response=await guest('print/orders',await order(count>=3?['one','two','three']:[]));assert.equal(response.status,200,await response.clone().text());
    const row=await db.prepare('SELECT * FROM print_orders').first<any>();
    assert.equal(row.note,count>=3?published.printNote:defaultPrintNote);assert.equal(row.default_note,defaultPrintNote);
    await db.prepare("UPDATE editions SET published_json=json_set(published_json,'$.defaultPrintNote','Changed later') WHERE year=2026").run();
    const history=(await (await admin('editions/2026/print-orders')).json() as any).orders[0];assert.equal(history.default_note,defaultPrintNote);assert.equal(history.note,row.note);
   }
   await reset();const initial=await (await admin('editions/2026/state')).json() as any;
   for(const note of ['x'.repeat(351),Array(12).fill('line').join('\n')])assert.equal((await admin('editions/2026/draft',{version:initial.version,draft:{...published,defaultPrintNote:note}})).status,400);
  });
  await t.test('default-only orders expose their frozen proof only to their household and survive new default designs',async()=>{
   await reset();await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({...published,photos:[]})).run();
   const response=await guest('print/orders',await order([]));assert.equal(response.status,200);
   const placed=(await response.json() as any).order;assert.equal(placed.cardCount,1);assert.equal(placed.artworkSrc,`/api/print/orders/${placed.id}/artwork`);
   const path=placed.artworkSrc.slice(5),before=await guest(path);assert.equal(before.status,200);const bytes=new Uint8Array(await before.arrayBuffer());
   assert.equal((await guest(path,undefined,{cookie:false})).status,401);
   const otherSession='e'.repeat(64);
   await db.prepare("INSERT INTO invites(id,person_id,token_hash,name,phone,expires_at,member_ids) VALUES('other-proof','partner','other-proof-hash','Other household','+15555550101',?1,'[\"partner\"]')").bind(expires).run();
   await db.prepare("INSERT INTO sessions(token_hash,invite_id,expires_at) VALUES(?1,'other-proof',?2)").bind(await digest(otherSession),expires).run();
   assert.equal((await mf.dispatchFetch('http://guest.test'+placed.artworkSrc,{headers:{Cookie:'__Host-year_session='+otherSession}})).status,404);
   await db.prepare("UPDATE keepsake_defaults SET revision=?1 WHERE year=2026").bind('f'.repeat(32)).run();
   await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify(published)).run();
   const journal=(await (await guest('journal')).json() as any).keepsake;assert.equal(journal.mode,'default');assert.equal(journal.order.id,placed.id);assert.equal(journal.order.artworkSrc,placed.artworkSrc);
   assert.deepEqual(new Uint8Array(await (await guest(path)).arrayBuffer()),bytes);
   assert.equal((await status()).order.artworkSrc,placed.artworkSrc);
   assert.equal((await admin('editions/2026/invitations/invite/reset-print-allowance',{orderId:placed.id,confirm:true})).status,200);
   assert.equal((await guest(path)).status,404);assert.equal((await (await guest('journal')).json() as any).keepsake.order,undefined);
   await db.prepare('UPDATE keepsake_defaults SET revision=?1 WHERE year=2026').bind(defaultRevision).run();
  });
  await t.test('personalized orders snapshot two proofs in the same border and reset releases both',async()=>{
   await reset();const journal=await (await guest('journal')).json() as any;assert.equal(journal.keepsake.mode,'personal');assert.equal(journal.keepsake.cardCount,1);assert.equal(journal.keepsake.format,'folded');
   const form=await order(),recipe=JSON.parse(form.get('recipe') as string);recipe.frame='santa';form.set('recipe',JSON.stringify(recipe));
   const response=await guest('print/orders',form);assert.equal(response.status,200,await response.clone().text());const result=await response.json() as any;
   const row=await db.prepare('SELECT * FROM print_orders WHERE id=?1').bind(result.order.id).first<any>();assert.equal(row.card_count,2);assert.notEqual(row.artwork_key,row.default_artwork_key);assert.equal(row.default_revision,defaultRevision);
   assert.deepEqual(new Uint8Array(await (await bucket.get(row.default_artwork_key))!.arrayBuffer()),new Uint8Array([...defaultJPEG,5]));
   assert.equal((await admin('editions/2026/print-orders/'+result.order.id+'/default-artwork')).status,200);
   assert.equal((await admin('editions/2026/invitations/invite/reset-print-allowance',{orderId:result.order.id,confirm:true})).status,200);
   assert.equal(await bucket.head(row.artwork_key),null);assert.equal(await bucket.head(row.default_artwork_key),null);
  });
  await t.test('only folded cards can be created and every surface is frozen with one physical card',async()=>{
   await reset();const invalid=await order(),recipe=JSON.parse(invalid.get('recipe') as string);recipe.format='flat';invalid.set('recipe',JSON.stringify(recipe));
   assert.equal((await guest('print/orders',invalid)).status,409);
   assert.equal((await db.prepare('SELECT count(*) n FROM print_orders').first<any>()).n,0);
   const response=await guest('print/orders',await order());assert.equal(response.status,200);
   const placed=(await response.json() as any).order;
   assert.equal(placed.format,'folded');assert.equal(placed.cardCount,1);assert.equal(placed.personalized,true);
   assert.equal(placed.preview.backText,'pixelbook ’26');assert.equal(placed.preview.note,foldedPreviewNote);assert.equal(placed.preview.authors,'Pixel');assert.ok(!JSON.stringify(placed).includes(published.printNote),'Guest receipts never expose the real note');assert.equal((await status()).preview.note,foldedPreviewNote);
   const row=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(row.format,'folded');assert.equal(row.note,published.printNote,'Actual note is frozen for fulfillment');assert.equal(row.back_text,'pixelbook ’26');assert.equal(row.status,'simulated');const payload=JSON.parse(row.handwrytten_order_json);assert.equal(payload.addresses[0].message,published.printNote);assert.equal(payload.font,'hwDavid');assert.equal(payload.font_size,13);assert.equal(payload.auto_font_size,true);assert.ok(!JSON.stringify(payload).includes(foldedPreviewNote));assert.equal(JSON.parse(row.recipe_json).layout,'a2-portrait-v1');
   const inside=await guest(placed.defaultSrc.slice(5));assert.equal(inside.status,200);const frozen=await inside.arrayBuffer();
   assert.equal((await guest(placed.defaultSrc.slice(5),undefined,{cookie:false})).status,401);
   await db.prepare("UPDATE editions SET published_json=json_set(published_json,'$.printNote','New note','$.authors','New authors') WHERE year=2026").run();
   await bucket.put('default-moss.jpg',new Uint8Array([1,2,3]));
   const saved=(await status()).order;assert.deepEqual(saved.preview,placed.preview);
   assert.deepEqual(await (await guest(saved.defaultSrc.slice(5))).arrayBuffer(),frozen);
   const history=(await (await admin('editions/2026/print-orders')).json() as any).orders[0];assert.equal(history.back_text,'pixelbook ’26');assert.equal(history.format,'folded');assert.equal(history.note,published.printNote,'Admin proofs retain the real note');
   await bucket.put('default-moss.jpg',new Uint8Array([...defaultJPEG,4]));
   assert.equal(printOrderView({...row,format:'legacy'}).cardCount,2,'Historical two-card orders keep their original meaning');
  });
  await t.test('guest previews and orders never wait for Handwrytten; admin proofs use frozen artwork and payloads',async()=>{
   await reset();const before=vendorCalls.length;
   assert.equal((await (await proofGuest('print/status')).json() as any).picturePreviews,'local');
   assert.equal((await proofGuest('print/previews',await order(),'')).status,401);
   assert.equal((await proofGuest('print/previews',await order())).status,410);
   const form=await order(),recipe=JSON.parse(form.get('recipe') as string);recipe.previewId='untrusted';recipe.note='wrong preview note';recipe.font_size=80;form.set('recipe',JSON.stringify(recipe));
   const response=await proofGuest('print/orders',form);assert.equal(response.status,200,await response.clone().text());const receipt=(await response.json() as any).order;
   assert.equal(receipt.pictures,undefined);assert.equal(receipt.status,'simulated');assert.equal(vendorCalls.length,before);
   const saved=await db.prepare('SELECT * FROM print_orders').first<any>(),originalPayload=JSON.parse(saved.handwrytten_order_json);assert.equal(originalPayload.card_id,null);assert.equal(originalPayload.font_size,13);assert.equal(originalPayload.addresses[0].message,published.printNote);
   // Publishing different art/note after ordering must never change this proof.
   await bucket.put('default-moss.jpg',new Uint8Array([...defaultJPEG,99]));
   await db.prepare("UPDATE editions SET published_json=json_set(published_json,'$.printNote','Changed later'),allow_print_orders=0 WHERE year=2026").run();
   const route='editions/2026/print-orders/'+receipt.id+'/prepare-proof';
   assert.equal((await admin(route,{},false)).status,401);assert.equal(vendorCalls.length,before);
   const first=await admin(route,{});assert.equal(first.status,200,await first.clone().text());const proof=await first.json() as any;assert.equal(proof.status,'ready');
   const uploads=vendorCalls.filter(c=>c.path.endsWith('/uploadCustomLogo'));
   assert.deepEqual(uploads.filter(c=>c.body.type==='cover').at(-1)!.body.bytes,[...defaultJPEG]);assert.deepEqual(uploads.filter(c=>c.body.type==='logo').at(-1)!.body.bytes,[...defaultJPEG,4]);
   const count=vendorCalls.length;assert.equal((await admin(route,{})).status,200);assert.equal(vendorCalls.length,count,'Saved proof is reused');
   const row=await db.prepare('SELECT * FROM print_orders').first<any>(),payload=JSON.parse(row.handwrytten_order_json);assert.equal(row.handwrytten_preview_id,proof.id);assert.ok(payload.card_id);const {card_id,...rest}=payload,{card_id:oldCard,...oldRest}=originalPayload;assert.deepEqual(rest,oldRest,'Proof attachment preserves real note, font and address');
   assert.equal((await admin('editions/2026/print-orders/'+receipt.id+'/vendor-inside')).status,200);assert.equal((await admin('editions/2025/print-orders/'+receipt.id+'/prepare-proof',{})).status,404);
   assert.equal((await (await proofGuest('print/status')).json() as any).order.pictures,undefined,'Guest receipts remain local after admin proof generation');
   for(const call of vendorCalls){assert.ok(!/\/(orders|basket|payments)\//.test(call.path));if(call.path.endsWith('/createCustomCard'))assert.ok(!JSON.stringify(call.body).includes(published.printNote));}
   await bucket.put('default-moss.jpg',new Uint8Array([...defaultJPEG,4]));
  });
  await t.test('default admin proofs use saved server artwork, blank inside left and require Test Mode',async()=>{
   await reset();await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({...published,photos:[],defaultPrintNote:'The real default note 🐾'})).run();
   hwMode=0;const before=vendorCalls.length,response=await proofGuest('print/orders',await order([]));assert.equal(response.status,200);assert.equal(vendorCalls.length,before,'Vendor unavailability does not block simulated orders');const receipt=(await response.json() as any).order;
   const route='editions/2026/print-orders/'+receipt.id+'/prepare-proof';assert.equal((await admin(route,{})).status,409);
   assert.equal(vendorCalls.filter(c=>c.path.endsWith('/uploadCustomLogo')).length,vendorCalls.slice(0,before).filter(c=>c.path.endsWith('/uploadCustomLogo')).length);
   hwMode=1;const proof=await admin(route,{});assert.equal(proof.status,200,await proof.clone().text());
   const card=vendorCalls.filter(c=>c.path.endsWith('/createCustomCard')).at(-1)!.body;assert.equal(card.cover_size_percent,90);assert.equal(card.main_type,'text');assert.equal(card.main_text,'');assert.equal(card.main_logo_id,undefined);
   const payload=JSON.parse((await db.prepare('SELECT handwrytten_order_json FROM print_orders').first<any>()).handwrytten_order_json);assert.equal(payload.addresses[0].message,'The real default note 🐾');assert.equal(payload.font_size,13);
   const manifest=(await (await proofGuest('journal')).json() as any).keepsake;assert.equal(manifest.order.pictures,undefined);assert.equal(manifest.order.preview.note,foldedPreviewNote);
  });
  await t.test('failed admin proof retrieval retries the same design and never fetches an arbitrary URL',async()=>{
   await reset();const response=await proofGuest('print/orders',await order()),receipt=(await response.json() as any).order,route='editions/2026/print-orders/'+receipt.id+'/prepare-proof';
   hwBadURL=true;const creates=vendorCalls.filter(c=>c.path.endsWith('/createCustomCard')).length;
   assert.equal((await admin(route,{})).status,502);assert.equal(vendorCalls.filter(c=>c.path.endsWith('/createCustomCard')).length,creates+1);
   assert.equal((await db.prepare('SELECT handwrytten_preview_id FROM print_orders').first<any>()).handwrytten_preview_id,null);
   hwBadURL=false;assert.equal((await admin(route,{})).status,200);assert.equal(vendorCalls.filter(c=>c.path.endsWith('/createCustomCard')).length,creates+1,'Retries never create another design');
  });
  await t.test('swapped local placement is frozen and used by the later admin proof',async()=>{
   await reset();const form=await order(),recipe=JSON.parse(form.get('recipe') as string);recipe.frontDesign='default';form.set('recipe',JSON.stringify(recipe));
   const before=vendorCalls.length,response=await proofGuest('print/orders',form);assert.equal(response.status,200);const receipt=(await response.json() as any).order;assert.equal(vendorCalls.length,before);assert.equal(receipt.frontDesign,'default');
   const proof=await admin('editions/2026/print-orders/'+receipt.id+'/prepare-proof',{});assert.equal(proof.status,200,await proof.clone().text());
   const cover=vendorCalls.filter(c=>c.path.endsWith('/uploadCustomLogo')&&c.body.type==='cover').at(-1)!,inside=vendorCalls.filter(c=>c.path.endsWith('/uploadCustomLogo')&&c.body.type==='logo').at(-1)!;
   assert.deepEqual(cover.body.bytes,[...defaultJPEG,4]);assert.deepEqual(inside.body.bytes,[...defaultJPEG]);
   const row=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(JSON.parse(row.recipe_json).frontDesign,'default');assert.equal(JSON.parse(row.handwrytten_order_json).addresses[0].message,published.printNote);
  });
  await t.test('default-only guests cannot request a personal cover and invalid placement is rejected',async()=>{
   await reset();await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({...published,photos:[]})).run();
   const before=vendorCalls.length,form=await order([]),recipe=JSON.parse(form.get('recipe') as string);recipe.frontDesign='personal';form.set('recipe',JSON.stringify(recipe));
   assert.equal((await proofGuest('print/orders',form)).status,403);assert.equal(vendorCalls.length,before);
   const invalid=await order([]),bad=JSON.parse(invalid.get('recipe') as string);bad.frontDesign='inside-right';invalid.set('recipe',JSON.stringify(bad));assert.equal((await guest('print/orders',invalid)).status,400);
   const invalidOrder=await order([]),wrong=JSON.parse(invalidOrder.get('recipe') as string);wrong.frontDesign='personal';invalidOrder.set('recipe',JSON.stringify(wrong));assert.equal((await guest('print/orders',invalidOrder)).status,403);
   assert.equal((await db.prepare('SELECT count(*) n FROM print_orders').first<any>()).n,0);
  });
  await t.test('local simulated orders also preserve swapped surfaces and legacy orders keep their original placement',async()=>{
   await reset();const form=await order(),recipe=JSON.parse(form.get('recipe') as string);recipe.frontDesign='default';form.set('recipe',JSON.stringify(recipe));
   const response=await guest('print/orders',form);assert.equal(response.status,200);const placed=(await response.json() as any).order;assert.equal(placed.frontDesign,'default');
   const row=await db.prepare('SELECT * FROM print_orders').first<any>();assert.deepEqual(new Uint8Array(await (await bucket.get(row.artwork_key))!.arrayBuffer()),new Uint8Array([...defaultJPEG,4]));
   assert.equal(printOrderView({...row,recipe_json:'{}'}).frontDesign,'personal');assert.equal(printOrderView({...row,card_count:1,recipe_json:'{}'}).frontDesign,'default');
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
   const row=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(row.status,'simulated');assert.ok(await bucket.get(row.artwork_key));assert.equal(row.note,published.printNote);assert.equal(row.default_note,published.printNote);
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
