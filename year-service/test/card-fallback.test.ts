import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {cardFallbackPreview,tickCardFallback} from '../src/card-fallback.ts';
import {countryDeadline,giftWindow,cutoffSchedule} from '../src/gift-deadline.ts';
import {createPrintOrder,printStatus,finishSavedPrintOrder,type PrintEnv} from '../src/printing.ts';
import {createMugOrder,mugStatus,mugQuote} from '../src/mug-orders.ts';
import {keepsakeManifest} from '../src/keepsake-defaults.ts';
import {orderBudgetApprovalRoute} from '../admin/src/order-budget-approval.ts';
import {cardFallbackAdminRoute} from '../admin/src/card-fallback.ts';
import {digest} from '../src/security.ts';
// @ts-expect-error Shared admin presentation helpers.
import {lastChoiceDate} from '../admin/client/card-fallback.js';
// @ts-expect-error Shared browser markup and clock helper.
import {giftMarkup} from '../web/pixelbook.js';
// @ts-expect-error Shared browser clock helper.
import {watchGiftDeadline} from '../web/gift-deadline.js';

test('fallback cards preserve eligibility, household uniqueness, frozen content and test-only fulfillment',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-06',d1Databases:['DB'],r2Buckets:['MEDIA']}));
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA');
  for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
   const sql=await readFile('migrations/'+f,'utf8');if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));
  }
  const at=Math.floor(Date.now()/1000),jpg=new Uint8Array([255,216,255,192,0,11,8,5,220,4,176,1,1,17,0,255,217]);
  const env={DB:db,MEDIA:bucket,ORDER_MODE:'simulation',PRINT_ORDER_MODE:'handwrytten_test',HANDWRYTTEN_API_KEY:'fixture-only'} as unknown as PrintEnv;
  const request=new Request('https://guest.test/api/print/orders',{method:'POST'});
  const published={authors:'Pixel',printNote:'Personal note.',defaultPrintNote:'Default holiday note.',photos:[],mugDesigns:[]};
  async function reset(){
   await db.exec('DELETE FROM card_fallback_jobs; DELETE FROM card_fallback_exclusions; DELETE FROM print_fulfillment; DELETE FROM print_orders; DELETE FROM invites; DELETE FROM people;');
   await db.prepare('UPDATE editions SET is_active=1,allow_print_orders=1,allow_mug_orders=1,published_json=?1,published_version=1 WHERE year=2026').bind(JSON.stringify(published)).run();
   await db.prepare('UPDATE card_fallback_policies SET international_cutoff=?1,international_run_at=?2,us_cutoff=?3,us_run_at=?4 WHERE year=2026').bind(at+200,at+300,at+400,at+500).run();
   await db.prepare("INSERT INTO keepsake_defaults(year,revision,frames_json) VALUES(2026,'approved',?1) ON CONFLICT(year) DO UPDATE SET revision='approved',frames_json=excluded.frames_json").bind(JSON.stringify({'starry-night':'approved.jpg'})).run();
   await bucket.put('approved.jpg',jpg);
  }
  async function add(id:string,country='US',address=true){
   const value={line1:'123 Synthetic Test Road',line2:'Unit 4',city:country==='IN'?'Mumbai':country==='NL'?'Amsterdam':'Portland',state:country==='IN'?'Maharashtra':country==='US'?'OR':'',postalCode:country==='IN'?'400001':country==='NL'?'1012 JS':'97201',country};
   await db.prepare('INSERT INTO people(id,name,mailing_address) VALUES(?1,?2,?3)').bind(id,'Recipient '+id,address?JSON.stringify(value):null).run();
   await db.prepare('INSERT INTO invites(id,person_id,name,phone,token_hash,expires_at,edition_year,member_ids,allow_print,allow_mug) VALUES(?1,?1,?2,?3,?4,?5,2026,?6,1,1)').bind(id,'Recipient '+id,'+1555'+String(Math.floor(Math.random()*10000000)).padStart(7,'0'),await digest(id),at+86400,JSON.stringify([id])).run();
   return await db.prepare('SELECT * FROM invites WHERE id=?1').bind(id).first<any>();
  }
  const due=async()=>db.prepare('UPDATE card_fallback_policies SET international_cutoff=?1,international_run_at=?1,us_cutoff=?1,us_run_at=?1 WHERE year=2026').bind(at-1).run();
  const count=async(table:string)=>Number((await db.prepare('SELECT count(*) AS n FROM '+table).first<any>()).n);
  await t.test('migration seeds the exact Pacific deadlines; country boundary is inclusive',async()=>{
   const p=await db.prepare('SELECT * FROM card_fallback_policies WHERE year=2026').first<any>();
   assert.equal(new Date(p.international_cutoff*1000).toISOString(),'2026-11-30T08:00:00.000Z');
   assert.equal(new Date(p.international_run_at*1000).toISOString(),'2026-11-30T14:00:00.000Z');
   assert.equal(new Date(p.us_cutoff*1000).toISOString(),'2026-12-07T08:00:00.000Z');
   assert.equal(new Date(p.us_run_at*1000).toISOString(),'2026-12-07T14:00:00.000Z');
   assert.equal(countryDeadline(p,'IN').closesAt,p.international_cutoff);assert.equal(countryDeadline(p,'NL').closesAt,p.international_cutoff);assert.equal(countryDeadline(p,undefined).closesAt,p.us_cutoff);
  });
  await t.test('dry run lists custom/default recipients and addresses without creating orders, jobs or proofs',async()=>{
   await reset();await add('india','IN');await add('dutch','NL');await add('us');await add('missing','US',false);
   for(const n of [1,2,3])await db.prepare("INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?2,'image/jpeg',17) ON CONFLICT DO NOTHING").bind('photo-'+n,'photo-'+n+'.jpg').run();
   await db.prepare("UPDATE editions SET published_json=json_set(published_json,'$.photos',json(?1)) WHERE year=2026").bind(JSON.stringify([1,2,3].map(n=>({id:'photo-'+n,preview_key:'photo-'+n+'.jpg',recipients:['india']})))).run();
   const preview=await cardFallbackPreview(env,2026,at);
   assert.equal(preview.rows.filter(r=>r.decision==='scheduled').length,3);assert.equal(preview.rows.find(r=>r.invitationId==='missing')?.decision,'skipped');assert.equal(preview.frame,'starry-night');
   assert.equal(preview.rows.find(r=>r.invitationId==='india')?.address?.postalCode,'400001');
   assert.equal(await count('print_orders'),0);assert.equal(await count('card_fallback_jobs'),0);assert.equal(await count('handwrytten_previews'),0);
   assert.equal((await cardFallbackPreview(env,2027,at)).policy,null);
  });
  await t.test('inactive, unpublished or disabled editions cannot create fallback orders',async()=>{
   for(const change of ['is_active=0','published_version=NULL','published_json=NULL','allow_print_orders=0']){
    await reset();await add('us');await due();await db.exec('UPDATE editions SET '+change+' WHERE year=2026');await tickCardFallback(env,at);assert.equal(await count('print_orders'),0);assert.equal((await cardFallbackPreview(env,2026,at)).rows[0].decision,'skipped');
   }
  });
  await t.test('admins can save Pacific last-choice dates without changing contacts, invitations or orders',async()=>{
   await reset();await add('us');const before=await db.prepare('SELECT * FROM people').all(),invites=await db.prepare('SELECT * FROM invites').all();
   const previousPolicy=await db.prepare('SELECT * FROM card_fallback_policies WHERE year=2026').first<any>();
   const response=await cardFallbackAdminRoute(new Request('https://admin.test',{method:'POST'}),env,'/api/card-fallback/dates',2026,'owner@example.com',async()=>({previousPolicy,internationalLastDay:'2026-11-29',usLastDay:'2026-12-06'}));assert.equal(response?.status,200);
   const saved=await db.prepare('SELECT * FROM card_fallback_policies WHERE year=2026').first<any>();assert.equal(saved.international_cutoff,1796025600);assert.equal(saved.us_cutoff,1796630400);
   assert.deepEqual((await db.prepare('SELECT * FROM people').all()).results,before.results);assert.deepEqual((await db.prepare('SELECT * FROM invites').all()).results,invites.results);assert.equal(await count('print_orders'),0);assert.equal(await count('card_fallback_jobs'),0);
   await assert.rejects(cardFallbackAdminRoute(new Request('https://admin.test',{method:'POST'}),env,'/api/card-fallback/dates',2026,'angela@example.com',async()=>({previousPolicy,internationalLastDay:'2026-11-28',usLastDay:'2026-12-05'})),/schedule changed/);
  });
  await t.test('invalid dates, past dates and edits after closure are rejected; retired exclusion controls do nothing',async()=>{
   await reset();await add('us');const previousPolicy=await db.prepare('SELECT * FROM card_fallback_policies WHERE year=2026').first<any>();
   for(const internationalLastDay of ['2026-02-30','2025-11-29','2026-01-01'])await assert.rejects(cardFallbackAdminRoute(new Request('https://admin.test',{method:'POST'}),env,'/api/card-fallback/dates',2026,'owner@example.com',async()=>({previousPolicy,internationalLastDay,usLastDay:'2026-12-06'})));
   await due();await tickCardFallback(env,at);const current=await db.prepare('SELECT * FROM card_fallback_policies WHERE year=2026').first<any>();
   await assert.rejects(cardFallbackAdminRoute(new Request('https://admin.test',{method:'POST'}),env,'/api/card-fallback/dates',2026,'owner@example.com',async()=>({previousPolicy:current,internationalLastDay:'2026-11-29',usLastDay:'2026-12-06'})),/cutoff has already started/);
   assert.equal(await cardFallbackAdminRoute(new Request('https://admin.test',{method:'POST'}),env,'/api/card-fallback/exclusions/us',2026,'owner@example.com',async()=>({excluded:true})),null);
  });
  await t.test('midnight closes gifts, 6 a.m. queues cards, and no mugs are created',async()=>{
   await reset();const india=await add('india','IN'),us=await add('us');
   assert.equal((await giftWindow(env.DB,india,at+199)).closed,false);assert.equal((await giftWindow(env.DB,india,at+200)).closed,true);assert.equal((await giftWindow(env.DB,us,at+200)).closed,false);
   await tickCardFallback(env,at+200);assert.equal(await count('card_fallback_jobs'),1);assert.equal(await count('print_orders'),0);
   await tickCardFallback(env,at+299);assert.equal(await count('print_orders'),0);
   await tickCardFallback(env,at+300);assert.equal(await count('print_orders'),1);
   const order=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(JSON.parse(order.recipe_json).frame,'starry-night');assert.equal(JSON.parse(order.recipe_json).source,'automatic-fallback');assert.equal(order.card_count,1);assert.equal(order.note,'Dear Recipient india,\n\nDefault holiday note.');
   assert.equal(JSON.parse(order.handwrytten_order_json).addresses[0].to_country,'India');assert.equal((await db.prepare('SELECT state FROM print_fulfillment').first<any>()).state,'pending');
   assert.equal(await count('mug_orders'),0);
   await tickCardFallback(env,at+500);assert.equal(await count('print_orders'),2);
  });
  await t.test('expired verification does not discard a complete admin-owned address; saved card is immutable',async()=>{
   await reset();await add('dutch','NL');await due();
   await db.prepare("UPDATE people SET address_verified=0,address_verifier=NULL WHERE id='dutch'").run();
   await tickCardFallback(env,at);const o=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(JSON.parse(o.address_json).country,'NL');
   await db.prepare("UPDATE people SET mailing_address=json_set(mailing_address,'$.city','Changed') WHERE id='dutch'").run();
   await db.prepare("UPDATE editions SET published_json=json_set(published_json,'$.defaultPrintNote','Changed') WHERE year=2026").run();
   await tickCardFallback(env,at+60);assert.equal(await count('print_orders'),1);assert.equal((await db.prepare('SELECT note FROM print_orders').first<any>()).note,o.note);
  });
  await t.test('skip missing/incomplete addresses, inactive invitations and permissions off',async()=>{
   await reset();await add('missing','US',false);await add('bad');await add('revoked');await add('expired');await add('off');
   await db.prepare("UPDATE people SET mailing_address=json_set(mailing_address,'$.postalCode','bad') WHERE id='bad'").run();
   await db.prepare("UPDATE invites SET revoked_at=?1 WHERE id='revoked'").bind(at).run();await db.prepare("UPDATE invites SET expires_at=?1 WHERE id='expired'").bind(at-1).run();await db.prepare("UPDATE invites SET allow_print=0 WHERE id='off'").run();
   await due();await tickCardFallback(env,at);assert.equal(await count('print_orders'),0);assert.equal((await cardFallbackPreview(env,2026,at)).rows.every(r=>r.decision==='skipped'),true);
   await db.prepare("UPDATE people SET mailing_address=?1 WHERE id='missing'").bind(JSON.stringify({line1:'123 Example Road',line2:'',city:'Portland',state:'OR',postalCode:'97201',country:'US'})).run();
   await tickCardFallback(env,at+60);assert.equal(await count('print_orders'),0,'Late addresses do not reopen the cutoff decision');
  });
  await t.test('changed country after closure cannot reopen gifts or postpone the fallback run',async()=>{
   await reset();const i=await add('india','IN');await tickCardFallback(env,at+200);
   await db.prepare("UPDATE people SET mailing_address=json_set(mailing_address,'$.country','US','$.state','OR','$.postalCode','97201') WHERE id='india'").run();
   assert.equal((await giftWindow(env.DB,i,at+201)).closed,true);assert.equal((await giftWindow(env.DB,i,at+201)).runAt,at+300);
  });
  await t.test('concurrent ticks and household aliases reserve just one default card',async()=>{
   await reset();await add('household');
   await add('alias');await db.prepare("UPDATE invites SET member_ids='[\"household\",\"alias\"]' WHERE id IN ('household','alias')").run();
   await due();await Promise.all([tickCardFallback(env,at),tickCardFallback(env,at)]);await tickCardFallback(env,at+60);
   assert.equal(await count('print_orders'),1);assert.equal(await count('print_fulfillment'),1);assert.equal(await count('mug_orders'),0);
   await tickCardFallback(env,at+120);assert.equal(await count('print_orders'),1);
  });
  await t.test('existing orders, including approval, unknown and reset history, prevent a second fallback',async()=>{
   await reset();await add('us');await due();await tickCardFallback(env,at);
   await db.prepare("UPDATE print_orders SET budget_review_required=1,allowance_reset_at=?1").bind(at).run();
   assert.equal((await cardFallbackPreview(env,2026,at)).rows[0].decision,'awaiting-approval');await tickCardFallback(env,at+60);assert.equal(await count('print_orders'),1);
   await db.prepare("UPDATE print_orders SET budget_review_required=0,status='unknown'").run();const saved=await db.prepare('SELECT id FROM print_orders').first<any>();await db.prepare("UPDATE print_orders SET handwrytten_order_json=json_set(handwrytten_order_json,'$.card_id',123)").run();await finishSavedPrintOrder(env,saved.id,2026);assert.equal(JSON.parse((await db.prepare('SELECT handwrytten_order_json FROM print_orders').first<any>()).handwrytten_order_json).card_id,123);assert.equal((await cardFallbackPreview(env,2026,at)).rows[0].decision,'needs-review');await tickCardFallback(env,at+120);assert.equal(await count('print_orders'),1);
  });
  await t.test('fallback totals over budget still require the existing exact-quote admin approval',async st=>{
   await reset();await add('us');await due();await tickCardFallback(env,at);
   const order=await db.prepare('SELECT * FROM print_orders').first<any>(),quote=JSON.stringify({currency:'USD',amounts:{total:1100},submitted:false,source:'handwrytten-test-basket',quoteOnly:false});
   await db.prepare('UPDATE print_orders SET handwrytten_quote_json=?1,budget_review_required=1 WHERE id=?2').bind(quote,order.id).run();
   await db.prepare("UPDATE print_fulfillment SET state='review',basket_item_id=NULL WHERE order_id=?1").bind(order.id).run();
   st.mock.method(globalThis,'fetch',async(input:any)=>{assert.ok(String(input).endsWith('/checkauth/auth'));return Response.json({status:'ok',test_mode:1});});
   const response=await orderBudgetApprovalRoute(new Request('https://admin.test',{method:'POST'}),env,`/api/print-orders/${order.id}/approve-budget`,2026,'owner@example.com',async()=>({confirm:true,quote}));
   assert.equal(response?.status,200);const approved=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(approved.budget_approved_cents,1100);assert.equal(approved.budget_review_required,0);assert.equal((await db.prepare('SELECT state FROM print_fulfillment').first<any>()).state,'pending');
   await tickCardFallback(env,at+60);assert.equal(await count('print_orders'),1);
  });
  await t.test('safe preparation failures retry; a crash resumes the original frozen reservation',async()=>{
   await reset();await add('us');await due();await bucket.delete('approved.jpg');
   await tickCardFallback(env,at);assert.equal((await db.prepare('SELECT state FROM card_fallback_jobs').first<any>()).state,'pending');assert.equal(await count('print_orders'),0);
   await bucket.put('approved.jpg',jpg);await tickCardFallback(env,at+60);const o=await db.prepare('SELECT * FROM print_orders').first<any>();assert.ok(o);
   await db.prepare("UPDATE print_orders SET status='preparing',handwrytten_order_json=NULL WHERE id=?1").bind(o.id).run();await db.exec('DELETE FROM print_fulfillment');await db.prepare("UPDATE card_fallback_jobs SET state='preparing',lease_until=0,next_at=0 WHERE order_id=?1").bind(o.id).run();
   await db.prepare("UPDATE people SET mailing_address=json_set(mailing_address,'$.city','Changed') WHERE id='us'").run();
   await tickCardFallback(env,at+120);assert.equal(await count('print_orders'),1);const resumed=await db.prepare('SELECT * FROM print_orders').first<any>();assert.equal(resumed.status,'simulated');assert.equal(JSON.parse(resumed.handwrytten_order_json).addresses[0].to_city,'Portland');
  });
  await t.test('a lost reservation response keeps its durable order link and resumes without a duplicate',async()=>{
   await reset();await add('us');await due();let reservation=false,lost=false;
   const interrupted={...env,DB:{prepare:(sql:string)=>{if(sql.includes('INSERT INTO print_orders'))reservation=true;return db.prepare(sql);},batch:async(statements:any)=>{const result=await db.batch(statements);if(reservation&&!lost){lost=true;throw new Error('Simulated response lost after commit');}return result;}}} as unknown as PrintEnv;
   await tickCardFallback(interrupted,at);const job=await db.prepare('SELECT * FROM card_fallback_jobs').first<any>();assert.ok(job.order_id);assert.equal(job.state,'pending');assert.equal(await count('print_orders'),1);
   await tickCardFallback(env,at+60);assert.equal((await db.prepare('SELECT status FROM print_orders').first<any>()).status,'simulated');assert.equal(await count('print_orders'),1);assert.equal(await count('print_fulfillment'),1);
  });
  await t.test('disabled test configuration never queues an automatic order',async()=>{
   await reset();await add('us');await due();await tickCardFallback({...env,PRINT_ORDER_MODE:'simulation'},at);assert.equal(await count('print_orders'),0);
   await tickCardFallback({...env,ORDER_MODE:'live'},at);assert.equal(await count('print_orders'),0);
  });
  await t.test('both server order paths close while saved order access remains independent',async()=>{
   await reset();const invite=await add('us');await due();
   assert.equal((await printStatus(request,env,invite)).canOrder,false);await assert.rejects(createPrintOrder(request,env,invite),/deadline/);
   assert.equal((await mugStatus(request,env,invite)).eligible,false);await assert.rejects(createMugOrder(request,env,invite,{}),/not enabled/);await assert.rejects(mugQuote(request,env,invite,{}),/not enabled/);
   assert.equal((await keepsakeManifest(env,invite,3)).enabled,false);
   assert.equal(giftMarkup({giftWindow:{closed:true},keepsake:{enabled:true},gift:{enabled:true,designs:[]}}),'');
  });
  await t.test('admin dry run is read-only and safe retries cannot re-send submitted/unknown orders',async()=>{
   await reset();await add('us');const schedule=await cardFallbackAdminRoute(new Request('https://admin.test/api/editions/2026/card-fallback/schedule'),env,'/api/card-fallback/schedule',2026,'owner@example.com',async()=>({}));const config=await schedule?.json() as any;assert.equal(config.policy.year,2026);assert.equal(config.policyEditable,true);assert.equal(Object.hasOwn(config,'rows'),false);const response=await cardFallbackAdminRoute(new Request('https://admin.test/api/editions/2026/card-fallback'),env,'/api/card-fallback',2026,'owner@example.com',async()=>({}));assert.equal(response?.status,200);assert.equal(await count('card_fallback_jobs'),0);assert.equal(await count('print_orders'),0);
   await due();await tickCardFallback(env,at);await db.exec("UPDATE print_orders SET status='unknown'; UPDATE card_fallback_jobs SET state='failed'");
   await assert.rejects(cardFallbackAdminRoute(new Request('https://admin.test/api/editions/2026/card-fallback/retry/us',{method:'POST'}),env,'/api/card-fallback/retry/us',2026,'owner@example.com',async()=>({})),/Only failed preparation/);
  });
 }finally{await mf.dispose();}
});

test('open pages close gifts exactly once at deadline and after a background-tab sleep',()=>{
 let clock=1000,callback:()=>void=()=>{},visibility:()=>void=()=>{},closed=0,canceled=0;
 const stop=watchGiftDeadline({closesAt:2,closed:false},()=>closed++,{now:()=>clock,schedule:(cb:()=>void,delay:number)=>{assert.ok(delay>0);callback=cb;return 1;},cancel:()=>canceled++,events:{addEventListener:(_name:string,cb:()=>void)=>{visibility=cb;},removeEventListener:()=>{}}});
 assert.equal(closed,0);clock=1999;callback();assert.equal(closed,0);clock=2000;visibility();assert.equal(closed,1);callback();assert.equal(closed,1);stop();assert.ok(canceled>0);
});

test('cutoff calendar dates follow Pacific daylight saving',()=>{
 assert.equal(cutoffSchedule('2026-11-29',2026).closesAt,1796025600);assert.equal(lastChoiceDate(1796025600),'2026-11-29');
 const spring=cutoffSchedule('2026-03-07',2026);assert.equal(new Date(spring.closesAt*1000).toISOString(),'2026-03-08T08:00:00.000Z');assert.equal(new Date(spring.runAt*1000).toISOString(),'2026-03-08T13:00:00.000Z');
 const autumn=cutoffSchedule('2026-10-31',2026);assert.equal(new Date(autumn.closesAt*1000).toISOString(),'2026-11-01T07:00:00.000Z');assert.equal(new Date(autumn.runAt*1000).toISOString(),'2026-11-01T14:00:00.000Z');

});

test('open pages pick up changed dates without placing orders',async()=>{
 let clock=1000,callback:()=>Promise<void>=async()=>{},closed=0;
 let next={closesAt:4,closed:false};
 const stop=watchGiftDeadline({closesAt:2,closed:false},()=>closed++,{now:()=>clock,schedule:(cb:()=>Promise<void>)=>{callback=cb;return 1;},cancel:()=>{},events:{addEventListener:()=>{},removeEventListener:()=>{}},refresh:async()=>next,repeat:()=>1,stopRepeat:()=>{}});
 clock=2000;await callback();assert.equal(closed,0,'An extension keeps gifts open past the old deadline');
 next={closesAt:3,closed:true};await callback();assert.equal(closed,1);stop();
});
