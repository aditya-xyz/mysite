import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser client exercised with a minimal DOM.
import {mountPixelGift} from '../web/pixelbook-gift.js';

function fixture(t: any,{hasOrder=true,orderingEnabled=true}={}){
 const previousDocument=(globalThis as any).document;
 const node=()=>({disabled:false,textContent:'',onclick:null as any,focus(){},setAttribute(){},addEventListener(){},after(){}});
 const launch=node(),heading=node(),status=node(),next=node(),history:string[]=[];
 const listeners:Record<string,()=>void>={};
 const modal={open:false,isConnected:true,html:'',
  set innerHTML(value:string){this.html=value;history.push(value);status.textContent='';},get innerHTML(){return this.html;},
  setAttribute(){},removeAttribute(){},querySelectorAll(){return [];},
  querySelector(selector:string){if(selector==='h2')return heading;if(selector==='.pb-gift-status')return status;if(selector==='[data-gift-next]')return next;return null;},
  addEventListener(event:string,handler:()=>void){listeners[event]=handler;},
  showModal(){this.open=true;},close(){this.open=false;listeners.close?.();},remove(){this.isConnected=false;}
 };
 (globalThis as any).document={activeElement:launch,body:{append(){}},createElement(tag:string){return tag==='dialog'?modal:node();}};
 const designs=Array.from({length:4},(_,i)=>({id:'mug-'+i,src:'/api/mugs/mug-'+i}));
 const gift=mountPixelGift({name:'Household',gift:{enabled:true,hasOrder,orderingEnabled,designs}},
  {querySelector(selector:string){return selector==='[data-open-gift]'?launch:null;}});
 t.after(()=>{gift.destroy();(globalThis as any).document=previousDocument;});
 return {launch,modal,history,status,designs,next};
}

test('viewing an existing household gift never renders the selector, including on reopen',async t=>{
 const {launch,modal,history,designs}=fixture(t);
 let resolve!:(value:Response)=>void;
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{assert.equal(path,'/api/gift/status');return new Promise<Response>(r=>resolve=r);});
 t.after(()=>fetch.mock.restore());
 for(let i=0;i<2;i++){
  const opening=launch.onclick();
  assert.equal(modal.open,true);
  assert.match(modal.innerHTML,/role="status">Loading your gift/);
  assert.doesNotMatch(modal.innerHTML,/data-design=|data-gift-next|Gift progress/);
  resolve(Response.json({claim:{status:'simulated',designId:designs[2].id,design:designs[2]}}));
  await opening;
  assert.match(modal.innerHTML,/Pixel perfect/);
  assert.match(modal.innerHTML,/mug-2/);
  modal.close();
 }
 assert.ok(history.every(html=>!html.includes('data-design=')));
});

test('a household order created since the journal loaded also skips the selector',async t=>{
 const {launch,modal,designs}=fixture(t,{hasOrder:false});
 const fetch=mock.method(globalThis,'fetch',async()=>Response.json({claim:{status:'simulated',designId:designs[1].id,design:designs[1]}}));
 t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();assert.doesNotMatch(modal.innerHTML,/data-design=/);
 await opening;assert.match(modal.innerHTML,/Pixel perfect/);
});

test('households without an order see the picker only after the status check',async t=>{
 const {launch,modal,next}=fixture(t,{hasOrder:false});
 const fetch=mock.method(globalThis,'fetch',async()=>Response.json({claim:null}));t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();assert.doesNotMatch(modal.innerHTML,/data-design=/);
 await opening;assert.match(modal.innerHTML,/data-design=/);assert.equal(next.disabled,false);
});

test('existing gifts remain viewable after new ordering is disabled',async t=>{
 const {launch,modal,designs}=fixture(t,{orderingEnabled:false});
 const fetch=mock.method(globalThis,'fetch',async()=>Response.json({claim:{status:'simulated',design:designs[0]}}));t.after(()=>fetch.mock.restore());
 await launch.onclick();assert.equal(fetch.mock.callCount(),1);assert.match(modal.innerHTML,/Pixel perfect/);
 assert.doesNotMatch(modal.innerHTML,/ordering opens soon|data-design=/);
});

test('status failures show an error without exposing a new-order picker',async t=>{
 const {launch,modal,status,history}=fixture(t);
 const fetch=mock.method(globalThis,'fetch',async()=>Response.json({error:'Please try again.'},{status:503}));t.after(()=>fetch.mock.restore());
 await launch.onclick();assert.match(modal.innerHTML,/couldn’t load your gift/);assert.equal(status.textContent,'Please try again.');
 assert.ok(history.every(html=>!html.includes('data-design=')));
});

test('closing during the status request keeps the dialog closed when it resolves',async t=>{
 const {launch,modal,history,designs}=fixture(t);
 let resolve!:(value:Response)=>void;
 const fetch=mock.method(globalThis,'fetch',async()=>new Promise<Response>(r=>resolve=r));t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();modal.close();resolve(Response.json({claim:{design:designs[0]}}));await opening;
 assert.equal(modal.open,false);assert.equal(history.length,1);
});
