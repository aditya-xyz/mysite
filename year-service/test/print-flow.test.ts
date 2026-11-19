import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser UI helper is plain JavaScript.
import {createPrintFlow} from '../web/print-flow.js';
const address={verified:true,version:1,recipientName:'Example Friend',address:{line1:'123 Example Lane',city:'Portland',state:'OR',postalCode:'97201',country:'US'}};
const printStatus={eligible:true,mode:'simulation',contentVersion:1,addressVersion:1,confirmationKey:'test'};
function fixture(t:import('node:test').TestContext){
 const originalFetch=globalThis.fetch,originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 let sheet:any;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{body:{append(node:any){node.isConnected=true;}},createElement(){
  const nodes=new Map(),events=new Map();
  sheet={open:false,isConnected:false,innerHTML:'',querySelectorAll(){return [];},setAttribute(){},querySelector(selector:string){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',disabled:false,focus(){},querySelector(){return null;}});return nodes.get(selector);},addEventListener(name:string,handler:any){events.set(name,handler);},showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},remove(){this.isConnected=false;}};return sheet;
 }}});
 t.after(()=>{globalThis.fetch=originalFetch;if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');});
 const notices:string[]=[];
 const button:any={disabled:false,isConnected:true,focused:false,removeAttribute(){},focus(){this.focused=true;}};
 const flow=createPrintFlow({getData:()=>({file:new File(['proof'],'proof.jpg',{type:'image/jpeg'}),cardCount:1,recipe:{}}),onChange(){},onAddressStatus(message:string){notices.push(message);},onAvailabilityChange(){button.disabled=flow.isActive();}});
 t.after(()=>flow.close());
 flow.bind({querySelector:()=>button});
 return {flow,button,notices,sheet:()=>sheet};
}
test('keepsake review opens from preloaded data but rechecks permissions before saving',async t=>{
 const {flow,button,sheet:getSheet}=fixture(t);
 const calls:string[]=[];let allowed=true;
 globalThis.fetch=async(input:any)=>{const path=String(input);calls.push(path);return Response.json(path==='/api/print/status'?{...printStatus,eligible:allowed}:address);};
 await flow.refresh();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.filter(p=>p==='/api/delivery-address').length,1);
 const before=calls.length,opened=button.onclick({currentTarget:button});
 const sheet=getSheet();assert.equal(sheet.open,true,'review opens synchronously');await opened;
 assert.equal(button.disabled,true,'the editor button stays disabled behind the review');
 await button.onclick({currentTarget:button});
 assert.equal(getSheet(),sheet,'a repeat tap cannot open another review');
 assert.equal(calls.length,before,'opening adds no network round trip');
 assert.match(sheet.querySelector('[data-delivery-address]').innerHTML,/Example Friend/);
 allowed=false;await sheet.querySelector('[data-submit-print]').onclick();
 assert.ok(calls.includes('/api/delivery-address/confirm'));
 assert.ok(calls.filter(p=>p==='/api/print/status').length>1);
 assert.ok(!calls.includes('/api/print/orders'),'revoked permission prevents saving');
 assert.match(sheet.querySelector('.ks-status').textContent,/permissions or scrapbook changed/);
});

test('slow address lookup leaves the editor open and shows the correct first checkout screen',async t=>{
 for(const verified of [true,false])await t.test(verified?'verified':'unverified',async child=>{
  const {flow,button,sheet,notices}=fixture(child);
  let resolveAddress!:(response:Response)=>void,calls=0;
  globalThis.fetch=async input=>{
   if(String(input)==='/api/print/status')return Response.json(printStatus);
   calls++;return new Promise(resolve=>{resolveAddress=resolve;});
  };
  await flow.refresh();
  const opening=button.onclick({currentTarget:button});
  assert.equal(sheet(),undefined);
  assert.equal(button.disabled,true);assert.match(notices.at(-1)!,/Checking your saved address/);
  await button.onclick({currentTarget:button});
  assert.equal(calls,1);
  resolveAddress(Response.json({...address,verified}));await opening;
  assert.equal(sheet().open,true);assert.equal(button.disabled,true);
  assert.equal(sheet().querySelector('#print-title').textContent,verified?'Mail this postcard?':'where’s home?');
  assert.doesNotMatch(sheet().querySelector('[data-delivery-address]').innerHTML,/Checking your saved address|Try again/);
  sheet().querySelector('[data-cancel-print]').onclick();
  assert.equal(button.disabled,false);
  assert.equal(button.focused,true);
 });
});

test('a failed address lookup stays in the editor and can be retried',async t=>{
 const {flow,button,sheet,notices}=fixture(t);
 let resolveAddress!:(response:Response)=>void;
 globalThis.fetch=async input=>String(input)==='/api/print/status'?Response.json(printStatus):new Promise(resolve=>{resolveAddress=resolve;});
 await flow.refresh();
 const first=button.onclick({currentTarget:button});
 resolveAddress(Response.json({error:'Address lookup unavailable'},{status:503}));await first;
 assert.equal(sheet(),undefined);assert.equal(button.disabled,false);assert.equal(notices.at(-1),'Address lookup unavailable');
 const retry=button.onclick({currentTarget:button});
 resolveAddress(Response.json(address));await retry;
 assert.equal(sheet().querySelector('#print-title').textContent,'Mail this postcard?');
});

test('closing the postcard while its address loads prevents a late checkout dialog',async t=>{
 const {flow,button,sheet}=fixture(t);
 let resolveAddress!:(response:Response)=>void;
 globalThis.fetch=async input=>String(input)==='/api/print/status'?Response.json(printStatus):new Promise(resolve=>{resolveAddress=resolve;});
 await flow.refresh();
 const first=button.onclick({currentTarget:button});
 flow.close();
 resolveAddress(Response.json(address));await first;
 assert.equal(sheet(),undefined);
});
