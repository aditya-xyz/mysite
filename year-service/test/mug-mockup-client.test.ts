import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser client exercised with a minimal DOM.
import {createMugMockups} from '../web/mug-mockups.js';
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
test('cached mockups skip canvas/uploads, decode before display and reuse image bytes across control redraws',async()=>{
 const calls:string[]=[];let release:()=>void=()=>{},decodeStarted=false,canvasCalls=0;
 const decoded=new Promise<void>(resolve=>release=resolve);
 const previousDocument=(globalThis as any).document,previousImage=(globalThis as any).Image;
 const element=()=>({isConnected:true,dataset:{} as Record<string,string>,children:[] as any[],status:{textContent:''},querySelector(){return this.status;},replaceChildren(...values:any[]){this.children=values;}});
 (globalThis as any).document={createElement(tag:string){if(tag==='canvas'){canvasCalls++;throw new Error('Cache hit must not render artwork');}return {tag,children:[] as any[],append(...nodes:any[]){this.children.push(...nodes);}};}};
 (globalThis as any).Image=class{src='';async decode(){decodeStarted=true;await decoded;}};
 const fetch=mock.method(globalThis,'fetch',async(path:string,init?:RequestInit)=>{
  calls.push(path);
  if(path.endsWith('/lookup')){assert.equal(init?.headers&&new Headers(init.headers).get('Content-Type'),'application/json');return Response.json({id:'cached',status:'ready',src:'/api/gift/mockup/cached/image'});}
  assert.equal(path,'/api/gift/mockup/cached/image');return new Response(new Blob(['synthetic PNG'],{type:'image/png'}));
 });
 const client=createMugMockups(),design={id:'design',src:'/approved-cutout.png',caption:'hello'},configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
 try{
  client.configure({styles:[]});client.preload(design,configuration);await settle();assert.equal(decodeStarted,true);
  const first=element();client.update(first,design,configuration);await settle();assert.equal(first.children.length,0,'No placeholder image or undecoded image is painted');
  release();await settle();assert.equal(first.children[0].tag,'img');assert.match(first.children[0].src,/^blob:/);
  const second=element();client.update(second,design,configuration);await settle();assert.equal(second.children[0].src,first.children[0].src);
  assert.deepEqual(calls,['/api/gift/mockup/lookup','/api/gift/mockup/cached/image']);assert.equal(canvasCalls,0);assert.equal(client.id(design,configuration),'cached');
 }finally{client.destroy();fetch.mock.restore();(globalThis as any).document=previousDocument;(globalThis as any).Image=previousImage;}
});
test('prepared library loads only saved image bytes with no canvas, polling or generation requests',async()=>{
 const calls:string[]=[],previousDocument=(globalThis as any).document,previousImage=(globalThis as any).Image;
 const figure={isConnected:true,dataset:{},children:[] as any[],querySelector(){return {textContent:''};},replaceChildren(...values:any[]){this.children=values;}};
 (globalThis as any).document={createElement(tag:string){assert.notEqual(tag,'canvas');return {tag,children:[] as any[],append(...nodes:any[]){this.children.push(...nodes);}};}};
 (globalThis as any).Image=class{src='';async decode(){}};
 const fetch=mock.method(globalThis,'fetch',async(path:string,init?:RequestInit)=>{calls.push(path);assert.equal(init?.method,'GET');assert.equal(path,'/api/gift/previews/prepared');return new Response(new Blob(['saved PNG'],{type:'image/png'}));});
 const client=createMugMockups(),design={id:'photo',caption:'Caption',src:'/approved.png'},configuration={style:'color-inside',size:'15oz',color:'dark blue',font:'handwritten'};
 try{
  client.configure({prepared:true,styles:[],previews:[{id:'prepared',designId:'photo',caption:'Caption',configuration,src:'/api/gift/previews/prepared'}]});
  client.preload(design,configuration);client.update(figure,design,configuration);await settle();assert.equal(figure.children[0].tag,'img');assert.deepEqual(calls,['/api/gift/previews/prepared']);assert.equal(client.preparedId(design,configuration),'prepared');
 }finally{client.destroy();fetch.mock.restore();(globalThis as any).document=previousDocument;(globalThis as any).Image=previousImage;}
});
test('missing saved preview stops the spinner and never competes with the preparation queue',async()=>{
 const previousDocument=(globalThis as any).document,previousImage=(globalThis as any).Image;
 const figure={isConnected:true,dataset:{},children:[] as any[],querySelector(){return {textContent:''};},replaceChildren(...values:any[]){this.children=values;}};
 (globalThis as any).document={createElement(tag:string){return {tag,textContent:'',children:[] as any[],append(...nodes:any[]){this.children.push(...nodes);}};}};
 (globalThis as any).Image=class{src='';async decode(){}};
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{assert.equal(path,'/api/gift/previews/now-ready');return new Response(new Blob(['saved PNG'],{type:'image/png'}));});
 const client=createMugMockups(),design={id:'photo',caption:'Caption'},configuration={style:'latte',size:'12oz',color:'white',font:'clean'};
 try{
  client.configure({prepared:true,styles:[],previews:[]});assert.equal(client.available(design,configuration),false);
  client.preload(design,configuration);client.update(figure,design,configuration);await settle();
  assert.equal(fetch.mock.callCount(),0);assert.match(figure.children[0].textContent,/still being prepared/);assert.equal(figure.children[0].className,'pb-mockup-wait');
  client.configure({prepared:true,styles:[],previews:[{id:'now-ready',designId:'photo',caption:'Caption',configuration:{font:'clean',color:'white',size:'12oz',style:'latte'},src:'/api/gift/previews/now-ready'}]});
  assert.equal(client.available(design,configuration),true,'Configuration property order does not affect saved lookup');
  await settle();assert.equal(figure.children[0].tag,'img','A refreshed catalog resumes the waiting preview without a separate preload');assert.equal(fetch.mock.callCount(),1);
 }finally{client.destroy();fetch.mock.restore();(globalThis as any).document=previousDocument;(globalThis as any).Image=previousImage;}
});
test('saved views default to handle-left and switch to handle-right without generation',async()=>{
 const previousDocument=(globalThis as any).document,previousImage=(globalThis as any).Image,calls:string[]=[];
 const node=(tag:string)=>({tag,children:[] as any[],append(...nodes:any[]){this.children.push(...nodes);}});
 (globalThis as any).document={createElement:node};(globalThis as any).Image=class{src='';async decode(){}};
 const fetch=mock.method(globalThis,'fetch',async(path:string,init?:RequestInit)=>{calls.push(path);assert.equal(init?.method,'GET');return new Response(new Blob([path],{type:'image/png'}));});
 const figure={isConnected:true,dataset:{} as any,children:[] as any[],querySelector(){return null;},replaceChildren(...nodes:any[]){this.children=nodes;}};
 const design={id:'photo',caption:'Hello'},configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
 const preview=(view:string)=>({id:view,view,designId:design.id,caption:design.caption,configuration,src:'/api/gift/previews/'+view});
 const client=createMugMockups();
 try{
  client.configure({prepared:true,styles:[],previews:[preview('handle-left')]});client.update(figure,design,configuration);await settle();
  assert.equal(client.preparedId(design,configuration),'handle-left');assert.equal(figure.children[1].children[0].textContent,'Handle left');assert.equal(figure.children[1].children[1].textContent,'Handle right');assert.equal(figure.children[1].children[1].disabled,true);
  client.configure({prepared:true,styles:[],previews:[preview('handle-left'),preview('handle-right')]});await settle();
  assert.equal(client.preparedId(design,configuration),'handle-left');assert.equal(figure.children[1].children[0].ariaPressed,'true');
  figure.children[1].children[1].onclick();await settle();assert.equal(client.preparedId(design,configuration),'handle-right');assert.equal(figure.children[1].children[1].ariaPressed,'true');
  figure.children[1].children[0].onclick();await settle();assert.equal(client.preparedId(design,configuration),'handle-left');
  assert.deepEqual(calls,['/api/gift/previews/handle-left','/api/gift/previews/handle-right'],'Toggling views reuses decoded saved images and never generates a mockup');
 }finally{client.destroy();fetch.mock.restore();(globalThis as any).document=previousDocument;(globalThis as any).Image=previousImage;}
});

test('angle changes retain their controls, turn decoded previews and respect reduced motion',async()=>{
 const saved={document:(globalThis as any).document,Image:(globalThis as any).Image,matchMedia:(globalThis as any).matchMedia,getComputedStyle:(globalThis as any).getComputedStyle};
 const animations:any[]=[];let reduced=false;
 const node=(tag:string):any=>({tagName:tag.toUpperCase(),className:'',children:[] as any[],isConnected:true,style:{},dataset:{},
  append(...items:any[]){for(const item of items){item.parent=this;this.children.push(item);}},
  replaceChildren(...items:any[]){this.children=[];this.append(...items);},
  querySelector(selector:string){return selector==='img.pb-printful-mockup'?this.children.find((n:any)=>n.tagName==='IMG'&&n.className==='pb-printful-mockup'):null;},
  querySelectorAll(){return this.children.filter((n:any)=>n.className==='pb-mockup-crossfade');},
  getBoundingClientRect(){return {left:0,top:0,width:200,height:200};},
  cloneNode(){return {...node(tag),src:this.src};},setAttribute(){},focus(){},
  replaceWith(next:any){const i=this.parent.children.indexOf(this);next.parent=this.parent;this.parent.children[i]=next;},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter((n:any)=>n!==this);},
  animate(frames:any,options:any){animations.push({frames,options});return {finished:Promise.resolve()};}
 });
 (globalThis as any).document={createElement:node};
 (globalThis as any).Image=class{src='';async decode(){}};
 (globalThis as any).matchMedia=()=>({matches:reduced});
 (globalThis as any).getComputedStyle=()=>({objectFit:'contain',objectPosition:'50% 50%',clipPath:'none'});
 const fetch=mock.method(globalThis,'fetch',async()=>new Response(new Blob(['synthetic PNG'],{type:'image/png'})));
 const client=createMugMockups(),figure=node('figure'),design={id:'photo',caption:'hello'},configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
 try{
  client.configure({prepared:true,styles:[],previews:['handle-left','handle-right'].map(view=>({id:view,designId:design.id,caption:design.caption,configuration,view,src:'/api/gift/previews/'+view}))});
  client.update(figure,design,configuration);await settle();
  const controls=figure.children[1];controls.children[1].onclick();await settle();
  assert.equal(figure.children[1],controls,'The highlight can slide because its control stays mounted');
  assert.equal(controls.children[1].ariaPressed,'true');assert.equal(animations.length,2);
  assert.ok(animations.every(a=>a.options.duration===440));
  assert.match(animations[0].frames[0].transform,/rotateY\(38deg\)/);assert.match(animations[1].frames.at(-1).transform,/rotateY\(-32deg\)/);
  assert.equal(figure.querySelectorAll('.pb-mockup-crossfade').length,0,'The old overlay is released after fading');
  reduced=true;controls.children[0].onclick();await settle();
  assert.equal(controls.children[0].ariaPressed,'true');assert.equal(animations.length,2,'Reduced motion skips both fade animations');
 }finally{client.destroy();fetch.mock.restore();Object.assign(globalThis,saved);}
});

function angleFixture(t:any){
 const saved={document:(globalThis as any).document,Image:(globalThis as any).Image,matchMedia:(globalThis as any).matchMedia};
 const node=(tag:string):any=>({tagName:tag.toUpperCase(),className:'',children:[],isConnected:true,dataset:{},attrs:new Map(),
  append(...nodes:any[]){for(const n of nodes){n.parent=this;this.children.push(n);}},
  replaceChildren(...nodes:any[]){this.children=[];this.append(...nodes);},
  querySelector(selector:string){return this.children.find((n:any)=>selector==='img.pb-printful-mockup'?n.tagName==='IMG'&&n.className==='pb-printful-mockup':selector==='figcaption'?n.tagName==='FIGCAPTION':false)||null;},
  querySelectorAll(){return [];},setAttribute(name:string,value:string){this.attrs.set(name,value);},focus(){},
  replaceWith(next:any){next.parent=this.parent;this.parent.children[this.parent.children.indexOf(this)]=next;},
 });
 (globalThis as any).document={createElement:node};(globalThis as any).Image=class{src='';async decode(){}};
 (globalThis as any).matchMedia=()=>({matches:true});t.after(()=>Object.assign(globalThis,saved));
 const design={id:'photo',caption:'hello'},configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
 const client=createMugMockups();t.after(()=>client.destroy());
 client.configure({prepared:true,styles:[],previews:['handle-left','handle-right'].map(view=>({id:view,view,designId:design.id,caption:design.caption,configuration,src:'/saved/'+view}))});
 return {client,figure:node('figure'),design,configuration};
}
test('preloading a selected mug decodes both saved angles once without generation',async t=>{
 const f=angleFixture(t),calls:string[]=[];
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{calls.push(path);return new Response(new Blob([path]));});t.after(()=>fetch.mock.restore());
 f.client.preload(f.design,f.configuration);await settle();
 assert.deepEqual(calls,['/saved/handle-left','/saved/handle-right']);
 f.client.update(f.figure,f.design,f.configuration);await settle();
 f.figure.children[1].children[1].onclick();await settle();
 f.client.preload(f.design,f.configuration);await settle();
 assert.equal(calls.length,2);assert.equal(f.figure.attrs.get('aria-busy'),'false');
});
test('slow angle taps select immediately, keep the current image and announce loading; late images cannot overwrite a newer tap',async t=>{
 const f=angleFixture(t);let release!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve);
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{if(path.endsWith('right'))await gate;return new Response(new Blob([path]));});t.after(()=>fetch.mock.restore());
 f.client.update(f.figure,f.design,f.configuration);await settle();
 const image=f.figure.children[0],controls=f.figure.children[1],caption=f.figure.children[2];
 controls.children[1].onclick();
 assert.equal(controls.children[1].ariaPressed,'true');assert.equal(controls.children[0].ariaPressed,'false');
 assert.equal(f.figure.attrs.get('aria-busy'),'true');assert.match(caption.textContent,/Loading right handle/);
 assert.equal(f.figure.children[0],image);
 await settle();controls.children[0].onclick();
 assert.equal(controls.children[0].ariaPressed,'true');assert.equal(f.figure.attrs.get('aria-busy'),'false');
 release();await settle();assert.equal(f.figure.children[0],image);
 controls.children[1].onclick();assert.notEqual(f.figure.children[0],image);
 assert.equal(f.figure.attrs.get('aria-busy'),'false');assert.equal(fetch.mock.callCount(),2);
});
test('an angle download failure stops loading and the same control can retry',async t=>{
 const f=angleFixture(t);let failed=false;
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{
  if(path.endsWith('right')&&!failed){failed=true;return Response.json({error:'Temporary failure'},{status:503});}
  return new Response(new Blob([path]));
 });t.after(()=>fetch.mock.restore());
 f.client.update(f.figure,f.design,f.configuration);await settle();
 const controls=f.figure.children[1];controls.children[1].onclick();await settle();
 assert.equal(f.figure.attrs.get('aria-busy'),'false');assert.match(f.figure.children[2].textContent,/Tap.*retry/);
 controls.children[1].onclick();assert.equal(f.figure.attrs.get('aria-busy'),'true');await settle();
 assert.equal(f.figure.attrs.get('aria-busy'),'false');assert.equal(f.figure.children[2].textContent,'Mug preview · final placement may vary');
 assert.equal(fetch.mock.callCount(),3);
});

test('an older open scrapbook explains when its mugshot caption was updated',async()=>{
 const previousDocument=(globalThis as any).document;
 const figure={isConnected:true,dataset:{},children:[] as any[],querySelector(){return null;},replaceChildren(...nodes:any[]){this.children=nodes;}};
 (globalThis as any).document={createElement(tag:string){return {tag,textContent:'',children:[] as any[],append(...nodes:any[]){this.children.push(...nodes);}};}};
 const fetch=mock.method(globalThis,'fetch',async()=>{throw Error('Stale caption must not fetch an unrelated preview');});
 const client=createMugMockups(),configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
 try{
  client.configure({prepared:true,styles:[],previews:[{id:'current',designId:'photo',caption:'Updated caption',configuration,src:'/current-proof'}]});
  client.update(figure,{id:'photo',caption:'Earlier caption'},configuration);await settle();
  assert.match(figure.children[0].textContent,/updated.*Refresh Pixelbook/);
  assert.equal(fetch.mock.callCount(),0);
 }finally{client.destroy();fetch.mock.restore();(globalThis as any).document=previousDocument;}
});
