import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {recipientPreviewRoute} from '../admin/src/recipient-preview.ts';

test('admin recipient preview is country-aware and never saves contacts, sessions or orders',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:{DB:'preview'},r2Buckets:{MEDIA:'preview'}}));
 try{
  const DB=await mf.getD1Database('DB'),MEDIA=await mf.getR2Bucket('MEDIA');
  for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
   const sql=await readFile('migrations/'+f,'utf8');if(sql.includes('--> statement-breakpoint'))await DB.batch(sql.split('--> statement-breakpoint').map(s=>DB.prepare(s)));else await DB.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));
  }
  await DB.prepare("INSERT INTO people(id,name,version) VALUES('preview-person','Preview friend',1)").run();
  await DB.prepare("INSERT INTO invites(id,person_id,member_ids,name,phone,token_hash,edition_year,expires_at,allow_mug,allow_print) VALUES('preview-invite','preview-person','[\"preview-person\"]','Friend','+15555550111',?1,2026,unixepoch()+86400,1,1)").bind('a'.repeat(64)).run();
  await DB.prepare('UPDATE editions SET allow_mug_orders=1,allow_print_orders=1 WHERE year=2026').run();
  const revision='d'.repeat(64);await DB.prepare('INSERT INTO keepsake_defaults(year,revision,frames_json) VALUES(2026,?1,?2)').bind(revision,JSON.stringify({moss:'default.jpg'})).run();await MEDIA.put('default.jpg','image');
  const env:any={DB,MEDIA,ADDRESS_VERIFICATION_PROVIDER:'google',GOOGLE_ADDRESS_VALIDATION_API_KEY:'fake'};
  let resolvedInvitation:string|undefined;
  const journal=async(invitationId?:string)=>{resolvedInvitation=invitationId;return ({name:'Friend',photos:[{id:'personal',personal:true},{id:'shared',personal:false}],gift:{enabled:true,designs:[{id:'mug'}]}});};
  const call=async(action:string,data?:any,query='invitation=preview-invite')=>recipientPreviewRoute(new Request('https://admin.test/api/editions/2026/recipient-preview/'+action+'?'+query,{method:data?'POST':'GET',...(data?{body:JSON.stringify(data)}:{})}),env,2026,'/api/recipient-preview/'+action,journal,async()=>data);
  const before=await DB.prepare('SELECT * FROM people').all();
  for(const country of ['IN','NL']){
   const address={country,line1:'Synthetic street 12',line2:'',city:country==='IN'?'Pune':'Amsterdam',state:country==='IN'?'Maharashtra':'',postalCode:country==='IN'?'411001':'1012 JS'};
   await DB.prepare('UPDATE people SET mailing_address=?1 WHERE id=?2').bind(JSON.stringify(address),'preview-person').run();
   const unchanged=await DB.prepare('SELECT * FROM people WHERE id=?1').bind('preview-person').first();
   await assert.rejects(()=>call('delivery-address/verify',{address}),/International addresses are managed in admin/);
   assert.deepEqual(await DB.prepare('SELECT * FROM people WHERE id=?1').bind('preview-person').first(),unchanged,'Google checks cannot change recipient contact data');
   const delivery=await (await call('delivery-address'))!.json() as any;assert.equal(delivery.country,country);assert.equal(delivery.previewOnly,true);assert.equal(delivery.verified,false);
   const data=await (await call('journal'))!.json() as any;assert.equal(data.adminPreview,true);assert.equal(data.gift.mode,'preview');assert.equal(data.gift.hasOrder,false);assert.equal(data.keepsake.enabled,true);assert.match(data.keepsake.defaultFrames.moss,/invitation=preview-invite/);
   const status=await (await call('print/status'))!.json() as any;assert.equal(status.previewOnly,true);assert.equal(status.canOrder,true);assert.equal(status.order,null);
   assert.equal((await call('default/'+revision+'/moss'))!.status,200);
   for(const action of ['gift/claim','print/orders','delivery-address/save','delivery-address/confirm','send','verify'])await assert.rejects(()=>call(action,{code:'123456'}),/cannot place orders/);
  }
  assert.deepEqual((await DB.prepare('SELECT id,name,version FROM people').all()).results,before.results.map(({id,name,version}:any)=>({id,name,version})));
  for(const table of ['sessions','print_orders','mug_orders'])assert.equal((await DB.prepare('SELECT count(*) n FROM '+table).first<any>())!.n,0);
  await call('journal',undefined,'recipient=preview-person');assert.equal(resolvedInvitation,'preview-invite','Individual preview resolves the real household invitation');
  await assert.rejects(()=>call('journal',undefined,'recipient=missing'),/Recipient not found/);
  await DB.prepare('UPDATE invites SET allow_mug=0,allow_print=0').run();
  const disabled=await (await call('journal'))!.json() as any;assert.equal(disabled.gift.enabled,false);assert.equal(disabled.keepsake.enabled,false);
 }finally{mock.restoreAll();await mf.dispose();}
});
