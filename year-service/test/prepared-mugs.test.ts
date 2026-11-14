import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {preparedMugPlans,preparedMugAdminRoute,syncPreparedMugs,startPreparedJob,finishPreparedJobs,preparedMugCatalog,preparedMugSource} from '../src/prepared-mugs.ts';
import type {PrintEnv} from '../src/printing.ts';

test('shared mug library includes every font, queues only affordable variants and serves complete saved combinations',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-08-06',script:'export default {fetch(){return new Response("test")}}',d1Databases:{DB:'prepared'},r2Buckets:{MEDIA:'prepared-media'}}));
 const tasks=new Map<string,number[]>(),calls:string[]=[];let failed=false;
 const png=new Uint8Array(33);png.set([137,80,78,71,13,10,26,10]);new DataView(png.buffer).setUint32(16,1200);new DataView(png.buffer).setUint32(20,1200);png[24]=8;png[25]=6;
 const mocked=mock.method(globalThis,'fetch',async(url:string,init:RequestInit={})=>{
  const u=new URL(url);calls.push(u.pathname);
  if(u.hostname==='files.cdn.printful.com'){assert.equal(new Headers(init.headers).has('Authorization'),false);return new Response(png,{headers:{'Content-Type':'image/png'}});}
  assert.equal(new Headers(init.headers).get('Authorization'),'Bearer prepared-test');
  if(u.pathname==='/products')return Response.json({result:[19,403,407,663].map(id=>({id,type:'MUG',title:'Mug '+id}))});
  if(u.pathname.startsWith('/products/')){
   const id=Number(u.pathname.split('/').pop());const variant=(id:number,size:string,color:string,price:string)=>({id,size,color,price,in_stock:true,availability_regions:{US:'United States'}});
   return Response.json({result:{variants:id===19?[variant(1320,'11 oz','White','6.07')]:id===403?[variant(22373,'15 oz','Dark Blue','9.13'),variant(17196,'15 oz','Black','9.13')]:id===407?[variant(11189,'12 oz','White','12.67')]:[variant(16440,'25 oz','White','22.54')]}});
  }
  if(u.pathname.includes('/printfiles/'))return Response.json({result:{option_groups:['Flat'],options:['Front','Right'],printfiles:[{printfile_id:43,width:2700,height:1050}],variant_printfiles:[1320,22373,17196,11189].map(variant_id=>({variant_id,placements:{default:43}}))}});
  if(u.pathname.includes('/create-task/')){
   if(failed)return new Response('private provider details',{status:503});
   const body=JSON.parse(String(init.body));assert.ok(!body.variant_ids.includes(16440));assert.equal(new Set(body.variant_ids).size,body.variant_ids.length);assert.ok(body.options.some((o:string)=>/right/i.test(o)));assert.equal(body.files[0].position.width,2700);assert.match(body.files[0].image_url,/^https:\/\/guest.test\/api\/gift\/prepared-source\/[a-f0-9]{64}$/);
   const key='task-'+tasks.size;tasks.set(key,body.variant_ids);return Response.json({result:{task_key:key,status:'pending'}});
  }
  assert.equal(u.pathname,'/mockup-generator/task');return Response.json({result:{status:'completed',mockups:(tasks.get(u.searchParams.get('task_key')!)||[]).map(id=>({variant_ids:[id],mockup_url:`https://files.cdn.printful.com/${id}-right.png`,extra:[{option:'Left',url:`https://files.cdn.printful.com/${id}-left.png`},{option:'Right',url:`https://files.cdn.printful.com/${id}-right.png`}]}))}});
 });
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA');
  for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){const sql=await readFile('migrations/'+f,'utf8');if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));}
  const designs=Array.from({length:4},(_,i)=>({id:'design-'+i,caption:'Caption '+i,alt:'Synthetic dog',cutoutVersion:'a'.repeat(32),preview_key:'approved-'+i+'.png'}));
  for(const design of designs)await db.prepare('INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?3,?4,?5)').bind(design.id,design.preview_key,design.id+'.png','image/png',png.length).run();
  await db.prepare('UPDATE editions SET is_active=1,published_json=?1 WHERE year=2026').bind(JSON.stringify({mugDesigns:designs,photos:[]})).run();
  const env={DB:db,MEDIA:bucket,PRINTFUL_ENABLED:'true',PRINTFUL_API_TOKEN:'prepared-test',JOURNAL_ORIGIN:'https://guest.test'} as unknown as PrintEnv;
  const plans=await preparedMugPlans(env,2026);assert.equal(plans.length,24);assert.deepEqual([...new Set(plans.map(p=>p.font))].sort(),['clean','handwritten','serif']);
  for(const plan of plans){new DataView(png.buffer).setUint32(16,plan.renderWidth);new DataView(png.buffer).setUint32(20,Math.round(plan.renderWidth*plan.printHeight/plan.printWidth));const response=await preparedMugAdminRoute(new Request('https://admin.test',{method:'POST',headers:{'Content-Type':'image/png'},body:png}),env,'/api/mug-preview-library/sources/'+plan.id,2026);assert.equal(response?.status,200);}
  await syncPreparedMugs(env,2026);
  assert.equal((await db.prepare('SELECT desired_count FROM mug_preview_sync').first<any>()).desired_count,96);
  const beforeAdmin=calls.length;assert.equal((await preparedMugPlans({...env,PRINTFUL_ENABLED:undefined,PRINTFUL_API_TOKEN:undefined},2026)).length,24);assert.equal(calls.length,beforeAdmin,'Admin source planning uses the saved supplier catalog without provider credentials');
  const empty=await preparedMugCatalog(env,2026);assert.equal(empty.prepared,true);assert.equal(empty.previews.length,0,'Initial fill stays in saved-only mode with no live-generation fallback');
  failed=true;assert.equal(await startPreparedJob(env),false);failed=false;
  assert.equal((await db.prepare("SELECT count(*) n FROM mug_preview_jobs WHERE status='queued'").first<any>()).n,36);
  await db.prepare('UPDATE mug_preview_jobs SET next_check_at=0').run();await db.prepare("DELETE FROM rate_limits WHERE key='printful-mockup-lease'").run();
  assert.equal(await startPreparedJob(env),true);assert.equal(await startPreparedJob(env),false,'Persistent lease prevents generation bursts');
  const pending=await db.prepare("SELECT source_token FROM mug_preview_jobs WHERE status='pending'").first<any>();assert.equal((await preparedMugSource(env,pending.source_token)).status,200);
  await db.prepare('UPDATE mug_preview_jobs SET next_check_at=0').run();await finishPreparedJobs(env);
  const partial=await preparedMugCatalog(env,2026);assert.ok(partial.previews.length>0&&partial.previews.length<48,'Finished combinations are usable before every photo/font is ready');
  for(let i=0;i<60;i++){
   await db.prepare('UPDATE mug_preview_jobs SET next_check_at=0').run();await finishPreparedJobs(env);
   await db.prepare("DELETE FROM rate_limits WHERE key='printful-mockup-lease'").run();await startPreparedJob(env);
  }
  const manifest=await preparedMugCatalog(env,2026);assert.equal(manifest.prepared,true);assert.equal(manifest.previews.length,96);assert.equal(manifest.styles.reduce((n:number,s:any)=>n+s.variants.length,0),4);
  assert.ok(manifest.previews.every((p:any)=>p.configuration.font&&p.src.startsWith('/api/gift/previews/')));
  assert.equal(manifest.previews.filter((p:any)=>p.view==='handle-right').length,48);assert.equal(manifest.previews.filter((p:any)=>p.view==='handle-left').length,48);
  const before=calls.length;assert.equal((await preparedMugCatalog(env,2026)).previews.length,96);assert.equal(calls.length,before,'Guest catalog reads never contact Printful');
  await assert.rejects(()=>preparedMugSource(env,pending.source_token),/not found/);
  await syncPreparedMugs(env,2026);assert.equal((await db.prepare("SELECT count(*) n FROM mug_preview_jobs WHERE status='queued'").first<any>()).n,0,'Nightly sync does not regenerate unchanged completed previews');
  const frontKeys=(await db.prepare("SELECT id,image_key FROM mug_preview_images WHERE view='handle-left' ORDER BY id").all<any>()).results;
  await db.prepare("DELETE FROM mug_preview_images WHERE view='handle-right'").run();
  await syncPreparedMugs(env,2026);assert.ok((await db.prepare("SELECT count(*) n FROM mug_preview_jobs WHERE status='queued'").first<any>()).n>0,'Existing front-only library queues missing handle views');
  assert.deepEqual((await db.prepare("SELECT id,image_key FROM mug_preview_images WHERE view='handle-left' ORDER BY id").all<any>()).results,frontKeys,'Existing front proofs keep their IDs and artwork');
  designs[0].caption='Changed caption';await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify({mugDesigns:designs,photos:[]})).run();assert.deepEqual((await preparedMugCatalog(env,2026)).previews,[],'Changed captions cannot reuse old prepared proofs or start a guest generation burst');
  assert.equal((await db.prepare('SELECT count(*) n FROM mug_orders').first<any>()).n,0);assert.ok(!calls.includes('/orders'));
 }finally{mocked.mock.restore();await mf.dispose();}
});
