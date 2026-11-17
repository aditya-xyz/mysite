import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Browser presentation helper.
import {slideStep} from '../web/step-motion.js';
test('steps slide forward and back, skip same-step updates and reduced motion, and cancel on close',async()=>{
 const original=(globalThis as any).matchMedia;let reduced=false;const animations:any[]=[],attrs=new Map(),events=new Map();
 (globalThis as any).matchMedia=()=>({matches:reduced});
 const body={animate(frames:any){let finish=()=>{};const a={frames,canceled:false,finished:new Promise<void>(r=>finish=r),cancel(){this.canceled=true;finish();},finish(){finish();}};animations.push(a);return a;}};
 const dialog={open:false,querySelector:()=>body,setAttribute:(k:string,v:string)=>attrs.set(k,v),removeAttribute:(k:string)=>attrs.delete(k),addEventListener:(k:string,v:any)=>events.set(k,v)};
 try{
  slideStep(dialog,'pick',0,'.body');dialog.open=true;slideStep(dialog,'review',1,'.body');assert.equal(attrs.get('data-step-direction'),'forward');assert.match(animations[0].frames[0].transform,/48px/);
  slideStep(dialog,'review',1,'.body');assert.equal(animations.length,1);assert.equal(animations[0].canceled,true);
  slideStep(dialog,'pick',0,'.body');assert.equal(attrs.get('data-step-direction'),'back');assert.match(animations[1].frames[0].transform,/-48px/);
  events.get('close')();assert.equal(animations[1].canceled,true);assert.equal(attrs.size,0);
  reduced=true;slideStep(dialog,'review',1,'.body');assert.equal(animations.length,2);
 }finally{(globalThis as any).matchMedia=original;}
});
