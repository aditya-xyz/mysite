import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {liveGiftAllowed,liveGiftIntentStatement,requireLiveGift,resetPostcardIntentStatement} from '../src/live-gifts.ts';
import {checkedMugDraft,tickLiveMugFulfillment,liveMugSource} from '../src/live-mug-fulfillment.ts';
import {resetMugAllowance,resetPrintAllowance} from '../admin/src/simulated-order-reset.ts';
import {tickPrintFulfillment} from '../src/handwrytten-fulfillment.ts';
import {digest} from '../src/security.ts';

test('scoped live gifts enforce identity, caps, exact artwork and one submission even after timeouts',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:{DB:'live'},r2Buckets:{MEDIA:'live'}}));
 const db=await mf.getD1Database('DB'),media=await mf.getR2Bucket('MEDIA');
 await db.exec(`CREATE TABLE editions(year INTEGER PRIMARY KEY,is_active INTEGER,allow_print_orders INTEGER,allow_mug_orders INTEGER,taken_offline_at INTEGER);
 CREATE TABLE invites(id TEXT PRIMARY KEY,edition_year INTEGER,person_id TEXT,member_ids TEXT,revoked_at INTEGER,expires_at INTEGER,allow_print INTEGER,allow_mug INTEGER);
 INSERT INTO editions VALUES(2026,1,1,1,NULL); INSERT INTO invites VALUES('home',2026,'owner','["owner","partner"]',NULL,unixepoch()+86400,1,1); INSERT INTO invites VALUES('other',2026,'friend','["friend"]',NULL,unixepoch()+86400,1,1);
 CREATE TABLE mug_orders(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,address_json TEXT,recipient_name TEXT,quote_json TEXT,print_artwork_key TEXT,print_layout_version INTEGER,allowance_reset_at INTEGER,updated_at INTEGER);
 CREATE TABLE print_orders(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,format TEXT,card_count INTEGER,handwrytten_preview_id TEXT,handwrytten_order_json TEXT,address_json TEXT,allowance_reset_at INTEGER,handwrytten_quote_json TEXT,budget_approved_cents INTEGER,budget_review_required INTEGER,provider_id TEXT,updated_at INTEGER);
 CREATE TABLE handwrytten_previews(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,card_id INTEGER,front_key TEXT,inside_key TEXT,back_key TEXT,updated_at INTEGER);`);
 for(const file of ['0029_handwrytten_fulfillment.sql','0033_handwrytten_quote_only.sql','0041_scoped_live_gifts.sql'])await db.batch((await readFile('migrations/'+file,'utf8')).split('--> statement-breakpoint').filter(s=>s.trim()).map(s=>db.prepare(s)));
 await db.prepare("INSERT INTO live_gift_permissions(year,invitation_id,person_id,member_ids,postcard_enabled,mug_enabled,enabled,expires_at) VALUES(2026,'home','owner','[\"owner\",\"partner\"]',1,1,1,unixepoch()+86400)").run();
 await db.prepare("INSERT INTO live_gift_orders(order_id,kind,year,invitation_id,max_cents,state,provider_id,payload_json,asset_token_hash,asset_expires_at) VALUES('mug-migrated','mug',2026,'home',2500,'submitted','321','{}','synthetic-token',unixepoch()+3600)").run();
 const beforeMigration=await db.prepare("SELECT * FROM live_gift_orders WHERE order_id='mug-migrated'").first<Record<string,unknown>>();
 await db.batch((await readFile('migrations/0044_live_mug_allowance_reset.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
 assert.deepEqual(await db.prepare("SELECT * FROM live_gift_orders WHERE order_id='mug-migrated'").first(),{...beforeMigration,allowance_reset_at:null});
 await db.batch((await readFile('migrations/0045_invitation_live_mugs.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
 assert.deepEqual(await db.prepare("SELECT * FROM live_gift_orders WHERE order_id='mug-migrated'").first(),{...beforeMigration,allowance_reset_at:null,mug_person_id:'owner',mug_member_ids:'["owner","partner"]',postcard_grant_id:null});
 await db.prepare("INSERT INTO live_gift_orders(order_id,kind,year,invitation_id,max_cents,state,provider_id) VALUES('postcard-migrated','postcard',2026,'home',1000,'submitted','654')").run();
 await db.batch((await readFile('migrations/0046_invitation_live_postcards.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
 assert.deepEqual(await db.prepare("SELECT state,provider_id,postcard_person_id,postcard_member_ids FROM live_gift_orders WHERE order_id='postcard-migrated'").first(),{state:'submitted',provider_id:'654',postcard_person_id:'owner',postcard_member_ids:'["owner","partner"]'});
 assert.equal((await db.prepare("SELECT mug_person_id FROM live_gift_orders WHERE order_id='mug-migrated'").first<any>()).mug_person_id,'owner');
 await db.prepare("DELETE FROM live_gift_orders WHERE order_id IN ('mug-migrated','postcard-migrated')").run();
 const env={DB:db as any,MEDIA:media as any,LIVE_GIFT_ORDERING:'true',PRINT_ORDER_MODE:'handwrytten_live',PRINTFUL_ENABLED:'true',PRINTFUL_API_TOKEN:'synthetic',PRINTFUL_STORE_ID:'123',SOCIAL_JOURNAL_ORIGIN:'https://live.test',HANDWRYTTEN_API_KEY:'synthetic',HANDWRYTTEN_PREVIEWS_ENABLED:'true'};
 const address={line1:'1 Synthetic Lane',line2:'',city:'Testville',state:'CA',postalCode:'90001',country:'US'};
 const calls:string[]=[];let mug:any=null,mugPayload:any=null,mugCost='19.99',loseConfirm=false,loseCreate=false,costsPending=false,readOnlyOrderToken=false,mode=0,previewTotal=4.86,basket:any[]=[],basketTotal=4.86,postcardAccepted=false,nextVendorId=100,vendorOrders=new Map<number,any>(),placeMetadata:string[]=[],detailIds:number[]=[],postcardDetailsStatus:string|null=null,postcardDetailsError=false,onPostcardDetails:((id:number)=>Promise<void>|void)|null=null;
 const cents=(v:number)=>Math.round(v*100)/100;
 function wrapDb(realDb:any,hooks:{onBatch?:(sqls:string[])=>void;onRun?:(sql:string)=>void}){
  const wrapStmt=(stmt:any,sql:string):any=>({
   bind:(...a:any[])=>wrapStmt(stmt.bind(...a),sql),
   first:(...a:any[])=>stmt.first(...a),
   run:(...a:any[])=>{hooks.onRun?.(sql);return stmt.run(...a);},
   all:(...a:any[])=>stmt.all(...a),
   raw:(...a:any[])=>stmt.raw(...a),
   __stmt:stmt,
   __sql:sql
  });
  return {
   prepare:(sql:string)=>wrapStmt(realDb.prepare(sql),sql),
   batch:(stmts:any[])=>{hooks.onBatch?.(stmts.map(s=>s.__sql||''));return realDb.batch(stmts.map(s=>s.__stmt??s));},
   exec:(sql:string)=>realDb.exec(sql),
   dump:()=>realDb.dump()
  };
 }
 const fetch=mock.method(globalThis,'fetch',async(url:string,init:RequestInit={})=>{
  const u=new URL(url),path=u.pathname,body=init.body?JSON.parse(String(init.body)):null;calls.push((init.method||'GET')+' '+path);
  if(u.hostname==='api.printful.com'){
   if(path==='/oauth/scopes')return Response.json({result:{scopes:[{scope:readOnlyOrderToken?'orders/read':'orders'}]}});
   if(path==='/orders'){
    assert.equal(u.searchParams.get('confirm'),'0');assert.equal(u.searchParams.get('update_existing'),'0');
    mugPayload=body;mug={id:123,external_id:body.external_id,status:'draft',shipping:body.shipping,recipient:body.recipient,items:body.items,costs:{currency:'USD',total:mugCost,subtotal:'10.00',discount:'0.00',shipping:'8.00',tax:cents(Number(mugCost)-18),vat:'0.00'}};
    if(loseCreate)throw new Error('Response lost');return Response.json({result:mug});
   }
   if(path==='/orders/123/confirm'){mug.status='pending';if(loseConfirm)throw new Error('Response lost');return Response.json({result:mug});}
   assert.equal(path,'/orders/123');return Response.json({result:costsPending?{...mug,costs:null}:mug});
  }
  assert.equal(u.hostname,'api.handwrytten.com');
  if(path.endsWith('/checkauth/auth'))return Response.json({status:'ok',test_mode:mode});
  if(path.endsWith('/countries/list'))return Response.json({status:'ok',countries:[{id:1,name:'United States',ups_code:'US'},{id:91,name:'India',ups_code:'IN'}]});
  if(path.endsWith('/profile/listAddresses'))return Response.json({status:'ok',addresses:[{id:17,country_id:1,name:'Synthetic sender'}]});
  if(path.endsWith('/outbound/process'))return Response.json({status:'ok',quantity:1,prices:{card_price:3.75,postage_price:cents(previewTotal-4.04),tax:.29,shipping_price:0,insert_price:0,bundle_price:0,without_tax:cents(previewTotal-.29),total:previewTotal}});
  if(path.endsWith('/basket/allNew'))return Response.json({status:'ok',test_mode:mode,items:basket,totals:{grand_total:cents(basketTotal-.29),tax:.29,total:basketTotal}});
  if(path.endsWith('/orders/placeBasket')){
   assert.ok(mode===0||mode===1);const vid=nextVendorId++;placeMetadata.push(body.client_metadata);
   vendorOrders.set(vid,{id:vid,client_metadata:body.client_metadata,status:'basket',test_mode:mode,quantity:1,payed:basketTotal});
   basket=[{id:vid,card_id:42,quantity:1,client_metadata:body.client_metadata,address_to:{country:body.addresses[0].to_country,address1:body.addresses[0].to_address1,address2:body.addresses[0].to_address2,city:body.addresses[0].to_city,state:body.addresses[0].to_state,zip:body.addresses[0].to_zip},card_orders:[{id:vid+100}],totals:{card:3.75,delivery_cost:cents(basketTotal-4.04),shipping:0,insert:0,gift_card:0,subtotal:cents(basketTotal-.29)},price_structure:{card:{money:3.75},postage:{money:cents(basketTotal-4.04)},tax:{money:.29}}}];return Response.json({status:'ok'});
  }
  if(path.endsWith('/basket/remove')){basket=[];return Response.json({status:'ok'});}
  if(path.endsWith('/basket/send')){
   assert.equal(body.test_mode,mode);assert.ok(body.price_structure.money<=10);assert.equal(basket.length,1);
   const active=vendorOrders.get(basket[0].id);if(active)active.status=postcardDetailsStatus??(mode===1?'test':'paid');
   postcardAccepted=true;basket=[];return Response.json({status:'ok'});
  }
  if(path.endsWith('/orders/details')){
   const id=Number(u.searchParams.get('id'));detailIds.push(id);
   if(onPostcardDetails)await onPostcardDetails(id);
   if(postcardDetailsError)throw new TypeError('Vendor lookup failed');
   const order=vendorOrders.get(id);
   return Response.json({status:'ok',order:order?{...order,status:postcardDetailsStatus??order.status,payed:order.payed??basketTotal}:{id:id||100,client_metadata:'print-live',status:postcardAccepted?(mode===1?'test':'paid'):'basket',test_mode:mode,quantity:1,payed:basketTotal}});
  }
  assert.fail('Unexpected provider request '+path);
 });
 async function reset(){
  calls.length=0;mug=null;mugPayload=null;mugCost='19.99';loseConfirm=false;loseCreate=false;costsPending=false;readOnlyOrderToken=false;mode=0;previewTotal=4.86;basket=[];basketTotal=4.86;postcardAccepted=false;nextVendorId=100;vendorOrders=new Map();placeMetadata=[];detailIds=[];postcardDetailsStatus=null;postcardDetailsError=false;onPostcardDetails=null;
  await db.exec("DELETE FROM live_gift_orders; DELETE FROM live_gift_permissions WHERE invitation_id!='home'; DELETE FROM mug_orders; DELETE FROM print_orders; DELETE FROM print_fulfillment_lock; DELETE FROM handwrytten_previews;");
 }
 async function seedMug(destination=address,shippingMethod='STANDARD'){
  await db.prepare("INSERT INTO mug_orders VALUES('mug-live','home',2026,'simulated',?1,'Synthetic Recipient',?2,'frozen.png',4,NULL,unixepoch())").bind(JSON.stringify(destination),JSON.stringify({currency:'USD',variantId:22373,totalCents:1999,withinBudget:true,destination:destination.country,shippingMethod})).run();
  await media.put('frozen.png',new Uint8Array([1,2,3]));await liveGiftIntentStatement(env,'mug-live','mug','home',2026).run();
 }
 async function seedPrint(intent=true,id='print-live',invite='home',previewId='proof'){
  await db.prepare("INSERT OR IGNORE INTO handwrytten_previews VALUES(?1,?2,2026,'ready',42,'front','inside','back',unixepoch())").bind(previewId,invite).run();
  const payload={card_id:42,font:'hwMadeline',font_size:13,auto_font_size:true,client_metadata:id,addresses:[{to_country:'United States',to_address1:address.line1,to_address2:address.line2,to_city:address.city,to_state:address.state,to_zip:address.postalCode,message:'Exact frozen note.'}]};
  await db.prepare("INSERT INTO print_orders(id,invitation_id,year,status,format,card_count,handwrytten_preview_id,handwrytten_order_json,address_json,budget_approved_cents) VALUES(?1,?2,2026,'simulated','folded',1,?3,?4,?5,5000)").bind(id,invite,previewId,JSON.stringify(payload),JSON.stringify(address)).run();
  await db.prepare("INSERT INTO print_fulfillment(order_id,state) VALUES(?1,'pending')").bind(id).run();if(intent)await liveGiftIntentStatement(env,id,'postcard',invite,2026).run();
 }
 const liveState=async(id:string)=>(await db.prepare('SELECT state FROM live_gift_orders WHERE order_id=?1').bind(id).first<any>())?.state;
 try{
  await t.test('the invitation flag enables live mugs without a grant',async()=>{
   await reset();
   await db.exec("UPDATE editions SET allow_mug_orders=0; UPDATE invites SET allow_mug=0 WHERE id='other';");
   try{
    assert.equal(await liveGiftAllowed(env,'home',2026,'mug'),true);
    assert.equal(await liveGiftAllowed(env,'other',2026,'mug'),false);
    assert.equal(await liveGiftAllowed({...env,LIVE_GIFT_ORDERING:'false'},'home',2026,'mug'),false);
    await db.prepare("UPDATE invites SET allow_mug=1 WHERE id='other'").run();
    assert.equal(await liveGiftAllowed(env,'other',2026,'mug'),true);
    await db.prepare("INSERT INTO mug_orders VALUES('mug-new','other',2026,'simulated','{}','Synthetic',NULL,NULL,4,NULL,unixepoch())").run();
    await liveGiftIntentStatement(env,'mug-new','mug','other',2026).run();
    assert.equal((await requireLiveGift(env,'mug-new','mug')).max_cents,2500);
    await db.prepare("UPDATE invites SET allow_mug=0 WHERE id='other'").run();
    await assert.rejects(()=>requireLiveGift(env,'mug-new','mug'),/not enabled/);
    await db.prepare("UPDATE invites SET allow_mug=1,member_ids='[\"friend\",\"other\"]' WHERE id='other'").run();
    assert.equal(await liveGiftAllowed(env,'other',2026,'mug'),true);
    await assert.rejects(()=>requireLiveGift(env,'mug-new','mug'),/not enabled/);
   }finally{
    await db.exec(`UPDATE editions SET allow_mug_orders=1; UPDATE invites SET allow_mug=1,member_ids='["friend"]' WHERE id='other';`);
   }
  });
  await t.test('postcard checkout uses the invitation flag and pins the household without a grant',async()=>{
   await reset();
   await db.exec("UPDATE editions SET allow_print_orders=0; UPDATE invites SET allow_print=0 WHERE id='other';");
   try{
    assert.equal(await liveGiftAllowed(env,'other',2026,'postcard'),false);
    await db.prepare("UPDATE invites SET allow_print=1 WHERE id='other'").run();
    assert.equal(await liveGiftAllowed(env,'other',2026,'postcard'),true);
    assert.equal(await liveGiftAllowed({...env,PRINT_ORDER_MODE:'handwrytten_test'},'other',2026,'postcard'),false);
    await seedPrint(true,'postcard-new','other');
    assert.equal((await requireLiveGift(env,'postcard-new','postcard')).max_cents,1000);
    await db.prepare("UPDATE invites SET allow_print=0 WHERE id='other'").run();
    await assert.rejects(()=>requireLiveGift(env,'postcard-new','postcard'),/not enabled/);
    await db.prepare(`UPDATE invites SET allow_print=1,member_ids='["friend","other"]' WHERE id='other'`).run();
    assert.equal(await liveGiftAllowed(env,'other',2026,'postcard'),true);
    await assert.rejects(()=>requireLiveGift(env,'postcard-new','postcard'),/not enabled/);
   }finally{
    await db.exec(`UPDATE editions SET allow_print_orders=1; UPDATE invites SET allow_print=1,member_ids='["friend"]' WHERE id='other';`);
   }
  });
  await t.test('mug submits one exact print file once under concurrent workers',async()=>{await reset();await seedMug();await Promise.all([tickLiveMugFulfillment(env),tickLiveMugFulfillment(env)]);await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'submitted');assert.equal(calls.filter(c=>c==='POST /orders/123/confirm').length,1);const url=new URL(mugPayload.items[0].files[0].url);assert.match(url.pathname,/^\/api\/gift\/order-source\/[a-f0-9]{64}$/);const capability=url.pathname.split('/').pop()!;assert.deepEqual(new Uint8Array(await (await liveMugSource(env,capability)).arrayBuffer()),new Uint8Array([1,2,3]));await db.prepare("UPDATE editions SET taken_offline_at=unixepoch() WHERE year=2026").run();try{await assert.rejects(()=>liveMugSource(env,capability),/not found/);}finally{await db.prepare("UPDATE editions SET taken_offline_at=NULL WHERE year=2026").run();}await assert.rejects(()=>liveMugSource(env,'0'.repeat(64)),/not found/);});
  await t.test('verified layout versions 5 and 6 submit once through the real fulfillment path',async()=>{
   for(const version of [5,6]){
    await reset();await seedMug();await db.prepare("UPDATE mug_orders SET print_layout_version=?1 WHERE id='mug-live'").bind(version).run();
    await Promise.all([tickLiveMugFulfillment(env),tickLiveMugFulfillment(env)]);await tickLiveMugFulfillment(env);
    assert.equal(await liveState('mug-live'),'submitted');assert.equal(calls.filter(c=>c==='POST /orders/123/confirm').length,1);
   }
  });
  await t.test('international mugs honor the quoted service and destination fields',async()=>{
   for(const [destination,expected] of [
    [{...address,country:'IN',state:'Maharashtra',city:'Mumbai',postalCode:'400001'},{state_name:'Maharashtra'}],
    [{...address,country:'NL',state:'',city:'Amsterdam',postalCode:'1012 AB'},{}]
   ] as const){
    await reset();await seedMug(destination,'INTL_ECONOMY');
    await tickLiveMugFulfillment(env);
    assert.equal(await liveState('mug-live'),'submitted');
    assert.equal(mugPayload.shipping,'INTL_ECONOMY');
    assert.deepEqual(mugPayload.recipient,{name:'Synthetic Recipient',address1:destination.line1,address2:'',city:destination.city,country_code:destination.country,zip:destination.postalCode,...expected});
   }
  });
  await t.test('unknown artwork versions stop before any supplier request',async()=>{
   for(const version of [1,7,999]){
    await reset();await seedMug();await db.prepare("UPDATE mug_orders SET print_layout_version=?1 WHERE id='mug-live'").bind(version).run();
    await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'review');assert.equal(calls.length,0);
   }
  });
  await t.test('read-only order access stops before exporting checkout data or creating a supplier draft',async()=>{
   await reset();await seedMug();readOnlyOrderToken=true;await tickLiveMugFulfillment(env);await tickLiveMugFulfillment(env);
   assert.equal(await liveState('mug-live'),'review');assert.deepEqual(calls,['GET /oauth/scopes']);
   const saved=await db.prepare("SELECT error,payload_json,asset_token_hash FROM live_gift_orders WHERE order_id='mug-live'").first<any>();
   assert.match(saved.error,/connection is read-only/);assert.equal(saved.payload_json,null);assert.equal(saved.asset_token_hash,null);
  });
  await t.test('lost confirmation response reconciles without another charge',async()=>{await reset();await seedMug();loseConfirm=true;await tickLiveMugFulfillment(env);await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'submitted');assert.equal(calls.filter(c=>c==='POST /orders/123/confirm').length,1);});
  await t.test('lost draft response is held and never automatically recreated',async()=>{await reset();await seedMug();loseCreate=true;await tickLiveMugFulfillment(env);await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'unknown');assert.equal((await db.prepare("SELECT status FROM mug_orders WHERE id='mug-live'").first<any>()).status,'unknown');assert.equal(calls.filter(c=>c==='POST /orders').length,1);assert.equal(calls.some(c=>c.includes('/confirm')),false);});
  await t.test('asynchronous draft pricing waits without a second draft or premature payment',async()=>{await reset();await seedMug();costsPending=true;await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'draft');assert.equal(calls.some(c=>c.includes('/confirm')),false);costsPending=false;await db.prepare("UPDATE live_gift_orders SET lease_until=unixepoch()-1").run();await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'submitted');assert.equal(calls.filter(c=>c==='POST /orders').length,1);});
  await t.test('mug over $25 is never confirmed',async()=>{await reset();await seedMug();mugCost='25.01';await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'review');assert.equal(calls.some(c=>c.includes('/confirm')),false);});
  await t.test('mug exact $25 cap is accepted; draft validation rejects changed files/address/quantity',async()=>{await reset();await seedMug();mugCost='25.00';await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'submitted');const draft={...mug,status:'draft'};assert.equal(checkedMugDraft(draft,mugPayload).totalCents,2500);for(const changed of [{...draft,items:[{...draft.items[0],quantity:2}]},{...draft,recipient:{...draft.recipient,zip:'00000'}},{...draft,items:[{...draft.items[0],files:[{type:'default',url:'https://wrong.test/image.png'}]}]}])assert.throws(()=>checkedMugDraft(changed,mugPayload));});
  await t.test('old simulated postcard without explicit intent never reaches provider',async()=>{await reset();await seedPrint(false);await tickPrintFulfillment(env);assert.equal(calls.length,0);});
  await t.test('postcard previews without ordering then submits exactly once',async()=>{await reset();await seedPrint();await Promise.all([tickPrintFulfillment(env),tickPrintFulfillment(env)]);await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'submitted');assert.ok(calls.indexOf('POST /v2/outbound/process')<calls.indexOf('POST /v2/orders/placeBasket'));assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);});
  await t.test('international postcards verify the final basket before payment without a domestic preview',async()=>{
   for(const total of [10.01,9.99]){
    await reset();await seedPrint();basketTotal=total;
    const destination={...address,country:'IN',state:'Maharashtra',city:'Mumbai',postalCode:'400001'};
    await db.prepare("UPDATE print_orders SET address_json=?1,handwrytten_order_json=json_set(handwrytten_order_json,'$.addresses[0].to_country','India','$.addresses[0].to_city',?2,'$.addresses[0].to_state',?3,'$.addresses[0].to_zip',?4) WHERE id='print-live'").bind(JSON.stringify(destination),destination.city,destination.state,destination.postalCode).run();
    await tickPrintFulfillment(env);
    assert.equal(calls.includes('POST /v2/outbound/process'),false);
    assert.ok(calls.includes('POST /v2/orders/placeBasket'));
    assert.equal(calls.includes('POST /v2/basket/send'),total<10);
    assert.equal(await liveState('print-live'),total<10?'submitted':'review');
    assert.equal(basket.length,0);
   }
  });
  await t.test('postcard preview over $10 never enters basket, even with old admin override',async()=>{await reset();await seedPrint();previewTotal=10.01;await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'review');assert.equal(calls.some(c=>c.includes('placeBasket')||c.includes('basket/send')),false);});
  await t.test('postcard final checkout over $10 is removed without payment',async()=>{await reset();await seedPrint();basketTotal=10.01;await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'review');assert.equal(calls.some(c=>c.includes('basket/send')),false);assert.equal(basket.length,0);});
  await t.test('household postcard follows supplier Test Mode without changing Pixelbook configuration',async()=>{await reset();await seedPrint();mode=1;await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'submitted');const saved=await db.prepare("SELECT provider_id,handwrytten_quote_json FROM print_orders WHERE id='print-live'").first<any>();assert.equal(saved.provider_id,'handwrytten-test-100');assert.equal(JSON.parse(saved.handwrytten_quote_json).testMode,true);assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);});
  await t.test('explicit admin reset releases a completed postcard intent while preserving its order history',async()=>{
   await reset();await seedPrint();mode=1;await tickPrintFulfillment(env);
   await resetPostcardIntentStatement(env,'print-live','home',2026).run();assert.equal(await liveState('print-live'),'submitted','an unreset test keeps its slot');
   await db.prepare("UPDATE print_orders SET allowance_reset_at=unixepoch() WHERE id='print-live'").run();
   await resetPostcardIntentStatement(env,'print-live','home',2026).run();assert.equal(await liveState('print-live'),undefined);
   assert.equal((await db.prepare("SELECT status FROM print_orders WHERE id='print-live'").first<any>()).status,'submitted');
   assert.equal((await db.prepare("SELECT state FROM print_fulfillment WHERE order_id='print-live'").first<any>()).state,'submitted');
   await reset();await seedPrint();await tickPrintFulfillment(env);
   await db.prepare("UPDATE print_orders SET allowance_reset_at=unixepoch() WHERE id='print-live'").run();
   await resetPostcardIntentStatement(env,'print-live','home',2026).run();assert.equal(await liveState('print-live'),undefined,'an explicit admin reset permits one more completed real postcard');
  });
  await t.test('fallback review releases a verified unsubmitted live intent, while an attempted send stays reserved',async()=>{
   for(const attempted of [true,false]){
    await reset();await seedPrint(true,'print-fallback-abc');previewTotal=10.01;await tickPrintFulfillment(env);
    assert.equal(await liveState('print-fallback-abc'),'review');
    if(attempted)await db.prepare("UPDATE print_orders SET handwrytten_quote_json='{\"submitAttempted\":true}' WHERE id='print-fallback-abc'").run();
    const resetOrder=()=>resetPrintAllowance(env,2026,'home',{confirm:true,orderId:'print-fallback-abc'});
    if(attempted){await assert.rejects(resetOrder,/allowance changed/);assert.equal(await liveState('print-fallback-abc'),'review');}
    else{assert.equal((await resetOrder()).historyCleared,false);assert.equal(await liveState('print-fallback-abc'),undefined);}
    const saved=await db.prepare("SELECT status,allowance_reset_at FROM print_orders WHERE id='print-fallback-abc'").first<any>();
    assert.equal(saved.status,'simulated');assert.equal(!!saved.allowance_reset_at,!attempted);
   }
  });
   await t.test('expired mutation leases never retry payment',async()=>{await reset();await seedMug();await db.prepare("UPDATE live_gift_orders SET state='submitting',lease_until=unixepoch()-1").run();await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'unknown');assert.equal((await db.prepare("SELECT status FROM mug_orders WHERE id='mug-live'").first<any>()).status,'unknown');assert.equal(calls.length,0);});
  await t.test('same household cannot create a second live mug intent while the first is unresolved',async()=>{await reset();await seedMug();await db.prepare("INSERT INTO mug_orders VALUES('mug-second','home',2026,'simulated',?1,'Synthetic',NULL,NULL,4,NULL,unixepoch())").bind(JSON.stringify(address)).run();await liveGiftIntentStatement(env,'mug-second','mug','home',2026).run();assert.equal(await liveState('mug-second'),undefined);});
  await t.test('a confirmed mug reset preserves fulfillment and permits one new live intent',async()=>{
   await reset();await seedMug();await tickLiveMugFulfillment(env);
   assert.equal(await liveState('mug-live'),'submitted');
   const before=calls.length;
   const release=await resetMugAllowance(env,2026,'home',{orderId:'mug-live',confirm:true});
   assert.equal(release.historyCleared,false);
   const original=await db.prepare("SELECT state,provider_id,allowance_reset_at FROM live_gift_orders WHERE order_id='mug-live'").first<any>();
   assert.deepEqual(original,{state:'submitted',provider_id:'123',allowance_reset_at:release.resetAt});
   assert.equal(calls.length,before);
   await db.prepare("INSERT INTO mug_orders VALUES('mug-second','home',2026,'simulated',?1,'Synthetic',NULL,NULL,4,NULL,unixepoch())").bind(JSON.stringify(address)).run();
   await liveGiftIntentStatement(env,'mug-second','mug','home',2026).run();
   assert.equal(await liveState('mug-second'),'pending');
   await assert.rejects(()=>resetMugAllowance(env,2026,'home',{orderId:'mug-live',confirm:true}),/allowance changed/);
   assert.equal(await liveState('mug-second'),'pending');
  });
  const seedSecondLivePrint=async()=>{
   await seedPrint(true,'print-live-2','other','proof-2');
  };
  await t.test('D1 batch failure after Handwrytten acceptance recovers via read-only lookup and unblocks the next postcard',async()=>{
   await reset();await seedPrint();await seedSecondLivePrint();
   let failSubmitBatch=true;
   const faultyEnv={...env,DB:wrapDb(db,{onBatch:sqls=>{if(failSubmitBatch&&sqls.some(s=>s.includes("UPDATE print_orders SET status='submitted'"))){failSubmitBatch=false;throw new Error('Injected D1 batch write failure');}}}) as any};
   await tickPrintFulfillment(faultyEnv,'print-live');
   assert.equal(failSubmitBatch,false);
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);
   const firstOrder=await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live'").first<any>();
   const firstFulfillment=await db.prepare("SELECT state,vendor_order_id,error FROM print_fulfillment WHERE order_id='print-live'").first<any>();
   const firstIntent=await db.prepare("SELECT state,provider_id,error FROM live_gift_orders WHERE order_id='print-live'").first<any>();
   const heldLock=await db.prepare('SELECT owner,blocked,lease_until FROM print_fulfillment_lock WHERE id=1').first<any>();
   assert.equal(firstOrder.status,'unknown','Failed D1 batch leaves no partial submitted state');
   assert.equal(firstOrder.provider_id,null);
   assert.equal(firstFulfillment.state,'unknown');
   assert.equal(firstFulfillment.vendor_order_id,100);
   assert.match(firstFulfillment.error,/#100/);
   assert.equal(firstIntent.state,'unknown');
   assert.match(firstIntent.error,/Verify order status/);
   assert.equal(heldLock.blocked,1);
   assert.ok(heldLock.owner.startsWith('print-live:'));
   assert.equal(await liveState('print-live-2'),'pending');

   await tickPrintFulfillment(env);
   assert.deepEqual(placeMetadata,['print-live','print-live-2'],'Never replays placeBasket for the recovered order');
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,2,'Sends basket once per postcard without creating a replacement');
   assert.deepEqual(detailIds,[100,100,101]);
   const recoveredOrder=await db.prepare("SELECT status,provider_id,handwrytten_quote_json FROM print_orders WHERE id='print-live'").first<any>();
   const recoveredFulfillment=await db.prepare("SELECT state,error FROM print_fulfillment WHERE order_id='print-live'").first<any>();
   const recoveredIntent=await db.prepare("SELECT state,provider_id,error,quote_json FROM live_gift_orders WHERE order_id='print-live'").first<any>();
   assert.equal(recoveredOrder.status,'submitted');
   assert.equal(recoveredOrder.provider_id,'handwrytten-live-100');
   assert.equal(JSON.parse(recoveredOrder.handwrytten_quote_json).submitted,true);
   assert.equal(JSON.parse(recoveredOrder.handwrytten_quote_json).submitAttempted,undefined);
   assert.equal(recoveredFulfillment.state,'submitted');
   assert.equal(recoveredFulfillment.error,null);
   assert.equal(recoveredIntent.state,'submitted');
   assert.equal(recoveredIntent.provider_id,'100');
   assert.equal(recoveredIntent.error,null);
   assert.equal(JSON.parse(recoveredIntent.quote_json).submitted,true);
   assert.equal((await db.prepare("SELECT provider_id,status FROM print_orders WHERE id='print-live-2'").first<any>()).provider_id,'handwrytten-live-101');
   assert.equal(await liveState('print-live-2'),'submitted');
   assert.equal((await db.prepare('SELECT count(*) n FROM print_fulfillment_lock').first<any>()).n,0);
  });
  await t.test('worker exit after Handwrytten acceptance reconciles after lease expiry without double-ordering',async()=>{
   await reset();await seedPrint();await seedSecondLivePrint();
   const outageEnv={...env,DB:wrapDb(db,{
    onBatch:()=>{if(calls.includes('POST /v2/basket/send'))throw new Error('Simulated worker exit / D1 outage');},
    onRun:()=>{if(calls.includes('POST /v2/basket/send'))throw new Error('Simulated worker exit / D1 outage');}
   }) as any};
   await tickPrintFulfillment(outageEnv,'print-live');
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);
   assert.equal((await db.prepare("SELECT state FROM print_fulfillment WHERE order_id='print-live'").first<any>()).state,'submitting');
   assert.equal((await db.prepare("SELECT status FROM print_orders WHERE id='print-live'").first<any>()).status,'simulated');
   assert.equal(await liveState('print-live'),'submitting');
   assert.equal((await db.prepare('SELECT blocked FROM print_fulfillment_lock WHERE id=1').first<any>()).blocked,1);

   const beforeActiveTick=calls.length;
   await tickPrintFulfillment(env);
   assert.equal(calls.length,beforeActiveTick,'Active lease holds until expiry');
   assert.equal(await liveState('print-live-2'),'pending');

   await db.prepare('UPDATE print_fulfillment_lock SET lease_until=unixepoch()-1 WHERE id=1').run();
   await tickPrintFulfillment(env);
   assert.deepEqual(placeMetadata,['print-live','print-live-2']);
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,2);
   assert.equal((await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live'").first<any>()).provider_id,'handwrytten-live-100');
   assert.equal(await liveState('print-live'),'submitted');
   assert.equal((await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live-2'").first<any>()).provider_id,'handwrytten-live-101');
   assert.equal(await liveState('print-live-2'),'submitted');
   assert.equal((await db.prepare('SELECT count(*) n FROM print_fulfillment_lock').first<any>()).n,0);
  });
  await t.test('ambiguous vendor outcome keeps the order locked and protected from resubmission',async()=>{
   await reset();await seedPrint();await seedSecondLivePrint();
   postcardDetailsStatus='basket';
   await tickPrintFulfillment(env,'print-live');
   await tickPrintFulfillment(env);
   assert.deepEqual(placeMetadata,['print-live']);
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);
   assert.equal(calls.some(c=>c==='POST /v2/basket/remove'),false);
   const o=await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live'").first<any>();
   const f=await db.prepare("SELECT state,error FROM print_fulfillment WHERE order_id='print-live'").first<any>();
   const l=await db.prepare("SELECT state,error FROM live_gift_orders WHERE order_id='print-live'").first<any>();
   assert.equal(o.status,'unknown');assert.equal(o.provider_id,null);
   assert.equal(f.state,'unknown');assert.equal(l.state,'unknown');
   assert.match(f.error,/#100/);assert.match(f.error,/basket/);assert.match(f.error,/Verify order status, payment, and Handwrytten basket/);
   assert.equal(l.error,f.error);
   assert.equal((await db.prepare('SELECT blocked FROM print_fulfillment_lock WHERE id=1').first<any>()).blocked,1);
   assert.equal(await liveState('print-live-2'),'pending');

   postcardDetailsError=true;
   await tickPrintFulfillment(env);
   assert.deepEqual(placeMetadata,['print-live']);
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);
   assert.equal((await db.prepare("SELECT state FROM print_fulfillment WHERE order_id='print-live'").first<any>()).state,'unknown');
   assert.match((await db.prepare("SELECT error FROM print_fulfillment WHERE order_id='print-live'").first<any>()).error,/#100/);
   assert.equal((await db.prepare('SELECT blocked FROM print_fulfillment_lock WHERE id=1').first<any>()).blocked,1);
   assert.equal(await liveState('print-live-2'),'pending');
  });
  await t.test('order stuck submitted/unknown under old worker reconciles safely without submitAttempted marker',async()=>{
   await reset();await seedPrint();await seedSecondLivePrint();
   const stuckQuote={currency:'USD',quantity:1,amounts:{card:375,postage:82,shipping:0,inserts:0,bundles:0,tax:29,subtotal:457,total:486},testMode:false,maxCents:1000,withinBudget:true};
   await db.prepare("UPDATE print_orders SET status='submitted',provider_id='handwrytten-live-100',handwrytten_quote_json=?1 WHERE id='print-live'").bind(JSON.stringify(stuckQuote)).run();
   await db.prepare("UPDATE print_fulfillment SET state='unknown',vendor_order_id=100,basket_item_id=200,error='Handwrytten needs review.' WHERE order_id='print-live'").run();
   await db.prepare("UPDATE live_gift_orders SET state='unknown',error='Handwrytten needs review.' WHERE order_id='print-live'").run();
   await db.prepare("INSERT INTO print_fulfillment_lock(id,owner,lease_until,blocked) VALUES(1,'print-live:old-worker',unixepoch()-1,1)").run();
   vendorOrders.set(100,{id:100,client_metadata:'print-live',status:'basket',test_mode:0,quantity:1,payed:0});
   nextVendorId=101;

   await tickPrintFulfillment(env);
   assert.equal(calls.filter(c=>c==='GET /v2/orders/details').length,1);
   assert.equal(calls.some(c=>c==='POST /v2/orders/placeBasket'||c==='POST /v2/basket/send'||c==='POST /v2/basket/remove'),false);
   const held=await db.prepare("SELECT state,error FROM print_fulfillment WHERE order_id='print-live'").first<any>();
   assert.equal(held.state,'unknown');
   assert.match(held.error,/#100/);
   assert.match(held.error,/basket/);
   assert.equal(await liveState('print-live'),'unknown');
   assert.equal((await db.prepare('SELECT blocked FROM print_fulfillment_lock WHERE id=1').first<any>()).blocked,1);
   assert.equal(await liveState('print-live-2'),'pending');

   vendorOrders.set(100,{id:100,client_metadata:'print-live',status:'paid',test_mode:0,quantity:1,payed:4.86});
   await tickPrintFulfillment(env);
   assert.deepEqual(placeMetadata,['print-live-2'],'Never replays placeBasket for the pre-patch stuck order');
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1,'Sends basket only for print-live-2');
   assert.deepEqual(detailIds,[100,100,101]);
   const syncOrder=await db.prepare("SELECT status,provider_id,handwrytten_quote_json FROM print_orders WHERE id='print-live'").first<any>();
   const syncFulfillment=await db.prepare("SELECT state,error FROM print_fulfillment WHERE order_id='print-live'").first<any>();
   const syncLive=await db.prepare("SELECT state,provider_id,error,quote_json FROM live_gift_orders WHERE order_id='print-live'").first<any>();
   assert.equal(syncOrder.status,'submitted');
   assert.equal(syncOrder.provider_id,'handwrytten-live-100');
   assert.equal(JSON.parse(syncOrder.handwrytten_quote_json).submitted,true);
   assert.equal(syncFulfillment.state,'submitted');
   assert.equal(syncFulfillment.error,null);
   assert.equal(syncLive.state,'submitted');
   assert.equal(syncLive.provider_id,'100');
   assert.equal(syncLive.error,null);
   assert.equal(JSON.parse(syncLive.quote_json).submitted,true);
   assert.equal((await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live-2'").first<any>()).provider_id,'handwrytten-live-101');
   assert.equal(await liveState('print-live-2'),'submitted');
   assert.equal((await db.prepare('SELECT count(*) n FROM print_fulfillment_lock').first<any>()).n,0);
  });
  await t.test('worker whose lease was taken over cannot finalize the order or release the new owner lock',async()=>{
   await reset();await seedPrint();
   onPostcardDetails=async()=>{
    onPostcardDetails=null;
    await db.prepare("UPDATE print_fulfillment_lock SET owner='print-live:taken-over',lease_until=unixepoch()+300,blocked=1 WHERE id=1").run();
   };
   await tickPrintFulfillment(env,'print-live');
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);
   assert.equal((await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live'").first<any>()).status,'simulated');
   assert.equal((await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live'").first<any>()).provider_id,null);
   assert.equal((await db.prepare("SELECT state FROM print_fulfillment WHERE order_id='print-live'").first<any>()).state,'submitting');
   assert.equal(await liveState('print-live'),'submitting');
   assert.equal((await db.prepare('SELECT owner,blocked FROM print_fulfillment_lock WHERE id=1').first<any>()).owner,'print-live:taken-over');

   await seedSecondLivePrint();
   await db.prepare('UPDATE print_fulfillment_lock SET lease_until=unixepoch()-1 WHERE id=1').run();
   onPostcardDetails=async()=>{
    onPostcardDetails=null;
    await db.prepare("UPDATE print_fulfillment_lock SET owner='print-live:winner',lease_until=unixepoch()+300,blocked=1 WHERE id=1").run();
   };
   await tickPrintFulfillment(env);
   assert.equal((await db.prepare("SELECT status FROM print_orders WHERE id='print-live'").first<any>()).status,'simulated');
   assert.equal((await db.prepare("SELECT state FROM print_fulfillment WHERE order_id='print-live'").first<any>()).state,'submitting');
   assert.equal(await liveState('print-live'),'submitting');
   assert.equal((await db.prepare('SELECT owner,blocked FROM print_fulfillment_lock WHERE id=1').first<any>()).owner,'print-live:winner');
   assert.equal(await liveState('print-live-2'),'pending');
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);

   await db.prepare('UPDATE print_fulfillment_lock SET lease_until=unixepoch()-1 WHERE id=1').run();
   await tickPrintFulfillment(env);
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,2);
   assert.equal(await liveState('print-live'),'submitted');
   assert.equal(await liveState('print-live-2'),'submitted');
   assert.equal((await db.prepare('SELECT count(*) n FROM print_fulfillment_lock').first<any>()).n,0);
  });
  await t.test('legacy unknown/unknown blocked order with saved vendor ID and checkout mode reconciles without resending',async()=>{
   await reset();await seedPrint();await seedSecondLivePrint();
   const legacyQuote={currency:'USD',quantity:1,amounts:{card:375,postage:82,shipping:0,inserts:0,bundles:0,tax:29,subtotal:457,total:486},testMode:false,submitted:false,maxCents:1000,withinBudget:true};
   await db.prepare("UPDATE print_orders SET status='unknown',provider_id=NULL,handwrytten_quote_json=?1 WHERE id='print-live'").bind(JSON.stringify(legacyQuote)).run();
   await db.prepare("UPDATE print_fulfillment SET state='unknown',vendor_order_id=100,basket_item_id=200,error='Handwrytten needs review.' WHERE order_id='print-live'").run();
   await db.prepare("UPDATE live_gift_orders SET state='unknown',provider_id=NULL,error='Handwrytten needs review.' WHERE order_id='print-live'").run();
   await db.prepare("INSERT INTO print_fulfillment_lock(id,owner,lease_until,blocked) VALUES(1,'print-live:legacy-worker',unixepoch()-1,1)").run();
   vendorOrders.set(100,{id:100,client_metadata:'print-live',status:'basket',test_mode:0,quantity:1,payed:0});
   nextVendorId=101;

   await tickPrintFulfillment(env);
   assert.deepEqual(detailIds,[100]);
   assert.equal(calls.some(c=>c==='POST /v2/orders/placeBasket'||c==='POST /v2/basket/send'||c==='POST /v2/basket/remove'),false);
   const heldOrder=await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live'").first<any>();
   const heldFulfillment=await db.prepare("SELECT state,error FROM print_fulfillment WHERE order_id='print-live'").first<any>();
   const heldLive=await db.prepare("SELECT state,error FROM live_gift_orders WHERE order_id='print-live'").first<any>();
   assert.equal(heldOrder.status,'unknown');
   assert.equal(heldOrder.provider_id,null);
   assert.equal(heldFulfillment.state,'unknown');
   assert.match(heldFulfillment.error,/#100/);
   assert.match(heldFulfillment.error,/basket/);
   assert.equal(heldLive.state,'unknown');
   assert.equal(heldLive.error,heldFulfillment.error);
   assert.equal((await db.prepare('SELECT blocked FROM print_fulfillment_lock WHERE id=1').first<any>()).blocked,1);
   assert.equal(await liveState('print-live-2'),'pending');

   vendorOrders.set(100,{id:100,client_metadata:'print-live',status:'paid',test_mode:0,quantity:1,payed:4.86});
   await tickPrintFulfillment(env);
   assert.deepEqual(placeMetadata,['print-live-2'],'Never replays placeBasket for the legacy unknown/unknown order');
   assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1,'Sends basket only for print-live-2');
   assert.deepEqual(detailIds,[100,100,101]);
   const recOrder=await db.prepare("SELECT status,provider_id,handwrytten_quote_json FROM print_orders WHERE id='print-live'").first<any>();
   const recFulfillment=await db.prepare("SELECT state,error FROM print_fulfillment WHERE order_id='print-live'").first<any>();
   const recLive=await db.prepare("SELECT state,provider_id,error,quote_json FROM live_gift_orders WHERE order_id='print-live'").first<any>();
   assert.equal(recOrder.status,'submitted');
   assert.equal(recOrder.provider_id,'handwrytten-live-100');
   assert.equal(JSON.parse(recOrder.handwrytten_quote_json).submitted,true);
   assert.equal(recFulfillment.state,'submitted');
   assert.equal(recFulfillment.error,null);
   assert.equal(recLive.state,'submitted');
   assert.equal(recLive.provider_id,'100');
   assert.equal(recLive.error,null);
   assert.equal(JSON.parse(recLive.quote_json).submitted,true);
   assert.equal((await db.prepare("SELECT status,provider_id FROM print_orders WHERE id='print-live-2'").first<any>()).provider_id,'handwrytten-live-101');
   assert.equal(await liveState('print-live-2'),'submitted');
   assert.equal((await db.prepare('SELECT count(*) n FROM print_fulfillment_lock').first<any>()).n,0);
  });
 }finally{fetch.mock.restore();await mf.dispose();}
});
