import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Browser module shared with the synthetic UI fixture.
import {previewRecipientChoices,filterPreviewRecipients} from '../admin/client/preview-recipient-picker.js';
test('preview choices sort by displayed invitation name and search household members without changing input arrays',()=>{
 const invites=[{id:'z',addressedTo:'Zoe & Amy',memberIds:['amy']},{id:'b',addressedTo:'ben',memberIds:['bob']},{id:'a',addressedTo:'Amber',memberIds:['amy']}],contacts=[{id:'bob',name:'Robert Jones'},{id:'amy',name:'Amy Smith'}];
 const before=JSON.stringify({invites,contacts}),choices=previewRecipientChoices(invites,contacts);
 assert.deepEqual(choices.map((c:any)=>c.label),['Shared photos only','Amber','ben','Zoe & Amy','Amy Smith','Robert Jones']);
 assert.deepEqual(filterPreviewRecipients(choices,'  ROBERT  ').map((c:any)=>c.value),['invite:b','bob']);
 assert.deepEqual(filterPreviewRecipients(choices,'absent'),[]);assert.equal(JSON.stringify({invites,contacts}),before);
});
