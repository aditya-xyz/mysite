import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {digest} from '../../src/security.ts';
import type {PublishedPhoto} from '../../src/edition.ts';

test('72 simultaneous households retain isolated journal/media reads and immediate access changes',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'.wrangler/test-bundle/index.js',compatibilityDate:'2026-08-06',d1Databases:['DB'],r2Buckets:['MEDIA'],bindings:{SMS_ENABLED:'false'},outboundService:async()=>{throw Error('Browsing must not call a vendor');}}));
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('MEDIA');
  for(const f of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
   const sql=await readFile('migrations/'+f,'utf8');
   if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));
   else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));
  }
  const expiry=Math.floor(Date.now()/1000)+86400,keys=Array.from({length:72},(_,i)=>(i+100).toString(16).padStart(64,'0'));
  const photos:PublishedPhoto[]=Array.from({length:97},(_,i)=>({id:'p-'+i,caption:'Photo '+i,alt:'Synthetic photo',recipients:i<72?['person-'+i]:[],preview_key:'grid.jpg',viewer_key:'viewer.jpg',original_key:null,filename:'fixture.jpg',mime:'image/jpeg',width:800,height:600}));
  const edition={title:'Synthetic launch',authors:'Pixel',intro:'Hi',note:'Hello',sharedTitle:'Shared',stories:[],photos,mugDesigns:[]};
  await db.batch(photos.map(p=>db.prepare("INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,'grid.jpg','fixture.jpg','image/jpeg',21)").bind(p.id)));
  await db.prepare('UPDATE editions SET is_active=1,published_json=?1,published_version=1 WHERE year=2026').bind(JSON.stringify(edition)).run();
  await bucket.put('grid.jpg','small display fixture');await bucket.put('viewer.jpg','viewer fixture');
  for(let i=0;i<72;i++){
   await db.prepare('INSERT INTO people(id,name) VALUES(?1,?2)').bind('person-'+i,'Guest '+i).run();
   await db.prepare('INSERT INTO invites(id,person_id,name,phone,token_hash,expires_at,member_ids) VALUES(?1,?2,?3,?4,?5,?6,?7)').bind('invite-'+i,'person-'+i,'Guest '+i,'+1555555'+String(i).padStart(4,'0'),await digest('invite-'+i),expiry,JSON.stringify(['person-'+i])).run();
   await db.prepare('INSERT INTO sessions VALUES(?1,?2,?3)').bind(await digest(keys[i]),'invite-'+i,expiry).run();
  }
  const get=async(path:string,i=0)=>{try{return await mf.dispatchFetch('https://guest.test/api/'+path,{headers:{Cookie:'__Host-year_session='+keys[i]}});}catch(error){console.error('Local load transport failure:',(error as Error&{cause?:unknown}).cause);throw error;}};
  await Promise.all(keys.map(async(_,i)=>{
   const response=await get('journal',i);assert.equal(response.status,200);const journal=await response.json() as {photos:{id:string}[]};
   assert.equal(journal.photos.length,26);assert.equal(journal.photos[0].id,'p-'+i);
   assert.match(response.headers.get('Server-Timing')!,/auth;dur=/);
   // Keep one outstanding HTTP/1 connection per household in the local runner.
   // All 72 households still run concurrently; this is not a production burst benchmark.
   for(const id of ['p-'+i,'p-72','p-73','p-74']){const r=await get('media/'+id,i);assert.equal(r.status,200);assert.equal(await r.text(),'small display fixture');assert.match(r.headers.get('Server-Timing')!,/storage;dur=/);}
  }));
  assert.equal((await get('media/p-1')).status,404,'Other households remain private');
  // Legacy manifests may assign an old invitation ID instead of the directory person.
  photos[0].recipients=['invite-0'];await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify(edition)).run();
  assert.equal((await get('media/p-0')).status,200);
  photos[0].hidden=true;await db.prepare('UPDATE editions SET published_json=?1 WHERE year=2026').bind(JSON.stringify(edition)).run();
  assert.equal((await get('media/p-0')).status,404,'Publication edits apply without an auth-cache delay');
  await db.prepare("UPDATE invites SET revoked_at=unixepoch() WHERE id='invite-0'").run();
  assert.equal((await get('media/p-72')).status,401);assert.equal((await get('journal')).status,401);
  assert.equal((await db.prepare('SELECT count(*) n FROM original_downloads').first<{n:number}>())!.n,0);
 }finally{await mf.dispose();}
});
