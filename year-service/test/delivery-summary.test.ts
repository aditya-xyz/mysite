import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser UI helper is plain JavaScript.
import {createDeliveryAddress} from '../web/delivery-address.js';
test('saved US addresses can be edited in the existing prefilled form and canceled without a save',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({verified:true,country:'US',version:1,recipientName:'Example Friend',address:{line1:'123 Example Lane',city:'Portland',state:'OR',postalCode:'97201',country:'US'}});};
 try{
  const delivery=createDeliveryAddress();await delivery.load();
  assert.match(delivery.markup(),/data-address-edit>Edit address/);assert.doesNotMatch(delivery.markup(),/Contact mom or dad/);assert.equal(delivery.ready,true);
  const handlers:Record<string,()=>void>={};const root={querySelector:(selector:string)=>['[data-address-edit]','[data-address-cancel]'].includes(selector)?{addEventListener:(_event:string,handler:()=>void)=>handlers[selector]=handler}:null};
  delivery.bind(root);handlers['[data-address-edit]']();assert.equal(delivery.ready,false);assert.match(delivery.markup(),/value="123 Example Lane"/);assert.match(delivery.markup(),/Verify & review address/);assert.match(delivery.markup(),/Cancel edit/);await assert.rejects(()=>delivery.confirm(),/Verify and save/);
  handlers['[data-address-cancel]']();assert.equal(delivery.ready,true);assert.match(delivery.markup(),/Sending to/);assert.equal(calls,1,'Opening and canceling an edit does not use verification quota');
  const review=delivery.summaryMarkup({showNote:false});assert.match(review,/Sending to/);assert.doesNotMatch(review,/data-address-edit|Contact mom or dad/);delivery.destroy();
 }finally{globalThis.fetch=original;}
});
test('international saved addresses retain the existing admin-managed flow',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({verified:true,country:'IN',version:1,recipientName:'Example Friend',address:{line1:'Test',city:'Thane',state:'Maharashtra',postalCode:'400610',country:'IN'}});
 try{const delivery=createDeliveryAddress();await delivery.load();assert.doesNotMatch(delivery.markup(),/data-address-edit/);assert.match(delivery.markup(),/Contact mom or dad/);delivery.destroy();}finally{globalThis.fetch=original;}
});
