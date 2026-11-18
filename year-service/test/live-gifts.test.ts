import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {liveGiftAllowed,liveGiftIntentStatement,releaseResetPostcardIntent} from '../src/live-gifts.ts';
import {checkedMugDraft,tickLiveMugFulfillment,liveMugSource} from '../src/live-mug-fulfillment.ts';
import {tickPrintFulfillment} from '../src/handwrytten-fulfillment.ts';
import {digest} from '../src/security.ts';

test('scoped live gifts enforce identity, caps, exact artwork and one submission even after timeouts',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:{DB:'live'},r2Buckets:{MEDIA:'live'}}));
 const db=await mf.getD1Database('DB'),media=await mf.getR2Bucket('MEDIA');
 await db.exec(`CREATE TABLE editions(year INTEGER PRIMARY KEY,is_active INTEGER,allow_print_orders INTEGER,allow_mug_orders INTEGER);
 CREATE TABLE invites(id TEXT PRIMARY KEY,edition_year INTEGER,person_id TEXT,member_ids TEXT,revoked_at INTEGER,expires_at INTEGER,allow_print INTEGER,allow_mug INTEGER);
 INSERT INTO editions VALUES(2026,1,1,1); INSERT INTO invites VALUES('home',2026,'owner','["owner","partner"]',NULL,unixepoch()+86400,1,1); INSERT INTO invites VALUES('other',2026,'friend','["friend"]',NULL,unixepoch()+86400,1,1);
 CREATE TABLE mug_orders(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,address_json TEXT,recipient_name TEXT,quote_json TEXT,print_artwork_key TEXT,print_layout_version INTEGER,allowance_reset_at INTEGER,updated_at INTEGER);
 CREATE TABLE print_orders(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,format TEXT,card_count INTEGER,handwrytten_preview_id TEXT,handwrytten_order_json TEXT,address_json TEXT,allowance_reset_at INTEGER,handwrytten_quote_json TEXT,budget_approved_cents INTEGER,budget_review_required INTEGER,provider_id TEXT,updated_at INTEGER);
 CREATE TABLE handwrytten_previews(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,card_id INTEGER,front_key TEXT,inside_key TEXT,back_key TEXT,updated_at INTEGER);`);
 for(const file of ['0029_handwrytten_fulfillment.sql','0033_handwrytten_quote_only.sql','0041_scoped_live_gifts.sql'])await db.batch((await readFile('migrations/'+file,'utf8')).split('--> statement-breakpoint').filter(s=>s.trim()).map(s=>db.prepare(s)));
 await db.prepare("INSERT INTO live_gift_permissions(year,invitation_id,person_id,member_ids,postcard_enabled,mug_enabled,enabled,expires_at) VALUES(2026,'home','owner','[\"owner\",\"partner\"]',1,1,1,unixepoch()+86400)").run();
 const env={DB:db as any,MEDIA:media as any,LIVE_GIFT_ORDERING:'true',PRINT_ORDER_MODE:'handwrytten_live',PRINTFUL_ENABLED:'true',PRINTFUL_API_TOKEN:'synthetic',PRINTFUL_STORE_ID:'123',SOCIAL_JOURNAL_ORIGIN:'https://live.test',HANDWRYTTEN_API_KEY:'synthetic',HANDWRYTTEN_PREVIEWS_ENABLED:'true'};
 const address={line1:'1 Synthetic Lane',line2:'',city:'Testville',state:'CA',postalCode:'90001',country:'US'};
 const calls:string[]=[];let mug:any=null,mugPayload:any=null,mugCost='19.99',loseConfirm=false,loseCreate=false,costsPending=false,readOnlyOrderToken=false,mode=0,previewTotal=4.86,basket:any[]=[],basketTotal=4.86,postcardAccepted=false;
 const cents=(v:number)=>Math.round(v*100)/100;
 const fetch=mock.method(globalThis,'fetch',async(url:string,init:RequestInit={})=>{
  const u=new URL(url),path=u.pathname,body=init.body?JSON.parse(String(init.body)):null;calls.push((init.method||'GET')+' '+path);
  if(u.hostname==='api.printful.com'){
   if(path==='/oauth/scopes')return Response.json({result:{scopes:[{scope:readOnlyOrderToken?'orders/read':'orders'}]}});
   if(path==='/orders'){
    assert.equal(u.searchParams.get('confirm'),'0');assert.equal(u.searchParams.get('update_existing'),'0');
    mugPayload=body;mug={id:123,external_id:body.external_id,status:'draft',shipping:'STANDARD',recipient:body.recipient,items:body.items,costs:{currency:'USD',total:mugCost,subtotal:'10.00',discount:'0.00',shipping:'8.00',tax:cents(Number(mugCost)-18),vat:'0.00'}};
    if(loseCreate)throw new Error('Response lost');return Response.json({result:mug});
   }
   if(path==='/orders/123/confirm'){mug.status='pending';if(loseConfirm)throw new Error('Response lost');return Response.json({result:mug});}
   assert.equal(path,'/orders/123');return Response.json({result:costsPending?{...mug,costs:null}:mug});
  }
  assert.equal(u.hostname,'api.handwrytten.com');
  if(path.endsWith('/checkauth/auth'))return Response.json({status:'ok',test_mode:mode});
  if(path.endsWith('/countries/list'))return Response.json({status:'ok',countries:[{id:1,name:'United States',ups_code:'US'}]});
  if(path.endsWith('/profile/listAddresses'))return Response.json({status:'ok',addresses:[{id:17,country_id:1,name:'Synthetic sender'}]});
  if(path.endsWith('/outbound/process'))return Response.json({status:'ok',quantity:1,prices:{card_price:3.75,postage_price:cents(previewTotal-4.04),tax:.29,shipping_price:0,insert_price:0,bundle_price:0,without_tax:cents(previewTotal-.29),total:previewTotal}});
  if(path.endsWith('/basket/allNew'))return Response.json({status:'ok',test_mode:mode,items:basket,totals:{grand_total:cents(basketTotal-.29),tax:.29,total:basketTotal}});
  if(path.endsWith('/orders/placeBasket')){
   assert.ok(mode===0||mode===1);assert.equal(body.client_metadata,'print-live');
   basket=[{id:100,card_id:42,quantity:1,client_metadata:body.client_metadata,address_to:{country:'United States',address1:body.addresses[0].to_address1,address2:body.addresses[0].to_address2,city:body.addresses[0].to_city,state:body.addresses[0].to_state,zip:body.addresses[0].to_zip},card_orders:[{id:200}],totals:{card:3.75,delivery_cost:cents(basketTotal-4.04),shipping:0,insert:0,gift_card:0,subtotal:cents(basketTotal-.29)},price_structure:{card:{money:3.75},postage:{money:cents(basketTotal-4.04)},tax:{money:.29}}}];return Response.json({status:'ok'});
  }
  if(path.endsWith('/basket/remove')){basket=[];return Response.json({status:'ok'});}
  if(path.endsWith('/basket/send')){assert.equal(body.test_mode,mode);assert.ok(body.price_structure.money<=10);postcardAccepted=true;basket=[];return Response.json({status:'ok'});}
  if(path.endsWith('/orders/details'))return Response.json({status:'ok',order:{id:100,client_metadata:'print-live',status:postcardAccepted?(mode===1?'test':'paid'):'basket',test_mode:mode,quantity:1,payed:basketTotal}});
  assert.fail('Unexpected provider request '+path);
 });
 async function reset(){
  calls.length=0;mug=null;mugPayload=null;mugCost='19.99';loseConfirm=false;loseCreate=false;costsPending=false;readOnlyOrderToken=false;mode=0;previewTotal=4.86;basket=[];basketTotal=4.86;postcardAccepted=false;
  await db.exec('DELETE FROM live_gift_orders; DELETE FROM mug_orders; DELETE FROM print_orders; DELETE FROM print_fulfillment_lock; DELETE FROM handwrytten_previews;');
 }
 async function seedMug(){
  await db.prepare("INSERT INTO mug_orders VALUES('mug-live','home',2026,'simulated',?1,'Synthetic Recipient',?2,'frozen.png',4,NULL,unixepoch())").bind(JSON.stringify(address),JSON.stringify({currency:'USD',variantId:22373,totalCents:1999,withinBudget:true,shippingMethod:'STANDARD'})).run();
  await media.put('frozen.png',new Uint8Array([1,2,3]));await liveGiftIntentStatement(env,'mug-live','mug','home',2026).run();
 }
 async function seedPrint(intent=true){
  await db.prepare("INSERT INTO handwrytten_previews VALUES('proof','home',2026,'ready',42,'front','inside','back',unixepoch())").run();
  const payload={card_id:42,font:'hwMadeline',font_size:13,auto_font_size:true,client_metadata:'print-live',addresses:[{to_country:'United States',to_address1:address.line1,to_address2:address.line2,to_city:address.city,to_state:address.state,to_zip:address.postalCode,message:'Exact frozen note.'}]};
  await db.prepare("INSERT INTO print_orders(id,invitation_id,year,status,format,card_count,handwrytten_preview_id,handwrytten_order_json,address_json,budget_approved_cents) VALUES('print-live','home',2026,'simulated','folded',1,'proof',?1,?2,5000)").bind(JSON.stringify(payload),JSON.stringify(address)).run();
  await db.prepare("INSERT INTO print_fulfillment(order_id,state) VALUES('print-live','pending')").run();if(intent)await liveGiftIntentStatement(env,'print-live','postcard','home',2026).run();
 }
 const liveState=async(id:string)=>(await db.prepare('SELECT state FROM live_gift_orders WHERE order_id=?1').bind(id).first<any>())?.state;
 try{
  await t.test('only exact current household with a live grant is allowed',async()=>{
   assert.equal(await liveGiftAllowed(env,'home',2026,'mug'),true);assert.equal(await liveGiftAllowed(env,'other',2026,'mug'),false);assert.equal(await liveGiftAllowed({...env,LIVE_GIFT_ORDERING:'false'},'home',2026,'mug'),false);
   await db.prepare("UPDATE invites SET member_ids='[\"owner\",\"other\"]' WHERE id='home'").run();assert.equal(await liveGiftAllowed(env,'home',2026,'mug'),false);await db.prepare("UPDATE invites SET member_ids='[\"owner\",\"partner\"]' WHERE id='home'").run();
  });
  await t.test('mug submits one exact print file once under concurrent workers',async()=>{await reset();await seedMug();await Promise.all([tickLiveMugFulfillment(env),tickLiveMugFulfillment(env)]);await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'submitted');assert.equal(calls.filter(c=>c==='POST /orders/123/confirm').length,1);const url=new URL(mugPayload.items[0].files[0].url);assert.match(url.pathname,/^\/api\/gift\/order-source\/[a-f0-9]{64}$/);assert.deepEqual(new Uint8Array(await (await liveMugSource(env,url.pathname.split('/').pop()!)).arrayBuffer()),new Uint8Array([1,2,3]));await assert.rejects(()=>liveMugSource(env,'0'.repeat(64)),/not found/);});
  await t.test('verified layout versions 5 and 6 submit once through the real fulfillment path',async()=>{
   for(const version of [5,6]){
    await reset();await seedMug();await db.prepare("UPDATE mug_orders SET print_layout_version=?1 WHERE id='mug-live'").bind(version).run();
    await Promise.all([tickLiveMugFulfillment(env),tickLiveMugFulfillment(env)]);await tickLiveMugFulfillment(env);
    assert.equal(await liveState('mug-live'),'submitted');assert.equal(calls.filter(c=>c==='POST /orders/123/confirm').length,1);
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
  await t.test('lost draft response is held and never automatically recreated',async()=>{await reset();await seedMug();loseCreate=true;await tickLiveMugFulfillment(env);await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'unknown');assert.equal(calls.filter(c=>c==='POST /orders').length,1);assert.equal(calls.some(c=>c.includes('/confirm')),false);});
  await t.test('asynchronous draft pricing waits without a second draft or premature payment',async()=>{await reset();await seedMug();costsPending=true;await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'draft');assert.equal(calls.some(c=>c.includes('/confirm')),false);costsPending=false;await db.prepare("UPDATE live_gift_orders SET lease_until=unixepoch()-1").run();await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'submitted');assert.equal(calls.filter(c=>c==='POST /orders').length,1);});
  await t.test('mug over $25 is never confirmed',async()=>{await reset();await seedMug();mugCost='25.01';await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'review');assert.equal(calls.some(c=>c.includes('/confirm')),false);});
  await t.test('mug exact $25 cap is accepted; draft validation rejects changed files/address/quantity',async()=>{await reset();await seedMug();mugCost='25.00';await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'submitted');const draft={...mug,status:'draft'};assert.equal(checkedMugDraft(draft,mugPayload).totalCents,2500);for(const changed of [{...draft,items:[{...draft.items[0],quantity:2}]},{...draft,recipient:{...draft.recipient,zip:'00000'}},{...draft,items:[{...draft.items[0],files:[{type:'default',url:'https://wrong.test/image.png'}]}]}])assert.throws(()=>checkedMugDraft(changed,mugPayload));});
  await t.test('old simulated postcard without explicit intent never reaches provider',async()=>{await reset();await seedPrint(false);await tickPrintFulfillment(env);assert.equal(calls.length,0);});
  await t.test('postcard previews without ordering then submits exactly once',async()=>{await reset();await seedPrint();await Promise.all([tickPrintFulfillment(env),tickPrintFulfillment(env)]);await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'submitted');assert.ok(calls.indexOf('POST /v2/outbound/process')<calls.indexOf('POST /v2/orders/placeBasket'));assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);});
  await t.test('postcard preview over $10 never enters basket, even with old admin override',async()=>{await reset();await seedPrint();previewTotal=10.01;await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'review');assert.equal(calls.some(c=>c.includes('placeBasket')||c.includes('basket/send')),false);});
  await t.test('postcard final checkout over $10 is removed without payment',async()=>{await reset();await seedPrint();basketTotal=10.01;await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'review');assert.equal(calls.some(c=>c.includes('basket/send')),false);assert.equal(basket.length,0);});
  await t.test('household postcard follows supplier Test Mode without changing Pixelbook configuration',async()=>{await reset();await seedPrint();mode=1;await tickPrintFulfillment(env);assert.equal(await liveState('print-live'),'submitted');const saved=await db.prepare("SELECT provider_id,handwrytten_quote_json FROM print_orders WHERE id='print-live'").first<any>();assert.equal(saved.provider_id,'handwrytten-test-100');assert.equal(JSON.parse(saved.handwrytten_quote_json).testMode,true);assert.equal(calls.filter(c=>c==='POST /v2/basket/send').length,1);});
  await t.test('explicit admin reset releases a completed postcard intent while preserving its order history',async()=>{
   await reset();await seedPrint();mode=1;await tickPrintFulfillment(env);
   await releaseResetPostcardIntent(env,'print-live');assert.equal(await liveState('print-live'),'submitted','an unreset test keeps its slot');
   await db.prepare("UPDATE print_orders SET allowance_reset_at=unixepoch() WHERE id='print-live'").run();
   await releaseResetPostcardIntent(env,'print-live');assert.equal(await liveState('print-live'),undefined);
   assert.equal((await db.prepare("SELECT status FROM print_orders WHERE id='print-live'").first<any>()).status,'submitted');
   assert.equal((await db.prepare("SELECT state FROM print_fulfillment WHERE order_id='print-live'").first<any>()).state,'submitted');
   await reset();await seedPrint();await tickPrintFulfillment(env);
   await db.prepare("UPDATE print_orders SET allowance_reset_at=unixepoch() WHERE id='print-live'").run();
   await releaseResetPostcardIntent(env,'print-live');assert.equal(await liveState('print-live'),undefined,'an explicit admin reset permits one more completed real postcard');
  });
  await t.test('expired mutation leases never retry payment',async()=>{await reset();await seedMug();await db.prepare("UPDATE live_gift_orders SET state='submitting',lease_until=unixepoch()-1").run();await tickLiveMugFulfillment(env);assert.equal(await liveState('mug-live'),'unknown');assert.equal(calls.length,0);});
  await t.test('same household cannot create a second live mug intent after allowance reset',async()=>{await reset();await seedMug();await db.prepare("INSERT INTO mug_orders VALUES('mug-second','home',2026,'simulated',?1,'Synthetic',NULL,NULL,4,NULL,unixepoch())").bind(JSON.stringify(address)).run();await liveGiftIntentStatement(env,'mug-second','mug','home',2026).run();assert.equal(await liveState('mug-second'),undefined);});
 }finally{fetch.mock.restore();await mf.dispose();}
});
