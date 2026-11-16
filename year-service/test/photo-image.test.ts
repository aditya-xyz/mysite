import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser image loader.
import {loadViewerPhoto} from '../web/photo-image.js';
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
