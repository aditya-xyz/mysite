import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The browser helper is intentionally plain JavaScript.
import {photoUploadError,bindPhotoDropzone} from '../admin/client/photo-upload.js';

test('photo selection validates the entire batch before any upload starts',()=>{
  const jpeg=new File(['original bytes'],'photo.jpg',{type:'image/jpeg'});
  const heic=new File(['heic'],'phone.heic',{type:'image/heic'});
  assert.match(photoUploadError([jpeg,heic]),/HEIC/);
  assert.match(photoUploadError([new File(['text'],'renamed.jpg',{type:'text/plain'})]),/not supported/);
  assert.match(photoUploadError([new File([],'empty.png',{type:'image/png'})]),/empty/);
  assert.match(photoUploadError([]),/Folders/);
});
test('file-manager selections accept supported photos without changing their original bytes',async()=>{
  const bytes=new Uint8Array([255,216,255,225,69,88,73,70]);
  const files=[new File([bytes],'camera.JPG'),new File(['png'],'photo.png',{type:'image/png'}),new File(['webp'],'photo.webp',{type:'image/webp'})];
  assert.equal(photoUploadError(files), '');
  assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()),bytes);
  assert.equal(files[0].name,'camera.JPG');
});
test('size and scrapbook limits are checked for dropped batches',()=>{
  const file=new File(['jpeg'],'photo.jpg',{type:'image/jpeg'});
  assert.equal(photoUploadError([file],299),'');
  assert.match(photoUploadError([file,file],299),/300 photos/);
  assert.match(photoUploadError([{name:'large.jpg',type:'image/jpeg',size:25*1024*1024+1}]),/25 MB/);
});

// Exercise browser EventTarget semantics with file-manager data, without production UI or media.
class DropArea extends EventTarget {
  states=new Set<string>();
  classList={add:(name:string)=>this.states.add(name),remove:(name:string)=>this.states.delete(name)};
}
function dragEvent(type:string,files:File[],items:unknown[]=[],types=['Files']){
  const event=new Event(type,{cancelable:true,bubbles:true});
  const dataTransfer={files,items,types,dropEffect:'none'};
  Object.defineProperty(event,'dataTransfer',{value:dataTransfer});
  return {event,dataTransfer};
}
test('file drops pass every original File to the uploader and clear the drag highlight',async()=>{
  const zone=new DropArea(),files=[new File(['a'],'a.jpg'),new File(['b'],'b.jpg')];let received:File[]=[];
  bindPhotoDropzone(zone,{isBusy:()=>false,onFiles:(value:File[])=>{received=value;},onError:()=>assert.fail('Valid files should not be rejected')});
  zone.dispatchEvent(dragEvent('dragenter',files).event);assert.ok(zone.states.has('is-dragging'));
  const over=dragEvent('dragover',files);zone.dispatchEvent(over.event);assert.equal(over.dataTransfer.dropEffect,'copy');assert.ok(over.event.defaultPrevented);
  const drop=dragEvent('drop',files);zone.dispatchEvent(drop.event);
  assert.deepEqual(received,files);assert.equal(received[0],files[0]);assert.ok(drop.event.defaultPrevented);assert.ok(!zone.states.has('is-dragging'));
});
test('busy uploads and folders cannot enqueue another upload; text drags are ignored',async()=>{
  const zone=new DropArea(),file=new File(['photo'],'photo.jpg');let busy=true,uploads=0,error='';
  bindPhotoDropzone(zone,{isBusy:()=>busy,onFiles:()=>uploads++,onError:(message:string)=>{error=message;}});
  zone.dispatchEvent(dragEvent('drop',[file]).event);assert.equal(uploads,0);assert.match(error,/Wait/);
  busy=false;zone.dispatchEvent(dragEvent('drop',[file],[{webkitGetAsEntry:()=>({isDirectory:true})}]).event);
  assert.equal(uploads,0);assert.match(error,/rather than folders/);
  const text=dragEvent('drop',[],[],['text/plain']);zone.dispatchEvent(text.event);assert.equal(text.event.defaultPrevented,false);assert.equal(uploads,0);
});
