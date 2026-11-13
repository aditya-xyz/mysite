import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {handwryttenCheckoutQuote} from '../src/handwrytten.ts';
test('checkout pricing preview is complete, exact in cents, Test Mode only and never touches orders or payment',async()=>{
 let mode=1,senders:any[]=[{id:17,default:true,country_id:1,name:'Synthetic sender',address1:'123 Example Lane',city:'Portland',state:'OR',zip:'97201'}],quantity=1;
 let prices:any={card_price:'3.75',postage_price:0.82,shipping_price:0,insert_price:0,bundle_price:0,without_tax:4.57,tax:0.29,total:4.86};
 const calls:{path:string;body:any}[]=[];
 const fetch=mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(String(init.body)):null;calls.push({path,body});
  assert.equal(new Headers(init.headers).get('Authorization'),'synthetic-key');
  if(path==='/v2/checkauth/auth')return Response.json({status:'ok',test_mode:mode});
  if(path==='/v2/profile/listAddresses')return Response.json({status:'OK',addresses:senders});
  assert.equal(path,'/v2/outbound/process','Only the documented quote endpoint may be posted');assert.equal(init.method,'POST');
  assert.deepEqual(body,{card_id:42,country:'United States',message:'Synthetic note\n\nWith love, Pixel',records:1,return_address_id:17,shipping_method_id:1});
  return Response.json({status:'ok',quantity,prices});
 });
 const env={HANDWRYTTEN_API_KEY:'synthetic-key'},input={cardId:42,message:'Synthetic note\n\nWith love, Pixel'};
 try{
  const quote=await handwryttenCheckoutQuote(env,input);assert.deepEqual(quote.amounts,{card:375,postage:82,tax:29,shipping:0,inserts:0,bundles:0,subtotal:457,total:486});assert.equal(quote.submitted,false);assert.equal(quote.currency,'USD');assert.equal(quote.quantity,1);
  senders[0].default=false;assert.equal((await handwryttenCheckoutQuote(env,input)).sender.id,17,'A sole saved sender is unambiguous even when Handwrytten omits its default flag');
  const good={...prices};delete prices.tax;await assert.rejects(()=>handwryttenCheckoutQuote(env,input),/incomplete/);
  prices={...good,total:4.87};await assert.rejects(()=>handwryttenCheckoutQuote(env,input),/inconsistent/);
  prices={...good,tax:-1};await assert.rejects(()=>handwryttenCheckoutQuote(env,input),/incomplete/);
  prices={...good,total:'NaN'};await assert.rejects(()=>handwryttenCheckoutQuote(env,input),/incomplete/);
  prices=good;quantity=2;await assert.rejects(()=>handwryttenCheckoutQuote(env,input),/quantity/);quantity=1;
  senders=[];await assert.rejects(()=>handwryttenCheckoutQuote(env,input),/return address/);
  mode=0;const before=calls.length;await assert.rejects(()=>handwryttenCheckoutQuote(env,input),/Test Mode/);assert.equal(calls.length,before+1);
  assert.ok(calls.every(c=>!/(orders|basket|payment|addToBasket)/.test(c.path)));
 }finally{fetch.mock.restore();}
});
