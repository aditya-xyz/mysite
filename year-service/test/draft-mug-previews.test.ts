import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {preparedMugPlans,preparedMugCatalog,preparedMugImage} from '../src/prepared-mugs.ts';
test('unpublished mug previews are readable in admin preview but never through guest catalog or image access',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-06',d1Databases:['DB'],r2Buckets:['MEDIA']}));
 try{
  const DB=await mf.getD1Database('DB'),MEDIA=await mf.getR2Bucket('MEDIA');
  for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){const sql=await readFile('migrations/'+name,'utf8');if(sql.includes('--> statement-breakpoint'))await DB.batch(sql.split('--> statement-breakpoint').map(s=>DB.prepare(s)));else await DB.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));}
  const cutoutVersion='a'.repeat(32),mugs=Array.from({length:4},(_,i)=>({id:'draft-mug-'+i,caption:'Draft caption '+i,alt:'Synthetic mug photo',cutoutVersion}));
  for(const mug of mugs)await DB.prepare('INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?2,?3,10)').bind(mug.id,mug.id+'.jpg','image/jpeg').run();
  const current=await DB.prepare('SELECT draft_json FROM editions WHERE year=2026').first<any>(),draft={...JSON.parse(current.draft_json),mugDesigns:mugs};
  const published=JSON.stringify({...draft,mugDesigns:[]});await DB.prepare('UPDATE editions SET draft_json=?1,published_json=?2,is_active=1 WHERE year=2026').bind(JSON.stringify(draft),published).run();
  const catalog={provider:'printful',currency:'USD',styles:[{id:'classic',productId:19,label:'Classic ceramic',sizes:['11oz'],colors:['white'],variants:[{id:1320,size:'11oz',color:'white',printWidth:2700,printHeight:1050}]}]};
  await DB.prepare('INSERT INTO mug_preview_sync(year,catalog_json,manifest_json) VALUES(2026,?1,NULL)').bind(JSON.stringify(catalog)).run();const env:any={DB,MEDIA};
  assert.equal((await preparedMugPlans(env,2026)).length,0);const plans=await preparedMugPlans(env,2026,true);assert.equal(plans.length,12);
  const p=plans[0],id='b'.repeat(64);await MEDIA.put('draft-only.png','private image');
  await DB.prepare('INSERT INTO mug_preview_sources(id,year,design_id,cutout_version,caption,font,ink,artwork_key) VALUES(?1,2026,?2,?3,?4,?5,?6,?7)').bind(p.id,p.design_id,p.cutout_version,p.caption,p.font,p.ink,p.artwork_key).run();
  await DB.prepare('INSERT INTO mug_preview_images(id,year,source_id,design_id,cutout_version,caption,font,style,size,color,variant_id,image_key,view) VALUES(?1,2026,?2,?3,?4,?5,?6,\'classic\',\'11oz\',\'white\',1320,\'draft-only.png\',\'handle-left\')').bind(id,p.id,p.design_id,p.cutout_version,p.caption,p.font).run();
  assert.equal((await preparedMugCatalog(env,2026,true))!.previews.length,0);const adminCatalog=await preparedMugCatalog(env,2026,true,true);assert.equal(adminCatalog!.previews.length,1);assert.equal(adminCatalog!.previews[0].designId,p.design_id);
  const invite:any={edition_year:2026};await assert.rejects(()=>preparedMugImage(env,invite,id),/Mug preview not found/);assert.equal((await preparedMugImage(env,invite,id,true)).status,200);
  assert.equal((await DB.prepare('SELECT published_json FROM editions WHERE year=2026').first<any>()).published_json,published);
  for(const table of ['mug_orders','print_orders','sessions'])assert.equal((await DB.prepare('SELECT count(*) n FROM '+table).first<any>()).n,0);
 }finally{await mf.dispose();}
});
