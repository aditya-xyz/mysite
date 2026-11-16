import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {translationsRoute} from '../admin/src/translations.ts';
import {translationPayload,localizeJournal,translationSources,language,type TranslationEntries} from '../src/translations.ts';
import {clientEdition,type Draft,type Published} from '../src/edition.ts';
// @ts-expect-error Shared UI translator.
import {translateText} from '../web/localization.js';

test('reviewed invitation languages preserve English, privacy and existing data',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-06',d1Databases:['DB']}));
 try{
 const db=await mf.getD1Database('DB');
 const files=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>!f.startsWith('0036'))){const sql=await readFile('migrations/'+file,'utf8');if(sql.includes('--> statement-breakpoint'))await db.batch(sql.split('--> statement-breakpoint').map(s=>db.prepare(s)));else await db.exec(sql.replace(/^--.*$/gm,'').replace(/\n/g,' '));}
 await db.prepare("INSERT INTO people(id,name,mailing_address) VALUES('existing','Existing person','saved address')").run();
 await db.prepare("INSERT INTO invites(id,person_id,token_hash,name,phone,expires_at,edition_year) VALUES('existing','existing','untouched-token','Existing person','+15555550100',9999999999,2026)").run();
 const before=await db.prepare("SELECT * FROM invites WHERE id='existing'").first<any>();
 await db.exec((await readFile('migrations/0036_invitation_languages.sql','utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
 const after=await db.prepare("SELECT * FROM invites WHERE id='existing'").first<any>();
 assert.equal(after.language,'en');delete after.language;assert.deepEqual(after,before);
 assert.equal((await db.prepare("SELECT mailing_address FROM people WHERE id='existing'").first<any>()).mailing_address,'saved address');
 const draft:Draft={title:'Pixelbook',authors:'Aditya & Angela',intro:'Welcome',note:'An English note',sharedTitle:'Our year',stories:[{id:'story-one',title:'A trip',body:'We took a walk.'}],photos:[{id:'one',caption:'Good dog.',alt:'A dog',recipients:[]},{id:'private',caption:'A private joke',alt:'Private photo',recipients:['other']}],printNote:'English card note',defaultPrintNote:'English default note',mugDesigns:[]};
 for(const id of ['one','private'])await db.prepare("INSERT INTO media_objects(id,year,preview_key,filename,mime,bytes) VALUES(?1,2026,?2,?2,'image/jpeg',10)").bind(id,id+'.jpg').run();
 await db.prepare('UPDATE editions SET draft_json=?1,draft_version=10 WHERE year=2026').bind(JSON.stringify(draft)).run();
 const request=(method='GET')=>new Request('https://admin.test/api/editions/2026/translations/mr',{method});
 const call=async(path:string,data?:any)=>{const r=await translationsRoute(request(data?'POST':'GET'),{DB:db},'/api/translations/'+path,2026,'owner@example.com',async()=>data);return r!.json() as Promise<any>;};
 let current:any;
 await t.test('drafts are invisible to guests, visible in admin preview, and incomplete review cannot publish',async()=>{
  current=await call('mr');assert.equal(current.version,0);
  const entries:TranslationEntries={...current.entries,note:{source:draft.note,value:'मराठी मजकूर'}};
  await call('mr',{version:0,sourceVersion:10,entries});
  assert.deepEqual((await translationPayload(db,2026,'mr')).translations,{});
  assert.equal((await translationPayload(db,2026,'mr',true)).translations.note.value,'मराठी मजकूर');
  current=await call('mr');await assert.rejects(()=>call('mr/publish',{version:current.version,sourceVersion:10,reviewed:true}),/Complete and review/);
  await assert.rejects(()=>call('mr',{version:0,sourceVersion:10,entries}),/changed/);
 });
 await t.test('placeholder validation and complete explicit approval',async()=>{
  const entries:TranslationEntries={...current.entries};for(const s of current.sources)if(!entries[s.key])entries[s.key]={source:s.source,value:'भाषांतर '+s.source};
  const key='ui:hi {name}!';entries[key]={source:'hi {name}!',value:'नमस्कार'};
  await assert.rejects(()=>call('mr',{version:current.version,sourceVersion:10,entries}),/placeholder/);
  entries[key].value='नमस्कार {name}!';
  await call('mr',{version:current.version,sourceVersion:10,entries});current=await call('mr');
  await assert.rejects(()=>call('mr/publish',{version:current.version,sourceVersion:10,reviewed:false}),/confirm you reviewed/);
  await call('mr/publish',{version:current.version,sourceVersion:10,reviewed:true});
  const payload=await translationPayload(db,2026,'mr');assert.equal(payload.translations.note.value,'मराठी मजकूर');
  const published={...draft,photos:draft.photos.map(p=>({...p,preview_key:'private.jpg',original_key:null,filename:'private.jpg',mime:'image/jpeg'}))} as Published;
  const original=JSON.stringify(published),client=localizeJournal(clientEdition(published,'existing','Existing person',2026,'existing'),payload);
  assert.equal(client.note,'मराठी मजकूर');assert.equal(client.photos.length,1);assert.equal(client.photos[0].caption,'भाषांतर Good dog.');
  assert.ok(!JSON.stringify(client).includes('A private joke'));assert.ok(!('translations' in client));assert.equal(JSON.stringify(published),original);assert.equal(published.printNote,'English card note');
  assert.deepEqual((await translationPayload(db,2026,'en')).translations,{});assert.equal(language('zh-CN'),'en');assert.equal(language('zh-TW'),'zh-TW');
 });
 await t.test('inline zinger saves merge only selected captions and preserve notes, controls and published text',async()=>{
  const fresh=await call('mr'),publishedBefore=JSON.stringify((await translationPayload(db,2026,'mr')).translations);
  const key='photo:one:caption';
  await call('mr',{patch:true,version:fresh.version,sourceVersion:10,entries:{[key]:{source:'Good dog.',value:'नवा विनोद'}}});
  const saved=await call('mr');assert.equal(saved.entries[key].value,'नवा विनोद');
  assert.deepEqual(saved.entries.note,fresh.entries.note);assert.deepEqual(saved.entries['photo:one:alt'],fresh.entries['photo:one:alt']);assert.deepEqual(saved.entries['ui:Continue'],fresh.entries['ui:Continue']);
  assert.equal(JSON.stringify((await translationPayload(db,2026,'mr')).translations),publishedBefore);
  await assert.rejects(()=>call('mr',{patch:true,version:fresh.version,sourceVersion:10,entries:{[key]:{source:'Good dog.',value:'Stale edit'}}}),/changed/);
  await assert.rejects(()=>call('mr',{patch:true,version:saved.version,sourceVersion:10,entries:{'ui:Continue':{source:'Continue',value:'Not inline content'}}}),/only update story text and photo zingers/);
  await assert.rejects(()=>call('mr',{patch:true,version:saved.version,sourceVersion:10,entries:{[key]:{source:'Wrong English',value:'Wrong source'}}}),/English source/);
 });
 await t.test('inline story drafts save both scripts without changing zingers, printed notes or approval',async()=>{
  for(const [locale,value] of [['mr','आपल्या गोष्टी'],['zh-TW','我們的故事']]){
   const fresh=await call(locale),before=await translationPayload(db,2026,locale);
   const entries={note:{source:draft.note,value},intro:{source:draft.intro,value},sharedTitle:{source:draft.sharedTitle,value},'story:story-one:title':{source:'A trip',value},'story:story-one:body':{source:'We took a walk.',value}};
   await call(locale,{patch:true,version:fresh.version,sourceVersion:10,entries});
   const saved=await call(locale);for(const key of Object.keys(entries))assert.equal(saved.entries[key].value,value);
   assert.deepEqual(saved.entries['photo:one:caption'],fresh.entries['photo:one:caption']);
   assert.deepEqual((await translationPayload(db,2026,locale)).translations,before.translations);
   assert.equal(JSON.parse((await db.prepare('SELECT draft_json FROM editions WHERE year=2026').first<any>()).draft_json).printNote,'English card note');
   await assert.rejects(()=>call(locale,{patch:true,version:saved.version,sourceVersion:10,entries:{printNote:{source:'English card note',value}}}),/only update story text/);
  }
 });
 await t.test('English edits invalidate only matching passages; drafts never implicitly republish',async()=>{
  const payload=await translationPayload(db,2026,'mr');const j=localizeJournal({note:'Changed English note',photos:[],stories:[]},payload);assert.equal(j.note,'Changed English note');
  const fresh=await call('mr');await db.prepare('UPDATE editions SET draft_version=11 WHERE year=2026').run();
  await assert.rejects(()=>call('mr/publish',{version:fresh.version,sourceVersion:10,reviewed:true}),/changed/);
  assert.equal((await db.prepare("SELECT token_hash FROM invites WHERE id='existing'").first<any>()).token_hash,'untouched-token');
  assert.ok(!translationSources(draft).some(s=>s.source==='English card note'));
 });
 }finally{await mf.dispose();}
});
test('reviewed UI templates substitute names and numbers without executing markup',()=>{
 assert.equal(translateText('Resend available in 21 seconds',{'Resend available in {seconds} seconds':'{seconds} 秒後可重新傳送'}),'21 秒後可重新傳送');
 assert.equal(translateText('hi <script>!',{'hi {name}!':'嗨，{name}！'}),'嗨，<script>！');
 assert.equal(translateText('Unknown English',{}),'Unknown English');
});
