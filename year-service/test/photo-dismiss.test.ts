import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser helper.
import {dismissPhotoToThumbnail} from '../web/photo-dismiss.js';

test('dismissal animates the painted image without allocating a proxy and accounts for a scaled drag',async()=>{
 const saved={document:(globalThis as any).document,innerWidth:(globalThis as any).innerWidth,innerHeight:(globalThis as any).innerHeight};
 let closed=0;const animations:any[]=[];
 (globalThis as any).innerWidth=390;(globalThis as any).innerHeight=700;
 (globalThis as any).document={createElement(){throw Error('Must reuse painted image');}};
 const image={style:{willChange:''},src:'/display',naturalWidth:400,naturalHeight:200,clientWidth:400,getAttribute:()=>'/display',getBoundingClientRect:()=>({left:40,top:100,width:300,height:500}),animate(frames:any,options:any){let finish=()=>{};const a={frames,options,finished:new Promise<void>(r=>finish=r),cancel(){},finish(){finish();}};animations.push(a);return a;}};
 const dialog={classList:{add(){}}};
 try{
  assert.equal(dismissPhotoToThumbnail(dialog,image,{getBoundingClientRect:()=>({left:20,top:40,right:120,bottom:90,width:100,height:50})},()=>closed++),true);
  assert.match(animations[0].frames[1].transform,/scale\(0.333/);assert.match(animations[0].frames[1].transform,/translate3d\(-160px,-380px/);assert.equal(animations[0].frames[1].opacity,1);
  animations[0].finish();await new Promise(r=>setImmediate(r));assert.equal(closed,1);assert.equal(image.style.willChange,'');
  dismissPhotoToThumbnail(dialog,image,{getBoundingClientRect:()=>({left:20,top:900,right:120,bottom:950,width:100,height:50})},()=>closed++);
  assert.equal(animations[1].frames[1].opacity,0);animations[1].finish();await new Promise(r=>setImmediate(r));assert.equal(closed,2);
  assert.equal(dismissPhotoToThumbnail(dialog,{...image,naturalWidth:0},null,()=>{}),false);
 }finally{Object.assign(globalThis,saved);}
});
