import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser UI helper is plain JavaScript.
import {createPrintFlow} from '../web/print-flow.js';
test('keepsake review opens from preloaded data but rechecks permissions before saving',async()=>{
 const originalFetch=globalThis.fetch,originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 const calls:string[]=[];let allowed=true,sheet:any;
 const address={verified:true,version:1,recipientName:'Example Friend',address:{line1:'123 Example Lane',city:'Portland',state:'OR',postalCode:'97201',country:'US'}};
 globalThis.fetch=async(input:any)=>{const path=String(input);calls.push(path);return Response.json(path==='/api/print/status'?{eligible:allowed,mode:'simulation',contentVersion:1,addressVersion:1,confirmationKey:'test'}:address);};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{body:{append(node:any){node.isConnected=true;}},createElement(){
  const nodes=new Map(),events=new Map();
  sheet={open:false,isConnected:false,innerHTML:'',setAttribute(){},querySelector(selector:string){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',disabled:false,focus(){},querySelector(){return null;}});return nodes.get(selector);},addEventListener(name:string,handler:any){events.set(name,handler);},showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},remove(){this.isConnected=false;}};return sheet;
 }}});
 try{
  const flow=createPrintFlow({getData:()=>({file:new File(['proof'],'proof.jpg',{type:'image/jpeg'}),cardCount:1,recipe:{}}),onChange(){}});
  await flow.refresh();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(p=>p==='/api/delivery-address').length,1);
  const before=calls.length,button:any={};flow.bind({querySelector:()=>button});
  const opened=button.onclick();assert.equal(sheet.open,true,'review opens synchronously');await opened;
  assert.equal(calls.length,before,'opening adds no network round trip');
  assert.match(sheet.querySelector('[data-delivery-address]').innerHTML,/Example Friend/);
  allowed=false;await sheet.querySelector('[data-submit-print]').onclick();
  assert.ok(calls.includes('/api/delivery-address/confirm'));
  assert.ok(calls.filter(p=>p==='/api/print/status').length>1);
  assert.ok(!calls.includes('/api/print/orders'),'revoked permission prevents saving');
  assert.match(sheet.querySelector('.ks-status').textContent,/permissions or scrapbook changed/);
  flow.close();
 }finally{globalThis.fetch=originalFetch;if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else delete (globalThis as any).document;}
});
