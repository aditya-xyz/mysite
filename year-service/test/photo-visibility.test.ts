import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clientEdition,visiblePhotos,type Published,type PublishedPhoto} from '../src/edition.ts';
const photo=(id:string,extra:Partial<PublishedPhoto>={}):PublishedPhoto=>({id,caption:id,alt:id,recipients:[],preview_key:id+'.jpg',original_key:null,filename:id+'.jpg',mime:'image/jpeg',...extra});
test('guest authorization rejects hidden and unassigned personal photos even in a malformed manifest',()=>{
 const edition:Published={title:'Test',authors:'Test',intro:'Test',note:'Test',sharedTitle:'Test',stories:[],photos:[photo('shared'),photo('hidden-shared',{hidden:true}),photo('hidden-personal',{hidden:true,recipients:['person']}),photo('pending-personal',{audience:'personal'}),photo('personal',{recipients:['person']}),photo('other',{recipients:['other']})]};
 assert.deepEqual(visiblePhotos(edition,'invite',['person']).map(p=>p.id),['shared','personal']);
 assert.deepEqual(clientEdition(edition,'invite','Test',2026,['person']).photos.map(p=>p.id),['shared','personal']);
 assert.deepEqual(visiblePhotos(edition,'unrelated').map(p=>p.id),['shared']);
});
