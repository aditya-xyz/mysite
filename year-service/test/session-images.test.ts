import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Browser-only display cache.
import {createSessionImages} from '../web/session-images.js';
function fixture(options:any={}){let calls=0,created=0;const revoked:string[]=[];let time=1000;const cache=createSessionImages({now:()=>time,fetchBlob:async()=>{calls++;return new Blob(['photo']);},createURL:()=>`blob:${++created}`,revokeURL:(url:string)=>revoked.push(url),...options});cache.configure('invite-v1',['/grid','/viewer','/mug','/original'],100);return {cache,revoked,calls:()=>calls,time:(value:number)=>time=value};}
test('reopening display images reuses bytes and object URLs, concurrent reads share one fetch',async()=>{const f=fixture();const urls=await Promise.all([f.cache.url('/grid'),f.cache.url('/grid')]);assert.deepEqual(urls,['blob:1','blob:1']);assert.equal(await f.cache.url('/grid'),'blob:1');assert.equal((await f.cache.blob('/grid')).size,5);assert.equal(f.calls(),1);assert.equal(await f.cache.url('/original'),'/original');assert.equal(await f.cache.url('/unapproved'),'/unapproved');await f.cache.blob('/original');assert.equal(f.calls(),2);assert.equal(f.cache.stats().entries,1);});
test('invitation/publication changes and session expiry revoke private URLs',async()=>{const f=fixture();await f.cache.url('/grid');f.cache.configure('invite-v2',['/grid'],100);assert.deepEqual(f.revoked,['blob:1']);await f.cache.url('/grid');f.time(100000);assert.equal(await f.cache.url('/grid'),'/grid');assert.deepEqual(f.revoked,['blob:1','blob:2']);assert.equal(f.cache.stats().entries,0);});
test('removed allowed media clears existing display bytes',async()=>{const f=fixture();await f.cache.url('/grid');f.cache.configure('invite-v1',['/mug'],100);assert.equal(f.cache.stats().entries,0);assert.deepEqual(f.revoked,['blob:1']);});
test('failures can retry and authentication failures clear all display images',async()=>{let fail=false;const f=fixture({fetchBlob:async()=>{if(fail)throw Object.assign(new Error('Denied'),{status:403});return new Blob(['photo']);}});await f.cache.url('/grid');fail=true;await assert.rejects(f.cache.url('/mug'));assert.equal(f.cache.stats().entries,0);assert.deepEqual(f.revoked,['blob:1']);fail=false;f.cache.configure('new-session',['/mug'],100);assert.match(await f.cache.url('/mug'),/^blob:/);});
test('one closed viewer does not cancel another waiter; closing all aborts shared read',async()=>{let resolve:any,aborted=false;const f=fixture({fetchBlob:(_src:string,{signal}:any)=>new Promise((res,rej)=>{resolve=res;signal.addEventListener('abort',()=>{aborted=true;rej(signal.reason);});})});const a=new AbortController(),b=new AbortController();const first=f.cache.url('/grid',{signal:a.signal}),second=f.cache.url('/grid',{signal:b.signal});a.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(aborted,false);resolve(new Blob(['ok']));assert.equal(await second,'blob:1');const third=f.cache.url('/viewer',{signal:b.signal});b.abort();await assert.rejects(third,{name:'AbortError'});assert.equal(aborted,true);});
test('late reads cannot populate a different invitation and least recently used entries are evicted',async()=>{let resolve:any;const f=fixture({fetchBlob:()=>new Promise(res=>resolve=res)});const pending=f.cache.url('/grid');f.cache.clear();resolve(new Blob(['old']));await assert.rejects(pending,{name:'AbortError'});assert.equal(f.cache.stats().entries,0);const small=fixture({maxEntries:1});await small.cache.url('/grid');await small.cache.url('/mug');assert.equal(small.cache.stats().entries,1);assert.deepEqual(small.revoked,['blob:1']);});


test('eager binding starts the offscreen mug once and leaves unrelated images lazy',async t=>{
 const seen=new Set();
 let intersect!: (items: {target:unknown;isIntersecting:boolean}[])=>void;
 const original=Object.getOwnPropertyDescriptor(globalThis,'IntersectionObserver');
 class Observer {
  constructor(callback:typeof intersect){intersect=callback;}
  observe(image:unknown){seen.add(image);}
  unobserve(image:unknown){seen.delete(image);}
  disconnect(){seen.clear();}
 }
 Object.defineProperty(globalThis,'IntersectionObserver',{configurable:true,value:Observer});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'IntersectionObserver',original);else Reflect.deleteProperty(globalThis,'IntersectionObserver');});
 const image=(source:string)=>({loading:'lazy',isConnected:true,dataset:{sessionSrc:source},src:''});
 const mug=image('/mug'),gallery=image('/grid');
 const root=(...images:ReturnType<typeof image>[])=>({querySelectorAll:()=>images.filter(image=>image.dataset.sessionSrc)});
 const f=fixture();
 f.cache.bind(root(mug,gallery));assert.equal(f.calls(),0);
 f.cache.bind(root(mug),{eager:true});assert.equal(mug.loading,'eager');
 assert.deepEqual([...seen],[gallery]);
 intersect([{target:mug,isIntersecting:true}]);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.calls(),1);assert.equal(mug.src,'blob:1');assert.equal(gallery.src,'');
});
