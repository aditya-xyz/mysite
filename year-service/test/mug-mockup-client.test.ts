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
  client.preload(design,configuration);await settle();assert.equal(figure.children[0].tag,'img');assert.equal(fetch.mock.callCount(),1);
 }finally{client.destroy();fetch.mock.restore();(globalThis as any).document=previousDocument;(globalThis as any).Image=previousImage;}
});
test('saved views default to front, preserve it after backfill, and switch to handle-right without generation',async()=>{
 const previousDocument=(globalThis as any).document,previousImage=(globalThis as any).Image,calls:string[]=[];
 const node=(tag:string)=>({tag,children:[] as any[],append(...nodes:any[]){this.children.push(...nodes);}});
 (globalThis as any).document={createElement:node};(globalThis as any).Image=class{src='';async decode(){}};
 const fetch=mock.method(globalThis,'fetch',async(path:string,init?:RequestInit)=>{calls.push(path);assert.equal(init?.method,'GET');return new Response(new Blob([path],{type:'image/png'}));});
 const figure={isConnected:true,dataset:{} as any,children:[] as any[],querySelector(){return null;},replaceChildren(...nodes:any[]){this.children=nodes;}};
 const design={id:'photo',caption:'Hello'},configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
 const preview=(view:string)=>({id:view,view,designId:design.id,caption:design.caption,configuration,src:'/api/gift/previews/'+view});
 const client=createMugMockups();
 try{
  client.configure({prepared:true,styles:[],previews:[preview('front')]});client.update(figure,design,configuration);await settle();
  assert.equal(client.preparedId(design,configuration),'front');assert.equal(figure.children[1].children[0].textContent,'Front');assert.equal(figure.children[1].children[1].disabled,true);
  client.configure({prepared:true,styles:[],previews:[preview('front'),preview('handle-right')]});await settle();
  assert.equal(client.preparedId(design,configuration),'front');assert.equal(figure.children[1].children[0].ariaPressed,'true');
  figure.children[1].children[1].onclick();await settle();assert.equal(client.preparedId(design,configuration),'handle-right');assert.equal(figure.children[1].children[1].ariaPressed,'true');
  figure.children[1].children[0].onclick();await settle();assert.equal(client.preparedId(design,configuration),'front');
  assert.deepEqual(calls,['/api/gift/previews/front','/api/gift/previews/handle-right'],'Toggling views reuses decoded saved images and never generates a mockup');
 }finally{client.destroy();fetch.mock.restore();(globalThis as any).document=previousDocument;(globalThis as any).Image=previousImage;}
});
