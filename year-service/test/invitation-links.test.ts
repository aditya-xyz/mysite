import {test} from 'node:test';import assert from 'node:assert/strict';
import {sealLink,unsealLink,invitationUrl} from '../admin/src/invitation-links.ts';
test('recoverable invitation tokens use authenticated encryption bound to invitation and year',async()=>{
 const raw='a'.repeat(64),secret='b'.repeat(64),cipher=await sealLink(raw,secret,'invite-one',2026);
 assert.ok(cipher&&!cipher.includes(raw));assert.equal(await unsealLink(cipher,secret,'invite-one',2026),raw);
 assert.notEqual(cipher,await sealLink(raw,secret,'invite-one',2026));
 for(const [key,id,year] of [[secret,'invite-two',2026],[secret,'invite-one',2027],['c'.repeat(64),'invite-one',2026]] as const)await assert.rejects(unsealLink(cipher,key,id,year));
 assert.equal(await sealLink(raw,undefined,'invite-one',2026),null);
 const env={JOURNAL_ORIGIN:'https://cloudflare.test',SOCIAL_JOURNAL_ORIGIN:'https://scrapbook.test'};
 assert.equal(invitationUrl(env,raw,true),'https://scrapbook.test/#'+raw);assert.equal(invitationUrl(env,raw,false),'https://cloudflare.test/#'+raw);
});
