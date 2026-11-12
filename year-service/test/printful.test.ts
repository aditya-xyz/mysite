import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {printfulCatalog,estimateMug} from '../src/printful.ts';
import type {PrintEnv,MailingAddress} from '../src/printing.ts';
const address:MailingAddress={line1:'123 Test St',line2:'Unit 2',city:'Portland',state:'OR',postalCode:'97201',country:'US'};
const configuration={style:'classic',size:'11oz',color:'white',font:'clean'};
test('Printful catalog and estimates fail closed and never create orders',async t=>{
 let unavailable=false,failed=false,broken=false,total=1424;
 const calls:{path:string;body:any}[]=[];
 const mocked=mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(String(init.body)):null;calls.push({path,body});
  assert.equal(new Headers(init.headers).get('Authorization'),'Bearer test-read-only');
  if(failed)return new Response('Provider failure containing private details',{status:401});
  if(path.startsWith('/mockup-generator/printfiles/'))return Response.json({result:{printfiles:[{printfile_id:43,width:2700,height:1050}],variant_printfiles:[1320,11051,17200,21352].map(id=>({variant_id:id,placements:{default:43}}))}});
  if(path.startsWith('/products/')){
   assert.equal(init.method,'GET');
   const id=Number(path.split('/').pop());
   const row=(id:number,size:string,color:string,in_stock=true,regions={US:'United States'})=>({id,size,color,in_stock,price:'6.07',availability_regions:regions});
   const variants=id===19?[row(1320,'11 oz','White',!unavailable),row(4830,'15 oz','White',false),row(16586,'20 oz','White'),row(99,'11 oz','White',true,{EU:'Europe'} as any)]:id===403?[row(11051,'11 oz','Black'),row(17200,'15 oz','Red'),row(100,'11 oz','Pink')]:[row(21352,'12 oz','White')];
   return Response.json({result:{variants}});
  }
  assert.equal(path,'/orders/estimate-costs');assert.equal(init.method,'POST');
  assert.deepEqual(body.recipient,{address1:address.line1,address2:address.line2,city:address.city,state_code:'OR',country_code:'US',zip:'97201'});
  assert.deepEqual(body.items,[{variant_id:1320,quantity:1}]);assert.equal(body.currency,'USD');
  return Response.json({result:{costs:{currency:broken?'EUR':'USD',subtotal:6.07,shipping:(total-715)/100,tax:1.08,vat:0,discount:0,total:total/100}}});
 });
 const env={PRINTFUL_ENABLED:'true',PRINTFUL_API_TOKEN:'test-read-only'} as PrintEnv;
 try{
  await t.test('filters sizes, colors, stock and US fulfillment while preserving valid tuples',async()=>{
   const catalog=await printfulCatalog(env);assert.equal(catalog.maxCents,2500);assert.equal(catalog.styles.length,3);
   assert.deepEqual(catalog.styles[0].sizes,['11oz']);assert.deepEqual(catalog.styles[0].variants.map(v=>v.id),[1320]);
   assert.equal(catalog.styles[1].variants.length,2);assert.deepEqual(catalog.styles[1].colors,['black','red']);
  });
  await t.test('includes shipping and tax, rounds floating point prices and checks the delivered cap',async()=>{
   let q=await estimateMug(env,configuration,address);assert.equal(q.totalCents,1424);assert.equal(q.shippingCents,709);assert.equal(q.taxCents,108);assert.equal(q.withinBudget,true);
   total=2500;assert.equal((await estimateMug(env,configuration,address)).withinBudget,true);
   total=2501;assert.equal((await estimateMug(env,configuration,address)).withinBudget,false);total=1424;
  });
  await t.test('rechecks availability and never estimates invalid or out-of-stock combinations',async()=>{
   const before=calls.filter(c=>c.body).length;unavailable=true;
   await assert.rejects(()=>estimateMug(env,configuration,address),/unavailable/);unavailable=false;
   await assert.rejects(()=>estimateMug(env,{...configuration,style:'color-inside',color:'red'},address),/unavailable/);
   await assert.rejects(()=>estimateMug(env,{...configuration,font:'injected'},address),/Choose an available/);
   assert.equal(calls.filter(c=>c.body).length,before);
  });
  await t.test('provider failures, missing credentials and invalid currencies never fall back to fake prices',async()=>{
   failed=true;await assert.rejects(()=>estimateMug(env,configuration,address),e=>e instanceof Error&&!e.message.includes('private details')&&e.message.includes('try again'));failed=false;
   broken=true;await assert.rejects(()=>estimateMug(env,configuration,address),/incomplete price/);broken=false;
   const before=calls.length;await assert.rejects(()=>printfulCatalog({...env,PRINTFUL_API_TOKEN:''}),/unavailable/);assert.equal(calls.length,before);
  });
  assert.ok(calls.every(c=>/^\/(products|mockup-generator\/printfiles)\/\d+$/.test(c.path)||c.path==='/orders/estimate-costs'));
 }finally{mocked.mock.restore();}
});
