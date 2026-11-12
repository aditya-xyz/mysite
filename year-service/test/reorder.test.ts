import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Browser helper is plain JavaScript.
import {reorderItems,reorderButton,reorderToolbar,reorderHandle} from '../admin/client/reorder.js';
// @ts-expect-error Browser presentation helper is plain JavaScript.
import {mugsMarkup} from '../admin/client/mug-editor.js';

test('reordering preserves complete objects, including hidden photos and recipient assignments',()=>{
 const first={id:'a',caption:'Keep caption',recipients:['friend']},hidden={id:'b',hidden:true},last={id:'c',cutoutVersion:'a'.repeat(32)};
 const original=[first,hidden,last],next=reorderItems(original,['c','a','b']);
 assert.deepEqual(original.map(p=>p.id),['a','b','c']);
 assert.deepEqual(next,[last,first,hidden]);assert.equal(next[0],last);assert.equal(next[1],first);assert.equal(next[2],hidden);
});
test('stale, incomplete, duplicate or foreign drop orders cannot remove or replace items',()=>{
 const items=[{id:'a'},{id:'b'},{id:'c'}];
 for(const ids of [['a','b'],['a','b','b'],['a','b','foreign'],['a','b','c','extra']])assert.throws(()=>reorderItems(items,ids),/collection changed/);
});
test('drag handles and caption locking appear only in explicit reorder mode',()=>{
 const state={year:2026,draft:{mugDesigns:[{id:'mug-a',caption:'Keep <this>',alt:'Artwork',cutoutVersion:'a'.repeat(32)}]}};
 assert.doesNotMatch(mugsMarkup(state),/data-reorder-handle|<textarea disabled/);
 const editing=mugsMarkup(state,{reordering:true});assert.match(editing,/data-reorder-handle="mug-a"/);assert.match(editing,/<textarea disabled/);assert.match(editing,/Keep &lt;this&gt;/);
 assert.equal(reorderToolbar('photos',12,false),'');
 assert.match(reorderButton('photos',12),/Reorder photos/);
 assert.equal(reorderButton('photos',1),'');
 assert.match(reorderToolbar('photos',12,true),/Done reordering/);assert.match(reorderToolbar('photos',12,true),/id="reorder-cancel"/);
 assert.equal(reorderToolbar('photos',1,false),'');assert.match(reorderHandle('a"','caption <x>'),/a&quot;/);
});

test('the mug reorder button belongs to the collection header and is not duplicated in mode',()=>{
 const state={year:2026,draft:{mugDesigns:[{id:'a',caption:'A',alt:'A'},{id:'b',caption:'B',alt:'B'}]}};
 const normal=mugsMarkup(state);assert.match(normal,/<div class="actions mug-collection-actions"><button[^>]*id="reorder-toggle"/);
 assert.doesNotMatch(mugsMarkup(state,{reordering:true}),/id="reorder-toggle"/);
});
