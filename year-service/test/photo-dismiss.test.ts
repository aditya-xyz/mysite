import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser helper.
import {dismissPhotoToThumbnail} from '../web/photo-dismiss.js';

test('dismissal returns the actual contained photo to a visible thumbnail and falls back for offscreen targets',async()=>{
 const saved={document:(globalThis as any).document,innerWidth:(globalThis as any).innerWidth,innerHeight:(globalThis as any).innerHeight};
 const proxies:any[]=[];let closed=0;
 (globalThis as any).innerWidth=390;(globalThis as any).innerHeight=700;
 (globalThis as any).document={createElement:()=>{let finish=()=>{};const p:any={style:{},setAttribute(){},remove(){this.removed=true;},animate(frames:any,options:any){this.frames=frames;this.options=options;return {finished:new Promise<void>(r=>finish=r)};},finish(){finish();}};proxies.push(p);return p;}};
 const image={src:'/display',naturalWidth:400,naturalHeight:200,getAttribute:()=>'/display',animate(){},getBoundingClientRect:()=>({left:40,top:100,width:300,height:500})};
 const dialog={append(){},classList:{add(){}}};
 try{
  assert.equal(dismissPhotoToThumbnail(dialog,image,{getBoundingClientRect:()=>({left:20,top:40,right:120,bottom:90,width:100,height:50})},()=>closed++),true);
  assert.equal(proxies[0].style.top,'275px');assert.equal(proxies[0].style.height,'150px');assert.match(proxies[0].frames[1].transform,/scale\(0.333/);assert.equal(proxies[0].frames[1].opacity,1);
  proxies[0].finish();await new Promise(r=>setImmediate(r));assert.equal(closed,1);assert.equal(proxies[0].removed,true);
  dismissPhotoToThumbnail(dialog,image,{getBoundingClientRect:()=>({left:20,top:900,right:120,bottom:950,width:100,height:50})},()=>closed++);
  assert.equal(proxies[1].frames[1].opacity,0);proxies[1].finish();await new Promise(r=>setImmediate(r));assert.equal(closed,2);
  assert.equal(dismissPhotoToThumbnail(dialog, {...image,naturalWidth:0},null,()=>{}),false);
 }finally{Object.assign(globalThis,saved);}
});
