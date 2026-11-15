import {orderBudgetApprovalRoute} from '../admin/src/order-budget-approval.ts';
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {tickPrintFulfillment,checkedBasket} from '../src/handwrytten-fulfillment.ts';
import {quoteSavedPrintOrder} from '../src/handwrytten-quote.ts';
import {googleMailingAddress} from '../admin/src/address-verification.ts';
import {mailingAddress} from '../src/printing.ts';
test('automatic test fulfillment serializes checkout, enforces destination totals and never replays uncertain mutations',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:{DB:'fulfillment'},r2Buckets:{MEDIA:'fulfillment'}}));
 const db=await mf.getD1Database('DB'),media=await mf.getR2Bucket('MEDIA');
 await db.exec("CREATE TABLE editions(year INTEGER PRIMARY KEY); CREATE TABLE invites(id TEXT PRIMARY KEY); CREATE TABLE print_orders(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,format TEXT,artwork_key TEXT,default_artwork_key TEXT,card_count INTEGER,handwrytten_preview_id TEXT,handwrytten_order_json TEXT,address_json TEXT,allowance_reset_at INTEGER,handwrytten_quote_json TEXT,provider_id TEXT,updated_at INTEGER); CREATE TABLE handwrytten_previews(id TEXT PRIMARY KEY,invitation_id TEXT,year INTEGER,status TEXT,card_id INTEGER,front_key TEXT,inside_key TEXT,back_key TEXT,updated_at INTEGER); INSERT INTO editions VALUES(2026); INSERT INTO invites VALUES('invite');");
 await db.batch((await readFile('migrations/0029_handwrytten_fulfillment.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
 await db.exec(await readFile('migrations/0033_handwrytten_quote_only.sql','utf8'));
 await db.exec("ALTER TABLE print_orders ADD COLUMN budget_review_required INTEGER NOT NULL DEFAULT 0; ALTER TABLE print_orders ADD COLUMN budget_approved_cents INTEGER; ALTER TABLE print_orders ADD COLUMN budget_approved_by TEXT; ALTER TABLE print_orders ADD COLUMN budget_approved_at INTEGER; CREATE TABLE admin_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,target TEXT);");
 const env={DB:db as any,MEDIA:media as any,HANDWRYTTEN_API_KEY:'synthetic-key',HANDWRYTTEN_PREVIEWS_ENABLED:'true',PRINT_ORDER_MODE:'handwrytten_test',ORDER_MODE:'simulation'};
 let approvedCap=10,mode=1,postage=.82,basket:any[]=[],sendFailure=false,stageFailure=false,missingTax=false,externalAddition=false,unverifiable=false,stealLease=false;
 const calls:{path:string;body:any}[]=[];
 const totals=()=>({grand_total:3.75+postage,tax:.29,total:Math.round((4.04+postage)*100)/100});
 const fetch=mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(String(init.body)):null;calls.push({path,body});assert.equal(new Headers(init.headers).get('Authorization'),'synthetic-key');
  if(path==='/v2/checkauth/auth')return Response.json({status:'ok',test_mode:mode});
  if(path==='/v2/profile/listAddresses')return Response.json({status:'ok',addresses:[{id:17,country_id:1,name:'Synthetic sender'}]});
  if(path==='/v2/countries/list'){if(stealLease)await db.prepare("UPDATE print_fulfillment_lock SET owner='another-worker',lease_until=unixepoch()+300 WHERE id=1").run();return Response.json({status:'ok',countries:[{id:1,name:'United States',ups_code:'US'},{id:96,name:'India',ups_code:'IN'},{id:142,name:'Netherlands',ups_code:'NL'}]});}
  if(path==='/v2/basket/allNew'){if(externalAddition&&basket.length===1){externalAddition=false;basket.push({id:999,client_metadata:'unrelated'});}return Response.json({status:'ok',test_mode:mode,items:basket,totals:{...totals(),...(missingTax?{tax:null}:{})}});}
  if(path==='/v2/orders/placeBasket'){
   assert.equal(mode,1);assert.equal(body.font,'hwMadeline');assert.equal(body.font_size,13);assert.equal(body.auto_font_size,true);assert.equal(body.return_address_id,17);assert.equal(body.addresses[0].return_address_id,17);assert.equal(body.addresses[0].wishes,undefined);
   if(stageFailure)throw new TypeError('Connection interrupted');
   basket=[{id:100,client_metadata:body.client_metadata,card_id:body.card_id,quantity:1,address_to:{country:body.addresses[0].to_country},card_orders:[{id:200}],totals:{card:3.75,delivery_cost:postage,shipping:0,insert:0,gift_card:0,subtotal:3.75+postage},price_structure:{card:{total:3.75,money:3.75},postage:{total:postage,money:postage},card_tax:{total:.29,money:.29}}}];return Response.json({status:'ok',order_id:100});
  }
  if(path.startsWith('/v2/orders/details')){if(unverifiable)throw new TypeError('Cannot confirm outcome');return Response.json({status:'ok',order:{id:100,client_metadata:'print-test',status:'test',test_mode:1,quantity:1,payed:totals().total}});}
  if(path==='/v2/basket/remove'){assert.equal(body.id,200);basket=[];return Response.json({status:'ok'});}
  assert.equal(path,'/v2/basket/send','Unexpected provider endpoint');assert.equal(mode,1);assert.equal(basket.length,1);assert.equal(body.test_mode,1);assert.equal(body.price_structure.money,totals().total);assert.ok(body.price_structure.money<=approvedCap);
  basket=[];if(sendFailure)throw new TypeError('Response lost after acceptance');return Response.json({status:'ok'});
 });
 const state=async()=>await db.prepare("SELECT f.*,o.status AS order_status,o.handwrytten_quote_json,o.provider_id FROM print_fulfillment f JOIN print_orders o ON o.id=f.order_id WHERE o.id='print-test'").first<any>();
 async function reset(country='US'){
  approvedCap=10;mode=1;postage=country==='US'?.82:1.85;basket=[];calls.length=0;sendFailure=false;stageFailure=false;missingTax=false;externalAddition=false;unverifiable=false;stealLease=false;
  await db.prepare('DELETE FROM print_orders').run();await db.prepare('DELETE FROM print_fulfillment_lock').run();await db.prepare('DELETE FROM handwrytten_previews').run();
  await db.prepare("INSERT INTO handwrytten_previews VALUES('proof','invite',2026,'ready',42,'front','inside','back',unixepoch())").run();
  const name=({US:'United States',IN:'India',NL:'Netherlands'} as any)[country],payload={card_id:42,font:'hwMadeline',font_size:13,auto_font_size:true,client_metadata:'print-test',addresses:[{to_country:name,to_address1:'Synthetic address',to_city:'Synthetic city',message:'Dear Household,\n\nA note.\nCheers, Pixel'}]};
  await db.prepare("INSERT INTO print_orders(id,invitation_id,year,status,format,card_count,handwrytten_preview_id,handwrytten_order_json,address_json) VALUES('print-test','invite',2026,'simulated','folded',1,'proof',?1,?2)").bind(JSON.stringify(payload),JSON.stringify({country})).run();
  await db.prepare("INSERT INTO print_fulfillment(order_id,state) VALUES('print-test','pending')").run();
 }
 try{
  for(const country of ['US','IN','NL'])await t.test(country+' uses exact destination-aware postage and automatically submits once',async()=>{
   await reset(country);await Promise.all([tickPrintFulfillment(env),tickPrintFulfillment(env)]);await tickPrintFulfillment(env);
   const s=await state(),q=JSON.parse(s.handwrytten_quote_json);assert.equal(s.state,'submitted');assert.equal(s.order_status,'submitted');assert.equal(s.provider_id,'handwrytten-test-100');assert.equal(q.amounts.total,country==='US'?486:589);assert.equal(q.amounts.postage,country==='US'?82:185);assert.equal(q.submitted,true);assert.equal(calls.filter(c=>c.path.endsWith('/basket/send')).length,1);
  });
  for(const country of ['IN','NL'])await t.test(country+' quote-only requests price the saved destination and remove their draft without submitting',async()=>{
   await reset(country);await db.prepare('DELETE FROM print_fulfillment').run();
   const result=await quoteSavedPrintOrder(env as any,2026,'print-test');
   assert.equal(result.status,'ready');assert.equal(result.quote.amounts.postage,185);assert.equal(result.quote.amounts.total,589);
   assert.equal(result.quote.destination,country==='IN'?'India':'Netherlands');assert.equal(result.quote.quoteOnly,true);assert.equal(result.quote.submitted,false);
   const current=await state();assert.equal(current.order_status,'simulated');assert.equal(current.quote_only,1);assert.equal(current.state,'review');
   assert.equal(basket.length,0);assert.equal(calls.filter(c=>c.path.endsWith('/basket/remove')).length,1);
   assert.ok(calls.every(c=>!c.path.endsWith('/basket/send')&&!c.path.endsWith('/outbound/process')));
   const count=calls.length;await tickPrintFulfillment(env);assert.equal(calls.length,count,'Cron must never submit a completed quote-only request');
   await quoteSavedPrintOrder(env as any,2026,'print-test');assert.equal(calls.filter(c=>c.path.endsWith('/orders/placeBasket')).length,2,'An explicit refresh may prepare a fresh quote after removing its previous draft');
   assert.ok(calls.every(c=>!c.path.endsWith('/basket/send')));
  });
  await t.test('international quote-only work is blocked before mutation when Test Mode is off',async()=>{
   await reset('IN');await db.prepare('DELETE FROM print_fulfillment').run();mode=0;
   await assert.rejects(()=>quoteSavedPrintOrder(env as any,2026,'print-test'),/Test Mode/);
   assert.ok(calls.every(c=>!c.path.endsWith('/orders/placeBasket')&&!c.path.endsWith('/basket/send')));
  });
  await t.test('a worker that lost its lease cannot stage an order or release another worker’s lock',async()=>{await reset();stealLease=true;await tickPrintFulfillment(env);assert.equal(calls.some(c=>c.path.endsWith('/orders/placeBasket')),false);assert.equal((await db.prepare('SELECT owner FROM print_fulfillment_lock').first<any>()).owner,'another-worker');});
  await t.test('exactly $10 is accepted',async()=>{await reset();postage=5.96;await tickPrintFulfillment(env);assert.equal((await state()).state,'submitted');assert.equal(JSON.parse((await state()).handwrytten_quote_json).amounts.total,1000);});
  await t.test('Test Mode off stops before staging',async()=>{await reset();mode=0;await tickPrintFulfillment(env);assert.equal((await state()).state,'review');assert.equal(calls.some(c=>c.path.endsWith('/placeBasket')||c.path.endsWith('/send')),false);});
  await t.test('manual approval authorizes only this test order and exact cap; price increases hold again',async()=>{
   await reset();postage=10;await tickPrintFulfillment(env);let current=await state();
   const approve=async(quote:string,actor='angela@example.com',overrides:any={})=>orderBudgetApprovalRoute(new Request('https://admin.test/api/editions/2026/print-orders/print-test/approve-budget',{method:'POST'}),{...env,...overrides},'/api/print-orders/print-test/approve-budget',2026,actor,async()=>({quote,confirm:true}));
   const held=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(held.budget_review_required,1);
   await assert.rejects(()=>approve('{}'),/quote changed/);
   await db.prepare("UPDATE print_fulfillment SET quote_only=1 WHERE order_id='print-test'").run();await assert.rejects(()=>approve(current.handwrytten_quote_json),/Quote-only/);await db.prepare("UPDATE print_fulfillment SET quote_only=0,state='unknown' WHERE order_id='print-test'").run();await assert.rejects(()=>approve(current.handwrytten_quote_json),/reconciliation/);await db.prepare("UPDATE print_fulfillment SET state='review' WHERE order_id='print-test'").run();
   await assert.rejects(()=>approve(current.handwrytten_quote_json,'owner@example.com',{PRINT_ORDER_MODE:'live'}),/Test Mode/);
   mode=0;await assert.rejects(()=>approve(current.handwrytten_quote_json),/Test Mode/);mode=1;
   const approved=await approve(current.handwrytten_quote_json);assert.equal(approved!.status,200);assert.equal((await state()).state,'pending');assert.equal((await state()).vendor_order_id,null);
   assert.equal((await approve(current.handwrytten_quote_json))!.status,200);assert.equal((await db.prepare('SELECT count(*) n FROM admin_events').first<any>()).n,1);
   postage=11;await tickPrintFulfillment(env);assert.equal((await state()).state,'review');assert.equal(calls.some(c=>c.path.endsWith('/basket/send')),false);
   current=await state();await approve(current.handwrytten_quote_json,'owner@example.com');approvedCap=15.04;await tickPrintFulfillment(env);
   assert.equal((await state()).state,'submitted');const saved=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(saved.budget_approved_cents,1504);assert.equal(saved.budget_approved_by,'owner@example.com');assert.equal(calls.filter(c=>c.path.endsWith('/basket/send')).length,1);
   await tickPrintFulfillment(env);assert.equal(calls.filter(c=>c.path.endsWith('/basket/send')).length,1);
   await assert.rejects(()=>approve(current.handwrytten_quote_json),/Active simulated order/);
  });
  await t.test('over $10 removes only its own unsent draft and never submits',async()=>{await reset();postage=10;await tickPrintFulfillment(env);assert.equal((await state()).state,'review');assert.equal(basket.length,0);assert.equal(calls.filter(c=>c.path.endsWith('/basket/remove')).length,1);assert.equal(calls.some(c=>c.path.endsWith('/basket/send')),false);});
  await t.test('an unrelated basket is preserved and never submitted',async()=>{await reset();basket=[{id:999,client_metadata:'not-ours'}];await tickPrintFulfillment(env);assert.equal((await state()).state,'review');assert.equal(basket.length,1);assert.ok(calls.every(c=>!['/v2/orders/placeBasket','/v2/basket/send','/v2/basket/remove'].includes(c.path)));});
  await t.test('missing tax after staging holds the account without guessing',async()=>{await reset();missingTax=true;await tickPrintFulfillment(env);await tickPrintFulfillment(env);assert.equal((await state()).state,'unknown');assert.equal(calls.some(c=>c.path.endsWith('/basket/send')),false);});
  await t.test('an uncertain submission is never replayed, even if the vendor accepted it',async()=>{await reset();sendFailure=true;unverifiable=true;await tickPrintFulfillment(env);await tickPrintFulfillment(env);assert.equal((await state()).state,'unknown');assert.equal((await state()).order_status,'unknown');assert.equal(calls.filter(c=>c.path.endsWith('/basket/send')).length,1);});
  await t.test('a lost submit response is reconciled by order ID without another submit',async()=>{await reset();sendFailure=true;await tickPrintFulfillment(env);assert.equal((await state()).state,'submitted');assert.equal(calls.filter(c=>c.path.endsWith('/basket/send')).length,1);});
  await t.test('an uncertain draft creation is never repeated',async()=>{await reset();stageFailure=true;await tickPrintFulfillment(env);await tickPrintFulfillment(env);assert.equal((await state()).state,'unknown');assert.equal(calls.filter(c=>c.path.endsWith('/orders/placeBasket')).length,1);});
  await t.test('a changed basket after staging cannot submit unrelated items',async()=>{await reset();externalAddition=true;await tickPrintFulfillment(env);assert.equal((await state()).state,'unknown');assert.equal(calls.some(c=>c.path.endsWith('/basket/send')),false);});
  await t.test('disabled app mode cannot make provider calls',async()=>{await reset();await tickPrintFulfillment({...env,PRINT_ORDER_MODE:'simulation'});assert.equal(calls.length,0);});
 }finally{fetch.mock.restore();await mf.dispose();}
});
test('India and Netherlands addresses normalize and use international Google validation without US-only USPS requirements',()=>{
 assert.equal(mailingAddress({line1:'1 Example',line2:'',city:'Amsterdam',state:'',postalCode:'1012js',country:'NL'}).postalCode,'1012 JS');
 assert.equal(mailingAddress({line1:'1 Example',line2:'',city:'Mumbai',state:'Maharashtra',postalCode:'400001',country:'IN'}).country,'IN');
 for(const country of ['IN','NL'] as const){const postal={regionCode:country,addressLines:['1 Example'],locality:country==='IN'?'Mumbai':'Amsterdam',administrativeArea:country==='IN'?'Maharashtra':'',postalCode:country==='IN'?'400001':'1012 JS'};assert.equal(googleMailingAddress({result:{verdict:{addressComplete:true,validationGranularity:'PREMISE'},address:{postalAddress:postal}}},country).country,country);}
 assert.throws(()=>googleMailingAddress({result:{verdict:{addressComplete:true,validationGranularity:'PREMISE'},address:{postalAddress:{regionCode:'US',addressLines:['1 Example']}}}}),/deliverable/);
});
