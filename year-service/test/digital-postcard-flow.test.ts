import {test,mock} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Browser task dialog.
import {createDigitalFlow} from '../web/digital-postcard-flow.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('digital confirmation can cancel, then locks default once and preserves direct share gestures',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let dialog:any,posts=0,downloads=0,shares=0,rejectClaim=false,releasePost:undefined|(()=>void);
 const context={measureText(v:string){return {width:v.length*10};},fillRect(){},drawImage(){},fillText(){}};
 const node=()=>({disabled:false,textContent:'',onclick:null as any,focus(){}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{fonts:{async load(){}},body:{append(){}},createElement(tag:string){if(tag==='canvas')return {width:0,height:0,getContext(){return context;},toBlob(callback:any){callback(new Blob(['JPEG'],{type:'image/jpeg'}));}};if(tag==='a')return {click(){downloads++;},remove(){}};const nodes=new Map(),cancels=[node(),node()],events:any={};dialog={open:false,innerHTML:'',setAttribute(){},querySelector(s:string){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll(){return cancels;},addEventListener(type:string,handler:any){events[type]=handler;},events,showModal(){this.open=true;},close(){this.open=false;},remove(){}};dialog.cancels=cancels;return dialog;}}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare(){return true;},async share(){shares++;}}});
 const base={eligible:true,claimed:false,personalized:false,note:'Full note',authors:'Pixel',contentVersion:1,defaultRevision:'revision',defaultSrc:'/default/'};
 const fetch=mock.method(globalThis,'fetch',async(path:any,init?:RequestInit)=>{
  if(path==='/api/print/digital/prepare'){
   assert.equal(JSON.parse(String(init?.body)).confirmed,true);
   return Response.json({note:base.note,contentVersion:base.contentVersion,defaultRevision:base.defaultRevision});
  }
  if(path==='/api/print/digital'&&init?.method==='POST'){
   posts++;const recipe=JSON.parse(String((init.body as FormData).get('recipe')));
   assert.equal(recipe.confirmed,true);
   await new Promise<void>(resolve=>releasePost=resolve);
   if(rejectClaim)return Response.json({error:'Your mailed postcard is already reserved.'},{status:409});
   return Response.json({...base,claimed:true,frame:'winterlight',artworkSrc:'/saved.jpg'});
  }
  if(path==='/saved.jpg')return new Response('Saved JPG',{headers:{'Content-Type':'image/jpeg'}});
  return Response.json({...base,note:undefined});
 });
 const image={width:1200,height:1500};const flow=createDigitalFlow({journal:{year:2026,name:'Household',householdSize:1},getData:()=>({frame:'winterlight',background:'/winterlight.png',images:[],crops:[],photoIds:[],cropMap:{}}),loadImage:async()=>image,onChange(){},onSaved(){}});
 try{await flow.refresh();let action=flow.requestCopy(false);await settle();assert.ok(dialog.open);assert.match(dialog.innerHTML,/paperless fan club/);assert.match(dialog.innerHTML,/skip mailing a postcard to your household/);assert.match(dialog.innerHTML,/Save digital postcard/);assert.doesNotMatch(dialog.innerHTML,/cannot be undone|ks-household-note|unclaimed-postcard/);assert.equal(posts,0);dialog.cancels[0].onclick();await action;assert.equal(downloads,0);assert.equal(posts,0);
 action=flow.requestCopy(false);await settle();const committing=dialog.querySelector('[data-confirm]').onclick();await settle();dialog.events.cancel({preventDefault(){}});assert.equal(dialog.open,true,'Escape cannot appear to cancel a permanent choice while it is saving');releasePost!();await committing;await action;assert.equal(posts,1);assert.equal(downloads,1);await flow.requestCopy(false);assert.equal(posts,1);assert.equal(downloads,2);const sharing=flow.requestCopy(true);assert.equal(shares,1,'The native share API runs directly in the click gesture, before an await');await sharing;

 const beforeMobileDownloads=downloads;
 const notices:string[]=[];
 const mobile=createDigitalFlow({journal:{year:2026,name:'Household',householdSize:1},getData:()=>({frame:'winterlight',background:'/winterlight.png',images:[],crops:[],photoIds:[],cropMap:{}}),loadImage:async()=>image,onChange(){},onSaved(_state:any,message:string){if(message)notices.push(message);}});
 try{
  await mobile.refresh();const firstTap=mobile.requestCopy(true);await settle();
  const confirm=dialog.querySelector('[data-confirm]');
  rejectClaim=true;
  const rejected=confirm.onclick();
  assert.equal(shares,1,'Confirmation keeps native Share closed before the claim succeeds');
  await settle();releasePost!();await rejected;
  assert.equal(mobile.claimed(),false);
  assert.equal(dialog.open,true);
  assert.equal(confirm.disabled,false);
  assert.match(dialog.querySelector('.ks-status').textContent,/mailed postcard is already reserved/);
  assert.equal(shares,1);assert.equal(downloads,beforeMobileDownloads);
  rejectClaim=false;
  const retry=confirm.onclick();
  await settle();releasePost!();await retry;await firstTap;
  assert.equal(downloads,beforeMobileDownloads,'Mobile confirmation must never start a file download');assert.equal(shares,1);
  const nextTap=mobile.requestCopy(true);assert.equal(shares,2,'The next tap opens native sharing synchronously with the complete JPG');await nextTap;
  const shareFailure=mock.method(navigator as any,'share',async()=>{throw new Error('Native share failed');});await mobile.requestCopy(true);assert.match(notices.at(-1)!,/Tap Share to try again/);assert.equal(downloads,beforeMobileDownloads);shareFailure.mock.restore();
  const unsupported=mock.method(navigator as any,'canShare',()=>false);await mobile.requestCopy(true);assert.match(notices.at(-1)!,/isn’t available/);assert.equal(downloads,beforeMobileDownloads,'Unsupported mobile sharing must not silently download');unsupported.mock.restore();
 }finally{mobile.close();}
 }finally{flow.close();fetch.mock.restore();if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else delete(globalThis as any).document;if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);}
});
