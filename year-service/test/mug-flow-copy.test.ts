import {test} from 'node:test';import assert from 'node:assert/strict';
import {starterTranslations} from '../src/translations.ts';
// @ts-expect-error Shared guest rendering module.
import {mugPreview,mugLoadingPreview} from '../web/mug-preview.js';
test('mug flow uses the approved Chinese household line and omits placement disclaimers from all preview states',()=>{
 const source='seriously, one per household. couch surfing only pays so much.';
 assert.equal(starterTranslations('zh-TW')['ui:'+source].value,'說真的，每個家只能送一個。沙發客的收入畢竟有限。');
 for(const markup of [mugLoadingPreview(),mugPreview({src:'/dog.png'}),mugPreview({src:'/dog.png',mockupSrc:'/proof.png'})])assert.doesNotMatch(markup,/final placement|<figcaption>/);
});
