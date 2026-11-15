import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {reserveSmsSend,smsLimits,SmsBudgetError} from '../src/sms-budget.ts';

test('global SMS reservations enforce daily and monthly limits atomically with UTC resets',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-06',d1Databases:['DB']}));
 try{
  const db=await mf.getD1Database('DB');
  await db.exec((await readFile('migrations/0031_sms_send_usage.sql','utf8')).replace(/\n/g,' '));
  const env={DB:db as unknown as D1Database,SMS_DAILY_LIMIT:'2',SMS_MONTHLY_LIMIT:'5'};
  const at=(day:string)=>Date.parse(day+'T23:59:30Z');
  const race=async(day:string)=>Promise.allSettled(Array.from({length:20},()=>reserveSmsSend(env,at(day))));
  const count=async()=>Number((await db.prepare('SELECT coalesce(sum(attempts),0) n FROM sms_send_usage').first<{n:number}>())!.n);
  await t.test('concurrent requests share the daily allowance',async()=>{
   const results=await race('2026-11-28');
   assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
   for(const result of results)if(result.status==='rejected'){
    assert.ok(result.reason instanceof SmsBudgetError);assert.equal(result.reason.status,429);assert.equal(result.reason.retryAfter,30);
   }
   assert.equal(await count(),2);
  });
  await t.test('a new UTC day gets its own allowance while retaining monthly usage',async()=>{
   assert.equal((await race('2026-11-29')).filter(r=>r.status==='fulfilled').length,2);assert.equal(await count(),4);
   await assert.rejects(reserveSmsSend(env,at('2026-11-29')),e=>e instanceof SmsBudgetError&&e.retryAfter===30);
   // A third day in the same month has one monthly slot left.
   const results=await race('2026-11-30');assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   assert.equal(await count(),5);
   await assert.rejects(reserveSmsSend(env,at('2026-11-30')),e=>e instanceof SmsBudgetError&&e.retryAfter===30);
   await assert.rejects(reserveSmsSend(env,at('2026-11-29')),e=>e instanceof SmsBudgetError&&e.retryAfter===86430);
  });
  await t.test('a new month and year reset usage without erasing history',async()=>{
   await reserveSmsSend(env,at('2026-12-01'));await reserveSmsSend(env,at('2027-01-01'));
   assert.equal(await count(),7);
  });
  await t.test('zero disables sending and invalid configuration fails closed without reserving',async()=>{
   const before=await count();
   for(const key of ['SMS_DAILY_LIMIT','SMS_MONTHLY_LIMIT'] as const){
    await assert.rejects(reserveSmsSend({...env,[key]:'0'},at('2027-02-01')),e=>e instanceof SmsBudgetError&&e.status===429);
    for(const invalid of ['','-1','1.5','NaN','Infinity','1000001'])
     await assert.rejects(reserveSmsSend({...env,[key]:invalid},at('2027-02-01')),e=>e instanceof SmsBudgetError&&e.status===503);
   }
   assert.equal(await count(),before);assert.deepEqual(smsLimits({DB:env.DB}),{daily:50,monthly:500});
  });
 }finally{await mf.dispose();}
});
