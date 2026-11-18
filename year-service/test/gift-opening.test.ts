import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser client exercised with a minimal DOM.
import {mountPixelGift} from '../web/pixelbook-gift.js';

function fixture(t: any,{hasOrder=true,orderingEnabled=true,claim=null as any,livePricing=false,receiptFigure=false}={}){
 const previousDocument=(globalThis as any).document;
 const node=()=>({disabled:false,textContent:'',onclick:null as any,focus(){},setAttribute(){},listeners:{} as Record<string,Function>,addEventListener(event:string,handler:Function){this.listeners[event]=handler;},append(){},after(){}});
 const description=node(),launch=node(),heading=node(),status=node(),next=node(),history:string[]=[],images:any[]=[],displayedImages:any[]=[];
 const figure={isConnected:true,dataset:{},children:[] as any[],querySelector(){return null;},replaceChildren(...children:any[]){this.children=children;}};
 const listeners:Record<string,()=>void>={};
 const modal={open:false,isConnected:true,html:'',className:'',
  set innerHTML(value:string){this.html=value;history.push(value);status.textContent='';},get innerHTML(){return this.html;},
  setAttribute(){},removeAttribute(){},querySelectorAll(){return [];},
  querySelector(selector:string){if(selector==='.pb-mug-preview'&&receiptFigure)return figure;if(selector==='h2')return heading;if(selector==='.pb-gift-status')return status;if(selector==='[data-gift-next]')return next;if(selector==='[data-saved-gift-image]'&&this.html.includes('data-saved-gift-image'))return {className:'pb-printful-mockup',alt:'Saved gift',replaceWith(image:any){displayedImages.push(image);}};return null;},
  addEventListener(event:string,handler:()=>void){listeners[event]=handler;},
  showModal(){this.open=true;},close(){this.open=false;listeners.close?.();},remove(){this.isConnected=false;}
 };
 (globalThis as any).document={activeElement:launch,body:{append(){}},createElement(tag:string){if(tag==='dialog')return modal;if(tag==='img'){const image={...node(),src:'',decoded:false,async decode(){this.decoded=true;}};images.push(image);return image;}return node();}};
 const designs=Array.from({length:4},(_,i)=>({id:'mug-'+i,src:'/api/mugs/mug-'+i}));
 const gift=mountPixelGift({name:'Household',gift:{enabled:true,hasOrder,orderingEnabled,designs,claim,livePricing}},
  {querySelector(selector:string){return selector==='[data-open-gift]'?launch:selector==='#pb-gift .pb-present-copy>p'?description:null;}});
 t.after(()=>{gift.destroy();(globalThis as any).document=previousDocument;});
 return {launch,modal,history,status,designs,next,images,displayedImages,description,figure};
}

test('viewing an existing household gift never renders the selector, including on reopen',async t=>{
 const {launch,modal,history,designs,displayedImages,description}=fixture(t);
 let resolve!:(value:Response)=>void;
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{assert.equal(path,'/api/gift/status');return new Promise<Response>(r=>resolve=r);});
 t.after(()=>fetch.mock.restore());
 for(let i=0;i<2;i++){
  const opening=launch.onclick();
  assert.equal(modal.open,true);
  assert.match(modal.innerHTML,i===0?/role="status">Loading your gift/:/Pixel perfect/);
  assert.doesNotMatch(modal.innerHTML,/data-design=|data-gift-next|Gift progress/);
  resolve(Response.json({claim:{status:'simulated',designId:designs[2].id,design:designs[2]}}));
  await opening;
  assert.match(modal.innerHTML,/Pixel perfect/);
  assert.match(displayedImages.at(-1).src,/mug-2/);
  assert.equal(description.textContent,'your morning coffee is about to become more pawesome');
  modal.close();
 }
 assert.ok(history.every(html=>!html.includes('data-design=')));
});

test('a household order created since the journal loaded replaces the provisional picker before continuing',async t=>{
 const {launch,modal,designs,next}=fixture(t,{hasOrder:false});
 const fetch=mock.method(globalThis,'fetch',async()=>Response.json({claim:{status:'simulated',designId:designs[1].id,design:designs[1]}}));
 t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();assert.equal(modal.open,true);assert.match(modal.innerHTML,/data-design=/);assert.match(modal.innerHTML,/data-gift-next\b[^>]*\bdisabled/);
 await opening;assert.match(modal.innerHTML,/Pixel perfect/);
});

test('new mugshot selections open directly without a household gift loading screen',async t=>{
 const {launch,modal,next}=fixture(t,{hasOrder:false});
 let resolve!:(value:Response)=>void;
 const fetch=mock.method(globalThis,'fetch',async()=>new Promise<Response>(r=>resolve=r));t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();assert.equal(modal.open,true);assert.match(modal.innerHTML,/data-gift-next\b[^>]*\bdisabled/);assert.equal(launch.disabled,false);
 assert.doesNotMatch(modal.innerHTML,/Loading your gift|your household’s gift/);
 resolve(Response.json({claim:null}));await opening;assert.equal(modal.open,true);assert.match(modal.innerHTML,/data-design=/);assert.equal(next.disabled,false);assert.equal(launch.disabled,false);
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

const savedGift={designId:'mug-2',status:'simulated',configuration:{style:'classic',size:'11oz',color:'white',font:'clean'},design:{id:'mug-2',src:'/api/gift/orders/saved/artwork',mockupSrc:'/api/gift/orders/saved/mockup'}};

test('journal snapshot preloads the saved image and opens immediately while refreshing in the background',async t=>{
 const {launch,modal,images,displayedImages,history}=fixture(t,{claim:savedGift,livePricing:true});
 assert.equal(images.length,1);assert.equal(images[0].src,savedGift.design.mockupSrc);assert.equal(images[0].decoded,true);
 let resolve!:(value:Response)=>void;
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{assert.equal(path,'/api/gift/status');return new Promise<Response>(r=>resolve=r);});t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();
 assert.equal(modal.open,true);assert.match(modal.innerHTML,/Pixel perfect/);
 assert.doesNotMatch(modal.innerHTML,/Loading your gift|data-design=|data-gift-next/);
 assert.equal(displayedImages[0],images[0],'Use the actual preloaded image, without another private image request');
 assert.doesNotMatch(modal.innerHTML,/src="\/api\/gift\/orders\/saved\/mockup"/);
 resolve(Response.json({claim:{...savedGift,id:'saved',address:{line1:'Not needed by the dialog'}}}));await opening;
 assert.equal(history.length,1,'An unchanged refresh must not redraw, reset scroll or move focus');
 assert.equal(images.length,1);
});

test('cached gift stays visible when its background refresh fails',async t=>{
 const {launch,modal,status}=fixture(t,{claim:savedGift});
 const fetch=mock.method(globalThis,'fetch',async()=>{throw new Error('Temporarily offline');});t.after(()=>fetch.mock.restore());
 await launch.onclick();assert.match(modal.innerHTML,/Pixel perfect/);assert.equal(status.textContent,'Temporarily offline');
 assert.doesNotMatch(modal.innerHTML,/Loading your gift|couldn’t load your gift|data-design=/);
});

test('background refresh replaces a stale saved gift and preloads its updated image',async t=>{
 const {launch,modal,images,displayedImages}=fixture(t,{claim:savedGift});
 const updated={...savedGift,designId:'mug-3',design:{id:'mug-3',src:'/api/gift/orders/new/artwork',mockupSrc:'/api/gift/orders/new/mockup'}};
 const fetch=mock.method(globalThis,'fetch',async()=>Response.json({claim:updated}));t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();assert.equal(displayedImages.at(-1).src,savedGift.design.mockupSrc);
 await opening;assert.match(modal.innerHTML,/Pixel perfect/);assert.equal(images.length,2);assert.equal(displayedImages.at(-1).src,updated.design.mockupSrc);
});

test('a reset household gift becomes a fresh picker only after the server confirms the reset',async t=>{
 const {launch,modal}=fixture(t,{claim:savedGift});
 const fetch=mock.method(globalThis,'fetch',async()=>Response.json({claim:null}));t.after(()=>fetch.mock.restore());
 const opening=launch.onclick();assert.match(modal.innerHTML,/Pixel perfect/);
 await opening;assert.match(modal.innerHTML,/data-design=/);assert.equal(launch.textContent,'pick your mugshot');
});

test('browsing the gallery does not start background mug-preview downloads',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const fetch=mock.method(globalThis,'fetch',async()=>{throw new Error('No mug network traffic before interaction');});
 t.after(()=>fetch.mock.restore());
 fixture(t,{hasOrder:false,livePricing:true});
 t.mock.timers.tick(5000);await Promise.resolve();
 assert.equal(fetch.mock.callCount(),0);
});

// @ts-expect-error Shared browser mug catalog.
import {mugStyles,pixelMugOptions} from '../web/mug-options.js';
test('the chooser warms only the selected saved proof and catalog refresh does not download it again',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});const calls:string[]=[];
 const fetch=mock.method(globalThis,'fetch',async(path:any)=>{calls.push(String(path));return Response.json(String(path).endsWith('/status')?{claim:null,livePricing:true}:{styles:mugStyles,prepared:true,previews:[{id:'saved',designId:'mug-0',configuration:pixelMugOptions(),src:'/supplier.jpg'}]});});t.after(()=>fetch.mock.restore());
 const {launch,modal}=fixture(t,{hasOrder:false,livePricing:true});await launch.onclick();assert.match(modal.innerHTML,/data-design=/);
 t.mock.timers.tick(30000);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['/api/gift/status','/api/gift/catalog','/supplier.jpg']);
});

for(const live of [false,true])for(const failFirst of [false,true])test(`${live?'live':'simulated'} mug submission shows a paw until the server responds and ${failFirst?'restores a safe retry':'prevents duplicate taps'}`,async t=>{
 const {launch,modal,next,designs,status}=fixture(t,{hasOrder:false});
 const claims:any[]=[];let respond!:(value:Response)=>void;
 const fetch=mock.method(globalThis,'fetch',async(path:string,init?:RequestInit)=>{
  if(path==='/api/gift/status')return Response.json({claim:null});
  if(path==='/api/delivery-address')return Response.json({verified:true,version:1,country:'US',mode:'local_mock',address:{line1:'123 Sample Lane',city:'Example',state:'CA',postalCode:'90001',country:'US'}});
  assert.equal(path,'/api/gift/claim');claims.push(JSON.parse(init!.body as string));return new Promise<Response>(r=>respond=r);
 });t.after(()=>fetch.mock.restore());
 await launch.onclick();await next.listeners.click();assert.doesNotMatch(modal.innerHTML,/your chosen mugshot|don’t i have excellent taste/);await next.listeners.click();
 assert.match(modal.innerHTML,/confirm & order/);
 let pending=next.listeners.click();assert.match(modal.innerHTML,/pb-mug-submission/);assert.match(modal.innerHTML,/pb-paw-fill/);assert.doesNotMatch(modal.innerHTML,/data-gift-next|test order saved/);
 await next.listeners.click();assert.equal(claims.length,1,'A second tap never creates another request');
 if(failFirst){respond(Response.json({error:'Please try again.'},{status:503}));await pending;assert.equal(status.textContent,'Please try again.');assert.match(modal.innerHTML,/confirm & order/);assert.doesNotMatch(modal.innerHTML,/pb-mug-submission/);pending=next.listeners.click();assert.equal(claims.length,2);assert.deepEqual(claims[0],claims[1],'Retry preserves the idempotency key and chosen mug');}
 respond(Response.json({claim:{live,fulfillment:live?'pending':undefined,status:'simulated',configuration:claims[0].configuration,designId:designs[0].id,design:designs[0]}}));await pending;
 assert.match(modal.innerHTML,/Pixel perfect. one of my favorite photos of me./);assert.doesNotMatch(modal.innerHTML,/<h3>Pixel perfect|excellent choice|that’s a wrap|pb-mug-submission/);assert.match(modal.className,/pb-mug-confirmation/);
 if(live){assert.match(modal.innerHTML,/order received/);assert.match(modal.innerHTML,/head back to your scrapbook/);assert.doesNotMatch(modal.innerHTML,/mug ordered|Your mug order is with Printful/);assert.equal(fetch.mock.calls.filter(call=>call.arguments[0]==='/api/gift/status').length,1,'No supplier-status polling after the saved claim');}
});

test('reopening a saved gift reconnects both prepared handle angles while preserving its saved image',async t=>{
 const previousImage=(globalThis as any).Image;(globalThis as any).Image=class{src='';async decode(){}};t.after(()=>{(globalThis as any).Image=previousImage;});
 const calls:string[]=[],claim={...savedGift,design:{...savedGift.design,caption:'Saved caption'}};
 const fetch=mock.method(globalThis,'fetch',async(path:string)=>{
  calls.push(path);
  if(path==='/api/gift/status')return Response.json({claim,livePricing:true});
  if(path==='/api/gift/catalog')return Response.json({styles:mugStyles,prepared:true,previews:['handle-left','handle-right'].map(view=>({id:view,view,designId:claim.designId,caption:claim.design.caption,configuration:claim.configuration,src:'/proof-'+view}))});
  assert.match(path,/^\/proof-handle-(left|right)$/);return new Response(new Blob(['saved proof']));
 });t.after(()=>fetch.mock.restore());
 const {launch,figure,modal}=fixture(t,{claim,livePricing:true,receiptFigure:true});
 await launch.onclick();for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls.includes('/api/gift/catalog'));assert.ok(calls.includes('/proof-handle-left'));assert.ok(calls.includes('/proof-handle-right'));
 assert.match(figure.children[1].className,/\bpb-mockup-views\b/);assert.match(modal.className,/pb-mug-confirmation/);
});
