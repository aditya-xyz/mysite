import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser helpers are intentionally plain JavaScript.
import {selectedItems,setPhotosHidden,removeDraftPhotos,deleteSelectedMedia} from '../admin/client/photo-bulk.js';

test('bulk visibility changes only selected photos and preserves order, assignments and captions',()=>{
  const photos=[{id:'a',caption:'A',recipients:['one'],hidden:false},{id:'b',caption:'B',recipients:[],hidden:true},{id:'c',caption:'C',recipients:['two']}];
  const selection=new Set(['a','b','stale']);
  assert.equal(setPhotosHidden(photos,selection,true),1);
  assert.deepEqual(photos.map(p=>p.id),['a','b','c']);
  assert.deepEqual(photos[0],{id:'a',caption:'A',recipients:['one'],hidden:true});
  assert.equal(photos[2].hidden,undefined);
  assert.equal(setPhotosHidden(photos,selection,false),2);
  assert.deepEqual(photos.map(p=>p.hidden),[false,false,undefined]);
});
test('bulk removal retains independent metadata snapshots for restoring from the library',()=>{
  const original={id:'b',caption:'Keep me',alt:'B',audience:'personal',recipients:['one'],hidden:true};
  const draft={photos:[{id:'a'},original,{id:'c'}],note:'unchanged'};
  const removed=removeDraftPhotos(draft,new Set(['b','missing']));
  assert.deepEqual(draft.photos,[{id:'a'},{id:'c'}]);assert.equal(draft.note,'unchanged');
  assert.deepEqual(removed,[original]);original.recipients.push('two');assert.deepEqual(removed[0].recipients,['one']);
});
test('selecting within a filtered view never expands to out-of-view or stale IDs',()=>{
  assert.deepEqual(selectedItems([{id:'visible'}],new Set(['visible','hidden','stale'])),[{id:'visible'}]);
});
test('bulk deletion preserves blocked items, continues independent requests, and retries only failures',async()=>{
  const items=[{id:'a',filename:'a.jpg'},{id:'protected',filename:'b.jpg'},{id:'c',filename:'c.jpg'}];
  const calls:string[]=[],progress:any[]=[];
  const result=await deleteSelectedMedia(items,async(id:string)=>{calls.push(id);if(id==='protected')throw new Error('Still published');},(p:unknown)=>progress.push(p));
  assert.deepEqual(calls,['a','protected','c']);assert.deepEqual(result.deleted,['a','c']);
  assert.deepEqual(result.failed,[{id:'protected',filename:'b.jpg',message:'Still published'}]);
  assert.deepEqual(progress.at(-1),{completed:3,total:3,deleted:2,failed:1});
  const retried:string[]=[];await deleteSelectedMedia(result.failed,async(id:string)=>{retried.push(id);});
  assert.deepEqual(retried,['protected']);
});
