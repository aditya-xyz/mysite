import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser display-only helper.
import {beginPreviewTransition} from '../web/preview-transition.js';

test('border changes preserve old pixels until ready and release their display snapshot',async()=>{
 const previous={document:(globalThis as any).document,matchMedia:(globalThis as any).matchMedia,devicePixelRatio:(globalThis as any).devicePixelRatio};
 let reduced=false,draws=0,animations=0,resolve:()=>void=()=>{};
 const overlays:any[]=[];
 const parent={getBoundingClientRect:()=>({left:10,top:20}),append:(node:any)=>overlays.push(node)};
 const source={isConnected:true,tagName:'CANVAS',parentElement:parent,getBoundingClientRect:()=>({left:15,top:25,width:300,height:400})};
 (globalThis as any).matchMedia=()=>({matches:reduced});(globalThis as any).devicePixelRatio=2;
 (globalThis as any).document={createElement:()=>({style:{},width:0,height:0,isConnected:true,setAttribute(){},getContext:()=>({drawImage(value:any){assert.equal(value,source);draws++;}}),remove(){this.isConnected=false;},animate(){animations++;return {finished:new Promise<void>(r=>resolve=r),cancel(){resolve();}};}})};
 try{
  const transition=beginPreviewTransition(source);assert.equal(draws,1);assert.equal(animations,0,'Loading the next border keeps the old picture in place');
  const overlay=overlays[0];assert.equal(overlay.width,600);assert.equal(overlay.height,800);assert.equal(overlay.style.left,'5px');
  transition.finish();transition.finish();assert.equal(animations,1);resolve();await new Promise(r=>setImmediate(r));
  assert.equal(overlay.isConnected,false);assert.equal(overlay.width,0);assert.equal(overlay.height,0);
  const canceled=beginPreviewTransition(source);canceled.cancel();assert.equal(overlays[1].isConnected,false);
  reduced=true;assert.equal(beginPreviewTransition(source),null);assert.equal(draws,2,'Reduced motion needs no snapshot allocation');
 }finally{Object.assign(globalThis,previous);}
});
