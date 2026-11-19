import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser image loader.
import {loadViewerPhoto,photoThumbnail} from '../web/photo-image.js';
// @ts-expect-error Browser display cache.
import {createSessionImages} from '../web/session-images.js';
test('only the final viewing image is revealed after decoding',async()=>{
 let resolve!:()=>void;const image={src:'',naturalWidth:1600,naturalHeight:1200,decode:()=>new Promise<void>(r=>resolve=r)},shown:any[]=[];
 const pending=loadViewerPhoto({src:'/thumbnail',viewerSrc:'/viewer'},{createImage:()=>image,isCurrent:()=>true,reveal:(...args:any[])=>shown.push(args),fail:()=>assert.fail()});
 assert.equal(image.src,'/viewer');assert.deepEqual(shown,[]);resolve();await pending;assert.deepEqual(shown,[['/viewer',1600,1200]]);
});
test('navigation discards a late image and errors never fall back to the thumbnail',async()=>{
 let resolve!:()=>void,current=true;let shown=0,errors=0;
 const pending=loadViewerPhoto({src:'/small',viewerSrc:'/large'},{createImage:()=>({decode:()=>new Promise<void>(r=>resolve=r)}),isCurrent:()=>current,reveal:()=>shown++,fail:()=>errors++});
 current=false;resolve();await pending;assert.equal(shown,0);
 const image={src:'',decode:async()=>{throw Error('offline')}};
 await loadViewerPhoto({src:'/small',viewerSrc:'/large'},{createImage:()=>image,isCurrent:()=>true,reveal:()=>shown++,fail:()=>errors++});assert.equal(image.src,'/large');assert.equal(errors,1);assert.equal(shown,0);
});
test('opening and preloading older gallery photos skip evicted thumbnails and decode the viewer rendition',async()=>{
 const cache=createSessionImages({maxEntries:1,fetchBlob:async()=>new Blob(['photo'])});
 const photos=[{src:'/first',viewerSrc:'/first-viewer'},{src:'/second',viewerSrc:'/second-viewer'}];
 cache.configure('gallery',[...photos.flatMap(photo=>[photo.src,photo.viewerSrc]),'/recent'],Date.now()/1000+60);
 try{
  const thumbnails:{src:string;complete:boolean;naturalWidth:number;naturalHeight:number}[]=[];
  for(const photo of photos)thumbnails.push({src:await cache.url(photo.src),complete:true,naturalWidth:300,naturalHeight:200});
  assert.equal(photoThumbnail(thumbnails[1],cache.isUsableURL)?.src,thumbnails[1].src);
  await cache.url('/recent');
  const shown:{source:string;fresh:boolean}[]=[];
  for(const [index,photo] of photos.entries()){
   assert.equal(photoThumbnail(thumbnails[index],cache.isUsableURL),null);
   await loadViewerPhoto(photo,{
    resolveSource:cache.url,isUsableURL:cache.isUsableURL,isCurrent:()=>true,
    createImage:()=>({src:'',naturalWidth:1600,naturalHeight:1200,decode:async()=>{}}),
    reveal:(source:string)=>shown.push({source,fresh:cache.isUsableURL(source)}),fail:()=>assert.fail()
   });
  }
  assert.equal(shown.length,2);
  assert.ok(shown.every(({source,fresh})=>fresh&&thumbnails.every(thumb=>thumb.src!==source)));
  assert.equal(cache.stats().entries,1);
 }finally{cache.clear();}
});
test('viewer decode retries via its original URL if eviction occurs during decode',async()=>{
 let usable=true;const attempts:string[]=[],shown:string[]=[];
 const image={src:'',naturalWidth:1600,naturalHeight:1200,async decode(){attempts.push(this.src);if(this.src==='blob:cached'){usable=false;throw Error('Revoked');}}};
 await loadViewerPhoto({src:'/grid',viewerSrc:'/viewer'},{resolveSource:async()=>'blob:cached',isUsableURL:(src:string)=>src!=='blob:cached'||usable,createImage:()=>image,isCurrent:()=>true,reveal:(src:string)=>shown.push(src),fail:()=>assert.fail()});
 assert.deepEqual(attempts,['blob:cached','/viewer']);
 assert.deepEqual(shown,['/viewer']);
});
