import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser helper.
import {createPhotoSlide} from '../web/photo-slide.js';

test('neighbors share one drag rail, settle from release position, and clean up on cancellation',async()=>{
 const saved={document:(globalThis as any).document,matchMedia:(globalThis as any).matchMedia};
 let reduced=false,reads=0;const animations:any[]=[],created:any[]=[];
 const make=(tag:string):any=>({tag,style:{visibility:'visible'},children:[] as any[],attrs:{} as any,complete:true,naturalWidth:300,naturalHeight:200,
  append(...nodes:any[]){nodes.forEach(node=>{node.parent=this;this.children.push(node);});},
  replaceWith(next:any){next.parent=this.parent;this.parent.children[this.parent.children.indexOf(this)]=next;},
  setAttribute(k:string,v:string){this.attrs[k]=v;},getAttribute(k:string){return k==='src'?this.src:this.attrs[k];},removeAttribute(k:string){if(k==='src')delete this.src;else delete this.attrs[k];},
  animate(frames:any,options:any){let finish=()=>{},reject=()=>{};const a={frames,options,finished:new Promise<void>((r,j)=>{finish=r;reject=j;}),cancel(){reject();},finish(){finish();}};animations.push(a);return a;}
 });
 (globalThis as any).document={createElement:(tag:string)=>{const n=make(tag);created.push(n);return n;}};
 (globalThis as any).matchMedia=()=>({matches:reduced});
 const frame={getBoundingClientRect:()=>{reads++;return {width:300};},children:[] as any[],style:{setProperty(){} }},image=make('img');image.parent=frame;frame.children.push(image);
 try{
  const slides=createPhotoSlide(frame,image),rail=created.find(n=>n.className==='photo-slide-rail');
  await slides.reveal('/first',300,200);assert.ok(created.filter(n=>n.tag==='img').every(n=>n.hidden));slides.neighbor(-1,'/previous');slides.neighbor(1,'/next');
  const neighbors=created.filter(n=>n.tag==='img');assert.equal(neighbors.length,2);assert.equal(neighbors[0].hidden,false);assert.equal(neighbors[1].hidden,false);assert.equal(neighbors[1].src,'/next');assert.equal(neighbors[1].style.left,'100%');assert.deepEqual(slides.ready(1),{src:'/next',width:300,height:200,preview:false});assert.equal(created.filter(n=>n.tag==='img').length,2);slides.neighbor(1,'/grid',false);assert.equal(slides.ready(1).preview,true);assert.equal(slides.ready(1).src,'/grid');slides.neighbor(1,'/next');
  slides.begin();const before=reads;slides.drag(-80);slides.drag(-90);assert.equal(reads,before);assert.equal(rail.style.transform,'translate3d(-90px,0,0)');
  slides.cancel(true);const moving=slides.reveal('/next',200,300,1);
  assert.equal(animations.length,1);assert.equal(animations[0].frames[0].transform,'translate3d(-90px,0,0)');assert.equal(animations[0].frames[1].transform,'translate3d(-300px,0,0)');
  assert.equal(image.src,'/first');animations[0].finish();await moving;assert.equal(image.src,'/next');assert.equal(rail.style.transform,'translate3d(0px,0,0)');assert.ok(neighbors.every(n=>!n.src&&n.hidden));
  slides.begin();slides.drag(100,true);assert.equal(rail.style.transform,'translate3d(25px,0,0)');const settling=slides.settle();animations.at(-1).finish();await settling;assert.equal(rail.style.transform,'translate3d(0px,0,0)');
  slides.begin();slides.drag(70);const canceled=slides.reveal('/previous',300,200,-1);slides.cancel();await canceled;assert.equal(image.src,'/previous');assert.equal(rail.style.transform,'translate3d(0px,0,0)');
  const count=animations.length;reduced=true;await slides.reveal('/instant',300,200,1);assert.equal(animations.length,count);assert.equal(image.src,'/instant');
  const geometryReads=reads;slides.upgrade('/sharper');assert.equal(image.src,'/sharper');assert.equal(reads,geometryReads);assert.equal(rail.style.transform,'translate3d(0px,0,0)');
  assert.ok(created.every(n=>n.tag!=='canvas'));
 }finally{Object.assign(globalThis,saved);}
});
