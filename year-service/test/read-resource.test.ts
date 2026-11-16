import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Browser-only GET transport.
import {readResource} from '../web/read-resource.js';
test('GET transport retries a transient error once and never retries authentication or quota failures',async()=>{
 let calls=0;assert.deepEqual(await readResource('/image',{fetcher:async()=>++calls===1?new Response('busy',{status:503}):Response.json({ok:true})}),{ok:true});assert.equal(calls,2);
 for(const status of [401,403,404,429]){calls=0;await assert.rejects(()=>readResource('/image',{fetcher:async()=>{calls++;return Response.json({error:'Denied'},{status});}}),(e:any)=>e.status===status);assert.equal(calls,1);}
});
test('a stalled response body times out, releases its request and retries once',async()=>{
 let calls=0,signal:AbortSignal;const result=await readResource('/image',{timeoutMs:5,fetcher:async(_url:string,options:any)=>{calls++;signal=options.signal;return Response.json({ok:true});},read:async(response:Response)=>calls===1?new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})):response.json()});assert.deepEqual(result,{ok:true});assert.equal(calls,2);
});
test('closing an image/editor cancels a stalled read without retrying',async()=>{
 const controller=new AbortController();let calls=0;const work=readResource('/image',{signal:controller.signal,fetcher:async(_url:string,{signal}:any)=>{calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});controller.abort();await assert.rejects(()=>work,(e:any)=>e.name==='AbortError');assert.equal(calls,1);
});
