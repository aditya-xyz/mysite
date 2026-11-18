import {test} from 'node:test';import assert from 'node:assert/strict';
// @ts-expect-error Shared admin browser module.
import {invitationGiftBudget,giftBudgetMarkup} from '../admin/client/gift-budget.js';
test('gift budget counts active household permissions, excludes digital cards, and recalculates saved changes',()=>{
 const rows=[{allow_mug:1,allow_print:1,expires_at:200},{allow_mug:0,allow_print:1,expires_at:200},{allow_mug:1,allow_print:1,paperlessId:'digital',expires_at:200},{allow_mug:1,allow_print:1,expires_at:50},{allow_mug:1,allow_print:1,revoked_at:1,expires_at:200}];
 assert.deepEqual(invitationGiftBudget(rows,100),{mugs:2,postcards:2,mugCents:3520,postcardCents:972,totalCents:4492,ceilingCents:7000});
 rows[0].allow_mug=0;rows[1].allow_print=0;assert.equal(invitationGiftBudget(rows,100).totalCents,2246);
 assert.equal(invitationGiftBudget([],100).totalCents,0);
 const active=Array.from({length:72},(_,i)=>({allow_mug:i<49?1:0,allow_print:1,expires_at:Date.now()/1000+1000}));assert.equal(invitationGiftBudget(active).totalCents,121232);assert.match(giftBudgetMarkup(active),/\$1,212\.32/);assert.match(giftBudgetMarkup(active),/\$1,945\.00/);
});
