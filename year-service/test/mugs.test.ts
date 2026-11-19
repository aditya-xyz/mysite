import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {digest} from '../src/security.ts';
import type {Draft} from '../src/edition.ts';
import {curatedMugIds} from '../src/mug-catalog.ts';
import {mugDisplayKey} from '../src/mug-images.ts';

test('configured mugs follow draft publication, minimum count, access and deletion protections',async t=>{
 const issuer='https://mugs-test.cloudflareaccess.com';
 const {publicKey,privateKey}=await generateKeyPair('RS256',{extractable:true});
 const jwk={...await exportJWK(publicKey),kid:'mugs',alg:'RS256',use:'sig'};
 const jwt=await new SignJWT({email:'owner@example.com'}).setProtectedHeader({alg:'RS256',kid:'mugs'}).setSubject('owner').setIssuedAt().setIssuer(issuer).setAudience('mugs').setExpirationTime('10m').sign(privateKey);
 const editorJwt=await new SignJWT({email:'editor@example.com'}).setProtectedHeader({alg:'RS256',kid:'mugs'}).setSubject('editor').setIssuedAt().setIssuer(issuer).setAudience('mugs').setExpirationTime('10m').sign(privateKey);
 let estimatedTotal=14.24,providerFailed=false,estimateCountry='US';const providerCalls:string[]=[];
 const shared={modules:true,compatibilityDate:'2026-08-06',d1Databases:{DB:'mug-db'},r2Buckets:{MEDIA:'mug-media'},outboundService:async(req:Request)=>{
  if(req.url.startsWith('https://files.cdn.printful.com/'))return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=','base64'),{headers:{'Content-Type':'image/png'}});
  if(req.url.startsWith('https://api.printful.com/')){
   const path=new URL(req.url).pathname;providerCalls.push(path);assert.equal(req.headers.get('Authorization'),'Bearer fake-read-only');
   if(providerFailed)return new Response('private provider error',{status:503});
   if(path==='/orders')return Response.json({error:'Synthetic supplier outage'},{status:503});
   if(path==='/products')return Response.json({result:[{id:19,type:'MUG',title:'White Glossy Mug'}]});
   if(path.startsWith('/mockup-generator/printfiles/'))return Response.json({result:{printfiles:[{printfile_id:43,width:2700,height:1050}],variant_printfiles:[{variant_id:1320,placements:{default:43}}]}});
   if(path.startsWith('/mockup-generator/create-task/')){const data=await req.json() as any;assert.equal(data.files[0].placement,'default');assert.deepEqual(data.files[0].position,{area_width:2700,area_height:1050,width:2700,height:1050,top:0,left:0});assert.match(data.files[0].image_url,/^https:\/\/live.test\/api\/gift\/mockup-source\/[a-f0-9]{64}$/);return Response.json({result:{task_key:'mockup-task',status:'pending'}});}
   if(path==='/mockup-generator/task')return Response.json({result:{status:'completed',mockups:[{mockup_url:'https://files.cdn.printful.com/mockup.png'}]}});
   if(path.startsWith('/products/'))return Response.json({result:{variants:[{id:1320,size:'11 oz',color:'White',price:'6.07',in_stock:true,availability_regions:{US:'United States'}}]}});
   if(path==='/shipping/rates')return Response.json({result:[{id:'STANDARD',rate:'7.09',currency:'USD'}]});
   assert.equal(path,'/orders/estimate-costs');const payload=await req.json() as any;
   assert.equal(payload.recipient.address1,'123 Verified Lane');assert.equal(payload.recipient.zip,estimateCountry==='US'?'97201':estimateCountry==='IN'?'411001':'1234 AB');assert.equal(payload.recipient.country_code,estimateCountry);assert.equal(payload.recipient.name,undefined);assert.equal(payload.items[0].files,undefined);
   return Response.json({result:{costs:{currency:'USD',subtotal:6.07,shipping:estimatedTotal-7.15,tax:1.08,vat:0,discount:0,total:estimatedTotal}}});
  }
  assert.equal(req.url,issuer+'/cdn-cgi/access/certs');return Response.json({keys:[jwk]});
 }};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{...shared,name:'live',routes:['live.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{LIVE_GIFT_ORDERING:'true',PRINTFUL_STORE_ID:'123',SOCIAL_JOURNAL_ORIGIN:'https://live.test',SMS_ENABLED:'false',ORDER_MODE:'simulation',PRINTFUL_ENABLED:'true',PRINTFUL_API_TOKEN:'fake-read-only'}},{...shared,name:'admin',routes:['admin.test/*'],scriptPath:'.wrangler/admin-test-bundle/index.js',bindings:{ADMIN_EMAIL:'owner@example.com',ADMIN_EMAILS:'editor@example.com',ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:'mugs',JOURNAL_ORIGIN:'https://guest.test',ORDER_MODE:'simulation',PRINTFUL_ENABLED:'true',PRINTFUL_API_TOKEN:'fake-read-only'}},{...shared,name:'guest',routes:['guest.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{SMS_ENABLED:'false'}},{...shared,name:'sim',routes:['sim.test/*'],scriptPath:'.wrangler/test-bundle/index.js',bindings:{SMS_ENABLED:'false',ORDER_MODE:'simulation'}}]}));
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
  await db.prepare("INSERT INTO people(id,name) VALUES('mug-partner','Partner Fullname')").run();
  await db.prepare('UPDATE invites SET member_ids=?1 WHERE id=?2').bind(JSON.stringify(['contact-mug-invite','mug-partner']),'mug-invite').run();
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
   assert.equal((await admin('draft',{draft,version},'')).status,401);assert.equal((await admin('mug-preview-library',undefined,'')).status,401);
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
  await t.test('display copies stay authenticated and separate from full-resolution print sources',async()=>{
   const displayPath=`mugs/mug-0/display?version=${cutoutVersion}`;
   assert.equal((await guest(displayPath,false)).status,401);
   assert.equal((await guest('mugs/mug-4/display')).status,404);
   assert.equal((await guest('mugs/mug-0/display?version='+ 'b'.repeat(32))).status,404);
   assert.equal((await guest(displayPath)).headers.get('Content-Type'),'image/png','Older versions fall back safely until prepared');
   const bytes=new TextEncoder().encode('synthetic display WebP');await bucket.put(mugDisplayKey(2026,'mug-0',cutoutVersion),bytes);
   const display=await guest(displayPath);assert.equal(display.status,200);assert.equal(display.headers.get('Content-Type'),'image/webp');assert.deepEqual(new Uint8Array(await display.arrayBuffer()),bytes);
   const full=await guest('mugs/mug-0');assert.equal(full.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await full.arrayBuffer()),rgbaPNG);
   const journal:any=await (await guest('journal')).json();assert.match(journal.gift.designs[0].src,/\/display\?version=/);assert.doesNotMatch(journal.gift.designs[0].printSrc,/\/display/);
   const preview:any=await (await admin('preview')).json();assert.match(preview.gift.designs[0].src,/\/display$/);assert.doesNotMatch(preview.gift.designs[0].printSrc,/\/display/);
   const path=`media/mug-0/cutout/${cutoutVersion}/display`;assert.equal((await admin(path,undefined,'')).status,401);assert.equal((await admin(path)).headers.get('Content-Type'),'image/webp');
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
   assert.equal((await (await sim('journal')).json() as any).gift.hasOrder,false);
   assert.equal((await (await sim('journal')).json() as any).gift.claim,null);
   for(const configuration of [{style:'unknown',size:'11oz',color:'white',font:'clean'},{style:'classic',size:'12oz',color:'white',font:'clean'},{style:'classic',size:'11oz',color:'red',font:'clean'},{style:'classic',size:'11oz',color:'white',font:'injected'},null]){
    assert.equal((await sim('gift/claim',{...payload,configuration})).status,400);
   }
   const configuration={style:'color-inside',size:'15oz',color:'blue',font:'handwritten'};
   const results=await Promise.all(Array.from({length:6},async()=>{const response=await sim('gift/claim',{...payload,configuration});assert.equal(response.status,200,await response.clone().text());return (await response.json() as any).claim;}));
   assert.equal(new Set(results.map(o=>o.id)).size,1);const first=results[0];assert.equal(first.status,'simulated');assert.deepEqual(first.configuration,configuration);assert.deepEqual((await (await sim('gift/status')).json() as any).claim.configuration,configuration);assert.equal(first.address.name,'Verified Recipient & Partner Fullname');assert.equal(first.address.line1,'123 Verified Lane');assert.equal(first.design.caption,'caption 0');
   assert.equal((await sim(first.design.src.replace('/api/',''))).headers.get('Content-Type'),'image/png');
   const history=await (await admin('mug-orders')).json() as any;assert.equal(history.orders.length,1);assert.deepEqual(JSON.parse(history.orders[0].configuration_json),configuration);assert.equal(history.orders[0].live,0);assert.equal(history.orders[0].live_state,null);assert.equal(history.counts[0].count,1);assert.equal(history.counts[0].live,0);assert.equal(history.counts[0].live_state,null);assert.equal(history.counts[0].can_reset,1);
   assert.equal((await db.prepare("SELECT mug_order_count,print_order_count FROM invites WHERE id='mug-invite'").first<any>()).mug_order_count,1);
   assert.equal((await sim('journal')).status,200);assert.equal((await (await sim('journal')).json() as any).gift.mode,'simulation');assert.equal((await (await sim('journal')).json() as any).gift.hasOrder,true);
   const savedGift=(await (await sim('journal')).json() as any).gift.claim;
   assert.deepEqual(savedGift,{designId:first.designId,status:first.status,approvalRequired:first.approvalRequired,configuration:first.configuration,design:first.design});
   assert.equal('address' in savedGift,false,'Journal preloads only the gift display, without shipping details');
   assert.equal((await admin('mug-settings',{allowMugOrders:false})).status,200);
   assert.equal((await (await sim('gift/status')).json() as any).claim.id,first.id);assert.equal((await sim(first.design.src.replace('/api/',''))).status,200);
   assert.equal((await admin('mug-settings',{allowMugOrders:true})).status,200);
   const resetPath='invitations/mug-invite/reset-mug-allowance';assert.equal((await admin(resetPath,{orderId:first.id})).status,400);
   assert.equal((await admin(resetPath,{orderId:first.id,confirm:true})).status,200);
   const cleared=await (await admin('mug-orders')).json() as any;assert.equal(cleared.orders.length,0);assert.equal(cleared.counts[0].count,0);assert.equal(cleared.counts[0].live,0);assert.equal(cleared.counts[0].live_state,null);assert.equal(cleared.counts[0].can_reset,0);assert.equal((await db.prepare("SELECT mug_order_count FROM invites WHERE id='mug-invite'").first<any>()).mug_order_count,0);assert.equal((await (await sim('gift/status')).json() as any).claim,null);
   assert.equal((await (await sim('journal')).json() as any).gift.hasOrder,false);
   assert.equal((await (await sim('journal')).json() as any).gift.claim,null);
   assert.equal((await sim(first.design.src.replace('/api/',''))).status,404);assert.equal(await bucket.head(`2026/mug-orders/${first.id}/artwork.png`),null);
   const second=(await (await sim('gift/claim',{...payload,requestKey:crypto.randomUUID()})).json() as any).claim;assert.notEqual(second.id,first.id);assert.deepEqual(second.configuration,{style:'color-inside',size:'15oz',color:'dark blue',font:'clean'});
   assert.equal((await admin(resetPath,{orderId:first.id,confirm:true})).status,409);assert.equal((await (await sim('gift/status')).json() as any).claim.id,second.id);
   assert.equal((await admin(resetPath,{orderId:second.id,confirm:true})).status,200);
  });
  await t.test('budget-filtered mug claims need no address estimate and only save simulated orders',async()=>{
   const live=(path:string,data?:unknown,auth=true)=>mf.dispatchFetch('https://live.test/api/gift/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:'https://live.test',...(auth?{Cookie:'__Host-year_session='+raw}:{}),'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
   const payload={addressVersion:1,designId:'mug-0',requestKey:crypto.randomUUID(),configuration:{style:'classic',size:'11oz',color:'white',font:'clean'}};
   assert.equal((await live('catalog',undefined,false)).status,401);assert.equal((await live('quote',payload,false)).status,401);
   assert.equal((await live('quote',{...payload,addressVersion:99})).status,409);assert.equal(providerCalls.length,0);
   assert.equal((await (await live('status')).json() as any).livePricing,true);assert.equal(providerCalls.length,0);
   const catalogResponse=await live('catalog');const catalog=await catalogResponse.json() as any;assert.equal(catalogResponse.status,200,JSON.stringify({catalog,providerCalls}));assert.equal(catalog.provider,'printful');assert.equal(catalog.styles[0].variants[0].id,1320);
   assert.equal((await (await live('quote',payload)).json() as any).totalCents,1424);
   estimatedTotal=25.01;assert.equal((await (await live('quote',payload)).json() as any).withinBudget,false);
   const blocked=await live('claim',{...payload,configuration:{style:'classic',size:'99oz',color:'white',font:'clean'}});assert.equal(blocked.status,400,'Only eligible catalog variants can be claimed');
   assert.equal((await db.prepare('SELECT count(*) n FROM mug_orders').first<any>()).n,0);
   await db.prepare("INSERT OR REPLACE INTO rate_limits(key,count,expires_at) VALUES('mug-estimate:mug-invite',21,unixepoch()+300)").run();
   assert.equal((await live('claim',payload)).status,409,'New paired artwork must exist before accepting the reservation');
   const published=JSON.parse((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<any>()).published_json),design=published.mugDesigns[0];
   const sourceId=await digest(JSON.stringify([4,2026,design.id,design.cutoutVersion,design.caption,'clean','dark',2700,1050,19]));
   await bucket.put(`2026/prepared-mugs/sources/${sourceId}.png`,'frozen-paired-artwork');
   const beforeClaim=providerCalls.length;providerFailed=true;
   const response=await live('claim',payload);assert.equal(response.status,200,await response.clone().text());providerFailed=false;
   assert.equal(providerCalls.length,beforeClaim,'Claim does not send an address or request a Printful cost estimate');
   const result=await response.json() as any;assert.equal(result.claim.status,'simulated');
   const row=await db.prepare('SELECT artwork_key,quote_json,status,print_artwork_key,print_layout_version FROM mug_orders').first<any>();assert.equal(row.status,'simulated');assert.equal(row.quote_json,null);assert.equal(row.print_layout_version,4);assert.equal(await (await bucket.get(row.print_artwork_key))?.text(),'frozen-paired-artwork');
   const history=await (await admin('mug-orders')).json() as any;assert.equal(history.orders[0].quote_json,null);assert.equal(history.orders[0].live,0);assert.equal(history.counts[0].can_reset,1);
   estimatedTotal=14.24;await db.prepare("DELETE FROM rate_limits WHERE key='mug-estimate:mug-invite'").run();
   const callsBefore=providerCalls.length;assert.equal((await live('claim',payload)).status,200);assert.equal(providerCalls.length,callsBefore,'Idempotent replay needs no new supplier call');
   assert.ok(providerCalls.every(path=>path==='/products'||/^\/(products|mockup-generator\/printfiles)\/\d+$/.test(path)||path==='/orders/estimate-costs'));
   const reset=await admin('invitations/mug-invite/reset-mug-allowance',{orderId:result.claim.id,confirm:true});assert.equal(reset.status,200);assert.equal(await bucket.head(row.artwork_key),null);assert.equal(await bucket.head(row.print_artwork_key),null);assert.equal((await db.prepare("SELECT mug_order_count FROM invites WHERE id='mug-invite'").first<any>()).mug_order_count,0);
  });
  await t.test('fresh scoped live checkout freezes the larger print file and rejects an over-budget domestic quote',async()=>{
   await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'mug-claim:%' OR key LIKE 'mug-estimate:%'").run();
   await db.prepare("INSERT INTO live_gift_permissions(year,invitation_id,person_id,member_ids,postcard_enabled,mug_enabled,enabled,expires_at) SELECT edition_year,id,person_id,member_ids,1,1,1,unixepoch()+3600 FROM invites WHERE id='mug-invite'").run();
   const live=(data:unknown)=>mf.dispatchFetch('https://live.test/api/gift/claim',{method:'POST',headers:{Origin:'https://live.test',Cookie:'__Host-year_session='+raw,'Content-Type':'application/json'},body:JSON.stringify(data)});
   const payload={addressVersion:1,designId:'mug-0',requestKey:crypto.randomUUID(),configuration:{style:'classic',size:'11oz',color:'white',font:'clean'}};
   let orderId:string|undefined,artworkKeys:string[]=[];
   try{
    estimatedTotal=25.01;const over=await live(payload);assert.equal(over.status,409,await over.clone().text());assert.equal((await db.prepare('SELECT count(*) n FROM live_gift_orders').first<any>()).n,0);
    estimatedTotal=14.24;const response=await live(payload);assert.equal(response.status,200,await response.clone().text());const result=await response.json() as any;
    orderId=result.claim.id;assert.equal(result.claim.live,true);assert.equal(result.mode,'live');
    const intent=await db.prepare('SELECT * FROM live_gift_orders WHERE order_id=?1').bind(orderId).first<any>();assert.equal(intent.max_cents,2500);assert.equal(intent.invitation_id,'mug-invite');assert.equal(intent.kind,'mug');assert.ok(['pending','review'].includes(intent.state));
    const frozen=await db.prepare('SELECT artwork_key,status,allowance_reset_at,print_artwork_key,print_layout_version,quote_json FROM mug_orders WHERE id=?1').bind(orderId).first<any>();assert.equal(frozen.status,'simulated');assert.equal(frozen.allowance_reset_at,null);assert.equal(frozen.print_layout_version,4);assert.ok(await bucket.head(frozen.artwork_key));assert.equal(await (await bucket.get(frozen.print_artwork_key))?.text(),'frozen-paired-artwork');assert.equal(JSON.parse(frozen.quote_json).destination,'US');
    artworkKeys=[frozen.artwork_key,frozen.print_artwork_key].filter(Boolean);
    const before=providerCalls.length;assert.equal((await live(payload)).status,200);assert.equal(providerCalls.length,before,'Repeated checkout reuses the existing order');
    const history=await (await admin('mug-orders')).json() as any;assert.equal(history.orders.length,1);assert.equal(history.orders[0].id,orderId);assert.equal(history.orders[0].status,'simulated');assert.equal(history.orders[0].live,1);assert.ok(['pending','review'].includes(history.orders[0].live_state));
    assert.equal(history.counts[0].count,1);assert.equal(history.counts[0].active_order_id,orderId);assert.equal(history.counts[0].status,'simulated');assert.equal(history.counts[0].live,1);assert.equal(history.counts[0].live_state,history.orders[0].live_state);assert.equal(history.counts[0].can_reset,0);
    const blockedReset=await admin('invitations/mug-invite/reset-mug-allowance',{orderId,confirm:true});
    assert.equal(blockedReset.status,409,'Simulation reset must not clear a live mug order whose mug_orders row still says simulated');
    const persisted=await db.prepare('SELECT status,allowance_reset_at FROM mug_orders WHERE id=?1').bind(orderId).first<any>();assert.equal(persisted?.status,'simulated');assert.equal(persisted?.allowance_reset_at,null);
    assert.equal((await db.prepare('SELECT order_id FROM live_gift_orders WHERE order_id=?1').bind(orderId).first<any>())?.order_id,orderId);
    assert.equal((await db.prepare("SELECT mug_order_count FROM invites WHERE id='mug-invite'").first<any>()).mug_order_count,1);
    assert.ok(await bucket.head(frozen.artwork_key),'Blocked reset preserves guest artwork in R2');
    assert.equal(await (await bucket.get(frozen.print_artwork_key))?.text(),'frozen-paired-artwork','Blocked reset preserves frozen print artwork in R2');
    assert.equal((await mf.dispatchFetch('https://live.test/api/gift/orders/'+orderId+'/artwork',{headers:{Cookie:'__Host-year_session='+raw}})).status,200);
    const statusAfter=await (await mf.dispatchFetch('https://live.test/api/gift/status',{headers:{Cookie:'__Host-year_session='+raw}})).json() as any;assert.equal(statusAfter.remaining,0);assert.equal(statusAfter.claim.id,orderId);assert.equal(statusAfter.claim.live,true);
    for(const state of ['pending','draft']){
     await db.prepare('UPDATE live_gift_orders SET state=?1 WHERE order_id=?2').bind(state,orderId).run();
     const stateHistory=await (await admin('mug-orders')).json() as any;assert.equal(stateHistory.orders[0].live,1);assert.equal(stateHistory.orders[0].live_state,state);assert.equal(stateHistory.counts[0].can_reset,0);
     assert.equal((await admin('invitations/mug-invite/reset-mug-allowance',{orderId,confirm:true})).status,409);
     assert.ok(await db.prepare('SELECT id FROM mug_orders WHERE id=?1').bind(orderId).first());
     assert.ok(await bucket.head(frozen.artwork_key));
    }
   }finally{
    if(orderId){
     await db.prepare('DELETE FROM live_gift_orders WHERE order_id=?1').bind(orderId).run();
     await db.prepare('DELETE FROM mug_orders WHERE id=?1').bind(orderId).run();
    }
    if(artworkKeys.length)await bucket.delete(artworkKeys);
    await db.prepare("DELETE FROM live_gift_permissions WHERE invitation_id='mug-invite'").run();
    await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'mug-estimate:%'").run();
    providerCalls.length=0;
   }
   assert.equal((await db.prepare("SELECT mug_order_count FROM invites WHERE id='mug-invite'").first<any>()).mug_order_count,0);
  });
  await t.test('international simulated claims check the real destination total and freeze the estimate before using the allowance',async()=>{
   const live=(path:string,data?:unknown)=>mf.dispatchFetch('https://live.test/api/gift/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:'https://live.test',Cookie:'__Host-year_session='+raw,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
   for(const country of ['IN','NL']){
    estimateCountry=country;await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'mug-estimate:%' OR key LIKE 'mug-claim:%'").run();
    const address={line1:'123 Verified Lane',line2:'',city:country==='IN'?'Pune':'Amsterdam',state:country==='IN'?'Maharashtra':'',postalCode:country==='IN'?'411001':'1234 AB',country};
    await db.prepare("UPDATE people SET mailing_address=?1,version=version+1 WHERE id='contact-mug-invite'").bind(JSON.stringify(address)).run();
    await db.prepare("UPDATE people SET address_verified=1,address_verifier=?1,address_verified_at=unixepoch(),address_verified_until=?2,address_verification_key='international-address' WHERE id='contact-mug-invite'").bind(country==='IN'?'admin':'google',country==='IN'?null:Math.floor(Date.now()/1000)+86400).run();
    const person=await db.prepare("SELECT version FROM people WHERE id='contact-mug-invite'").first<any>();
    const payload={addressVersion:person.version,designId:'mug-0',requestKey:crypto.randomUUID(),configuration:{style:'classic',size:'11oz',color:'white',font:'clean'}};
    estimatedTotal=25.01;const pendingResponse=await live('claim',payload);assert.equal(pendingResponse.status,200,await pendingResponse.clone().text());const pending=(await pendingResponse.json() as any).claim;assert.equal(pending.approvalRequired,true);assert.equal((await db.prepare('SELECT budget_review_required FROM mug_orders WHERE id=?1').bind(pending.id).first<any>()).budget_review_required,1);const held=await db.prepare('SELECT * FROM mug_orders WHERE id=?1').bind(pending.id).first<any>();
    assert.equal((await admin(`mug-orders/${pending.id}/approve-budget`,{quote:held.quote_json,confirm:true},'')).status,401);
    assert.equal((await admin(`mug-orders/${pending.id}/approve-budget`,{quote:'{}',confirm:true})).status,409);
    const approval=await admin(`mug-orders/${pending.id}/approve-budget`,{quote:held.quote_json,confirm:true},country==='NL'?editorJwt:jwt);assert.equal(approval.status,200,await approval.clone().text());
    const saved=await db.prepare('SELECT * FROM mug_orders WHERE id=?1').bind(pending.id).first<any>();assert.equal(saved.budget_approved_cents,2501);assert.equal(saved.budget_approved_by,country==='NL'?'editor@example.com':'owner@example.com');assert.equal(saved.budget_review_required,0);assert.equal(saved.configuration_json,held.configuration_json);assert.equal(saved.artwork_key,held.artwork_key);assert.equal(saved.address_json,held.address_json);assert.equal(saved.status,'simulated');
    assert.equal((await admin(`mug-orders/${pending.id}/approve-budget`,{quote:held.quote_json,confirm:true})).status,200);
    estimatedTotal=27.02;assert.equal((await admin(`mug-orders/${pending.id}/quote`,{})).status,200);assert.equal((await db.prepare('SELECT budget_review_required FROM mug_orders WHERE id=?1').bind(pending.id).first<any>()).budget_review_required,1);assert.equal((await admin(`mug-orders/${pending.id}/approve-budget`,{quote:held.quote_json,confirm:true})).status,409);
    assert.equal((await admin('invitations/mug-invite/reset-mug-allowance',{orderId:pending.id,confirm:true})).status,200);
    providerFailed=true;const failed=await live('claim',payload);assert.equal(failed.status,503,await failed.clone().text());providerFailed=false;
    estimatedTotal=14.24;const response=await live('claim',payload);assert.equal(response.status,200,await response.clone().text());
    const receipt=(await response.json() as any).claim,row=await db.prepare('SELECT quote_json,status,address_json FROM mug_orders WHERE id=?1').bind(receipt.id).first<any>();
    assert.equal(row.status,'simulated');assert.equal(JSON.parse(row.quote_json).destination,country);assert.equal(JSON.parse(row.quote_json).totalCents,1424);assert.deepEqual(JSON.parse(row.address_json),address);
    const before=providerCalls.length;assert.equal((await live('claim',payload)).status,200);assert.equal(providerCalls.length,before,'Reopening an existing simulated gift must not repeat the estimate');
    const refreshed=await admin(`mug-orders/${receipt.id}/quote`,{});assert.equal(refreshed.status,200,await refreshed.clone().text());assert.equal((await refreshed.json() as any).quote.destination,country);
    assert.equal((await admin('invitations/mug-invite/reset-mug-allowance',{orderId:receipt.id,confirm:true})).status,200);
   }
   estimateCountry='US';estimatedTotal=14.24;
   await db.prepare("UPDATE people SET mailing_address=?1,version=1 WHERE id='contact-mug-invite'").bind(JSON.stringify({line1:'123 Verified Lane',line2:'',city:'Portland',state:'OR',postalCode:'97201',country:'US'})).run();
   await db.prepare("UPDATE people SET address_verified=1,address_verifier='google',address_verified_at=unixepoch(),address_verified_until=unixepoch()+86400,address_verification_key='mug-address' WHERE id='contact-mug-invite'").run();
   await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'mug-estimate:%'").run();
  });
  await t.test('signed-in estimates do not share the login POST budget and retain supplier limits',async()=>{
   const ip='203.0.113.15',hash=await digest(ip),expiry=Math.floor(Date.now()/1000)+300;
   await db.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?1,60,?2)').bind('ip:'+hash,expiry).run();
   const request=(path:string,authenticated=true)=>mf.dispatchFetch('https://live.test/api/'+path,{method:'POST',headers:{Origin:'https://live.test','CF-Connecting-IP':ip,'Content-Type':'application/json',...(authenticated?{Cookie:'__Host-year_session='+raw}:{})},body:JSON.stringify({configuration:{style:'classic',size:'11oz',color:'white',font:'clean'},addressVersion:1})});
   const quote=await request('gift/quote');assert.equal(quote.status,200,await quote.clone().text());
   for(const path of ['open','gift/quote']){const blocked=await request(path,false);assert.equal(blocked.status,429,'Unauthenticated activity retains the existing login protection');assert.ok(Number(blocked.headers.get('Retry-After'))>0);assert.match((await blocked.json() as any).error,/try again in/);}
   await db.prepare('INSERT OR REPLACE INTO rate_limits(key,count,expires_at) VALUES(?1,20,?2)').bind('mug-estimate:mug-invite',expiry).run();
   const before=providerCalls.length;assert.equal((await request('gift/quote')).status,429);assert.equal(providerCalls.length,before,'Per-household provider limit still blocks external requests');
   await db.prepare("DELETE FROM rate_limits WHERE key='mug-estimate:mug-invite'").run();
   await db.prepare('UPDATE rate_limits SET count=600 WHERE key=?1').bind('activity-ip:'+hash).run();
   assert.equal((await request('gift/quote')).status,429,'Signed-in network activity remains bounded');
   assert.equal(providerCalls.length,before);
  });
  await t.test('legacy mockup uploads are closed and authenticated cached images remain usable',async()=>{
   const live=async(path:string,init:any={})=>{
    const encoded=init.body instanceof FormData?new Request('https://live.test',{method:'POST',body:init.body}):null;
    const body=encoded?await encoded.arrayBuffer():init.body;
    return mf.dispatchFetch('https://live.test/api/gift/'+path,{...init,...(body?{body}:{}),headers:{Origin:'https://live.test',Cookie:'__Host-year_session='+raw,...(encoded?{'Content-Type':encoded.headers.get('Content-Type')!}:{}),...init.headers}});
   };
   const configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
   const png=new Uint8Array(33);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);view.setUint32(16,1800);view.setUint32(20,700);png[24]=8;png[25]=6;
   const form=()=>{const f=new FormData();f.append('designId','mug-0');f.append('configuration',JSON.stringify(configuration));f.append('artwork',new File([png],'print.png',{type:'image/png'}));return f;};
   const beforeUpload=providerCalls.length;
   assert.equal((await live('mockup',{method:'POST',body:form()})).status,410);
   assert.equal(providerCalls.length,beforeUpload);
   assert.equal((await db.prepare('SELECT count(*) n FROM mug_mockups').first<any>()).n,0);
   const job={id:'b'.repeat(64)};
   const {published_json}=await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<any>();
   const design=JSON.parse(published_json).mugDesigns.find((m:any)=>m.id==='mug-0');
   await bucket.put('cached-preview.png',png,{httpMetadata:{contentType:'image/png'}});
   await db.prepare("INSERT INTO mug_mockups(id,invitation_id,year,recipe_key,design_id,configuration_json,caption,cutout_version,source_key,image_key,status,source_expires_at,next_poll_at,layout_version) VALUES(?1,'mug-invite',2026,'recipe','mug-0',?2,?3,?4,'expired','cached-preview.png','ready',0,0,3)").bind(job.id,JSON.stringify(configuration),design.caption,design.cutoutVersion).run();
   assert.equal((await mf.dispatchFetch('https://live.test/api/gift/mockup/'+job.id)).status,401);
   assert.equal((await live('mockup/'+job.id+'/image')).headers.get('Content-Type'),'image/png');
   assert.equal((await mf.dispatchFetch('https://live.test/api/gift/mockup-source/'+job.id)).status,404);
   const lookupPayload={designId:'mug-0',configuration};
   const beforeLookup=providerCalls.length;
   const cachedLookup=await live('mockup/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lookupPayload)});assert.equal(cachedLookup.status,200);assert.equal((await cachedLookup.json() as any).status,'ready');assert.equal(providerCalls.length,beforeLookup,'Cache lookup skips rendering, upload and provider calls');
   const missingLookup=await live('mockup/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...lookupPayload,configuration:{...configuration,font:'serif'}})});assert.equal((await missingLookup.json() as any).status,'missing');
   assert.equal((await db.prepare('SELECT count(*) n FROM mug_orders').first<any>()).n,0);
   assert.ok(!providerCalls.includes('/orders'));
   const saved=await (await mf.dispatchFetch('https://live.test/api/gift/claim',{method:'POST',headers:{Origin:'https://live.test',Cookie:'__Host-year_session='+raw,'Content-Type':'application/json'},body:JSON.stringify({designId:'mug-0',configuration,addressVersion:1,requestKey:crypto.randomUUID(),mockupId:job.id})})).json() as any;
   assert.match(saved.claim.design.mockupSrc,/^\/api\/gift\/orders\/mug-/);
   const journalGift=(await (await mf.dispatchFetch('https://live.test/api/journal',{headers:{Cookie:'__Host-year_session='+raw}})).json() as any).gift;
   assert.equal(journalGift.claim.design.mockupSrc,saved.claim.design.mockupSrc);
   assert.equal((await mf.dispatchFetch('https://live.test'+saved.claim.design.mockupSrc)).status,401);
   assert.equal((await mf.dispatchFetch('https://live.test'+saved.claim.design.mockupSrc,{headers:{Cookie:'__Host-year_session='+raw}})).headers.get('Content-Type'),'image/png');
   const history=await (await admin('mug-orders')).json() as any;assert.ok(history.orders[0].mockup_key);
   await admin('invitations/mug-invite/reset-mug-allowance',{orderId:saved.claim.id,confirm:true});
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
  await t.test('curated mugs can save a new display order while artwork remains protected',async()=>{
   const curated=curatedMugIds.map((id,index)=>({id,caption:'Curated '+index,alt:'Approved artwork '+index,cutoutVersion}));
   for(const {id} of curated){
    await bucket.put(id+'.jpg',jpeg);
    await bucket.put(`2026/${id}/mugs/${cutoutVersion}.png`,rgbaPNG,{httpMetadata:{contentType:'image/png'}});
    await db.prepare('INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?,2026,?,?,?,?)').bind(id,id+'.jpg',id+'.jpg','image/jpeg',jpeg.length).run();
   }
   const curatedDraft={...draft,mugDesigns:curated};
   await db.prepare('UPDATE editions SET draft_json=? WHERE year=2026').bind(JSON.stringify(curatedDraft)).run();
   const next={...curatedDraft,mugDesigns:[...curated].reverse()};
   const publishedBefore=(await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<any>()).published_json;
   await save(next);
   const saved:any=await (await admin('state')).json();assert.deepEqual(saved.draft.mugDesigns.map((d:any)=>d.id),next.mugDesigns.map(d=>d.id));
   assert.equal((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<any>()).published_json,publishedBefore);
   for(const mugDesigns of [next.mugDesigns.map((d,i)=>i===0?{...d,cutoutVersion:'b'.repeat(32)}:d),next.mugDesigns.map((d,i)=>i===0?{...d,alt:'Changed artwork'}:d)]){
    assert.equal((await admin('draft',{version,draft:{...next,mugDesigns}})).status,400);
   }
   const historyBefore=await db.prepare('SELECT * FROM mug_orders ORDER BY id').all();
   const reduced={...next,mugDesigns:next.mugDesigns.slice(1)};await save(reduced);
   assert.equal((await db.prepare('SELECT published_json FROM editions WHERE year=2026').first<any>()).published_json,publishedBefore);
   assert.deepEqual((await db.prepare('SELECT * FROM mug_orders ORDER BY id').all()).results,historyBefore.results);
   for(const d of next.mugDesigns)assert.ok(await bucket.head(`2026/${d.id}/mugs/${cutoutVersion}.png`),'Saved cutout remains available');
   await publish();
   const journal:any=await (await guest('journal')).json();assert.deepEqual(journal.gift.designs.map((d:any)=>d.id),reduced.mugDesigns.map(d=>d.id));
  });
 }finally{await mf.dispose();}
});
