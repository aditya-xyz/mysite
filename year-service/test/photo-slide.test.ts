import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Display-only browser helper.
import {createPhotoSlide} from '../web/photo-slide.js';

test('decoded photos slide in the navigation direction and release old display pixels',async()=>{
 const saved={document:(globalThis as any).document,matchMedia:(globalThis as any).matchMedia,devicePixelRatio:(globalThis as any).devicePixelRatio};
 let reduced=false,draws=0;const animations:any[]=[],created:any[]=[];
 const make=(tag:string):any=>({tag,style:{visibility:'visible'},children:[] as any[],width:0,height:0,naturalWidth:300,
  append(...nodes:any[]){nodes.forEach(node=>{node.parent=this;this.children.push(node);});},
  replaceWith(next:any){next.parent=this.parent;this.parent.children[this.parent.children.indexOf(this)]=next;},
  remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter((n:any)=>n!==this);},
  setAttribute(){},getBoundingClientRect:()=>({width:300,height:200}),getContext:()=>({drawImage(){draws++;}}),
  animate(frames:any,options:any){let finish=()=>{};const a={frames,options,finished:new Promise<void>(r=>finish=r),cancel(){finish();},finish(){finish();}};animations.push(a);return a;}
 });
 (globalThis as any).document={createElement:(tag:string)=>{const node=make(tag);created.push(node);return node;}};
 (globalThis as any).matchMedia=()=>({matches:reduced});(globalThis as any).devicePixelRatio=2;
 const frame={getBoundingClientRect:()=>({width:300}),children:[] as any[],style:{setProperty(){} }},image=make('img');image.parent=frame;frame.children.push(image);
 try{
  const slides=createPhotoSlide(frame,image);slides.reveal('/first',300,200,0);assert.equal(draws,0);
  slides.reveal('/second',300,200,1);assert.equal(image.src,'/second');assert.equal(draws,1);
  assert.equal(animations[0].frames[0].transform,'translateX(100%)');assert.equal(animations[1].frames[1].transform,'translateX(-100%)');
  const old=created.find(n=>n.tag==='canvas');animations.forEach(a=>a.finish());await new Promise(r=>setImmediate(r));
  assert.equal(old.removed,true);assert.equal(old.width,0);
  slides.reveal('/previous',300,200,-1);assert.equal(animations[2].frames[0].transform,'translateX(-100%)');
  slides.cancel();assert.equal(created.filter(n=>n.tag==='canvas').at(-1).removed,true);
  slides.drag(-80);assert.equal(image.style.transform,'translateX(-80px)');
  slides.cancel(true);slides.reveal('/drag-next',300,200,1);
  assert.equal(animations.at(-1).frames[0].transform,'translateX(-80px)');
  slides.drag(100,true);assert.equal(image.style.transform,'translateX(25px)');slides.settle();
  assert.equal(image.style.transform,'');assert.equal(animations.at(-1).frames[0].transform,'translateX(25px)');
  const count=animations.length;reduced=true;slides.reveal('/immediate',300,200,1);assert.equal(animations.length,count);assert.equal(image.src,'/immediate');
 }finally{Object.assign(globalThis,saved);}
});
