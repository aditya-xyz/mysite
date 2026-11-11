import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
// @ts-expect-error Browser JavaScript module.
import {swipeStep,dismissDrag} from '../web/photo-navigation.js';
// Exercise the viewer's actual pointer wiring without a browser-only test dependency.
const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const wiring=app.slice(app.indexOf('let swipeStart=null;'),app.indexOf('const wheelStep='));
function viewer(){
 const handlers=new Map<string,(event:any)=>void>(),steps:number[]=[],animations:unknown[]=[];let closed=0;
 const photoStage={style:{transform:'',opacity:''},getAnimations:()=>[],animate:(frames:unknown)=>animations.push(frames),setPointerCapture:()=>{},addEventListener:(name:string,handler:(event:any)=>void)=>handlers.set(name,handler)};
 const viewport={scale:1,addEventListener:()=>{}};
 runInNewContext(wiring,{photoStage,dialog:{classList:{toggle:()=>{}}},window:{visualViewport:viewport},matchMedia:()=>({matches:false}),swipeStep,dismissDrag,movePhoto:(step:number)=>steps.push(step),closePhoto:()=>closed++});
 const pointer=(type:string,x:number,y:number,id=1,pointerType='touch')=>handlers.get(type)!({clientX:x,clientY:y,pointerId:id,pointerType,button:0,target:{closest:(selector:string)=>selector==='.photo-image'?{}:null}});
 return {pointer,photoStage,steps,animations,viewport,closed:()=>closed};
}
test('mobile drag dismisses downward, snaps back on short drags, and keeps horizontal navigation separate',()=>{
 const down=viewer();down.pointer('pointerdown',100,100);down.pointer('pointermove',110,240);assert.ok(down.photoStage.style.transform.includes('140px'));down.pointer('pointerup',110,240);assert.equal(down.closed(),1);assert.deepEqual(down.steps,[]);
 const short=viewer();short.pointer('pointerdown',100,100);short.pointer('pointermove',100,150);short.pointer('pointerup',100,150);assert.equal(short.closed(),0);assert.equal(short.photoStage.style.transform,'');assert.equal(short.animations.length,1);
 const horizontal=viewer();horizontal.pointer('pointerdown',200,100);horizontal.pointer('pointermove',100,105);horizontal.pointer('pointerup',100,105);assert.deepEqual(horizontal.steps,[1]);assert.equal(horizontal.closed(),0);
});
test('pinch, canceled pointers, zoomed pages, and mouse drags do not dismiss the viewer',()=>{
 const pinch=viewer();pinch.pointer('pointerdown',100,100);pinch.pointer('pointermove',100,150);pinch.pointer('pointerdown',200,100,2);assert.equal(pinch.photoStage.style.transform,'');pinch.pointer('pointerup',100,250);assert.equal(pinch.closed(),0);
 const canceled=viewer();canceled.pointer('pointerdown',100,100);canceled.pointer('pointermove',100,250);canceled.pointer('pointercancel',100,250);canceled.pointer('pointerup',100,250);assert.equal(canceled.closed(),0);assert.equal(canceled.photoStage.style.transform,'');
 for(const mouse of [false,true]){const v=viewer();if(!mouse)v.viewport.scale=2;const type=mouse?'mouse':'touch';v.pointer('pointerdown',100,100,1,type);v.pointer('pointermove',100,250,1,type);v.pointer('pointerup',100,250,1,type);assert.equal(v.closed(),0);}
});
