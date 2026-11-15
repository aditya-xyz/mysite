import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {estimateMug,printfulCatalog} from '../src/printful.ts';
import type {PrintEnv,MailingAddress} from '../src/printing.ts';

for(const country of ['IN','NL'] as const)test('Printful '+country+' uses destination-specific methods, state mapping and delivered costs without creating orders',async()=>{
 let available=true,currency='USD',total=1240,missingTax=false;
 const address:MailingAddress={country,line1:'Synthetic street 12 -2',line2:'Unit 3',city:country==='IN'?'Pune':'Amsterdam',state:country==='IN'?'Maharashtra':'',postalCode:country==='IN'?'411001':'1234 AB'};
 const configuration={style:'classic',size:'11oz',color:'white',font:'clean'},calls:{path:string;body:any}[]=[];
 const fetch=mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(String(init.body)):null;calls.push({path,body});
  if(path==='/products')return Response.json({result:[{id:19,type:'MUG',title:'Classic'}]});
  if(path==='/products/19')return Response.json({result:{variants:[{id:990,size:'11 oz',color:'White',in_stock:true,price:'6.07',availability_regions:{EU:'Europe'}}]}});
  if(path==='/mockup-generator/printfiles/19')return Response.json({result:{printfiles:[],variant_printfiles:[]}});
  assert.ok(['/shipping/rates','/orders/estimate-costs'].includes(path));
  assert.equal(body.recipient.country_code,country);assert.equal(body.recipient.zip,address.postalCode);assert.equal(body.recipient.address1,address.line1);
  assert.equal(body.recipient.state_code,undefined);assert.equal(body.recipient.state_name,country==='IN'?'Maharashtra':undefined);
  assert.deepEqual(body.items,[{variant_id:990,quantity:1}]);
  if(path==='/shipping/rates')return Response.json({result:available?[{id:'INTERNATIONAL_STANDARD',rate:'4.18',currency:'USD'}]:[]});
  assert.equal(body.shipping,'INTERNATIONAL_STANDARD');
  return Response.json({result:{costs:{currency,subtotal:'6.07',shipping:(total-822)/100,...(missingTax?{}:{tax:0}),vat:'2.15',discount:0,total:total/100}}});
 });
 const env={PRINTFUL_ENABLED:'true',PRINTFUL_API_TOKEN:'synthetic-international-'+country} as PrintEnv;
 try{
  const catalog=await printfulCatalog(env,false,country);assert.equal(catalog.requiresDestinationEstimate,true);assert.equal(catalog.shippingReserveCents,0);assert.equal(catalog.styles[0].variants[0].id,990,'EU fulfillment is not filtered out by a US-only rule');
  const quote=await estimateMug(env,configuration,address);assert.equal(quote.totalCents,1240);assert.equal(quote.taxCents,215);assert.equal(quote.destination,country);assert.equal(quote.shippingMethod,'INTERNATIONAL_STANDARD');assert.equal(quote.withinBudget,true);
  total=2501;assert.equal((await estimateMug(env,configuration,address)).withinBudget,false);total=1240;
  available=false;const before=calls.filter(c=>c.path==='/orders/estimate-costs').length;await assert.rejects(()=>estimateMug(env,configuration,address),/cannot currently ship/);assert.equal(calls.filter(c=>c.path==='/orders/estimate-costs').length,before);available=true;
  currency='EUR';await assert.rejects(()=>estimateMug(env,configuration,address),/incomplete price/);currency='USD';
  missingTax=true;await assert.rejects(()=>estimateMug(env,configuration,address),/incomplete price/);
  assert.ok(calls.every(c=>c.path!=='/orders'&&!/confirm|payment/.test(c.path)));
 }finally{fetch.mock.restore();}
});
