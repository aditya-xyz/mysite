import {curatedMugChange,curatedMugIds} from '../src/mug-catalog.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser helper is plain JavaScript.
import {addMugPhoto} from '../admin/client/mug-editor.js';
// @ts-expect-error Browser presentation helper is plain JavaScript.
import {hasMugChoices,giftMarkup,assetPath} from '../web/pixelbook.js';

test('adding a mug photo never assigns it to the scrapbook gallery and reselecting preserves captions',()=>{
 const gallery={id:'gallery',alt:'A real description',recipients:['friend']};
 const state:any={draft:{photos:[gallery]}};
 assert.equal(addMugPhoto(state,{id:'mug'}),true);
 assert.deepEqual(state.draft.photos,[gallery]);assert.equal(state.draft.mugDesigns[0].id,'mug');
 state.draft.mugDesigns[0].caption='Keep this';assert.equal(addMugPhoto(state,{id:'mug'}),false);assert.equal(state.draft.mugDesigns[0].caption,'Keep this');
 assert.equal(addMugPhoto(state,{id:'gallery'}),true);assert.equal(state.draft.mugDesigns[1].alt,gallery.alt);assert.deepEqual(gallery.recipients,['friend']);
});
test('the guest section requires four distinct usable photo choices, independently of personal photos',()=>{
 const designs=Array.from({length:4},(_,i)=>({id:'mug-'+i,src:'/api/mugs/mug-'+i,caption:''}));
 const journal={name:'Household',photos:[],gift:{enabled:true,designs:designs.slice(0,3)}};
 assert.equal(hasMugChoices(journal),false);assert.equal(giftMarkup(journal),'');
 journal.gift.designs=designs;assert.equal(hasMugChoices(journal),true);assert.match(giftMarkup(journal),/pick your mugshot/);
 journal.gift.designs=[designs[0],designs[0],designs[1],designs[2]];assert.equal(hasMugChoices(journal),false);
 journal.gift.designs=designs;journal.gift.enabled=false;assert.equal(hasMugChoices(journal),false);
});

test('version-pinned mug URLs remain usable and stay on this origin',()=>{
 const src='/api/mugs/photo?version='+'a'.repeat(32);assert.equal(assetPath(src),src);
 assert.equal(hasMugChoices({gift:{enabled:true,designs:Array.from({length:4},(_,i)=>({id:String(i),src}))}}),true);
 for(const value of ['//evil.test/photo','https://evil.test/photo','/api/mugs/photo?redirect=https://evil.test','/api/mugs/photo?version=oops'])assert.equal(assetPath(value),'');
});

test('curated artwork stays fixed while captions can change',()=>{
 const current=curatedMugIds.map(id=>({id,caption:'Original',alt:'A photo',cutoutVersion:'a'.repeat(32)}));
 assert.equal(curatedMugChange(current,current.map(d=>({...d,caption:'New caption'}))),false);
 assert.equal(curatedMugChange(current,current.slice(1)),true);
 assert.equal(curatedMugChange(current,[...current].reverse()),false);
 assert.equal(curatedMugChange(current,[current[0],...current.slice(0,-1)]),true);
 for(const change of [{id:'other'},{alt:'Other'},{cutoutVersion:'b'.repeat(32)},{cutoutEditable:true}])assert.equal(curatedMugChange(current,current.map((d,i)=>i===0?{...d,...change}:d)),true);
});
