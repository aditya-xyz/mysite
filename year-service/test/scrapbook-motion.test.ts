import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
// @ts-expect-error Browser helpers are intentionally plain JavaScript.
import {mountScrapbookMotion} from '../web/scrapbook-motion.js';

function fixture(t:TestContext,{reduced=false,observerAvailable=true,canAnimate=true}={}){
 const globals=globalThis as unknown as Record<string,unknown>;
 const saved=new Map(['window','document','matchMedia','IntersectionObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const restore=()=>{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globals[key];}};
 const observers:{callback:Function;options:unknown;observed:Set<unknown>}[]=[],listeners=new Map<string,Function>();
 let preferenceChanged:Function=()=>{};
 const media={matches:reduced,addEventListener:(_type:string,fn:Function)=>{preferenceChanged=fn;},removeEventListener:()=>{}};
 function gift(kind:string){
  const classes=new Set([kind]),calls:{frames:any[];options:any;finish:()=>void;cancel:()=>void}[]=[];
  const child={};
  const node={
   child,calls,classList:{add:(name:string)=>classes.add(name),remove:(name:string)=>classes.delete(name),contains:(name:string)=>classes.has(name)},
   contains:(target:unknown)=>target===node||target===child,
   animate:canAnimate?(frames:any[],options:any)=>{
    let finish!:()=>void,reject!:(error:Error)=>void;
    const finished=new Promise<void>((resolve,no)=>{finish=resolve;reject=no;});
    const cancel=()=>reject(new Error('Animation canceled'));
    calls.push({frames,options,finish,cancel});return {finished,cancel};
   }:undefined
  };
  return node;
 }
 const keepsake=gift('ks-entry'),mug=gift('pb-gift');
 class Observer {
  entry:{callback:Function;options:unknown;observed:Set<unknown>};
  constructor(callback:Function,options:unknown){this.entry={callback,options,observed:new Set()};observers.push(this.entry);}
  observe(node:unknown){this.entry.observed.add(node);}unobserve(node:unknown){this.entry.observed.delete(node);}disconnect(){this.entry.observed.clear();}
 }
 globals.window={innerWidth:390,...(observerAvailable?{IntersectionObserver:Observer}:{}),addEventListener:()=>{},removeEventListener:()=>{}};
 globals.IntersectionObserver=Observer;
 globals.document={hidden:false,addEventListener:()=>{},removeEventListener:()=>{}};
 globals.matchMedia=()=>media;
 const root={querySelectorAll:(selector:string)=>selector==='.ks-entry,.pb-gift'?[keepsake,mug]:[],querySelector:()=>null,
  addEventListener:(type:string,fn:Function)=>listeners.set(type,fn),removeEventListener:(type:string)=>listeners.delete(type)};
 const motion=mountScrapbookMotion(root);t.after(()=>{motion.destroy();restore();});
 const enter=(node:unknown,ratio=.5)=>observers[1].callback([{target:node,isIntersecting:true,intersectionRatio:ratio}]);
 return {keepsake,mug,observers,listeners,motion,enter,reduce(){media.matches=true;preferenceChanged();}};
}

test('both gifts stay hidden until entering and never expose the resting card during their entrance',async t=>{
 const f=fixture(t);
 for(const gift of [f.keepsake,f.mug])assert(gift.classList.contains('pb-gift-awaiting'));
 f.enter(f.keepsake,.08);assert.equal(f.keepsake.calls.length,0);
 for(const gift of [f.keepsake,f.mug]){
  f.enter(gift);assert.equal(gift.calls.length,1);assert(gift.classList.contains('pb-gift-awaiting'));
  assert.equal(gift.calls[0].frames[0].opacity,0);assert.equal(gift.calls[0].options.fill,'both');
  gift.calls[0].finish();await setImmediate();assert(!gift.classList.contains('pb-gift-awaiting'));
  f.enter(gift);assert.equal(gift.calls.length,1,'Scrolling back does not replay the entrance');
 }
});

test('keyboard focus reveals a waiting gift immediately',t=>{
 const f=fixture(t);f.listeners.get('focusin')!({target:f.keepsake.child});
 assert(!f.keepsake.classList.contains('pb-gift-awaiting'));assert.equal(f.keepsake.calls.length,0);
 f.enter(f.keepsake);assert.equal(f.keepsake.calls.length,0);
});

test('keyboard focus during an entrance cancels the movement and exposes the control',async t=>{
 const f=fixture(t);f.enter(f.mug);f.listeners.get('focusin')!({target:f.mug.child});await setImmediate();
 assert(!f.mug.classList.contains('pb-gift-awaiting'));assert.equal(f.mug.calls.length,1);
});

test('reduced motion or missing browser capabilities leave both gifts visible',async t=>{
 for(const options of [{reduced:true},{observerAvailable:false},{canAnimate:false}]){
  await t.test(JSON.stringify(options),child=>{const f=fixture(child,options);for(const gift of [f.keepsake,f.mug])assert(!gift.classList.contains('pb-gift-awaiting'));});
 }
});

test('preference changes and teardown clear hidden state even during an active entrance',async t=>{
 const f=fixture(t);f.enter(f.keepsake);f.reduce();await setImmediate();
 for(const gift of [f.keepsake,f.mug])assert(!gift.classList.contains('pb-gift-awaiting'));
 f.motion.destroy();assert(!f.listeners.has('focusin'));assert(f.observers.every(o=>o.observed.size===0));
});
