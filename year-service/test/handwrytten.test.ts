import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {handwryttenStatus,prepareHandwryttenCard,prepareHandwryttenFoldedCard,handwryttenArtPlacement} from '../src/handwrytten.ts';
test('Handwrytten diagnostics and preview preparation require test mode and never submit orders or payment',async()=>{
 let testMode=0;const calls:string[]=[];
 const mocked=mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname;calls.push(path);assert.equal(new Headers(init.headers).get('Authorization'),'private-test-key');
  if(path.endsWith('/checkauth/auth'))return Response.json({status:'ok',test_mode:testMode,login:'private@example.test'});
  if(path.endsWith('/design/dimensions'))return Response.json({status:'ok',dimensions:[{id:2,orientation:'portrait',format:'flat',open_width:'5.000',open_height:'7.000'}]});
  if(path.endsWith('/uploadCustomLogo')){assert.ok(init.body instanceof FormData);return Response.json({status:'ok',id:123});}
  if(path.endsWith('/checkUploadedCustomLogo')){assert.ok(init.body instanceof FormData);assert.ok(init.body.get('file') instanceof File);return Response.json({status:'ok'});}
  assert.equal(path,'/v2/cards/createCustomCard');assert.equal(JSON.parse(String(init.body)).dimension_id,2);return Response.json({status:'ok',card_id:456});
 });
 try{
  const env={HANDWRYTTEN_API_KEY:'private-test-key'},image=new File([new Uint8Array([255,216,255,192,0,11,8,8,52,5,220,1,1,17,0,255,217])],'synthetic.jpg',{type:'image/jpeg'});
  assert.equal((await handwryttenStatus({})).connected,false);
  assert.equal('login' in await handwryttenStatus(env),false);
  await assert.rejects(()=>prepareHandwryttenCard(env,image,'Synthetic test'),/Test Mode/);assert.equal(calls.some(p=>p.includes('/cards/')),false);
  testMode=1;assert.deepEqual(await prepareHandwryttenCard(env,image,'Synthetic test'),{prepared:true,cardId:456,dimensionId:2,testMode:true,submitted:false});
  assert.ok(calls.every(p=>!p.includes('/orders/')&&!p.includes('/basket/')&&!p.includes('/payment')));
 }finally{mocked.mock.restore();}
});

test('folded picture placements use approved maximum sizes and design-only requests',async()=>{
 const calls:string[]=[];let body:any,imageId=10;
 const fake=mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path.endsWith('/checkauth/auth'))return Response.json({status:'ok',test_mode:1});
  if(path.endsWith('/design/dimensions'))return Response.json({status:'ok',dimensions:[{id:4,orientation:'portrait',format:'folded'}]});
  if(path.endsWith('/fonts/list'))return Response.json({status:'ok',fonts:[{id:'hwMadeline'}]});
  if(path.endsWith('/uploadCustomLogo'))return Response.json({status:'ok',id:++imageId});
  if(path.endsWith('/createCustomCard')){body=JSON.parse(String(init.body));return Response.json({status:'ok',card_id:123});}
  assert.equal(path,'/v2/cards/view');return Response.json({status:'ok',card:{images:Object.fromEntries(['front','inside','back'].map(side=>[side,[{image:'https://d3e924qpzqov0g.cloudfront.net/cardimages/customCards/test-'+side+'.png'}]]))}});
 });
 try{const image=new File(['test'],'test.jpg',{type:'image/jpeg'});await prepareHandwryttenFoldedCard({HANDWRYTTEN_API_KEY:'fake'},{name:'Measured frame',front:image,inside:image,back:image,onBack:async()=>{},onCard:async()=>{}});assert.deepEqual(handwryttenArtPlacement,{cover:100,inside:100});assert.equal(body.cover_size_percent,100);assert.equal(body.main_logo_size_percent,100);assert.equal(body.back_size_percent,40);assert.ok(calls.every(path=>!path.includes('/orders/')&&!path.includes('/basket/')));}finally{fake.mock.restore();}
});
