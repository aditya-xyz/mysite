import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The browser helper is intentionally plain JavaScript.
import {photoUploadError,uploadPhoto,findUploadedPhoto,fingerprintPhoto,addPhotoToDraft,bindPhotoDropzone} from '../admin/client/photo-upload.js';

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
  for(const size of [25*1024*1024+1,99_999_999])assert.equal(photoUploadError([{name:'large.jpg',type:'image/jpeg',size}]),'');
  for(const size of [100_000_000,100_000_001])assert.match(photoUploadError([{name:'large.jpg',type:'image/jpeg',size}]),/smaller than 100 MB/);
});
test('chunk uploader preserves bytes, reports progress, and sends previews separately',async()=>{
  const file=new File([new Uint8Array([255,216,255,225,69,88,73,70,1,2,3,4])],'original.JPG');
  const preview=new Blob(['grid']),viewer=new Blob(['viewer']),chunks:Blob[]=[],progress:number[]=[];
  const result=await uploadPhoto(file,{preview,viewer},async(path:string,data:unknown)=>{
    if(path==='uploads'){
      assert.match((data as {id:string}).id,/^photo-[a-f0-9]{24}$/);
      assert.deepEqual({...data as object,id:undefined},{id:undefined,filename:'original.JPG',mime:'image/jpeg',bytes:12});
      return {id:'test-photo',chunkBytes:5};
    }
    if(path.endsWith('/complete')){
      assert.ok(data instanceof FormData);assert.equal(data.get('original'),null);
      assert.equal(await (data.get('preview') as File).text(),'grid');
      assert.equal(await (data.get('viewer') as File).text(),'viewer');
      return {id:'done'};
    }
    assert.equal(path,`uploads/test-photo/parts/${chunks.length+1}`);assert.ok(data instanceof Blob);chunks.push(data);return {};
  },(value:number)=>progress.push(value));
  assert.deepEqual(new Uint8Array(await new Blob(chunks).arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
  assert.deepEqual(chunks.map(c=>c.size),[5,5,2]);assert.deepEqual(progress,[42,83,100]);assert.equal(result.id,'done');
});
test('chunk failure aborts only the unfinished upload and preserves the original error',async()=>{
  const paths:string[]=[],failure=new Error('Connection lost');
  await assert.rejects(()=>uploadPhoto(new File(['photo'],'photo.jpg'),{preview:new Blob(),viewer:new Blob()},async(path:string)=>{
    paths.push(path);if(path==='uploads')return {id:'unfinished',chunkBytes:5};
    throw failure;
  }),error=>error===failure);
  assert.deepEqual(paths,['uploads','uploads/unfinished/parts/1','uploads/unfinished/abort']);
});
test('matching original bytes reuse existing media without creating an upload',async()=>{
  const file=new File(['same original bytes'],'renamed.jpg',{type:'image/jpeg'}),hash=await fingerprintPhoto(file);
  const paths:string[]=[];
  const result=await findUploadedPhoto(file,async(path:string,data:{hash:string;bytes:number})=>{paths.push(path);assert.equal(data.hash,hash);assert.equal(data.bytes,file.size);return {media:{id:'existing'},candidates:[]};},()=>assert.fail('Known fingerprints do not download originals'));
  assert.equal(result.media.id,'existing');assert.deepEqual(paths,['media/lookup']);
});
test('older media is checked byte-for-byte, and equal filenames and sizes cannot reuse different contents',async()=>{
  const file=new File(['photo-A'],'same.jpg'),different=new Blob(['photo-B']),matching=new Blob(['photo-A']);const checked:string[]=[];
  const result=await findUploadedPhoto(file,async(path:string,data:unknown)=>{
    if(path==='media/lookup')return {media:null,candidates:[{id:'different'},{id:'matching'}]};
    checked.push(path);return {media:{id:path.includes('matching')?'matching':'different'}};
  },async(path:string)=>path.includes('different')?different:matching);
  assert.equal(result.media.id,'matching');assert.deepEqual(checked,['media/different/fingerprint','media/matching/fingerprint']);
  const draft={photos:[{id:'matching',caption:'Keep this caption',alt:'Accessible description',recipients:['person-1']}]};
  assert.equal(addPhotoToDraft(draft,{id:'matching'}),false);assert.equal(draft.photos[0].caption,'Keep this caption');
  draft.photos=[];
  assert.equal(addPhotoToDraft(draft,{id:'matching',draftPhoto:{caption:'Restored',alt:'Description',recipients:['person-1']}}),true);
  assert.deepEqual(draft.photos[0],{id:'matching',caption:'Restored',alt:'Description',recipients:['person-1']});
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
