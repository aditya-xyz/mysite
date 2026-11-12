import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('immediate print migration preserves saved intent, pending revocations and address binding',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-08-06',script:'export default {fetch(){return new Response("test")}}',d1Databases:{DB:'migration-print'}}));
 try{
  const db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE invites(id TEXT PRIMARY KEY,edition_year INTEGER); CREATE TABLE editions(year INTEGER PRIMARY KEY,draft_json TEXT,published_json TEXT);');
  for(const [year,draft,published] of [[2026,{printInvitations:['pending-on'],printAddressKeys:{'pending-on':'new-key'}},{printInvitations:['pending-off'],printAddressKeys:{'pending-off':'old-key'}}],[2027,{}, {printInvitations:['legacy'],printAddressKeys:{legacy:'legacy-key'}}]] as const)await db.prepare('INSERT INTO editions VALUES(?1,?2,?3)').bind(year,JSON.stringify(draft),JSON.stringify(published)).run();
  for(const [id,year]of [['pending-on',2026],['pending-off',2026],['legacy',2027]] as const)await db.prepare('INSERT INTO invites VALUES(?1,?2)').bind(id,year).run();
  await db.batch((await readFile('migrations/0017_immediate_print_permissions.sql','utf8')).split('--> statement-breakpoint').map(sql=>db.prepare(sql)));
  assert.deepEqual((await db.prepare('SELECT id,allow_print,print_address_key FROM invites ORDER BY id').all()).results,[{id:'legacy',allow_print:1,print_address_key:'legacy-key'},{id:'pending-off',allow_print:0,print_address_key:null},{id:'pending-on',allow_print:1,print_address_key:'new-key'}]);
 }finally{await mf.dispose();}
});
