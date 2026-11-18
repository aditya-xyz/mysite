import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Shared admin browser module.
import {filterInvitations,postcardPermission} from '../admin/client/invitation-filters.js';
test('invitation gift filters combine with household search without changing permissions',()=>{
 const invitations=[{id:'both',allow_mug:1,allow_print:1,memberIds:['alice']},{id:'card',allow_mug:0,allow_print:1},{id:'digital',allow_mug:1,allow_print:1,paperlessId:'chosen'},{id:'none',allow_mug:0,allow_print:0}],contacts=[{id:'alice',name:'Alice Smith'}],before=JSON.stringify(invitations);
 const ids=(filters:object)=>filterInvitations(invitations,contacts,filters).map((i:any)=>i.id);
 assert.deepEqual(ids({}),['both','card','digital','none']);assert.deepEqual(ids({mugs:'on'}),['both','digital']);assert.deepEqual(ids({mugs:'off',postcards:'mail'}),['card']);assert.deepEqual(ids({postcards:'paperless'}),['digital']);assert.deepEqual(ids({postcards:'off'}),['none']);assert.deepEqual(ids({query:'  ALICE ',mugs:'on',postcards:'mail'}),['both']);assert.deepEqual(ids({query:'Alice',mugs:'off'}),[]);assert.equal(postcardPermission(invitations[2]),'paperless');assert.equal(JSON.stringify(invitations),before);
});
