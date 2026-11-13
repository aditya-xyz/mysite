import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser preparation helper is plain JavaScript.
import {createPrintPreviews} from '../web/print-previews.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const data=(frame='santa')=>({file:new File(['synthetic artwork'],'proof.jpg',{type:'image/jpeg'}),recipe:{format:'folded',mode:'default',frame,photoIds:[],crops:{},defaultRevision:'synthetic'}});
const pictures=(id:string)=>({id,provider:'handwrytten',frontSrc:'/proof/'+id+'/front',insideSrc:'/proof/'+id+'/inside',backSrc:'/proof/'+id+'/back'});
function mockImages(t:any){
 const original=Object.getOwnPropertyDescriptor(globalThis,'Image'),decoded:string[]=[];
 Object.defineProperty(globalThis,'Image',{configurable:true,value:class{src='';async decode(){decoded.push(this.src);}}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'Image',original);else delete (globalThis as any).Image;});return decoded;
}
test('background preparation waits for the latest stable selection and preloads its proof images',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const decoded=mockImages(t),calls:any[]=[];
 t.mock.method(globalThis,'fetch',async(path:any,init:any)=>{calls.push({path,recipe:JSON.parse(init.body.get('recipe'))});return Response.json({status:'ready',pictures:pictures('latest')});});
 const cache=createPrintPreviews(),first=data(),latest=data('classic');t.after(()=>cache.close());
 cache.schedule(first);t.mock.timers.tick(800);cache.schedule(latest);t.mock.timers.tick(999);assert.equal(calls.length,0);
 t.mock.timers.tick(1);await tick();assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/print/previews');assert.equal(calls[0].recipe.frame,'classic');
 assert.deepEqual(cache.peek(latest),pictures('latest'));assert.equal(cache.peek(first),null);assert.equal(decoded.length,3);
 await cache.load(latest);assert.equal(calls.length,1,'Opening checkout reuses the prepared proof');assert.equal(decoded.length,3,'Ready images are not prepared twice');
});
test('checkout shares in-flight preparation and late results cannot replace a newer selection',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});mockImages(t);const requests:{resolve:(r:Response)=>void;signal:AbortSignal}[]=[];
 t.mock.method(globalThis,'fetch',(_path:any,init:any)=>new Promise<Response>(resolve=>{requests.push({resolve,signal:init.signal});}));
 const cache=createPrintPreviews(),old=data(),current=data('moss');t.after(()=>cache.close());
 cache.schedule(old);t.mock.timers.tick(600);cache.schedule(old);t.mock.timers.tick(400);assert.equal(requests.length,1,'Repeated unchanged renders do not postpone preparation');
 const oldCheckout=cache.load(old);assert.equal(cache.load(old),oldCheckout);assert.equal(requests.length,1,'Opening during preparation shares the request');
 cache.schedule(current);t.mock.timers.tick(1000);assert.equal(requests.length,2);
 requests[1].resolve(Response.json({status:'ready',pictures:pictures('current')}));await tick();
 requests[0].resolve(Response.json({status:'ready',pictures:pictures('old')}));await oldCheckout;
 assert.deepEqual(cache.peek(current),pictures('current'));assert.deepEqual(cache.peek(old),pictures('old'));
});
test('unfinished edits and closing the editor cancel scheduled work and active requests',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});mockImages(t);let calls=0,signal:AbortSignal|undefined;
 t.mock.method(globalThis,'fetch',(_path:any,init:any)=>{calls++;signal=init.signal;return new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
 const cache=createPrintPreviews(),snapshot=data();t.after(()=>cache.close());
 cache.schedule(snapshot);cache.schedule({file:null});t.mock.timers.tick(1000);assert.equal(calls,0,'A crop or border edit cancels the previous debounce');
 cache.schedule(snapshot);cache.close();t.mock.timers.tick(1000);assert.equal(calls,0);
 const pending=cache.load(snapshot);assert.equal(calls,1);cache.close();assert.equal(signal!.aborted,true);await assert.rejects(pending,/aborted/);assert.equal(cache.peek(snapshot),null);
});
test('failed background preparation stays quiet until checkout explicitly retries it',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});mockImages(t);let calls=0;
 t.mock.method(globalThis,'fetch',async()=>++calls===1?Response.json({error:'Temporary preview delay'},{status:503}):Response.json({status:'ready',pictures:pictures('retried')}));
 const cache=createPrintPreviews(),snapshot=data();t.after(()=>cache.close());
 cache.schedule(snapshot);t.mock.timers.tick(1000);await tick();assert.equal(calls,1);assert.equal(cache.peek(snapshot),null);
 cache.schedule(snapshot);t.mock.timers.tick(2000);assert.equal(calls,1,'Re-rendering does not repeatedly retry a failed background request');
 assert.deepEqual(await cache.load(snapshot,{retry:true}),pictures('retried'));assert.equal(calls,2);
});

test('front and inside placement share artwork bytes but never share the wrong proof',async t=>{
 mockImages(t);const calls:string[]=[];
 t.mock.method(globalThis,'fetch',async(_path:any,init:any)=>{const recipe=JSON.parse(init.body.get('recipe'));calls.push(recipe.frontDesign);return Response.json({status:'ready',pictures:pictures(recipe.frontDesign)});});
 const cache=createPrintPreviews(),original=data(),personal={...original,recipe:{...original.recipe,mode:'personal',frontDesign:'personal'}},swapped={...personal,recipe:{...personal.recipe,frontDesign:'default'}};t.after(()=>cache.close());
 assert.deepEqual(await cache.load(personal),pictures('personal'));assert.equal(cache.peek(swapped),null);
 assert.deepEqual(await cache.load(swapped),pictures('default'));assert.deepEqual(cache.peek(personal),pictures('personal'));
 await cache.load(personal);assert.deepEqual(calls,['personal','default'],'Swapping back reuses the original cached proof');
});
