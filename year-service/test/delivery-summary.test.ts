import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser UI helper is plain JavaScript.
import {createDeliveryAddress} from '../web/delivery-address.js';
test('review summaries can omit repeated contact instructions while the address step keeps them',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({verified:true,version:1,recipientName:'Example Friend',address:{line1:'123 Example Lane',city:'Portland',state:'OR',postalCode:'97201',country:'US'}});
 try{
  const delivery=createDeliveryAddress();await delivery.load();
  assert.match(delivery.markup(),/Contact mom or dad/);
  const review=delivery.summaryMarkup({showNote:false});assert.match(review,/Sending to/);assert.match(review,/Example Friend/);assert.match(review,/123 Example Lane/);assert.doesNotMatch(review,/Contact mom or dad/);
  delivery.destroy();
 }finally{globalThis.fetch=original;}
});
