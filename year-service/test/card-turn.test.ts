import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser presentation helper.
import {turnCardView} from '../web/card-turn.js';

test('card views fold, preserve note pixels and safely replace an interrupted turn',async()=>{
 const saved=(globalThis as any).matchMedia;let reduced=false,copies=0;
 (globalThis as any).matchMedia=()=>({matches:reduced});
 const animations:any[]=[],ghosts:any[]=[];
 const animate=(frames:any[],options:any)=>{let finish:()=>void=()=>{};const a={frames,options,finished:new Promise<void>(r=>finish=r),cancel(){finish();},finish(){finish();}};animations.push(a);return a;};
 const panel=(name:string,hidden:boolean):any=>{
  const leaves=[{style:{},animate},{style:{},animate}],canvases=name==='inside'?[{width:100,height:120,getContext:()=>({drawImage(){copies++;}})}]:[];
  return {dataset:{cardPanel:name},hidden,style:{},animate,inert:false,removed:false,
   getBoundingClientRect:()=>({left:name==='inside'?0:50,top:40,width:name==='inside'?200:100,height:130}),
   cloneNode:()=>panel(name,false),setAttribute(){},remove(){this.removed=true;},
   querySelectorAll:(selector:string)=>selector==='canvas'?canvases:selector==='.fc-page'?leaves:[]};
 };
 const panels=[panel('front',false),panel('inside',true),panel('back',true)];
 const root={querySelectorAll:()=>panels,getBoundingClientRect:()=>({left:0,top:0}),append:(ghost:any)=>ghosts.push(ghost)};
 try{
  turnCardView(root,'inside');assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);assert.equal(ghosts.length,1);
  assert.ok(animations.some(a=>a.frames.some((f:any)=>f.transform?.includes('150deg'))),'The cover hinges open instead of simply fading');
  turnCardView(root,'back');assert.equal(ghosts[0].removed,true,'A rapid second choice cancels the prior overlay');
  assert.equal(panels[2].hidden,false);assert.equal(panels[1].hidden,true);assert.equal(copies,1,'The note canvas is copied into the outgoing spread');
  animations.forEach(a=>a.finish());await new Promise(r=>setImmediate(r));
  assert.equal(ghosts[1].removed,true);assert.equal(ghosts[1].querySelectorAll('canvas')[0].width,0);
  const count=animations.length;reduced=true;turnCardView(root,'front');
  assert.equal(panels[0].hidden,false);assert.equal(animations.length,count,'Reduced motion changes the visible view immediately');
  turnCardView(root,'front');assert.equal(ghosts.length,2,'Choosing the current view adds no animation');
 }finally{(globalThis as any).matchMedia=saved;}
});
